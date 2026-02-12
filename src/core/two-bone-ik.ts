/**
 * Two-bone inverse kinematics.
 * Places foot at target position by rotating upper and lower leg.
 * Chain: hip (a) -> knee (b) -> foot (c). Target = t.
 */

import * as THREE from 'three';

const _tmp = new THREE.Vector3();

/** Rotation that takes unit vector u to v */
function rotationBetween(u: THREE.Vector3, v: THREE.Vector3, eps = 1e-5): THREE.Quaternion {
  const axis = new THREE.Vector3().crossVectors(u, v);
  const len = axis.length();
  if (len < eps) return new THREE.Quaternion();
  axis.divideScalar(len);
  const angle = Math.acos(Math.max(-1, Math.min(1, u.dot(v))));
  return new THREE.Quaternion().setFromAxisAngle(axis, angle);
}

/** Perpendicular to n, biased toward hint (for knee bend direction) */
function perpendicularUnit(n: THREE.Vector3, hint: THREE.Vector3): THREE.Vector3 {
  const v = _tmp.copy(hint).sub(n.clone().multiplyScalar(hint.dot(n)));
  const len = v.length();
  if (len < 1e-6) {
    v.set(Math.abs(n.y) < 0.9 ? 0 : 1, Math.abs(n.y) < 0.9 ? 1 : 0, 0);
    v.sub(n.clone().multiplyScalar(v.dot(n))).normalize();
  } else {
    v.divideScalar(len);
  }
  return v;
}

/**
 * Solve two-bone IK: place foot at target by rotating upper (hip) and lower (knee) leg.
 * a=hip, b=knee, c=foot (world positions), t=target foot position.
 * Modifies upperBone and lowerBone quaternions. Call after mesh.updateMatrixWorld(true).
 */
export function solveTwoBoneIK(
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  t: THREE.Vector3,
  upperBone: THREE.Object3D,
  lowerBone: THREE.Object3D
): void {
  const lenAb = a.distanceTo(b);
  const lenBc = b.distanceTo(c);
  const lenAt = a.distanceTo(t);

  if (lenAb < 1e-6 || lenBc < 1e-6) return;

  let bFinal: THREE.Vector3;
  let cFinal: THREE.Vector3;

  const n = new THREE.Vector3().subVectors(a, t);
  if (lenAt < 1e-4) n.set(1, 0, 0);
  else n.normalize();

  if (lenAt < Math.abs(lenAb - lenBc) - 1e-6) {
    const sign = lenAb > lenBc ? 1 : -1;
    bFinal = a.clone().add(n.clone().multiplyScalar(-sign * lenAb));
    cFinal = bFinal.clone().add(n.clone().multiplyScalar(sign * lenBc));
  } else if (lenAt <= lenAb + lenBc + 1e-6) {
    cFinal = t.clone();
    const cosTheta =
      (lenBc * lenBc - lenAb * lenAb - lenAt * lenAt) / (-2 * lenAb * lenAt);
    const cosThetaClamped = Math.max(-1, Math.min(1, cosTheta));
    const sinTheta = Math.sqrt(1 - cosThetaClamped * cosThetaClamped);
    const r = lenAb * sinTheta;
    const m = a.clone().add(n.clone().multiplyScalar(-lenAb * cosThetaClamped));
    const u = perpendicularUnit(n, b.clone().sub(m));
    bFinal = m.clone().add(u.multiplyScalar(r));
  } else {
    bFinal = a.clone().add(n.clone().multiplyScalar(-lenAb));
    cFinal = bFinal.clone().add(n.clone().multiplyScalar(-lenBc));
  }

  // Upper bone: rotate so hip->knee points to hip->bFinal. Work in upper bone's parent frame.
  const upperParent = upperBone.parent;
  if (!upperParent) return;
  upperParent.updateMatrixWorld(true);
  const upperParentInv = new THREE.Matrix4().copy(upperParent.matrixWorld).invert();
  const localB = b.clone().applyMatrix4(upperParentInv).sub(a.clone().applyMatrix4(upperParentInv)).normalize();
  const localBFinal = bFinal.clone().applyMatrix4(upperParentInv).sub(a.clone().applyMatrix4(upperParentInv)).normalize();
  if (localB.length() > 1e-6 && localBFinal.length() > 1e-6) {
    const rotUpper = rotationBetween(localB, localBFinal);
    upperBone.quaternion.premultiply(rotUpper);
    upperBone.updateMatrixWorld(true);
  }

  // Lower bone: rotate so knee->foot points to bFinal->cFinal. Work in upper bone (knee parent) frame.
  const kneeInv = new THREE.Matrix4().copy(upperBone.matrixWorld).invert();
  const localC = c.clone().applyMatrix4(kneeInv).sub(bFinal.clone().applyMatrix4(kneeInv)).normalize();
  const localCFinal = cFinal.clone().applyMatrix4(kneeInv).sub(bFinal.clone().applyMatrix4(kneeInv)).normalize();
  if (localC.length() > 1e-6 && localCFinal.length() > 1e-6) {
    const rotLower = rotationBetween(localC, localCFinal);
    lowerBone.quaternion.premultiply(rotLower);
  }
}
