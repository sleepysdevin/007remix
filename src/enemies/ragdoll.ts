/**
 * Ragdoll physics for death animations.
 * Creates dynamic physics bodies connected by spherical joints,
 * then syncs their transforms to the skeleton each frame.
 */

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '../core/physics-world';

/** VRM humanoid bone name -> ragdoll body (for mapping) */
const RAGDOLL_BONES = [
  'hips',
  'spine',
  'chest',
  'head',
  'leftUpperArm',
  'leftLowerArm',
  'rightUpperArm',
  'rightLowerArm',
  'leftUpperLeg',
  'leftLowerLeg',
  'rightUpperLeg',
  'rightLowerLeg',
] as const;

/** Parent of each ragdoll bone (for joint creation) */
const BONE_PARENT: Record<string, string> = {
  spine: 'hips',
  chest: 'spine',
  head: 'chest',
  leftUpperArm: 'chest',
  leftLowerArm: 'leftUpperArm',
  rightUpperArm: 'chest',
  rightLowerArm: 'rightUpperArm',
  leftUpperLeg: 'hips',
  leftLowerLeg: 'leftUpperLeg',
  rightUpperLeg: 'hips',
  rightLowerLeg: 'rightUpperLeg',
};

/** Approximate segment half-lengths (m) for capsule colliders */
const SEGMENT_HALF_HEIGHTS: Record<string, number> = {
  hips: 0.12,
  spine: 0.1,
  chest: 0.1,
  head: 0.1,
  leftUpperArm: 0.18,
  leftLowerArm: 0.2,
  rightUpperArm: 0.18,
  rightLowerArm: 0.2,
  leftUpperLeg: 0.35,
  leftLowerLeg: 0.35,
  rightUpperLeg: 0.35,
  rightLowerLeg: 0.35,
};

const SEGMENT_RADII: Record<string, number> = {
  hips: 0.12,
  spine: 0.08,
  chest: 0.1,
  head: 0.1,
  leftUpperArm: 0.04,
  leftLowerArm: 0.035,
  rightUpperArm: 0.04,
  rightLowerArm: 0.035,
  leftUpperLeg: 0.06,
  leftLowerLeg: 0.05,
  rightUpperLeg: 0.06,
  rightLowerLeg: 0.05,
};

export interface RagdollBoneMapping {
  rawBoneName: string;
  ragdollBone: (typeof RAGDOLL_BONES)[number];
}

export class Ragdoll {
  private bodies: Map<string, RAPIER.RigidBody> = new Map();
  private joints: RAPIER.ImpulseJoint[] = [];
  private boneToBody: Map<string, RAPIER.RigidBody> = new Map();
  private physics: PhysicsWorld;
  private mapping: RagdollBoneMapping[];
  private _pos = new THREE.Vector3();
  private _quat = new THREE.Quaternion();
  private _parentQuat = new THREE.Quaternion();

  constructor(physics: PhysicsWorld, boneMapping: RagdollBoneMapping[]) {
    this.physics = physics;
    this.mapping = boneMapping;
  }

  /**
   * Activate the ragdoll. Reads current bone poses from the mesh to set initial body positions.
   */
  activate(mesh: THREE.Object3D): void {
    mesh.updateMatrixWorld(true);

    for (const { rawBoneName, ragdollBone } of this.mapping) {
      const node = mesh.getObjectByName(rawBoneName);
      if (!node) continue;
      const bone = ragdollBone;

      node.getWorldPosition(this._pos);
      node.getWorldQuaternion(this._quat);

      const halfH = SEGMENT_HALF_HEIGHTS[ragdollBone] ?? 0.1;
      const radius = SEGMENT_RADII[ragdollBone] ?? 0.05;
      const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(this._pos.x, this._pos.y, this._pos.z)
        .setRotation({ x: this._quat.x, y: this._quat.y, z: this._quat.z, w: this._quat.w })
        .setLinearDamping(1.5)
        .setAngularDamping(2);

      const body = this.physics.world.createRigidBody(bodyDesc);
      const colliderDesc = RAPIER.ColliderDesc.capsule(halfH, radius)
        .setDensity(45)
        .setCollisionGroups((0x0002 << 16) | 0xfffd);
      this.physics.world.createCollider(colliderDesc, body);
      this.bodies.set(ragdollBone, body);
      this.boneToBody.set(ragdollBone, body);
    }

    const pelvis = this.bodies.get('hips');
    if (pelvis) {
      pelvis.applyImpulse({ x: 0, y: -3, z: 0 }, true);
    }

    const R = this.physics.rapier;
    for (const [child, parent] of Object.entries(BONE_PARENT)) {
      const body1 = this.bodies.get(parent);
      const body2 = this.bodies.get(child);
      if (!body1 || !body2) continue;

      const pos1 = body1.translation();
      const pos2 = body2.translation();
      const midX = (pos1.x + pos2.x) * 0.5;
      const midY = (pos1.y + pos2.y) * 0.5;
      const midZ = (pos1.z + pos2.z) * 0.5;

      const anchor1 = new R.Vector3(midX - pos1.x, midY - pos1.y, midZ - pos1.z);
      const anchor2 = new R.Vector3(midX - pos2.x, midY - pos2.y, midZ - pos2.z);
      const jointData = R.JointData.spherical(anchor1, anchor2);
      jointData.stiffness = 25;
      jointData.damping = 3;
      const joint = this.physics.world.createImpulseJoint(jointData, body1, body2, true);
      this.joints.push(joint);
    }
  }

  /**
   * Sync physics body transforms to skeleton bones. Call each frame after physics step.
   * Bones are set in their parent's local space so the skeleton matches the ragdoll.
   */
  syncToSkeleton(mesh: THREE.Object3D): void {
    mesh.updateMatrixWorld(true);

    for (const { rawBoneName, ragdollBone } of this.mapping) {
      const body = this.boneToBody.get(ragdollBone);
      const node = mesh.getObjectByName(rawBoneName);
      if (!body || !node?.parent) continue;

      const t = body.translation();
      const r = body.rotation();
      this._pos.set(t.x, t.y, t.z);
      this._quat.set(r.x, r.y, r.z, r.w);
      node.parent.updateMatrixWorld(true);
      const parentWorldInv = new THREE.Matrix4().copy(node.parent.matrixWorld).invert();
      this._pos.applyMatrix4(parentWorldInv);
      node.parent.getWorldQuaternion(this._parentQuat).invert();
      this._quat.premultiply(this._parentQuat);
      node.position.copy(this._pos);
      node.quaternion.copy(this._quat);
    }
    mesh.updateMatrixWorld(true);
  }

  /** Get pelvis position for moving the character group */
  getPelvisPosition(out: THREE.Vector3): void {
    const pelvis = this.bodies.get('hips');
    if (pelvis) {
      const t = pelvis.translation();
      out.set(t.x, t.y, t.z);
    }
  }

  getPelvisQuaternion(out: THREE.Quaternion): void {
    const pelvis = this.bodies.get('hips');
    if (pelvis) {
      const r = pelvis.rotation();
      out.set(r.x, r.y, r.z, r.w);
    }
  }

  dispose(): void {
    for (const joint of this.joints) {
      try {
        this.physics.world.removeImpulseJoint(joint, false);
      } catch {
        /* already removed */
      }
    }
    this.joints.length = 0;
    for (const body of this.bodies.values()) {
      try {
        this.physics.world.removeRigidBody(body);
      } catch {
        /* already removed */
      }
    }
    this.bodies.clear();
    this.boneToBody.clear();
  }
}

/** Build bone mapping from VRM humanoid to ragdoll bodies */
export function buildRagdollBoneMapping(vrm: { humanoid?: { getRawBoneNode: (name: never) => { name: string } | null } }): RagdollBoneMapping[] {
  const humanoid = vrm?.humanoid;
  if (!humanoid) return [];
  const out: RagdollBoneMapping[] = [];
  for (const bone of RAGDOLL_BONES) {
    const node = humanoid.getRawBoneNode(bone as never);
    if (node) out.push({ rawBoneName: node.name, ragdollBone: bone });
  }
  return out;
}
