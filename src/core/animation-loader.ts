/**
 * Load standalone animation GLBs from a folder and retarget to VRM/GLB models.
 * Drop idle.glb, walk.glb, run.glb, etc. into public/models/animations/
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { retargetClip } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { VRM } from '@pixiv/three-vrm';

const MODELS_BASE = '/models/';

/** Bone names from Mixamo that VRM typically lacks - filter tracks for these to avoid PropertyBinding warnings */
const MIXAMO_EXTRA_BONES = new Set([
  'mixamorigHeadTop_End', 'mixamorigL_Ear', 'mixamorigR_Ear', 'mixamorigJaw',
  'mixamorigTongueBack', 'mixamorigTongueMid', 'mixamorigTongueFront',
  'mixamorigLeftEye', 'mixamorigRightEye', 'mixamorigLeftToeBase', 'mixamorigRightToeBase',
  'mixamorigLeftFinger', 'mixamorigRightFinger', 'mixamorigNeck',
]);

const ANIM_FILES: { files: string[]; patterns: RegExp[] }[] = [
  { files: ['idle.glb', 'Idle.glb', 'Idle .glb'], patterns: [/\bidle\b/i, /\bstand\b/i] },
  { files: ['walk.glb', 'Walk.glb'], patterns: [/\bwalk\b/i] },
  { files: ['run.glb', 'Run.glb'], patterns: [/\brun\b/i] },
  { files: ['death.glb', 'Death.glb'], patterns: [/\bdeath\b/i, /\bdie\b/i] },
  { files: ['attack.glb', 'Attack.glb'], patterns: [/\battack\b/i, /\bshoot\b/i, /\bfire\b/i] },
  { files: ['hit.glb', 'Hit.glb'], patterns: [/\bhit\b/i, /\bhurt\b/i] },
];

/** VRM humanoid bone name -> common Mixamo/source bone name */
const HUMANOID_TO_MIXAMO: Record<string, string> = {
  hips: 'mixamorigHips',
  spine: 'mixamorigSpine',
  chest: 'mixamorigSpine1',
  upperChest: 'mixamorigSpine2',
  neck: 'mixamorigNeck',
  head: 'mixamorigHead',
  leftUpperLeg: 'mixamorigLeftUpLeg',
  leftLowerLeg: 'mixamorigLeftLeg',
  leftUpperArm: 'mixamorigLeftArm',
  leftLowerArm: 'mixamorigLeftForeArm',
  rightUpperLeg: 'mixamorigRightUpLeg',
  rightLowerLeg: 'mixamorigRightLeg',
  rightUpperArm: 'mixamorigRightArm',
  rightLowerArm: 'mixamorigRightForeArm',
};

function findSkinnedMesh(obj: THREE.Object3D): THREE.SkinnedMesh | null {
  if (obj instanceof THREE.SkinnedMesh) return obj;
  for (const c of obj.children) {
    const found = findSkinnedMesh(c);
    if (found) return found;
  }
  return null;
}

function getVrmBoneNames(vrm: VRM): Map<string, string> {
  const out = new Map<string, string>();
  const humanoid = vrm.humanoid;
  if (!humanoid) return out;
  for (const [humanoidName, mixamoName] of Object.entries(HUMANOID_TO_MIXAMO)) {
    const node = humanoid.getRawBoneNode(humanoidName as never);
    if (node) out.set(node.name, mixamoName);
  }
  return out;
}

/** Extract bone name from track path like ".bones[BoneName].position" or "Armature/BoneName.quaternion" */
function getBoneNameFromTrack(track: THREE.KeyframeTrack): string | null {
  const name = track.name;
  const bonesMatch = name.match(/\.bones\[([^\]]+)\]/);
  if (bonesMatch) return bonesMatch[1];
  // Path like "Armature/mixamorigHips.quaternion" - last path segment
  const parts = name.split(/[\/\.]/);
  return parts.length >= 2 ? parts[parts.length - 2] : null;
}

/**
 * Remove tracks that target Mixamo bones not present on VRM (e.g. facial, neck, fingers).
 * Prevents "No target node found for track" warnings and allows core body anims to play.
 */
function filterClipForVRM(clip: THREE.AnimationClip, targetRoot: THREE.Object3D): THREE.AnimationClip {
  const mesh = findSkinnedMesh(targetRoot);
  const validBones = mesh?.skeleton?.bones
    ? new Set(mesh.skeleton.bones.map((b) => b.name))
    : null;

  const validTracks = clip.tracks.filter((track) => {
    const boneName = getBoneNameFromTrack(track);
    if (!boneName) return true; // non-bone track, keep
    if (validBones?.has(boneName)) return true; // exists on target, keep
    if (MIXAMO_EXTRA_BONES.has(boneName)) return false; // known VRM-missing bone, drop
    // Unknown: if we have validBones, it's not on target so drop; else keep (skeleton not found)
    return validBones === null;
  });

  if (validTracks.length === 0) return clip; // avoid empty clip
  return new THREE.AnimationClip(clip.name, clip.duration, validTracks);
}

/**
 * Load animation clips from a folder. Tries idle.glb, walk.glb, run.glb, etc.
 */
export async function loadAnimationsFromFolder(
  folderPath: string
): Promise<THREE.AnimationClip[]> {
  const base = folderPath.startsWith('/') ? folderPath : `${MODELS_BASE}${folderPath}`;
  const allClips: THREE.AnimationClip[] = [];

  for (const { files } of ANIM_FILES) {
    for (const file of files) {
      const url = `${base}${base.endsWith('/') ? '' : '/'}${file}`;
      try {
        const gltf = await new Promise<THREE.GLTF>((resolve, reject) => {
          new GLTFLoader().load(url, resolve, undefined, reject);
        });
        if (gltf.animations?.length) {
          allClips.push(...gltf.animations);
          break; // found one, skip other variants
        }
      } catch {
        // File missing or load failed, try next variant
      }
    }
  }

  return allClips;
}

/**
 * Retarget animation clips from a source scene (e.g. Mixamo GLB) to a VRM.
 * Returns new clips that can be played on the VRM.
 */
export function retargetClipsToVRM(
  vrm: VRM,
  sourceScene: THREE.Object3D,
  clips: THREE.AnimationClip[]
): THREE.AnimationClip[] {
  const targetMesh = findSkinnedMesh(vrm.scene);
  const sourceMesh = findSkinnedMesh(sourceScene);
  if (!targetMesh?.skeleton || !sourceMesh?.skeleton) return [];

  const vrmBoneNames = getVrmBoneNames(vrm);
  const names: Record<string, string> = {};
  vrmBoneNames.forEach((mixamoName, vrmBoneName) => {
    names[vrmBoneName] = mixamoName;
  });

  const retargeted: THREE.AnimationClip[] = [];
  for (const clip of clips) {
    try {
      const retargetedClip = retargetClip(
        targetMesh,
        sourceMesh,
        clip,
        { names, preserveBoneMatrix: false }
      );
      retargeted.push(retargetedClip);
    } catch {
      // Retarget failed, skip clip
    }
  }
  return retargeted;
}

/**
 * Load standalone animations and merge with a character.
 * If the character is a VRM, we need a source rig for retargeting.
 * We use the first animation file that has a SkinnedMesh as the source.
 * For VRM we only use retargeted clips (never raw Mixamo); filters out tracks for bones VRM lacks.
 */
export async function loadAndMergeStandaloneAnimations(
  folderPath: string,
  char: { scene: THREE.Group; animations: THREE.AnimationClip[]; vrm?: VRM }
): Promise<THREE.AnimationClip[]> {
  const base = folderPath.startsWith('/') ? folderPath : `${MODELS_BASE}${folderPath}`;
  let merged = [...char.animations];
  let lastError: string | null = null;

  for (const { files } of ANIM_FILES) {
    for (const file of files) {
      const url = `${base}${base.endsWith('/') ? '' : '/'}${file}`;
      try {
        const gltf = await new Promise<THREE.GLTF>((resolve, reject) => {
          new GLTFLoader().load(url, resolve, undefined, reject);
        });
        if (!gltf.animations?.length) {
          lastError = `${file} loaded but has no animations`;
          continue;
        }

        const sourceMesh = findSkinnedMesh(gltf.scene);
        if (char.vrm && sourceMesh) {
          const retargeted = retargetClipsToVRM(char.vrm, gltf.scene, gltf.animations);
          if (retargeted.length === 0) {
            const targetMesh = findSkinnedMesh(char.scene);
            lastError = `Retarget failed: VRM mesh=${!!targetMesh}, source mesh=ok, bone map size=${getVrmBoneNames(char.vrm).size}`;
            continue;
          }
          merged.push(...retargeted);
        } else if (char.vrm && !sourceMesh) {
          lastError = `${file}: no SkinnedMesh in Mixamo GLB (try "With Skin" export)`;
          continue;
        } else if (!char.vrm) {
          merged.push(...gltf.animations);
        }
        lastError = null;
        break; // found one, skip other variants
      } catch (e) {
        lastError = `${file}: ${e instanceof Error ? e.message : 'load failed'}`;
      }
    }
  }

  // Filter out tracks for Mixamo bones VRM doesn't have (head/neck/facial extras)
  if (char.vrm && merged.length > 0) {
    const targetRoot = char.scene;
    merged = merged.map((clip) => filterClipForVRM(clip, targetRoot));
  }

  if (merged.length === 0 && lastError) {
    console.warn('[Animation]', lastError);
  }

  return merged;
}
