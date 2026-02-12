/**
 * Maps our pose-library joint rotations to VRM humanoid bone names.
 * VRM 1.0 uses lowercase bone names (hips, spine, leftUpperArm, etc.)
 *
 * Hit/death work with Euler Y+Z (leftShoulderX on Y, leftShoulderZ on Z).
 * Walk shoulder swing is weak — we apply swing to BOTH Y and Z to maximise
 * visible motion from front, and amplify walk swing for sprite visibility.
 */

import * as THREE from 'three';
import type { Pose } from '../model/pose-library';

function eulerToQuaternionArray(x: number, y: number, z: number): [number, number, number, number] {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
  return [q.x, q.y, q.z, q.w];
}

/** Subtle arm swing for walk — keeps arms down but adds side-to-side motion */
const WALK_SWING_AMP = 0.5;

/** Amplify leg stride for walk — more noticeable leg gap/motion in baked sprites */
const WALK_LEG_AMP = 1.45;

/** Downward pull so BOTH arms rest in A-pose. Sign flipped — was making arms point up. */
const ARMS_DOWN_Y = 0.85;

/** Reduce spread when neutral to bring arms from T-pose to A-pose (angled down). */
const ARM_DOWN_OFFSET = 0.95;

function getSwingVal(swing: number, spread: number): number {
  if (Math.abs(spread) >= 0.15) return swing;
  return swing * WALK_SWING_AMP;
}

/** Apply arm-down offset only for idle/walk (small spread); hit/death keep full spread. */
function getSpreadWithDown(spread: number): number {
  return Math.abs(spread) < 0.2 ? spread - ARM_DOWN_OFFSET : spread;
}

/** Same Y value for both arms when idle/walk — symmetric A-pose. */
function getArmY(swing: number, spread: number): number {
  if (Math.abs(spread) >= 0.2) return swing;
  return swing + ARMS_DOWN_Y;
}

export function poseToVRMPose(pose: Pose): Record<string, { rotation?: [number, number, number, number]; position?: [number, number, number] }> {
  const get = (k: keyof Pose) => (pose[k] ?? 0) as number;
  const vrm: Record<string, { rotation?: [number, number, number, number]; position?: [number, number, number] }> = {};

  vrm.hips = { position: [0, get('hipsY'), 0] };
  vrm.spine = { rotation: eulerToQuaternionArray(get('torsoX'), 0, get('torsoZ')) };
  vrm.chest = { rotation: eulerToQuaternionArray(get('torsoX'), 0, get('torsoZ')) };
  vrm.head = { rotation: eulerToQuaternionArray(get('headX'), get('headY'), get('headZ')) };

  // Arms: use individual swings for side-to-side motion; negate right for symmetry; negate to flip down.
  const isIdleWalk = Math.abs(get('leftShoulderZ')) < 0.2 && Math.abs(get('rightShoulderZ')) < 0.2;
  const lSpread = getSpreadWithDown(get('leftShoulderZ'));
  const rSpread = getSpreadWithDown(get('rightShoulderZ'));
  const lSwing = getSwingVal(get('leftShoulderX'), get('leftShoulderZ'));
  const rSwing = getSwingVal(get('rightShoulderX'), get('rightShoulderZ'));
  let armY = isIdleWalk ? getArmY(lSwing, get('leftShoulderZ')) : lSwing;
  let armZ = isIdleWalk ? (lSpread + rSpread) / 2 : 0;
  if (isIdleWalk) {
    armY = -armY;
    armZ = -armZ;
  }
  const rArmY = isIdleWalk ? -getArmY(rSwing, get('rightShoulderZ')) : rSwing;
  const rArmZ = isIdleWalk ? -armZ : rSpread;
  vrm.leftUpperArm = { rotation: eulerToQuaternionArray(0, armY, isIdleWalk ? armZ : lSpread) };
  vrm.leftLowerArm = { rotation: eulerToQuaternionArray(get('leftElbowX'), 0, 0) };
  vrm.rightUpperArm = { rotation: eulerToQuaternionArray(0, rArmY, rArmZ) };
  vrm.rightLowerArm = { rotation: eulerToQuaternionArray(get('rightElbowX'), 0, 0) };

  const legAmp = isIdleWalk ? WALK_LEG_AMP : 1;
  // VRM right-side bones often use mirrored local axes; negate right leg so both swing visibly
  const leftHip = get('leftHipX') * legAmp;
  const rightHip = -get('rightHipX') * legAmp;
  const leftKnee = get('leftKneeX') * legAmp;
  const rightKnee = -get('rightKneeX') * legAmp;
  vrm.leftUpperLeg = { rotation: eulerToQuaternionArray(leftHip, 0, 0) };
  vrm.leftLowerLeg = { rotation: eulerToQuaternionArray(leftKnee, 0, 0) };
  vrm.rightUpperLeg = { rotation: eulerToQuaternionArray(rightHip, 0, 0) };
  vrm.rightLowerLeg = { rotation: eulerToQuaternionArray(rightKnee, 0, 0) };

  return vrm;
}
