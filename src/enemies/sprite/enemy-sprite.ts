import * as THREE from 'three';
import { generateGuardSpriteSheet, COLS, ROWS, type GuardVariant, GUARD_VARIANTS } from './guard-sprite-sheet';
import { SpriteAnimator, type AnimationName } from './sprite-animator';

/**
 * A billboarded enemy sprite — replaces the 3D cylinder/sphere/box meshes.
 * Uses a PlaneGeometry with a CanvasTexture sprite atlas.
 * Y-axis-only billboard so enemies stay upright when the player looks up/down.
 */
export class EnemySprite {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshBasicMaterial;
  readonly animator: SpriteAnimator;
  readonly shadowMesh: THREE.Mesh; // fake blob shadow at feet

  private hitTintTimer = 0;
  private texture: THREE.CanvasTexture;

  constructor(variant: GuardVariant = GUARD_VARIANTS.guard) {
    // Get (or generate + cache) the shared sprite sheet
    const sharedTexture = generateGuardSpriteSheet(variant);

    // Clone texture so each enemy has independent UV offsets
    // (shares the same source image on the GPU)
    this.texture = sharedTexture.clone();
    this.texture.needsUpdate = true;
    this.texture.repeat.set(1 / COLS, 1 / ROWS);

    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      alphaTest: 0.1,
      side: THREE.DoubleSide,
      depthWrite: true,
    });

    // Plane sized ~1.0 wide × 1.8 tall, shifted up so bottom = feet
    const geo = new THREE.PlaneGeometry(1.0, 1.8);
    geo.translate(0, 0.9, 0);

    this.mesh = new THREE.Mesh(geo, this.material);

    // Fake blob shadow (dark semi-transparent ellipse at feet)
    const shadowGeo = new THREE.PlaneGeometry(0.8, 0.4);
    shadowGeo.rotateX(-Math.PI / 2); // lay flat on ground
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    });
    this.shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    this.shadowMesh.position.y = 0.02; // just above floor to avoid z-fighting

    // Animator
    this.animator = new SpriteAnimator(COLS, ROWS);
    this.updateTextureOffset();
  }

  /** Y-axis-only billboard: rotates mesh to face camera horizontally */
  billboardToCamera(cameraWorldPos: THREE.Vector3, enemyWorldPos: THREE.Vector3): void {
    const dx = cameraWorldPos.x - enemyWorldPos.x;
    const dz = cameraWorldPos.z - enemyWorldPos.z;
    this.mesh.rotation.y = Math.atan2(dx, dz);
  }

  /** Update animation and hit flash tint */
  update(dt: number): void {
    this.animator.update(dt);
    this.updateTextureOffset();

    // Hit flash: tint the sprite red then fade back to white
    if (this.hitTintTimer > 0) {
      this.hitTintTimer -= dt;
      this.material.color.setHex(0xff4444);
    } else {
      this.material.color.setHex(0xffffff);
    }
  }

  triggerHitFlash(): void {
    this.hitTintTimer = 0.12;
  }

  /** Play an animation by name */
  play(name: AnimationName, force = false): void {
    this.animator.play(name, force);
  }

  private updateTextureOffset(): void {
    this.texture.offset.set(this.animator.offsetX, this.animator.offsetY);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.shadowMesh.geometry.dispose();
    (this.shadowMesh.material as THREE.MeshBasicMaterial).dispose();
  }
}
