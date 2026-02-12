/**
 * Custom 3D enemy model from loaded GLB or VRM.
 * Same interface as EnemyModel: mesh, shadowMesh, update(), play(), triggerHitFlash().
 * Uses animation clips when present; otherwise stays in default pose.
 * Uses SkeletonUtils.clone for proper per-instance skeleton (required for animation).
 * For VRM: copies normalized→raw each frame so animations apply to the mesh.
 */

import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { VRMHumanBoneList } from '@pixiv/three-vrm';
import type { LoadedCharacter } from '../../core/model-loader';
import type { VRM } from '@pixiv/three-vrm';
import { isLoadedVRM } from '../../core/model-loader';
import { solveTwoBoneIK } from '../../core/two-bone-ik';
import { Ragdoll, buildRagdollBoneMapping, type RagdollBoneMapping } from '../ragdoll';
import type { PhysicsWorld } from '../../core/physics-world';

const TARGET_HEIGHT = 1.7;
/** How far to sink the model (meters) during death — pose JSON has no position data */
const DEATH_SINK = 0.9;

function getSceneAndAnimations(char: LoadedCharacter): { scene: THREE.Group; animations: THREE.AnimationClip[] } {
  return { scene: char.scene, animations: char.animations };
}

function collectMeshes(obj: THREE.Object3D, out: THREE.Mesh[]): void {
  if (obj instanceof THREE.Mesh && obj.material) {
    out.push(obj);
  }
  obj.children.forEach((c) => collectMeshes(c, out));
}

function fixMaterials(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh && child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) {
        if (mat instanceof THREE.Material) {
          mat.side = THREE.DoubleSide;
          mat.depthWrite = true;
          if (mat instanceof THREE.MeshStandardMaterial) {
            if (mat.color.getHex() === 0 && mat.emissive.getHex() === 0) mat.emissive.setHex(0x333333);
          }
        }
      }
    }
  });
}

function findSkinnedMesh(obj: THREE.Object3D): THREE.SkinnedMesh | null {
  if (obj instanceof THREE.SkinnedMesh) return obj;
  for (const c of obj.children) {
    const found = findSkinnedMesh(c);
    if (found) return found;
  }
  return null;
}

/** VRM normalized→raw copy params (from VRMHumanoidRig internals). */
type VRMCopyParams = {
  bones: { boneName: string; rawName: string; normName: string; parentWorldRot: THREE.Quaternion; boneRot: THREE.Quaternion }[];
};

function buildVRMCopyParams(vrm: VRM): VRMCopyParams | null {
  const humanoid = vrm.humanoid;
  if (!humanoid) return null;
  const rig = (humanoid as { _normalizedHumanBones?: { _parentWorldRotations?: Record<string, THREE.Quaternion>; _boneRotations?: Record<string, THREE.Quaternion> } })._normalizedHumanBones;
  if (!rig?._parentWorldRotations || !rig?._boneRotations) return null;

  const bones: VRMCopyParams['bones'] = [];
  for (const boneName of VRMHumanBoneList) {
    const rawNode = humanoid.getRawBoneNode(boneName as never);
    const normNode = humanoid.getNormalizedBoneNode(boneName as never);
    const parentWorldRot = rig._parentWorldRotations[boneName];
    const boneRot = rig._boneRotations[boneName];
    if (rawNode && normNode && parentWorldRot && boneRot)
      bones.push({ boneName, rawName: rawNode.name, normName: normNode.name, parentWorldRot: parentWorldRot.clone(), boneRot: boneRot.clone() });
  }
  return { bones };
}

const _copyQ = new THREE.Quaternion();
const _copyV = new THREE.Vector3();
const _copyM = new THREE.Matrix4();

function copyNormalizedToRaw(mesh: THREE.Object3D, params: VRMCopyParams, copyHipsPosition: boolean): void {
  for (const { boneName, rawName, normName, parentWorldRot, boneRot } of params.bones) {
    const rawNode = mesh.getObjectByName(rawName);
    const normNode = mesh.getObjectByName(normName);
    if (!rawNode || !normNode) continue;

    _copyQ.copy(parentWorldRot).invert();
    rawNode.quaternion.copy(normNode.quaternion).multiply(parentWorldRot).premultiply(_copyQ).multiply(boneRot);

    // Hips position copy only for death/hit — body collapses to ground. Skip for walk (causes invisibility).
    if (copyHipsPosition && boneName === 'hips' && rawNode.parent) {
      normNode.getWorldPosition(_copyV);
      rawNode.parent.updateWorldMatrix(true, false);
      rawNode.position.copy(_copyV.applyMatrix4(_copyM.copy(rawNode.parent.matrixWorld).invert()));
    }
  }
}

/** Leg chain for foot IK: upper, lower, foot raw bone names */
type FootIKParams = { left: [string, string, string]; right: [string, string, string] };

function buildFootIKParams(vrm: VRM): FootIKParams | null {
  const humanoid = vrm.humanoid;
  if (!humanoid) return null;
  const leftUpper = humanoid.getRawBoneNode('leftUpperLeg' as never);
  const leftLower = humanoid.getRawBoneNode('leftLowerLeg' as never);
  const leftFoot = humanoid.getRawBoneNode('leftFoot' as never);
  const rightUpper = humanoid.getRawBoneNode('rightUpperLeg' as never);
  const rightLower = humanoid.getRawBoneNode('rightLowerLeg' as never);
  const rightFoot = humanoid.getRawBoneNode('rightFoot' as never);
  if (!leftUpper || !leftLower || !leftFoot || !rightUpper || !rightLower || !rightFoot) return null;
  return {
    left: [leftUpper.name, leftLower.name, leftFoot.name],
    right: [rightUpper.name, rightLower.name, rightFoot.name],
  };
}

const _posA = new THREE.Vector3();
const _posB = new THREE.Vector3();
const _posC = new THREE.Vector3();
const _posT = new THREE.Vector3();
const _floorY = new THREE.Vector3();

function applyFootIK(mesh: THREE.Object3D, ik: FootIKParams, floorY: number): void {
  mesh.updateMatrixWorld(true);
  for (const [upperName, lowerName, footName] of [ik.left, ik.right]) {
    const upper = mesh.getObjectByName(upperName);
    const lower = mesh.getObjectByName(lowerName);
    const foot = mesh.getObjectByName(footName);
    if (!upper || !lower || !foot) continue;
    upper.getWorldPosition(_posA);
    lower.getWorldPosition(_posB);
    foot.getWorldPosition(_posC);
    _posT.set(_posC.x, floorY, _posC.z);
    solveTwoBoneIK(_posA, _posB, _posC, _posT, upper, lower);
  }
}

/** Called each frame with pelvis world position and rotation when ragdoll is active */
export type RagdollPelvisCallback = (pos: THREE.Vector3, quat: THREE.Quaternion) => void;

export class EnemyCustomModel {
  readonly mesh: THREE.Group;
  readonly shadowMesh: THREE.Mesh;

  private hitFlashMeshes: THREE.Mesh[] = [];
  private hitTintTimer = 0;
  private mixer: THREE.AnimationMixer | null = null;
  private clipMap = new Map<string, { clip: THREE.AnimationClip; duration: number }>();
  private currentAction: THREE.AnimationAction | null = null;
  private vrmCopyParams: VRMCopyParams | null = null;
  private footIKParams: FootIKParams | null = null;
  private ragdollMapping: RagdollBoneMapping[] = [];
  private ragdoll: Ragdoll | null = null;
  private ragdollPelvisCallback: RagdollPelvisCallback | null = null;
  private meshBaseY = 0;

  constructor(char: LoadedCharacter) {
    const { scene, animations } = getSceneAndAnimations(char);
    if (isLoadedVRM(char)) {
      this.vrmCopyParams = buildVRMCopyParams(char.vrm);
      this.footIKParams = buildFootIKParams(char.vrm);
      this.ragdollMapping = buildRagdollBoneMapping(char.vrm);
    }
    try {
      this.mesh = cloneSkinned(scene) as THREE.Group;
    } catch {
      this.mesh = scene.clone(true);
    }
    fixMaterials(this.mesh);

    // VRM uses layers 9/10 by default — force layer 0 so camera sees the model
    this.mesh.traverse((child) => child.layers.set(0));

    // VRM/GLB typically faces -Z; our facing uses +Z forward — rotate 180° so model faces correct way
    this.mesh.rotation.y = Math.PI;

    const box = new THREE.Box3().setFromObject(this.mesh);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale = TARGET_HEIGHT / Math.max(size.y, 0.01);
    this.mesh.scale.setScalar(scale);
    this.meshBaseY = -box.min.y * scale;
    this.mesh.position.set(-center.x * scale, this.meshBaseY, -center.z * scale);

    collectMeshes(this.mesh, this.hitFlashMeshes);
    for (const m of this.hitFlashMeshes) {
      const mat = m.material as THREE.MeshStandardMaterial;
      if (mat?.color) {
        (m.userData as Record<string, number>).originalColor = mat.color.getHex();
      }
    }

    if (animations?.length) {
      // Use full scene root as mixer root so PropertyBinding can find all nodes.
      // VRM normalized bones (Normalized_Hips, etc.) live in a separate hierarchy from the SkinnedMesh.
      this.mixer = new THREE.AnimationMixer(this.mesh);
      const first = animations[0];
      const fallback = { clip: first, duration: first.duration };
      for (const clip of animations) {
        const nm = clip.name.toLowerCase().replace(/\s+/g, '_');
        if (!this.clipMap.has(nm)) this.clipMap.set(nm, { clip, duration: clip.duration });
        if (/\bidle\b|stand|default|pose|bind|tpose|t-pose|breathing/i.test(clip.name)) this.clipMap.set('idle', { clip, duration: clip.duration });
        if (/\bwalk\b|locomotion|move|forward|run\b/i.test(clip.name)) this.clipMap.set('walk', { clip, duration: clip.duration });
        if (/\bdeath\b|die|dead|dying/i.test(clip.name)) this.clipMap.set('death', { clip, duration: clip.duration });
        if (/\b(attack|shoot|fire|aim|aiming)\b/i.test(clip.name)) {
          this.clipMap.set('shoot', { clip, duration: clip.duration });
          this.clipMap.set('alert', { clip, duration: clip.duration });
        }
        if (/\bhit\b|hurt|damage|recoil/i.test(clip.name)) this.clipMap.set('hit', { clip, duration: clip.duration });
        if (/\brun\b/i.test(clip.name) && !this.clipMap.has('walk')) this.clipMap.set('walk', { clip, duration: clip.duration });
      }
      if (!this.clipMap.has('idle')) this.clipMap.set('idle', fallback);
      if (!this.clipMap.has('walk')) this.clipMap.set('walk', fallback);
    }

    const shadowGeo = new THREE.PlaneGeometry(0.8, 0.4);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    });
    this.shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    this.shadowMesh.position.y = 0.02;
  }

  /** Activate ragdoll physics for death. Replaces death animation. Only for VRM with full rig. */
  activateRagdoll(physics: PhysicsWorld, onPelvisUpdate: RagdollPelvisCallback): boolean {
    if (this.ragdollMapping.length < 6) return false;
    this.ragdoll?.dispose();
    this.ragdoll = new Ragdoll(physics, this.ragdollMapping);
    this.ragdoll.activate(this.mesh);
    this.ragdollPelvisCallback = onPelvisUpdate;
    return true;
  }

  /** Clean up ragdoll when enemy is removed */
  disposeRagdoll(): void {
    this.ragdoll?.dispose();
    this.ragdoll = null;
    this.ragdollPelvisCallback = null;
  }

  get isRagdollActive(): boolean {
    return this.ragdoll !== null;
  }

  update(dt: number): void {
    if (this.ragdoll) {
      const _p = new THREE.Vector3();
      const _q = new THREE.Quaternion();
      this.ragdoll.getPelvisPosition(_p);
      this.ragdoll.getPelvisQuaternion(_q);
      this.ragdollPelvisCallback?.(_p, _q);
      this.ragdoll.syncToSkeleton(this.mesh);
    } else if (this.mixer) {
      this.mixer.update(dt);
      if (this.vrmCopyParams) {
        const clipName = this.currentAction?.getClip().name?.toLowerCase() ?? '';
        const copyHips = clipName === 'death' || clipName === 'hit';
        copyNormalizedToRaw(this.mesh, this.vrmCopyParams, copyHips);
      }
      // Death sink: pose JSON has no position data — procedurally sink the model
      const clipName = this.currentAction?.getClip().name?.toLowerCase() ?? '';
      if (clipName === 'death') {
        const action = this.currentAction!;
        const clip = action.getClip();
        const duration = clip.duration;
        const t = duration > 0 ? Math.min(1, action.time / duration) : 1;
        // Sink completes in 55% of clip; ease-out cubic for natural drop-then-settle
        const tSink = Math.min(1, t / 0.55);
        const progress = 1 - Math.pow(1 - tSink, 3);
        this.mesh.position.y = this.meshBaseY - DEATH_SINK * progress;
        // Foot IK: plant feet on ground during death collapse
        if (this.footIKParams) {
          const ref = this.mesh.parent?.getWorldPosition(_floorY) ?? this.mesh.getWorldPosition(_floorY);
          const floorY = ref.y - 0.02;
          applyFootIK(this.mesh, this.footIKParams, floorY);
        }
      } else {
        this.mesh.position.y = this.meshBaseY;
      }
    }
    if (this.hitTintTimer > 0) {
      this.hitTintTimer -= dt;
      for (const m of this.hitFlashMeshes) {
        const mat = m.material as THREE.MeshStandardMaterial;
        if (mat?.color) mat.color.setHex(0xff4444);
      }
    } else {
      for (const m of this.hitFlashMeshes) {
        const orig = (m.userData as Record<string, number>).originalColor;
        const mat = m.material as THREE.MeshStandardMaterial;
        if (typeof orig === 'number' && mat?.color) {
          mat.color.setHex(orig);
        }
      }
    }
  }

  triggerHitFlash(): void {
    this.hitTintTimer = 0.12;
  }

  play(name: string, force = false): void {
    if (!this.mixer) return;
    const key = name.toLowerCase();
    let entry = this.clipMap.get(key);
    if (!entry) {
      entry = this.clipMap.get(key === 'alert' ? 'shoot' : key === 'shoot' ? 'attack' : key);
    }
    if (!entry) return;
    // Compare by clip identity, not name — Mixamo exports often use "mixamo.com" for all clips
    if (this.currentAction?.getClip() === entry.clip && !force) return;
    this.currentAction?.stop();
    this.currentAction = this.mixer.clipAction(entry.clip);
    this.currentAction.reset();
    this.currentAction.setLoop(name === 'death' || name === 'hit' ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    this.currentAction.clampWhenFinished = name === 'death' || name === 'hit';
    this.currentAction.play();
  }
}
