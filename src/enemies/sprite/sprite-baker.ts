/**
 * Runtime sprite baker — renders 3D model poses to a sprite sheet texture.
 * Uses WebGLRenderTarget to capture each frame, composites into 5×3 atlas.
 * Supports procedural guard model or custom GLB.
 */

import * as THREE from 'three';
import { createGuardModel } from '../model/guard-model-factory';
import { ANIMATIONS, type AnimationName, type Pose } from '../model/pose-library';
import { GUARD_VARIANTS, COLS, FRAME_W, FRAME_H, ROWS } from './guard-sprite-sheet';
import type { LoadedCharacter } from '../../core/model-loader';
import { isLoadedVRM } from '../../core/model-loader';
import { poseToVRMPose } from './vrm-pose-mapper';

/** Frame index -> [animationName, keyframeIndex] */
const FRAME_POSES: [AnimationName, number][] = [
  ['idle', 0], ['idle', 1],
  ['alert', 0], ['alert', 1],
  ['shoot', 0], ['shoot', 1],
  ['hit', 0], ['hit', 1],
  ['death', 0], ['death', 1], ['death', 2],
  ['walk', 0], ['walk', 1],
];

function getPose(animName: AnimationName, keyframeIndex: number): Pose {
  const anim = ANIMATIONS[animName];
  if (!anim || keyframeIndex >= anim.keyframes.length) return {};
  return anim.keyframes[keyframeIndex].pose;
}

function applyPose(
  joints: ReturnType<typeof createGuardModel>['joints'],
  pose: Pose,
): void {
  const get = (k: keyof Pose) => (pose[k] ?? 0) as number;
  joints.hips.position.y = 0.9 + get('hipsY');
  joints.torso.rotation.x = get('torsoX');
  joints.torso.rotation.z = get('torsoZ');
  joints.head.rotation.x = get('headX');
  joints.head.rotation.y = get('headY');
  joints.head.rotation.z = get('headZ');
  joints.leftShoulder.rotation.x = get('leftShoulderX');
  joints.leftShoulder.rotation.z = get('leftShoulderZ');
  joints.rightShoulder.rotation.x = get('rightShoulderX');
  joints.rightShoulder.rotation.z = get('rightShoulderZ');
  joints.leftElbow.rotation.x = get('leftElbowX');
  joints.rightElbow.rotation.x = get('rightElbowX');
  joints.leftHip.rotation.set(get('leftHipX'), 0, 0);
  joints.rightHip.rotation.set(get('rightHipX'), 0, 0);
  joints.leftKnee.rotation.set(get('leftKneeX'), 0, 0);
  joints.rightKnee.rotation.set(get('rightKneeX'), 0, 0);
}

const cache = new Map<string, THREE.Texture>();

/**
 * Bake a sprite sheet from the procedural guard model.
 * Returns a texture suitable for EnemySprite. Cached by variant name.
 */
export function bakeGuardSpriteSheet(variantName = 'guard'): THREE.Texture {
  const cached = cache.get(variantName);
  if (cached) return cached;

  const variant = GUARD_VARIANTS[variantName] ?? GUARD_VARIANTS.guard;
  const { rootGroup, joints } = createGuardModel(variant);

  const scene = new THREE.Scene();
  scene.background = null; // Transparent — no opaque backdrop
  scene.add(rootGroup);

  const light = new THREE.DirectionalLight(0xffffff, 1.2);
  light.position.set(0, 2, 3);
  light.target.position.set(0, 0.9, 0);
  scene.add(light);
  scene.add(light.target);

  const ambient = new THREE.AmbientLight(0x404060, 0.4);
  scene.add(ambient);

  const camera = new THREE.OrthographicCamera(-0.5, 0.5, 1.0, -0.8, 0.1, 10);
  camera.position.set(0, 0.9, 3);
  camera.lookAt(0, 0.9, 0);
  camera.updateProjectionMatrix();

  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: false,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(FRAME_W, FRAME_H);
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const renderTarget = new THREE.WebGLRenderTarget(FRAME_W, FRAME_H, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
  });

  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = FRAME_W * COLS;
  outputCanvas.height = FRAME_H * ROWS;
  const ctx = outputCanvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  for (let frameIndex = 0; frameIndex < FRAME_POSES.length; frameIndex++) {
    const [animName, kfIndex] = FRAME_POSES[frameIndex];
    const pose = getPose(animName, kfIndex);
    applyPose(joints, pose);

    renderer.setRenderTarget(renderTarget);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);

    const pixels = new Uint8ClampedArray(FRAME_W * FRAME_H * 4);
    renderer.readRenderTargetPixels(renderTarget, 0, 0, FRAME_W, FRAME_H, pixels);

    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = FRAME_W;
    frameCanvas.height = FRAME_H;
    const frameCtx = frameCanvas.getContext('2d')!;
    const imageData = frameCtx.createImageData(FRAME_W, FRAME_H);
    const rowBytes = FRAME_W * 4;
    for (let r = 0; r < FRAME_H; r++) {
      const srcRow = FRAME_H - 1 - r;
      for (let i = 0; i < rowBytes; i++) {
        imageData.data[r * rowBytes + i] = pixels[srcRow * rowBytes + i];
      }
    }
    frameCtx.putImageData(imageData, 0, 0);

    const col = frameIndex % COLS;
    const row = Math.floor(frameIndex / COLS);
    ctx.drawImage(frameCanvas, col * FRAME_W, row * FRAME_H);
  }

  renderTarget.dispose();
  renderer.dispose();

  const texture = new THREE.CanvasTexture(outputCanvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  cache.set(variantName, texture);
  return texture;
}

function fixMaterialsForSprite(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh && child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      const replacements: THREE.Material[] = [];
      for (const mat of mats) {
        const isPBR = mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial;
        const isLambert = mat instanceof THREE.MeshLambertMaterial || mat instanceof THREE.MeshPhongMaterial;
        if (isPBR || isLambert) {
          const m = mat as THREE.MeshStandardMaterial;
          const basic = new THREE.MeshBasicMaterial({
            color: m.color?.getHex?.() === 0 ? 0x555555 : m.color,
            map: m.map ?? null,
            side: THREE.DoubleSide,
            depthWrite: true,
            transparent: m.transparent ?? false,
            opacity: m.opacity ?? 1,
          });
          replacements.push(basic);
        } else if (mat instanceof THREE.Material) {
          mat.side = THREE.DoubleSide;
          mat.depthWrite = true;
          replacements.push(mat);
        }
      }
      (child as THREE.Mesh).material = replacements.length === 1 ? replacements[0] : replacements;
    }
  });
}

/** Frame index -> [clipNamePattern, timeInClip] for custom GLB */
const CUSTOM_FRAME_SAMPLES: [RegExp, number][] = [
  [/\bidle\b/i, 0], [/\bidle\b/i, 0.5],
  [/\b(attack|shoot)\b/i, 0], [/\b(attack|shoot)\b/i, 0.2],
  [/\b(attack|shoot)\b/i, 0], [/\b(attack|shoot)\b/i, 0.1],
  [/\bhit\b/i, 0], [/\bhit\b/i, 0.1],
  [/\bdeath\b/i, 0], [/\bdeath\b/i, 0.3], [/\bdeath\b/i, 0.6],
  [/\bwalk\b/i, 0], [/\bwalk\b/i, 0.2],
];

function findClip(animations: THREE.AnimationClip[], pattern: RegExp): THREE.AnimationClip | null {
  return animations.find((c) => pattern.test(c.name)) ?? null;
}

/**
 * Bake sprite sheet from custom GLB/VRM model. Uses cached model from getCachedEnemyModel.
 * - VRM with humanoid: uses pose-library bone mapping (Phase 4)
 * - GLB or VRM with animations: samples clip poses
 * - Otherwise: renders default pose for all frames
 */
export function bakeCustomModelSpriteSheet(char: LoadedCharacter): THREE.Texture {
  const cacheKey = `__custom__${char.scene.uuid}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const useVRMPoseLibrary = isLoadedVRM(char) && char.vrm?.humanoid != null;

  const scene = new THREE.Scene();
  scene.background = null;

  let root: THREE.Group;
  if (useVRMPoseLibrary) {
    root = char.scene;
  } else {
    root = char.scene.clone(true);
  }
  fixMaterialsForSprite(root);

  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = 1.7 / Math.max(size.y, 0.01);
  root.scale.setScalar(scale);
  root.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
  root.rotation.y = Math.PI;
  scene.add(root);

  const light = new THREE.DirectionalLight(0xffffff, 2);
  light.position.set(0, 2, 3);
  light.target.position.set(0, 0.9, 0);
  scene.add(light);
  scene.add(light.target);
  scene.add(new THREE.AmbientLight(0xffffff, 0.8));

  const camera = new THREE.OrthographicCamera(-0.75, 0.75, 1.15, -0.95, 0.1, 10);
  camera.position.set(0, 0.9, 3);
  camera.lookAt(0, 0.9, 0);
  camera.updateProjectionMatrix();

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, preserveDrawingBuffer: true });
  renderer.setSize(FRAME_W, FRAME_H);
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const renderTarget = new THREE.WebGLRenderTarget(FRAME_W, FRAME_H, { format: THREE.RGBAFormat, type: THREE.UnsignedByteType });
  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = FRAME_W * COLS;
  outputCanvas.height = FRAME_H * ROWS;
  const ctx = outputCanvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  const mixer = !useVRMPoseLibrary && char.animations?.length ? new THREE.AnimationMixer(root) : null;

  for (let i = 0; i < 13; i++) {
    if (useVRMPoseLibrary && char.kind === 'vrm') {
      const [animName, kfIndex] = FRAME_POSES[i];
      const pose = getPose(animName, kfIndex);
      const vrmPose = poseToVRMPose(pose);
      char.vrm.humanoid.setNormalizedPose(vrmPose as Parameters<typeof char.vrm.humanoid.setNormalizedPose>[0]);
      char.vrm.update(0);
    } else if (mixer && char.animations?.length) {
      const [pattern, t] = CUSTOM_FRAME_SAMPLES[i];
      const clip = findClip(char.animations, pattern) ?? char.animations[0];
      const action = mixer.clipAction(clip);
      action.reset();
      action.time = Math.min(t, clip.duration * 0.99);
      action.paused = true;
      action.play();
      mixer.update(0);
    }

    renderer.setRenderTarget(renderTarget);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);

    const pixels = new Uint8ClampedArray(FRAME_W * FRAME_H * 4);
    renderer.readRenderTargetPixels(renderTarget, 0, 0, FRAME_W, FRAME_H, pixels);
    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = FRAME_W;
    frameCanvas.height = FRAME_H;
    const frameCtx = frameCanvas.getContext('2d')!;
    const imageData = frameCtx.createImageData(FRAME_W, FRAME_H);
    const rowBytes = FRAME_W * 4;
    for (let r = 0; r < FRAME_H; r++) {
      const srcRow = FRAME_H - 1 - r;
      for (let j = 0; j < rowBytes; j++) imageData.data[r * rowBytes + j] = pixels[srcRow * rowBytes + j];
    }
    frameCtx.putImageData(imageData, 0, 0);
    ctx.drawImage(frameCanvas, (i % COLS) * FRAME_W, Math.floor(i / COLS) * FRAME_H);
  }

  if (useVRMPoseLibrary && char.kind === 'vrm') {
    char.vrm.humanoid.resetNormalizedPose();
    char.vrm.update(0);
  }

  root.rotation.y = 0;
  scene.remove(root);
  renderTarget.dispose();
  renderer.dispose();
  const texture = new THREE.CanvasTexture(outputCanvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  cache.set(cacheKey, texture);
  return texture;
}
