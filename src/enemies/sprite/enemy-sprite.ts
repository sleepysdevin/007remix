import * as THREE from 'three';
import {
  generateGuardSpriteSheet,
  loadSpriteSheetFromImage,
  COLS,
  ROWS,
  type GuardVariant,
  GUARD_VARIANTS,
} from './guard-sprite-sheet';
import { SpriteAnimator, type AnimationName } from './sprite-animator';

export type EnemySpriteSource = GuardVariant | THREE.Texture;

/**
 * A billboarded enemy sprite — replaces the 3D cylinder/sphere/box meshes.
 * Uses a PlaneGeometry with a CanvasTexture or image sprite atlas.
 * Y-axis-only billboard so enemies stay upright when the player looks up/down.
 * Supports procedural (GuardVariant), or pre-loaded texture (from image).
 */
export class EnemySprite {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshBasicMaterial;
  readonly animator: SpriteAnimator;
  readonly shadowMesh: THREE.Mesh; // fake blob shadow at feet

  private hitTintTimer = 0;
  private texture: THREE.Texture;

  constructor(source: EnemySpriteSource = GUARD_VARIANTS.guard) {
    const sharedTexture =
      source instanceof THREE.Texture
        ? source
        : generateGuardSpriteSheet(source as GuardVariant);

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

    // Plane sized for human scale (~1.7–1.9m); custom baked sprites use larger footprint
    const isBakedTexture = source instanceof THREE.Texture;
    const w = isBakedTexture ? 1.15 : 1.0;
    const h = isBakedTexture ? 2.0 : 1.8;
    const geo = new THREE.PlaneGeometry(w, h);
    geo.translate(0, h / 2, 0);

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

  /**
   * Create an EnemySprite from an image URL (e.g. baked sprite sheet PNG).
   * Use for sprites generated from 3D models.
   */
  static async fromImage(url: string): Promise<EnemySprite> {
    const texture = await loadSpriteSheetFromImage(url);
    return new EnemySprite(texture);
  }

  /** Y-axis-only billboard: rotates mesh to face camera horizontally. */
  billboardToCamera(cameraWorldPos: THREE.Vector3, enemyWorldPos: THREE.Vector3, parentRotationY = 0): void {
    const dx = cameraWorldPos.x - enemyWorldPos.x;
    const dz = cameraWorldPos.z - enemyWorldPos.z;
    const angleToCamera = Math.atan2(dx, dz);
    this.mesh.rotation.y = angleToCamera - parentRotationY;
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
