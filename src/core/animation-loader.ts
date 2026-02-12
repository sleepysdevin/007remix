/**
 * Load standalone animation GLBs from a folder and retarget to VRM/GLB models.
 * Drop idle.glb, walk.glb, run.glb, etc. into public/models/animations/
 * Pose JSON files (duration + frames with bone quaternions) in public/animations/
 *
 * Supports both "With Skin" and "Without Skin" Mixamo exports:
 * - With Skin: uses SkeletonUtils.retargetClip (SkinnedMesh required)
 * - Without Skin: direct track retargeting (vinny-888 style) - no SkinnedMesh needed
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { retargetClip } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { VRM } from '@pixiv/three-vrm';

const MODELS_BASE = '/models/';
const POSE_JSON_BASE = '/animations/';

/** Pose JSON format: { duration, frames: [{ time, bones: { boneName: { x, y, z, w } } }] } */
interface PoseJsonFrame {
  time: number;
  bones: Record<string, { x: number; y: number; z: number; w: number }>;
}
interface PoseJson {
  duration: number;
  frames: PoseJsonFrame[];
}

/** Map pose JSON bone names (e.g. LeftHandThumb1) to VRM humanoid names */
const POSE_JSON_BONE_MAP: Record<string, string> = {
  LeftEye: 'leftEye',
  RightEye: 'rightEye',
  LeftHandThumb1: 'leftThumbMetacarpal',
  LeftHandThumb2: 'leftThumbProximal',
  LeftHandThumb3: 'leftThumbDistal',
  RightHandThumb1: 'rightThumbMetacarpal',
  RightHandThumb2: 'rightThumbProximal',
  RightHandThumb3: 'rightThumbDistal',
  LeftHandIndex1: 'leftIndexProximal',
  LeftHandIndex2: 'leftIndexIntermediate',
  LeftHandIndex3: 'leftIndexDistal',
  RightHandIndex1: 'rightIndexProximal',
  RightHandIndex2: 'rightIndexIntermediate',
  RightHandIndex3: 'rightIndexDistal',
  LeftHandMiddle1: 'leftMiddleProximal',
  LeftHandMiddle2: 'leftMiddleIntermediate',
  LeftHandMiddle3: 'leftMiddleDistal',
  RightHandMiddle1: 'rightMiddleProximal',
  RightHandMiddle2: 'rightMiddleIntermediate',
  RightHandMiddle3: 'rightMiddleDistal',
  LeftHandRing1: 'leftRingProximal',
  LeftHandRing2: 'leftRingIntermediate',
  LeftHandRing3: 'leftRingDistal',
  RightHandRing1: 'rightRingProximal',
  RightHandRing2: 'rightRingIntermediate',
  RightHandRing3: 'rightRingDistal',
  LeftHandPinky1: 'leftLittleProximal',
  LeftHandPinky2: 'leftLittleIntermediate',
  LeftHandPinky3: 'leftLittleDistal',
  RightHandPinky1: 'rightLittleProximal',
  RightHandPinky2: 'rightLittleIntermediate',
  RightHandPinky3: 'rightLittleDistal',
};

function toVrmBoneName(jsonKey: string): string {
  const mapped = POSE_JSON_BONE_MAP[jsonKey];
  if (mapped) return mapped;
  return jsonKey.charAt(0).toLowerCase() + jsonKey.slice(1);
}

/** Load pose animation from JSON (VRM-style bone quaternions) and create AnimationClip */
async function loadPoseAnimationFromJson(
  vrm: VRM,
  url: string,
  animName: string
): Promise<THREE.AnimationClip | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = (await res.json()) as PoseJson;
    if (!json?.frames?.length || typeof json.duration !== 'number') return null;

    const humanoid = vrm.humanoid;
    if (!humanoid) return null;

    const tracks: THREE.QuaternionKeyframeTrack[] = [];
    const boneKeys = Object.keys(json.frames[0].bones);

    for (const jsonBoneKey of boneKeys) {
      const vrmBoneName = toVrmBoneName(jsonBoneKey);
      const node = humanoid.getNormalizedBoneNode(vrmBoneName as never);
      if (!node) continue;

      const times: number[] = [];
      const values: number[] = [];
      for (const frame of json.frames) {
        const q = frame.bones[jsonBoneKey];
        if (!q) continue;
        times.push(frame.time);
        values.push(q.x, q.y, q.z, q.w);
      }
      if (times.length === 0) continue;
      tracks.push(new THREE.QuaternionKeyframeTrack(`${node.name}.quaternion`, times, values));
    }

    if (tracks.length === 0) return null;
    const clip = new THREE.AnimationClip(animName, json.duration, tracks);
    if (import.meta.env.DEV) {
      console.log(`[Animation] ${url}: pose JSON loaded, ${tracks.length} bone tracks`);
    }
    return clip;
  } catch {
    return null;
  }
}

/** Bone names from Mixamo that VRM typically lacks - filter tracks for these to avoid PropertyBinding warnings */
const MIXAMO_EXTRA_BONES = new Set([
  'mixamorigHeadTop_End', 'mixamorigL_Ear', 'mixamorigR_Ear', 'mixamorigJaw',
  'mixamorigTongueBack', 'mixamorigTongueMid', 'mixamorigTongueFront',
  'mixamorigLeftEye', 'mixamorigRightEye', 'mixamorigLeftToeBase', 'mixamorigRightToeBase',
  'mixamorigLeftFinger', 'mixamorigRightFinger', 'mixamorigNeck',
]);

const ANIM_FILES: { name: string; files: string[]; patterns: RegExp[] }[] = [
  { name: 'idle', files: ['idle.glb', 'Idle.glb', 'Idle .glb'], patterns: [/\bidle\b/i, /\bstand\b/i] },
  { name: 'walk', files: ['walk.glb', 'Walk.glb'], patterns: [/\bwalk\b/i] },
  { name: 'run', files: ['run.glb', 'Run.glb'], patterns: [/\brun\b/i] },
  { name: 'death', files: ['death.glb', 'Death.glb', 'Death Fall.glb', 'Dying.glb'], patterns: [/\bdeath\b/i, /\bdie\b/i, /\bdying\b/i] },
  { name: 'attack', files: ['attack.glb', 'Attack.glb'], patterns: [/\battack\b/i, /\bshoot\b/i, /\bfire\b/i] },
  { name: 'hit', files: ['hit.glb', 'Hit.glb', 'Hit Reaction.glb', 'Hit React.glb', 'Get Hit.glb'], patterns: [/\bhit\b/i, /\bhurt\b/i, /\bdamage\b/i, /\brecoil\b/i] },
];

/** Mixamo bone name -> VRM humanoid bone name (for direct track retargeting, vinny-888 style) */
const MIXAMO_TO_HUMANOID: Record<string, string> = {
  mixamorigHips: 'hips',
  mixamorigSpine: 'spine',
  mixamorigSpine1: 'chest',
  mixamorigSpine2: 'upperChest',
  mixamorigNeck: 'neck',
  mixamorigHead: 'head',
  mixamorigLeftShoulder: 'leftShoulder',
  mixamorigLeftArm: 'leftUpperArm',
  mixamorigLeftForeArm: 'leftLowerArm',
  mixamorigLeftHand: 'leftHand',
  mixamorigRightShoulder: 'rightShoulder',
  mixamorigRightArm: 'rightUpperArm',
  mixamorigRightForeArm: 'rightLowerArm',
  mixamorigRightHand: 'rightHand',
  mixamorigLeftUpLeg: 'leftUpperLeg',
  mixamorigLeftLeg: 'leftLowerLeg',
  mixamorigLeftFoot: 'leftFoot',
  mixamorigLeftToeBase: 'leftToes',
  mixamorigRightUpLeg: 'rightUpperLeg',
  mixamorigRightLeg: 'rightLowerLeg',
  mixamorigRightFoot: 'rightFoot',
  mixamorigRightToeBase: 'rightToes',
  // Alternate names (Blender/other exporters may strip mixamorig prefix)
  Hips: 'hips',
  Spine: 'spine',
  Spine1: 'chest',
  Spine2: 'upperChest',
  Neck: 'neck',
  Head: 'head',
  LeftArm: 'leftUpperArm',
  LeftForeArm: 'leftLowerArm',
  LeftHand: 'leftHand',
  RightArm: 'rightUpperArm',
  RightForeArm: 'rightLowerArm',
  RightHand: 'rightHand',
  LeftUpLeg: 'leftUpperLeg',
  LeftLeg: 'leftLowerLeg',
  LeftFoot: 'leftFoot',
  RightUpLeg: 'rightUpperLeg',
  RightLeg: 'rightLowerLeg',
  RightFoot: 'rightFoot',
};

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
    if (boneName.startsWith('Normalized_')) return true; // VRM normalized bones (pose JSON), keep
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

  for (const { name: animName, files } of ANIM_FILES) {
    for (const file of files) {
      const url = `${base}${base.endsWith('/') ? '' : '/'}${file}`;
      try {
        const gltf = await new Promise<THREE.GLTF>((resolve, reject) => {
          new GLTFLoader().load(url, resolve, undefined, reject);
        });
        if (gltf.animations?.length) {
          for (const clip of gltf.animations) clip.name = animName;
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
 * Uses SkeletonUtils.retargetClip when both have SkinnedMesh.
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

/** Extract Mixamo bone name from track - supports "mixamorigHips.quaternion" and "path/mixamorigHips.quaternion" */
function getMixamoBoneFromTrack(track: THREE.KeyframeTrack): string | null {
  const name = track.name;
  // .bones[BoneName].property (SkinnedMesh format)
  const bonesMatch = name.match(/\.bones\[([^\]]+)\]/);
  if (bonesMatch) return bonesMatch[1];
  // "mixamorigHips.quaternion" or "Armature/mixamorigHips.quaternion"
  const parts = name.split(/[\/\.]/);
  if (parts.length >= 2) {
    const bonePart = parts[parts.length - 2];
    if (MIXAMO_TO_HUMANOID[bonePart] != null) return bonePart;
    // Try common Mixamo prefix
    if (bonePart.startsWith('mixamo')) return bonePart;
  }
  return null;
}

/**
 * Retarget clips from armature-only GLB (no SkinnedMesh) to VRM.
 * Targets normalized bones. For cloned enemies we need VRM update() to copy to raw;
 * since we can't call that on clones, animations may not play. Raw bone targeting
 * was tried but corrupted the mesh (invisible). Keep normalized for visibility.
 */
function retargetClipsFromArmatureOnly(
  vrm: VRM,
  sourceScene: THREE.Object3D,
  clips: THREE.AnimationClip[]
): THREE.AnimationClip[] {
  const humanoid = vrm.humanoid;
  if (!humanoid) return [];

  const restRotationInverse = new THREE.Quaternion();
  const parentRestWorldRotation = new THREE.Quaternion();
  const _quatA = new THREE.Quaternion();
  const _vec3 = new THREE.Vector3();

  // Hips height scale (Mixamo vs VRM)
  const mixamoHips = sourceScene.getObjectByName('mixamorigHips') ?? sourceScene.getObjectByName('Hips');
  const vrmHips = humanoid.getNormalizedBoneNode('hips' as never);
  let hipsPositionScale = 1;
  if (mixamoHips && vrmHips) {
    const motionHipsHeight = mixamoHips.position.y;
    vrmHips.getWorldPosition(_vec3);
    const vrmHipsY = _vec3.y;
    vrm.scene.getWorldPosition(_vec3);
    const vrmRootY = _vec3.y;
    const vrmHipsHeight = Math.abs(vrmHipsY - vrmRootY);
    if (Math.abs(motionHipsHeight) > 1e-6) hipsPositionScale = vrmHipsHeight / Math.abs(motionHipsHeight);
  }

  const isVrm0 = vrm.meta?.metaVersion === '0';

  const retargeted: THREE.AnimationClip[] = [];
  for (const clip of clips) {
    const newTracks: THREE.KeyframeTrack[] = [];

    clip.tracks.forEach((track) => {
      const mixamoRigName = getMixamoBoneFromTrack(track);
      if (!mixamoRigName) return;

      const vrmBoneName = MIXAMO_TO_HUMANOID[mixamoRigName];
      if (vrmBoneName == null) return;
      if (MIXAMO_EXTRA_BONES.has(mixamoRigName)) return;

      const vrmNode = humanoid.getNormalizedBoneNode(vrmBoneName as never);
      const vrmNodeName = vrmNode?.name;
      if (vrmNodeName == null) return;

      const mixamoRigNode = sourceScene.getObjectByName(mixamoRigName);
      if (!mixamoRigNode?.parent) return;

      const trackParts = track.name.split('.');
      const propertyName = trackParts[trackParts.length - 1];

      mixamoRigNode.getWorldQuaternion(restRotationInverse).invert();
      mixamoRigNode.parent.getWorldQuaternion(parentRestWorldRotation);

      if (track instanceof THREE.QuaternionKeyframeTrack) {
        const values = [...track.values];
        for (let i = 0; i < values.length; i += 4) {
          _quatA.fromArray(values, i);
          _quatA.premultiply(parentRestWorldRotation).multiply(restRotationInverse);
          _quatA.toArray(values, i);
        }
        const finalValues = isVrm0 ? values.map((v, i) => (i % 2 === 0 ? -v : v)) : values;
        newTracks.push(new THREE.QuaternionKeyframeTrack(`${vrmNodeName}.${propertyName}`, track.times, finalValues));
      } else if (track instanceof THREE.VectorKeyframeTrack) {
        const value = track.values.map((v, i) => (isVrm0 && i % 3 !== 1 ? -v : v) * hipsPositionScale);
        newTracks.push(new THREE.VectorKeyframeTrack(`${vrmNodeName}.${propertyName}`, track.times, value));
      }
    });

    if (newTracks.length > 0) {
      retargeted.push(new THREE.AnimationClip(clip.name || 'vrmAnimation', clip.duration, newTracks));
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

  for (const { name: animName, files } of ANIM_FILES) {
    for (const file of files) {
      const url = `${base}${base.endsWith('/') ? '' : '/'}${file}`;
      try {
        const gltf = await new Promise<THREE.GLTF>((resolve, reject) => {
          new GLTFLoader().load(url, resolve, undefined, reject);
        });
        if (!gltf.animations?.length) {
          lastError = `${file} loaded but has no animations (export "With Skin" in Mixamo)`;
          continue;
        }

        const sourceMesh = findSkinnedMesh(gltf.scene);
        if (char.vrm && sourceMesh) {
          const retargeted = retargetClipsToVRM(char.vrm, gltf.scene, gltf.animations);
          for (const clip of retargeted) clip.name = animName;
          if (retargeted.length === 0) {
            const targetMesh = findSkinnedMesh(char.scene);
            const boneCount = getVrmBoneNames(char.vrm).size;
            lastError = `Retarget failed: VRM SkinnedMesh=${!!targetMesh}, Mixamo SkinnedMesh=ok, VRM humanoid bones=${boneCount} (VRM may need different rig)`;
            continue;
          }
          merged.push(...retargeted);
          if (import.meta.env.DEV) {
            console.log(`[Animation] ${file}: ${retargeted.length} clip(s) retargeted (With Skin)`);
          }
        } else if (char.vrm && !sourceMesh) {
          const retargeted = retargetClipsFromArmatureOnly(char.vrm, gltf.scene, gltf.animations);
          for (const clip of retargeted) clip.name = animName;
          if (retargeted.length === 0) {
            lastError = `${file}: armature-only retarget failed (check Mixamo bone names match mixamorigHips, etc.)`;
            continue;
          }
          merged.push(...retargeted);
          if (import.meta.env.DEV) {
            console.log(`[Animation] ${file}: ${retargeted.length} clip(s) retargeted (Without Skin)`);
          }
        } else if (!char.vrm) {
          for (const clip of gltf.animations) {
            clip.name = animName;
            merged.push(clip);
          }
        }
        lastError = null;
        break; // found one, skip other variants
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'load failed';
        if (!msg.includes('<!DOCTYPE') && !msg.includes('404')) {
          lastError = `${file}: ${msg}`;
        }
      }
    }
  }

  // Also load pose JSON from /animations/ (death.json, hit.json) — VRM-style bone quaternions
  if (char.vrm) {
    for (const { name: animName, file } of [
      { name: 'death', file: 'death1.json' },
      { name: 'hit', file: 'hit.json' },
    ]) {
      const url = `${POSE_JSON_BASE}${file}`;
      const clip = await loadPoseAnimationFromJson(char.vrm, url, animName);
      if (clip) merged.push(clip);
    }
  }

  // Filter out tracks for Mixamo bones VRM doesn't have (head/neck/facial extras)
  if (char.vrm && merged.length > 0) {
    const targetRoot = char.scene;
    merged = merged.map((clip) => filterClipForVRM(clip, targetRoot));
  }

  if (merged.length === 0) {
    console.warn(
      '[Animation] No animations loaded.',
      lastError ? lastError : 'Add idle.glb, walk.glb to public/models/animations/ (Mixamo "With Skin" or "Without Skin" both supported)'
    );
  }

  return merged;
}
