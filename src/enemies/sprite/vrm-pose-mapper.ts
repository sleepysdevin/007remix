/**
 * Maps our pose-library joint rotations to VRM humanoid bone names.
 * VRM 1.0 uses lowercase bone names (hips, spine, leftUpperArm, etc.)
 */

import * as THREE from 'three';
import type { Pose } from '../model/pose-library';

function eulerToQuaternionArray(x: number, y: number, z: number): [number, number, number, number] {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
  return [q.x, q.y, q.z, q.w];
}

export function poseToVRMPose(pose: Pose): Record<string, { rotation?: [number, number, number, number]; position?: [number, number, number] }> {
  const get = (k: keyof Pose) => (pose[k] ?? 0) as number;
  const vrm: Record<string, { rotation?: [number, number, number, number]; position?: [number, number, number] }> = {};

  vrm.hips = { position: [0, get('hipsY'), 0] };
  vrm.spine = { rotation: eulerToQuaternionArray(get('torsoX'), 0, get('torsoZ')) };
  vrm.chest = { rotation: eulerToQuaternionArray(get('torsoX'), 0, get('torsoZ')) };
  vrm.head = { rotation: eulerToQuaternionArray(get('headX'), get('headY'), get('headZ')) };
  vrm.leftUpperArm = { rotation: eulerToQuaternionArray(get('leftShoulderX'), 0, get('leftShoulderZ')) };
  vrm.leftLowerArm = { rotation: eulerToQuaternionArray(get('leftElbowX'), 0, 0) };
  vrm.rightUpperArm = { rotation: eulerToQuaternionArray(get('rightShoulderX'), 0, get('rightShoulderZ')) };
  vrm.rightLowerArm = { rotation: eulerToQuaternionArray(get('rightElbowX'), 0, 0) };
  vrm.leftUpperLeg = { rotation: eulerToQuaternionArray(get('leftHipX'), 0, 0) };
  vrm.leftLowerLeg = { rotation: eulerToQuaternionArray(get('leftKneeX'), 0, 0) };
  vrm.rightUpperLeg = { rotation: eulerToQuaternionArray(get('rightHipX'), 0, 0) };
  vrm.rightLowerLeg = { rotation: eulerToQuaternionArray(get('rightKneeX'), 0, 0) };

  return vrm;
}
