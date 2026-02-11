/**
 * Browser-side sprite baking from 3D models.
 * Renders procedural guard model poses to a 5×3 sprite sheet.
 * Run via bake-sprites.ts (Puppeteer).
 */

import * as THREE from 'three';
import { createGuardModel } from '../src/enemies/model/guard-model-factory';
import { ANIMATIONS, type AnimationName, type Pose } from '../src/enemies/model/pose-library';
import { GUARD_VARIANTS } from '../src/enemies/sprite/guard-sprite-sheet';
import { COLS, FRAME_W, FRAME_H, ROWS } from '../src/enemies/sprite/guard-sprite-sheet';

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

/**
 * Bake sprite sheet from procedural guard model.
 * Returns base64 PNG data URL.
 */
export async function bakeSpriteSheet(): Promise<string> {
  const variant = GUARD_VARIANTS.guard;
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

    const col = frameIndex % COLS;
    const row = Math.floor(frameIndex / COLS);
    const x = col * FRAME_W;
    const y = row * FRAME_H;

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

    ctx.drawImage(frameCanvas, x, y);
  }

  renderTarget.dispose();
  renderer.dispose();

  return outputCanvas.toDataURL('image/png');
}

declare global {
  interface Window {
    __runBake?: () => Promise<string>;
  }
}

if (typeof window !== 'undefined') {
  window.__runBake = bakeSpriteSheet;
}
