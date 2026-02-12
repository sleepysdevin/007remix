import * as THREE from 'three';
import { InputManager } from '../core/input-manager';
import { SensitivitySettings } from '../core/sensitivity-settings';

const PITCH_LIMIT = Math.PI / 2 - 0.01; // Just under 90 degrees

export class FPSCamera {
  readonly camera: THREE.PerspectiveCamera;
  private yaw = 0;
  private pitch = 0;

  constructor() {
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.05,
      200,
    );
    window.addEventListener('resize', this.onResize);
  }

  update(input: InputManager): void {
    const sens = SensitivitySettings.getMouseSensitivity();
    this.yaw -= input.mouseMovementX * sens;
    this.pitch -= input.mouseMovementY * sens;
    this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch));

    // Build a quaternion from yaw and pitch
    const qYaw = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      this.yaw,
    );
    const qPitch = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      this.pitch,
    );
    this.camera.quaternion.copy(qYaw).multiply(qPitch);
  }

  /** Set camera world position (called by player controller) */
  setPosition(x: number, y: number, z: number): void {
    this.camera.position.set(x, y, z);
  }

  /** Get the forward direction on the XZ plane (for movement) */
  getForward(out: THREE.Vector3): THREE.Vector3 {
    out.set(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    return out;
  }

  /** Get the right direction on the XZ plane */
  getRight(out: THREE.Vector3): THREE.Vector3 {
    out.set(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    return out;
  }

  /** Get the camera's look direction (full 3D, for raycasting) */
  getLookDirection(out: THREE.Vector3): THREE.Vector3 {
    this.camera.getWorldDirection(out);
    return out;
  }

  /**
   * Get the current yaw rotation (for network sync).
   */
  getYRotation(): number {
    return this.yaw;
  }

  private onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  };

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
  }
}
