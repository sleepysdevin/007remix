/**
 * Builds low-poly 3D enemy models from box primitives.
 * N64-style chunky geometry with flat shading.
 */

import * as THREE from 'three';
import type { GuardVariant } from '../sprite/guard-sprite-sheet';

// Shared geometry — reused by all enemies
const GEOS = {
  torso: new THREE.BoxGeometry(0.4, 0.45, 0.22),
  vest: new THREE.BoxGeometry(0.36, 0.4, 0.2),
  belt: new THREE.BoxGeometry(0.38, 0.06, 0.2),
  head: new THREE.BoxGeometry(0.22, 0.22, 0.22),
  eye: new THREE.BoxGeometry(0.05, 0.05, 0.01),
  upperArm: new THREE.BoxGeometry(0.1, 0.2, 0.1),
  lowerArm: new THREE.BoxGeometry(0.08, 0.18, 0.08),
  hand: new THREE.BoxGeometry(0.06, 0.06, 0.06),
  upperLeg: new THREE.BoxGeometry(0.12, 0.25, 0.12),
  lowerLeg: new THREE.BoxGeometry(0.1, 0.22, 0.1),
  boot: new THREE.BoxGeometry(0.12, 0.06, 0.14),
  helmet: new THREE.BoxGeometry(0.24, 0.12, 0.24),
  cap: new THREE.BoxGeometry(0.2, 0.04, 0.2),
  beret: new THREE.BoxGeometry(0.2, 0.03, 0.2),
  rifleReceiver: new THREE.BoxGeometry(0.06, 0.05, 0.25),
  rifleBarrel: new THREE.BoxGeometry(0.04, 0.04, 0.15),
};

export interface GuardModelJoints {
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  leftShoulder: THREE.Group;
  rightShoulder: THREE.Group;
  leftElbow: THREE.Group;
  rightElbow: THREE.Group;
  leftHip: THREE.Group;
  rightHip: THREE.Group;
  leftKnee: THREE.Group;
  rightKnee: THREE.Group;
}

export interface GuardModelResult {
  rootGroup: THREE.Group;
  joints: GuardModelJoints;
  hitFlashMeshes: THREE.Mesh[];
}

const materialCache = new Map<string, THREE.MeshStandardMaterial>();

function getMat(key: string, color: number): THREE.MeshStandardMaterial {
  const k = `${key}-${color.toString(16)}`;
  let m = materialCache.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      flatShading: true,
      roughness: 0.7,
      metalness: 0.1,
    });
    materialCache.set(k, m);
  }
  return m;
}

function getMetalMat(key: string, color: number): THREE.MeshStandardMaterial {
  const k = `${key}-metal-${color.toString(16)}`;
  let m = materialCache.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      flatShading: true,
      roughness: 0.4,
      metalness: 0.6,
    });
    materialCache.set(k, m);
  }
  return m;
}

function parseColor(hex: string | undefined): number {
  if (!hex) {
    console.warn('[parseColor] Undefined color provided, using default 0xff0000');
    return 0xff0000; // Default red color for missing values
  }
  return parseInt(hex.replace('#', ''), 16);
}

export function createGuardModel(variant: GuardVariant): GuardModelResult {
  console.log('[createGuardModel] Starting guard model creation for variant:', variant);
  
  const uniformColor = parseColor(variant.uniformColor);
  const vestColor = parseColor(variant.vestColor);
  const skinTone = parseColor(variant.skinTone);
  const darkColor = 0x1a1a1a;

  const rootGroup = new THREE.Group();
  const hitFlashMeshes: THREE.Mesh[] = [];

  // Scale to human height (~1.75m) — base model is ~1.45m
  const MODEL_SCALE = 1.2;
  rootGroup.scale.setScalar(MODEL_SCALE);
  console.log('[createGuardModel] Model scale set to:', MODEL_SCALE);

  // Offset so boot bottoms touch y=0 at rest pose.
  // Boot bottom is at y≈0.40 in model space; after 1.2x scale = 0.48 in parent space.
  rootGroup.position.y = -0.48;

  // Hips at waist height
  const hips = new THREE.Group();
  hips.position.set(0, 0.9, 0);
  rootGroup.add(hips);

  // Torso — bottom at hips (0.225 = half of 0.45 height)
  const torso = new THREE.Group();
  torso.position.set(0, 0.225, 0);
  hips.add(torso);

  const torsoMat = getMat('torso', uniformColor).clone();
  const torsoMesh = new THREE.Mesh(GEOS.torso, torsoMat);
  (torsoMesh.userData as Record<string, number>).originalColor = torsoMat.color.getHex();
  torsoMesh.position.set(0, 0, 0);
  torsoMesh.castShadow = true;
  torsoMesh.receiveShadow = true;
  torso.add(torsoMesh);
  hitFlashMeshes.push(torsoMesh);

  const vestMat = getMat('vest', vestColor).clone();
  const vestMesh = new THREE.Mesh(GEOS.vest, vestMat);
  (vestMesh.userData as Record<string, number>).originalColor = vestMat.color.getHex();
  vestMesh.position.set(0, 0.02, 0);
  vestMesh.castShadow = true;
  vestMesh.receiveShadow = true;
  torso.add(vestMesh);
  hitFlashMeshes.push(vestMesh);

  const beltMesh = new THREE.Mesh(GEOS.belt, getMat('belt', 0x35382e));
  beltMesh.position.set(0, -0.21, 0);  // lower to bridge torso-leg gap
  torso.add(beltMesh);

  // Head — torso mesh extends -0.225 to +0.225 in Y, so top at 0.225
  const head = new THREE.Group();
  head.position.set(0, 0.225, 0);  // head bottom at torso top
  torso.add(head);

  // Neck — fills gap between head and torso, skin tone
  const neckMat = getMat('neck', skinTone).clone();
  const neck = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.06, 0.14),
    neckMat,
  );
  (neck.userData as Record<string, number>).originalColor = neckMat.color.getHex();
  neck.position.set(0, 0.03, 0);
  head.add(neck);
  hitFlashMeshes.push(neck);

  const headMat = getMat('head', skinTone).clone();
  const headMesh = new THREE.Mesh(GEOS.head, headMat);
  (headMesh.userData as Record<string, number>).originalColor = headMat.color.getHex();
  headMesh.position.set(0, 0.17, 0);  // head above neck (0.06 + 0.22/2)
  headMesh.castShadow = true;
  headMesh.receiveShadow = true;
  head.add(headMesh);
  hitFlashMeshes.push(headMesh);

  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const leftEye = new THREE.Mesh(GEOS.eye, eyeMat);
  leftEye.position.set(-0.04, 0.13, 0.115);
  head.add(leftEye);
  const rightEye = new THREE.Mesh(GEOS.eye, eyeMat);
  rightEye.position.set(0.04, 0.13, 0.115);
  head.add(rightEye);

  // Headgear — raised so they sit on top of head, not covering face
  const headgearMat = getMat('headgear', 0x3d4242);
  if (variant.headgear === 'helmet' || variant.headgear === 'helmet_net') {
    const helmet = new THREE.Mesh(GEOS.helmet, headgearMat);
    helmet.position.set(0, 0.32, 0);  // clear head top to avoid z-fighting/flicker
    helmet.castShadow = true;
    helmet.receiveShadow = true;
    helmet.frustumCulled = false;
    const helmetMat = helmet.material as THREE.MeshStandardMaterial;
    helmetMat.polygonOffset = true;
    helmetMat.polygonOffsetFactor = -1;
    helmetMat.polygonOffsetUnits = -1;
    head.add(helmet);
  } else if (variant.headgear === 'cap') {
    const cap = new THREE.Mesh(GEOS.cap, getMat('cap', 0x1e1e26));
    cap.position.set(0, 0.285, 0);
    cap.castShadow = true;
    cap.receiveShadow = true;
    cap.frustumCulled = false;
    const capMat = cap.material as THREE.MeshStandardMaterial;
    capMat.polygonOffset = true;
    capMat.polygonOffsetFactor = -1;
    capMat.polygonOffsetUnits = -1;
    head.add(cap);
  } else if (variant.headgear === 'beret') {
    const beret = new THREE.Mesh(GEOS.beret, getMat('beret', 0x4a2a2a));
    beret.position.set(0, 0.285, 0.02);
    beret.castShadow = true;
    beret.receiveShadow = true;
    beret.frustumCulled = false;
    const beretMat = beret.material as THREE.MeshStandardMaterial;
    beretMat.polygonOffset = true;
    beretMat.polygonOffsetFactor = -1;
    beretMat.polygonOffsetUnits = -1;
    head.add(beret);
  }

  // Left arm
  const leftShoulder = new THREE.Group();
  leftShoulder.position.set(-0.22, 0.15, 0);
  torso.add(leftShoulder);

  const leftArmMat = getMat('arm', uniformColor).clone();
  const leftUpperArm = new THREE.Mesh(GEOS.upperArm, leftArmMat);
  (leftUpperArm.userData as Record<string, number>).originalColor = leftArmMat.color.getHex();
  leftUpperArm.position.set(0, -0.1, 0);
  leftUpperArm.castShadow = true;
  leftUpperArm.receiveShadow = true;
  leftShoulder.add(leftUpperArm);
  hitFlashMeshes.push(leftUpperArm);

  const leftElbow = new THREE.Group();
  leftElbow.position.set(0, -0.2, 0);
  leftShoulder.add(leftElbow);

  const leftLowerArm = new THREE.Mesh(GEOS.lowerArm, getMat('arm', uniformColor));
  leftLowerArm.position.set(0, -0.09, 0);
  leftElbow.add(leftLowerArm);

  const leftHand = new THREE.Mesh(GEOS.hand, getMat('hand', skinTone));
  leftHand.position.set(0, -0.18, 0);
  leftElbow.add(leftHand);

  // Right arm (with rifle)
  const rightShoulder = new THREE.Group();
  rightShoulder.position.set(0.22, 0.15, 0);
  torso.add(rightShoulder);

  const rightArmMat = getMat('arm', uniformColor).clone();
  const rightUpperArm = new THREE.Mesh(GEOS.upperArm, rightArmMat);
  (rightUpperArm.userData as Record<string, number>).originalColor = rightArmMat.color.getHex();
  rightUpperArm.position.set(0, -0.1, 0);
  rightUpperArm.castShadow = true;
  rightUpperArm.receiveShadow = true;
  rightShoulder.add(rightUpperArm);
  hitFlashMeshes.push(rightUpperArm);

  const rightElbow = new THREE.Group();
  rightElbow.position.set(0, -0.2, 0);
  rightShoulder.add(rightElbow);

  const rightLowerArm = new THREE.Mesh(GEOS.lowerArm, getMat('arm', uniformColor));
  rightLowerArm.position.set(0, -0.09, 0);
  rightElbow.add(rightLowerArm);

  const rightHand = new THREE.Mesh(GEOS.hand, getMat('hand', skinTone));
  rightHand.position.set(0, -0.18, 0);
  rightElbow.add(rightHand);

  // Weapon is attached by EnemyModel on a stable aiming pivot.

  // Legs — connect at waist (hips origin); leg swing uses Z axis for forward/back
  const leftHip = new THREE.Group();
  leftHip.position.set(-0.1, 0, 0);  // at waist, no gap below torso
  hips.add(leftHip);

  const leftLegMat = getMat('leg', uniformColor).clone();
  const leftUpperLeg = new THREE.Mesh(GEOS.upperLeg, leftLegMat);
  (leftUpperLeg.userData as Record<string, number>).originalColor = leftLegMat.color.getHex();
  leftUpperLeg.position.set(0, -0.125, 0);
  leftUpperLeg.castShadow = true;
  leftUpperLeg.receiveShadow = true;
  leftHip.add(leftUpperLeg);
  hitFlashMeshes.push(leftUpperLeg);

  const leftKnee = new THREE.Group();
  leftKnee.position.set(0, -0.25, 0);
  leftHip.add(leftKnee);

  const leftLowerLeg = new THREE.Mesh(GEOS.lowerLeg, getMat('leg', uniformColor));
  leftLowerLeg.position.set(0, -0.11, 0);
  leftKnee.add(leftLowerLeg);

  const leftBoot = new THREE.Mesh(GEOS.boot, getMat('boot', 0x1a1a1a));
  leftBoot.position.set(0, -0.22, 0.02);
  leftKnee.add(leftBoot);

  // Right leg
  const rightHip = new THREE.Group();
  rightHip.position.set(0.1, 0, 0);
  hips.add(rightHip);

  const rightLegMat = getMat('leg', uniformColor).clone();
  const rightUpperLeg = new THREE.Mesh(GEOS.upperLeg, rightLegMat);
  (rightUpperLeg.userData as Record<string, number>).originalColor = rightLegMat.color.getHex();
  rightUpperLeg.position.set(0, -0.125, 0);
  rightUpperLeg.castShadow = true;
  rightUpperLeg.receiveShadow = true;
  rightHip.add(rightUpperLeg);
  hitFlashMeshes.push(rightUpperLeg);

  const rightKnee = new THREE.Group();
  rightKnee.position.set(0, -0.25, 0);
  rightHip.add(rightKnee);

  const rightLowerLeg = new THREE.Mesh(GEOS.lowerLeg, getMat('leg', uniformColor));
  rightLowerLeg.position.set(0, -0.11, 0);
  rightKnee.add(rightLowerLeg);

  const rightBoot = new THREE.Mesh(GEOS.boot, getMat('boot', 0x1a1a1a));
  rightBoot.position.set(0, -0.22, 0.02);
  rightKnee.add(rightBoot);

  console.log('[createGuardModel] Guard model creation completed successfully');
  return {
    rootGroup,
    joints: {
      hips,
      torso,
      head,
      leftShoulder,
      rightShoulder,
      leftElbow,
      rightElbow,
      leftHip,
      rightHip,
      leftKnee,
      rightKnee,
    },
    hitFlashMeshes,
  };
}
