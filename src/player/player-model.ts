import * as THREE from 'three';
import { globalLightPool } from '../core/light-pool';
import type { LoadedCharacter } from '../core/model-loader';

/**
 * Creates a low-poly 3D player character model for remote players.
 * Similar to enemy models but with distinct player colors.
 */

const PLAYER_COLORS = [
  0x4488ff, // Blue
  0xff4444, // Red
  0x44ff44, // Green
  0xffaa44, // Orange
  0xff44ff, // Magenta
  0x44ffff, // Cyan
  0xffff44, // Yellow
  0xff8844, // Burnt orange
];

let colorIndex = 0;

/**
 * Build a simple low-poly humanoid player model.
 * Uses BoxGeometry primitives with flat shading for retro N64-style look.
 */
export function buildPlayerModel(playerId: string): THREE.Group {
  const root = new THREE.Group();

  // Assign unique color per player (cycles through colors)
  const playerColor = PLAYER_COLORS[colorIndex % PLAYER_COLORS.length];
  colorIndex++;

  // Materials with flat shading for low-poly look + enhanced visual depth
  const bodyMat = new THREE.MeshStandardMaterial({
    color: playerColor,
    flatShading: true,
    roughness: 0.6,
    metalness: 0.3,
    emissive: playerColor,
    emissiveIntensity: 0.15, // Subtle glow for team identification
  });

  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x222222,
    flatShading: true,
    roughness: 0.7,
    metalness: 0.1,
  });

  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xd4a57a,
    flatShading: true,
    roughness: 0.9,
    metalness: 0.0,
  });

  const armorMat = new THREE.MeshStandardMaterial({
    color: 0x444444,
    flatShading: true,
    roughness: 0.4,
    metalness: 0.6, // More metallic for tactical armor look
    emissive: 0x222222,
    emissiveIntensity: 0.1,
  });

  // Hips (root transform point at center of character)
  const hips = new THREE.Group();
  hips.position.y = 0.9;
  root.add(hips);

  // Torso (main body with armor vest)
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.22), bodyMat);
  torso.position.y = 0.25;
  hips.add(torso);

  // Tactical vest overlay (adds visual depth)
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.35, 0.24), armorMat);
  vest.position.y = 0.3;
  hips.add(vest);

  // Head
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), skinMat);
  head.position.y = 0.61;
  hips.add(head);

  // Eyes (two small dark boxes)
  const leftEye = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.02), darkMat);
  leftEye.position.set(-0.06, 0.64, 0.11);
  hips.add(leftEye);

  const rightEye = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.02), darkMat);
  rightEye.position.set(0.06, 0.64, 0.11);
  hips.add(rightEye);

  // Arms (simple boxes extending from shoulders)
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.26, 0.3, 0);
  hips.add(leftArm);

  const leftArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.4, 0.12), bodyMat);
  leftArmMesh.position.y = 0; // Centered on arm group
  leftArm.add(leftArmMesh);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.26, 0.3, 0);
  hips.add(rightArm);

  const rightArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.4, 0.12), bodyMat);
  rightArmMesh.position.y = 0; // Centered on arm group
  rightArm.add(rightArmMesh);

  // Hands (attached to arms, not hips)
  const leftHand = new THREE.Group();
  leftHand.position.set(0, -0.22, 0); // Relative to arm position
  leftArm.add(leftHand);

  const leftPalm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), skinMat);
  leftHand.add(leftPalm);

  // Left fingers
  for (let i = 0; i < 4; i++) {
    const finger = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.02), skinMat);
    finger.position.set(-0.03 + i * 0.02, -0.07, 0.03);
    leftHand.add(finger);
  }

  const rightHand = new THREE.Group();
  rightHand.position.set(0, -0.22, 0); // Relative to arm position
  rightArm.add(rightHand);

  const rightPalm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), skinMat);
  rightHand.add(rightPalm);

  // Right fingers
  for (let i = 0; i < 4; i++) {
    const finger = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.02), skinMat);
    finger.position.set(-0.03 + i * 0.02, -0.07, 0.03);
    rightHand.add(finger);
  }

  // Legs with knee joints for bending animation
  // Left leg
  const leftUpperLeg = new THREE.Group();
  leftUpperLeg.position.set(-0.1, 0, 0); // At hip level
  hips.add(leftUpperLeg);

  const leftThigh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.22, 0.14), darkMat);
  leftThigh.position.y = -0.11; // Centered on upper leg group
  leftThigh.castShadow = true;
  leftUpperLeg.add(leftThigh);

  // Knee joint (lower leg pivots here)
  const leftLowerLeg = new THREE.Group();
  leftLowerLeg.position.y = -0.22; // At knee position
  leftUpperLeg.add(leftLowerLeg);

  const leftCalf = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.23, 0.14), darkMat);
  leftCalf.position.y = -0.115; // Centered on lower leg group
  leftCalf.castShadow = true;
  leftLowerLeg.add(leftCalf);

  // Right leg
  const rightUpperLeg = new THREE.Group();
  rightUpperLeg.position.set(0.1, 0, 0); // At hip level
  hips.add(rightUpperLeg);

  const rightThigh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.22, 0.14), darkMat);
  rightThigh.position.y = -0.11;
  rightThigh.castShadow = true;
  rightUpperLeg.add(rightThigh);

  const rightLowerLeg = new THREE.Group();
  rightLowerLeg.position.y = -0.22;
  rightUpperLeg.add(rightLowerLeg);

  const rightCalf = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.23, 0.14), darkMat);
  rightCalf.position.y = -0.115;
  rightCalf.castShadow = true;
  rightLowerLeg.add(rightCalf);

  // Boots (attached to lower legs)
  const leftBoot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.2), new THREE.MeshStandardMaterial({
    color: 0x111111,
    flatShading: true,
    roughness: 0.9,
  }));
  leftBoot.position.set(0, -0.28, 0.03); // Relative to lower leg
  leftLowerLeg.add(leftBoot);

  const rightBoot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.2), new THREE.MeshStandardMaterial({
    color: 0x111111,
    flatShading: true,
    roughness: 0.9,
  }));
  rightBoot.position.set(0, -0.28, 0.03);
  rightLowerLeg.add(rightBoot);

  // Weapon will be added separately via setWeapon() method
  // Store weapon attachment point (positioned in left hand for third-person view)
  root.userData.weaponAttachPoint = {
    // Attach to left hand - position relative to hand center
    x: -0.02, // Slight offset (mirror for left hand)
    y: 0.02,
    z: 0.06,
    rotationX: Math.PI / 2,
    rotationY: Math.PI,
    rotationZ: 0,
    attachToLeftHand: true,
  };

  // Cast shadows
  torso.castShadow = true;
  vest.castShadow = true;
  head.castShadow = true;
  leftArmMesh.castShadow = true;
  rightArmMesh.castShadow = true;

  // Store player ID for identification
  root.userData.playerId = playerId;

  return root;
}

const TARGET_PLAYER_HEIGHT = 1.7;

/**
 * Build a player model from a loaded GLB/VRM.
 * Used for remote players when customPlayerModelPath is set.
 */
export function buildPlayerModelFromCharacter(playerId: string, char: LoadedCharacter): THREE.Group {
  const root = new THREE.Group();
  const scene = char.scene.clone(true);

  fixMaterialsForPlayer(scene);

  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = TARGET_PLAYER_HEIGHT / Math.max(size.y, 0.01);
  scene.scale.setScalar(scale);
  scene.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);

  root.add(scene);

  root.userData.playerId = playerId;
  root.userData.isCustomModel = true;
  root.userData.weaponAttachPoint = {
    x: 0, y: 0.9, z: 0.2,
    rotationX: Math.PI / 2,
    rotationY: Math.PI,
    rotationZ: 0,
    attachToRoot: true,
  };

  return root;
}

function fixMaterialsForPlayer(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh && child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) {
        if (mat instanceof THREE.Material) {
          mat.side = THREE.DoubleSide;
          mat.depthWrite = true;
        }
      }
    }
  });
}

/**
 * Attach a weapon mesh to the player model.
 * Uses the actual weapon meshes from WeaponViewModel.
 * Weapon is attached to the left hand so it moves naturally with arm animations.
 * For custom models (attachToRoot), attaches to the model root.
 */
export function setPlayerWeapon(model: THREE.Group, weaponMesh: THREE.Group): void {
  const attachPoint = model.userData.weaponAttachPoint as {
    x: number; y: number; z: number;
    rotationX: number; rotationY: number; rotationZ: number;
    attachToLeftHand?: boolean;
    attachToRoot?: boolean;
  } | undefined;

  if (!attachPoint || !weaponMesh) return;

  // Remove old weapon if exists
  const oldWeapon = model.userData.weapon as THREE.Group | undefined;
  if (oldWeapon) {
    const parent = oldWeapon.parent;
    if (parent) parent.remove(oldWeapon);
  }

  let attachParent: THREE.Object3D;
  if (attachPoint.attachToRoot) {
    attachParent = model;
  } else {
    const hips = model.children[0];
    if (!hips) return;
    const leftArm = hips.children[5] as THREE.Group;
    const leftHand = leftArm?.children[1] as THREE.Group;
    attachParent = attachPoint.attachToLeftHand && leftHand ? leftHand : hips;
  }

  weaponMesh.position.set(attachPoint.x, attachPoint.y, attachPoint.z);
  weaponMesh.rotation.set(attachPoint.rotationX, attachPoint.rotationY, attachPoint.rotationZ);
  weaponMesh.scale.setScalar(0.65);

  weaponMesh.traverse((child) => {
    child.layers.set(0);
  });

  attachParent.add(weaponMesh);
  model.userData.weapon = weaponMesh;
}

/**
 * Animate player movement with bob, arm swing, and realistic leg walking animation with knee bending.
 * Call this each frame with the player's movement state.
 * Custom models (GLB/VRM) use minimal animation for now.
 */
export function animatePlayerMovement(model: THREE.Group, time: number, isMoving: boolean): void {
  if (model.userData.isCustomModel) return;

  const hips = model.children[0];
  if (!hips) return;

  // Get body parts for animation
  // Order: 0=torso, 1=vest, 2=head, 3=leftEye, 4=rightEye, 5=leftArm, 6=rightArm, 7=leftUpperLeg, 8=rightUpperLeg
  const leftArm = hips.children[5];
  const rightArm = hips.children[6];
  const leftUpperLeg = hips.children[7] as THREE.Group;
  const rightUpperLeg = hips.children[8] as THREE.Group;

  // Get lower legs (knee joints) from inside upper legs: 0=thigh mesh, 1=lowerLeg group
  const leftLowerLeg = leftUpperLeg?.children[1] as THREE.Group;
  const rightLowerLeg = rightUpperLeg?.children[1] as THREE.Group;

  if (isMoving) {
    // Subtle bob when moving (reduced to avoid floating appearance)
    const bobAmount = Math.sin(time * 8) * 0.02;
    hips.position.y = 0.9 + bobAmount;

    // Walking cycle phase
    const phase = time * 8;
    const leftPhase = Math.sin(phase);
    const rightPhase = Math.sin(phase + Math.PI); // Right leg opposite of left

    // Arm swing (opposite of legs for natural walking)
    const armSwing = 0.3;
    if (leftArm) leftArm.rotation.x = -leftPhase * armSwing; // Left arm opposite of left leg
    if (rightArm) rightArm.rotation.x = -rightPhase * armSwing;

    // Upper leg swing from hip (thigh)
    const legSwing = 0.4;
    if (leftUpperLeg) leftUpperLeg.rotation.x = leftPhase * legSwing;
    if (rightUpperLeg) rightUpperLeg.rotation.x = rightPhase * legSwing;

    // Knee bend (lower leg) - bends when leg swings forward
    // Bend forward (positive rotation on lower leg), straighten when swinging back
    const kneeBend = 0.5;
    if (leftLowerLeg) {
      const leftKnee = Math.max(0, leftPhase) * kneeBend; // Bend when positive (forward swing)
      leftLowerLeg.rotation.x = leftKnee;
    }
    if (rightLowerLeg) {
      const rightKnee = Math.max(0, rightPhase) * kneeBend;
      rightLowerLeg.rotation.x = rightKnee;
    }
  } else {
    // Idle - smoothly return to neutral pose
    hips.position.y = THREE.MathUtils.lerp(hips.position.y, 0.9, 0.1);

    if (leftArm) leftArm.rotation.x = THREE.MathUtils.lerp(leftArm.rotation.x, 0, 0.1);
    if (rightArm) rightArm.rotation.x = THREE.MathUtils.lerp(rightArm.rotation.x, 0, 0.1);
    if (leftUpperLeg) leftUpperLeg.rotation.x = THREE.MathUtils.lerp(leftUpperLeg.rotation.x, 0, 0.1);
    if (rightUpperLeg) rightUpperLeg.rotation.x = THREE.MathUtils.lerp(rightUpperLeg.rotation.x, 0, 0.1);
    if (leftLowerLeg) leftLowerLeg.rotation.x = THREE.MathUtils.lerp(leftLowerLeg.rotation.x, 0, 0.1);
    if (rightLowerLeg) rightLowerLeg.rotation.x = THREE.MathUtils.lerp(rightLowerLeg.rotation.x, 0, 0.1);
  }
}

/**
 * Play weapon firing animation (recoil + muzzle flash).
 * Call this when a remote player fires their weapon.
 */
export function playFireAnimation(model: THREE.Group): void {
  const weapon = model.userData.weapon as THREE.Group | undefined;
  if (!weapon) return;

  // Store original position for recoil
  if (!model.userData.weaponAttachPoint) return;
  const attachPoint = model.userData.weaponAttachPoint;

  // Weapon recoil animation (kick back slightly)
  weapon.position.z = attachPoint.z - 0.08;
  weapon.rotation.set(
    attachPoint.rotationX + 0.15,
    attachPoint.rotationY,
    attachPoint.rotationZ
  );

  // Muzzle flash (pooled point light at weapon tip)
  const muzzleFlash = globalLightPool.acquire(0xffaa44, 8, 4, 50);
  muzzleFlash.position.set(0, 0, 0.35); // In front of weapon (local to weapon)
  weapon.add(muzzleFlash); // Attach to weapon so it follows correctly

  // Return to original position
  setTimeout(() => {
    weapon.position.z = attachPoint.z;
    weapon.rotation.set(attachPoint.rotationX, attachPoint.rotationY, attachPoint.rotationZ);
  }, 80);

  // Track fire time for aiming animation
  model.userData.lastFireTime = performance.now();
}

/**
 * Update aiming pose (arms raised when recently fired).
 * Call this each frame - arms will raise for 0.5s after firing.
 */
export function updateAimingPose(model: THREE.Group): void {
  if (model.userData.isCustomModel) return;

  const hips = model.children[0];
  if (!hips) return;

  const leftArm = hips.children[5];
  const rightArm = hips.children[6];

  // Check if player fired recently (within last 500ms)
  const lastFireTime = model.userData.lastFireTime as number | undefined;
  const timeSinceFire = lastFireTime ? performance.now() - lastFireTime : 999999;
  const isAiming = timeSinceFire < 500; // Keep arms raised for 500ms after firing

  if (isAiming) {
    // Raise arms to aiming position
    if (leftArm) {
      leftArm.rotation.x = THREE.MathUtils.lerp(leftArm.rotation.x, -Math.PI / 3, 0.2);
      leftArm.rotation.z = THREE.MathUtils.lerp((leftArm.rotation as any).z || 0, 0.2, 0.2);
    }
    if (rightArm) {
      rightArm.rotation.x = THREE.MathUtils.lerp(rightArm.rotation.x, -Math.PI / 3, 0.2);
      rightArm.rotation.z = THREE.MathUtils.lerp((rightArm.rotation as any).z || 0, -0.2, 0.2);
    }
  }
  // Note: normal arm position is handled by animatePlayerMovement
}
