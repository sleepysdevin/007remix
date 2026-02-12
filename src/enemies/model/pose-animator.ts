/**
 * Keyframe pose interpolator for low-poly 3D enemy models.
 * Replaces SpriteAnimator — lerps joint rotations between keyframe poses.
 */

import type { Pose, PoseKeyframe, AnimationDef } from './pose-library';
import { ANIMATIONS } from './pose-library';

export type AnimationName = 'idle' | 'alert' | 'shoot' | 'hit' | 'death' | 'walk';

/** All pose keys that can be interpolated */
const POSE_KEYS: (keyof Pose)[] = [
  'hipsY', 'torsoX', 'torsoZ', 'headX', 'headY', 'headZ',
  'leftShoulderX', 'leftShoulderZ', 'rightShoulderX', 'rightShoulderZ',
  'leftElbowX', 'rightElbowX',
  'leftHipX', 'rightHipX', 'leftKneeX', 'rightKneeX',
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function getPoseValue(pose: Pose, key: keyof Pose): number {
  const v = pose[key];
  return typeof v === 'number' ? v : 0;
}

function interpolatePoses(from: Pose, to: Pose, t: number): Pose {
  const result: Pose = {};
  for (const key of POSE_KEYS) {
    const a = getPoseValue(from, key);
    const b = getPoseValue(to, key);
    result[key] = lerp(a, b, t);
  }
  return result;
}

export interface PoseAnimatorApply {
  (jointName: string, value: number): void;
}

/**
 * Drives pose-based animation by interpolating between keyframes
 * and exposing the current pose for application to the model.
 */
export class PoseAnimator {
  private currentAnim: AnimationName = 'idle';
  private keyframeIndex = 0;
  private elapsed = 0;
  private _finished = false;

  /** Current interpolated pose (output) */
  readonly currentPose: Pose = {};

  get currentAnimation(): AnimationName {
    return this.currentAnim;
  }

  get finished(): boolean {
    return this._finished;
  }

  play(name: AnimationName, force = false): void {
    if (name === this.currentAnim && !force && !this._finished) return;
    this.currentAnim = name;
    const anim = ANIMATIONS[name];
    if (anim?.loop && anim.keyframes.length > 0) {
      this.keyframeIndex = Math.floor(Math.random() * anim.keyframes.length);
      const kf = anim.keyframes[this.keyframeIndex];
      this.elapsed = Math.random() * Math.max(0.0001, kf.duration);
    } else {
      this.keyframeIndex = 0;
      this.elapsed = 0;
    }
    this._finished = false;
    this.updateCurrentPose();
  }

  update(dt: number): void {
    const anim = ANIMATIONS[this.currentAnim];
    if (!anim || this._finished) return;

    this.elapsed += dt;
    const keyframes = anim.keyframes;

    // Advance through keyframes
    while (this.keyframeIndex < keyframes.length) {
      const kf = keyframes[this.keyframeIndex];
      if (this.elapsed < kf.duration) break;

      this.elapsed -= kf.duration;
      this.keyframeIndex++;

      if (this.keyframeIndex >= keyframes.length) {
        if (anim.loop) {
          this.keyframeIndex = 0;
        } else {
          this.keyframeIndex = keyframes.length - 1;
          this._finished = true;
          break;
        }
      }
    }

    this.updateCurrentPose();
  }

  private updateCurrentPose(): void {
    const anim = ANIMATIONS[this.currentAnim];
    if (!anim) return;

    const keyframes = anim.keyframes;
    const idx = Math.min(this.keyframeIndex, keyframes.length - 1);
    const kf = keyframes[idx];
    const duration = kf.duration;
    const t = duration > 0 ? Math.min(1, this.elapsed / duration) : 1;

    const prevPose = idx === 0
      ? (anim.loop ? keyframes[keyframes.length - 1].pose : {})
      : keyframes[idx - 1].pose;
    const interpolated = interpolatePoses(prevPose, kf.pose, t);
    Object.assign(this.currentPose, interpolated);
  }
}
