import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsWorld } from '../../core/physics-world';
import { globalLightPool } from "../../core/light-pool";

/**
 * Destructible prop system — crates and barrels take damage from gunfire and explosions.
 * When health reaches 0, the prop shatters into debris chunks with physics.
 * Barrels trigger a secondary explosion dealing area damage.
 */

const DEBRIS_COUNT = 2; // Aggressive reduction to minimize explosion hitch
const DEBRIS_LIFETIME = 1.2; // Reduced from 1.8
const DEBRIS_GRAVITY = -12;
const BARREL_FLASH_DURATION = 0.25; // Reduced from 0.35
const BARREL_FLASH_POOL_SIZE = 8;
const BARREL_FLASH_COLOR = 0xff8800;
const BARREL_FLASH_GEO = new THREE.SphereGeometry(1.2, 6, 4);

// Shared debris geometries (reused by all debris chunks to avoid per-chunk allocation)
const SHARED_DEBRIS_GEOS: THREE.BoxGeometry[] = [];
function getDebrisGeo(size: number): THREE.BoxGeometry {
  // Use 4 shared geo sizes — close enough for small debris chunks
  const idx = Math.floor(Math.random() * 4);
  if (!SHARED_DEBRIS_GEOS[idx]) {
    const scales = [
      [0.8, 0.6, 0.9],
      [1.0, 0.5, 0.7],
      [0.7, 0.9, 0.8],
      [1.1, 0.4, 1.0],
    ];
    const [sx, sy, sz] = scales[idx];
    SHARED_DEBRIS_GEOS[idx] = new THREE.BoxGeometry(sx, sy, sz);
  }
  return SHARED_DEBRIS_GEOS[idx];
}

// Pre-built materials per prop type (3 color variants each, MeshBasicMaterial for perf)
const DEBRIS_MAT_CACHE = new Map<string, THREE.MeshBasicMaterial[]>();
function getDebrisMats(type: string): THREE.MeshBasicMaterial[] {
  if (DEBRIS_MAT_CACHE.has(type)) return DEBRIS_MAT_CACHE.get(type)!;
  let baseColor: number;
  if (type === 'crate') baseColor = 0x8B6914;
  else if (type === 'crate_metal') baseColor = 0x556677;
  else baseColor = 0x664433;

  const mats: THREE.MeshBasicMaterial[] = [];
  for (let i = 0; i < 4; i++) {
    const c = new THREE.Color(baseColor);
    c.offsetHSL(
      (i * 0.04 - 0.06),
      (i * 0.05 - 0.1),
      (i * 0.08 - 0.12),
    );
    mats.push(new THREE.MeshBasicMaterial({ color: c }));
  }
  DEBRIS_MAT_CACHE.set(type, mats);
  return mats;
}

// Health defaults per prop type
const DEFAULT_HEALTH: Record<string, number> = {
  crate: 30,
  crate_metal: 70,
  barrel: 12,
};

// Barrel explosion properties - reduced for performance
const BARREL_EXPLOSION_RADIUS = 2; // Reduced from 3
const BARREL_EXPLOSION_DAMAGE = 35; // Reduced from 50

export interface PropLoot {
  type: string;
  amount?: number;
}

export interface DestructibleProp {
  mesh: THREE.Object3D;
  collider: RAPIER.Collider;
  health: number;
  maxHealth: number;
  type: 'crate' | 'crate_metal' | 'barrel';
  position: THREE.Vector3;
  size: number; // approximate extent for debris sizing
  loot?: PropLoot;
}

interface Debris {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  rotSpeedX: number;
  rotSpeedY: number;
  rotSpeedZ: number;
  life: number;
  maxLife: number;
  floorY: number;
}

interface BarrelFlash {
  light: THREE.PointLight;
  flash: THREE.Mesh;
  elapsed: number;
}

interface PendingExplosionDamage {
  center: THREE.Vector3;
  radius: number;
  damage: number;
}

export class DestructibleSystem {
  private scene: THREE.Scene;
  private physics: PhysicsWorld;
  private props: DestructibleProp[] = [];
  private debris: Debris[] = [];
  private barrelFlashes: BarrelFlash[] = [];
  private flashMeshPool: THREE.Mesh[] = [];
  private pendingExplosionDamage: PendingExplosionDamage[] = [];
  private pendingDispose: THREE.Object3D[] = [];

  // Reusable vector
  private readonly _tmpVec = new THREE.Vector3();

  /**
   * Called when a prop is destroyed. Use for sounds, chain explosions, etc.
   * (type, position)
   */
  onPropDestroyed: ((type: string, position: THREE.Vector3) => void) | null = null;

  /**
   * Called when a prop is destroyed (with full prop data for networking).
   * (prop)
   */
  onPropDestroyedFull: ((prop: DestructibleProp) => void) | null = null;

  /**
   * Called when a barrel explodes — deal area damage to enemies / player.
   * (position, radius, damage)
   */
  onBarrelExplode: ((position: THREE.Vector3, radius: number, damage: number) => void) | null = null;

  /** Called when a destroyed prop drops loot. (lootType, amount, position) */
  onLootDrop: ((lootType: string, amount: number, position: THREE.Vector3) => void) | null = null;

  constructor(scene: THREE.Scene, physics: PhysicsWorld) {
    this.scene = scene;
    this.physics = physics;
    this.prewarmFlashPool();
  }

  /** Prewarm first-use barrel explosion objects to reduce first-hit hitch. */
  prewarmBarrelExplosionPath(): void {
    const light = globalLightPool.acquire(0xff6600, 60, 8);
    this.scene.add(light);
    this.scene.remove(light);
    globalLightPool.release(light);

    const flash = this.acquireFlashMesh();
    flash.frustumCulled = false;
    flash.position.set(0, -9999, 0);
    this.scene.add(flash);
    this.scene.remove(flash);
    this.flashMeshPool.push(flash);

    // Warm Rapier collider/body remove path to avoid first-destruction hitch.
    const warmBodyDesc = RAPIER.RigidBodyDesc.fixed();
    warmBodyDesc.setTranslation(0, -9999, 0);
    const warmBody = this.physics.world.createRigidBody(warmBodyDesc);
    const warmCollider = this.physics.world.createCollider(RAPIER.ColliderDesc.ball(0.1), warmBody);
    this.physics.removeCollider(warmCollider);
    this.physics.removeRigidBody(warmBody);
  }

  private prewarmFlashPool(): void {
    while (this.flashMeshPool.length < BARREL_FLASH_POOL_SIZE) {
      const mat = new THREE.MeshBasicMaterial({
        color: BARREL_FLASH_COLOR,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const flash = new THREE.Mesh(BARREL_FLASH_GEO, mat);
      this.flashMeshPool.push(flash);
    }
  }

  private acquireFlashMesh(): THREE.Mesh {
    if (this.flashMeshPool.length > 0) {
      return this.flashMeshPool.pop()!;
    }
    const mat = new THREE.MeshBasicMaterial({
      color: BARREL_FLASH_COLOR,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    return new THREE.Mesh(BARREL_FLASH_GEO, mat);
  }

  /** Register a destructible prop. Returns the prop for chaining. */
  register(
    mesh: THREE.Object3D,
    collider: RAPIER.Collider,
    type: 'crate' | 'crate_metal' | 'barrel',
    health?: number,
    size?: number,
    loot?: PropLoot,
  ): DestructibleProp {
    const hp = health ?? DEFAULT_HEALTH[type] ?? 30;
    const prop: DestructibleProp = {
      mesh,
      collider,
      health: hp,
      maxHealth: hp,
      type,
      position: mesh.position.clone(),
      size: size ?? 1,
      loot,
    };
    this.props.push(prop);
    return prop;
  }

  /** Find prop by Rapier collider handle. */
  getByColliderHandle(handle: number): DestructibleProp | null {
    for (const p of this.props) {
      if (p.health > 0 && p.collider.handle === handle) return p;
    }
    return null;
  }

  /** Quick check if a collider belongs to a living destructible prop. */
  isDestructible(collider: RAPIER.Collider): boolean {
    return this.getByColliderHandle(collider.handle) !== null;
  }

  /**
   * Destroy a prop by position and type (for multiplayer sync).
   * Returns true if a matching prop was found and destroyed.
   * Call with skipNetworkCallback=true to avoid echoing the destroy event.
   * Call with silent=true to skip explosions/debris/sounds (for new-joiner sync).
   */
  destroyByPositionAndType(
    position: { x: number; y: number; z: number },
    type: 'crate' | 'crate_metal' | 'barrel',
    tolerance = 0.5,
    skipNetworkCallback = true,
    silent = false
  ): boolean {
    const eventPos = new THREE.Vector3(position.x, position.y, position.z);
    for (const prop of this.props) {
      if (prop.health > 0 && prop.type === type) {
        const distance = prop.position.distanceTo(eventPos);
        if (distance < tolerance) {
          if (silent) {
            this.removeSilent(prop);
          } else if (skipNetworkCallback) {
            const orig = this.onPropDestroyedFull;
            this.onPropDestroyedFull = null;
            this.destroy(prop);
            this.onPropDestroyedFull = orig;
          } else {
            this.destroy(prop);
          }
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Remove a prop silently (no explosions, debris, sounds, loot).
   * Used when syncing destroyed state for new joiners.
   */
  private removeSilent(prop: DestructibleProp): void {
    this.scene.remove(prop.mesh);
    this.pendingDispose.push(prop.mesh);
    const body = prop.collider.parent();
    this.physics.removeCollider(prop.collider);
    if (body) this.physics.removeRigidBody(body);
    const idx = this.props.indexOf(prop);
    if (idx >= 0) this.props.splice(idx, 1);
  }

  /** Apply damage to a specific prop. */
  damage(prop: DestructibleProp, amount: number): void {
    if (prop.health <= 0) return;
    prop.health -= amount;

    // Avoid heavy flash work on barrels, which are often hit in chain explosions.
    if (prop.type !== 'barrel') this.flashMesh(prop.mesh);

    if (prop.health <= 0) {
      this.destroy(prop);
    }
  }

  /** Damage all props within a radius (explosions). Damage falls off with distance. */
  damageInRadius(center: THREE.Vector3, radius: number, damage: number): void {
    // Iterate a copy since destroy() mutates this.props
    const snapshot = this.props.slice();
    for (const p of snapshot) {
      if (p.health <= 0) continue;
      const dx = p.position.x - center.x;
      const dy = p.position.y - center.y;
      const dz = p.position.z - center.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist <= radius) {
        const falloff = 1 - dist / radius;
        this.damage(p, damage * falloff);
      }
    }
  }

  private flashMesh(obj: THREE.Object3D): void {
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const mat = child.material;
        if (mat instanceof THREE.MeshStandardMaterial) {
          const origHex = mat.color.getHex();
          mat.emissive.setHex(0xff2200);
          mat.emissiveIntensity = 0.6;
          setTimeout(() => {
            mat.emissive.setHex(0x000000);
            mat.emissiveIntensity = 0;
            mat.color.setHex(origHex);
          }, 80);
        }
      }
    });
  }

  private destroy(prop: DestructibleProp): void {
    // Notify for networking (before removal)
    this.onPropDestroyedFull?.(prop);

    // Trigger barrel explosion effects immediately so it feels instant on hit.
    if (prop.type === 'barrel') {
      this.spawnBarrelFlash(prop.position);
      this.onBarrelExplode?.(prop.position, BARREL_EXPLOSION_RADIUS, BARREL_EXPLOSION_DAMAGE);
      this.pendingExplosionDamage.push({
        center: prop.position.clone(),
        radius: BARREL_EXPLOSION_RADIUS,
        damage: BARREL_EXPLOSION_DAMAGE,
      });
    }

    // Remove visual
    this.scene.remove(prop.mesh);
    // Barrel disposal can stall on first hit; skip runtime disposal for barrels.
    if (prop.type !== 'barrel') {
      // Defer disposal to spread GPU/GC work over multiple frames.
      this.pendingDispose.push(prop.mesh);
    }

    // Remove physics body + collider
    const body = prop.collider.parent();
    this.physics.removeCollider(prop.collider);
    if (body) this.physics.removeRigidBody(body);

    // Skip debris for barrels to avoid frame hitch on explosion.
    if (prop.type !== 'barrel') {
      this.spawnDebris(prop);
    }

    // Remove from tracking list
    const idx = this.props.indexOf(prop);
    if (idx >= 0) this.props.splice(idx, 1);

    // Drop loot if defined
    if (prop.loot) {
      const amount = prop.loot.amount ?? 1;
      this.onLootDrop?.(prop.loot.type, amount, prop.position);
    }

    // Notify for sounds
    this.onPropDestroyed?.(prop.type, prop.position);
  }

  private spawnBarrelFlash(pos: THREE.Vector3): void {
    const light = globalLightPool.acquire(0xff6600, 60, 8);
    light.position.copy(pos);
    light.position.y += 0.5;
    this.scene.add(light);

    const flash = this.acquireFlashMesh();
    const mat = flash.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.9;
    flash.scale.set(1, 1, 1);
    flash.position.copy(pos);
    flash.position.y += 0.3;
    this.scene.add(flash);

    this.barrelFlashes.push({ light, flash, elapsed: 0 });
  }

  private spawnDebris(prop: DestructibleProp): void {
    const mats = getDebrisMats(prop.type);
    // Keep barrel explosions cheap.
    const count = prop.type === 'barrel' ? 1 : DEBRIS_COUNT;
    const speed = prop.type === 'barrel' ? 4 : 2; // Reduced speeds
    // Floor level = bottom of the prop (prop center minus half size)
    const floorY = prop.position.y - prop.size / 2;

    for (let i = 0; i < count; i++) {
      const s = prop.size * (0.06 + Math.random() * 0.14);
      const geo = getDebrisGeo(s);
      const mat = mats[i % mats.length];

      const mesh = new THREE.Mesh(geo, mat);
      mesh.scale.setScalar(s);
      mesh.position.copy(prop.position);
      mesh.position.x += (Math.random() - 0.5) * prop.size * 0.4;
      mesh.position.y += Math.random() * prop.size * 0.3;
      mesh.position.z += (Math.random() - 0.5) * prop.size * 0.4;
      mesh.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI,
      );
      this.scene.add(mesh);

      const angle = Math.random() * Math.PI * 2;
      const outSpeed = (1 + Math.random()) * speed;
      const velocity = new THREE.Vector3(
        Math.cos(angle) * outSpeed,
        1 + Math.random() * (prop.type === 'barrel' ? 3 : 2), // Reduced vertical velocity
        Math.sin(angle) * outSpeed,
      );

      const life = DEBRIS_LIFETIME * (0.6 + Math.random() * 0.4);
      this.debris.push({
        mesh,
        velocity,
        rotSpeedX: (Math.random() - 0.5) * 8, // Reduced rotation speeds
        rotSpeedY: (Math.random() - 0.5) * 8,
        rotSpeedZ: (Math.random() - 0.5) * 8,
        life,
        maxLife: life,
        floorY,
      });
    }
  }

  /** Update debris physics, barrel flashes, and cleanup. Call once per frame. */
  update(dt: number): void {
    // Process one pending chain-explosion damage event per frame to avoid spikes.
    if (this.pendingExplosionDamage.length > 0) {
      const evt = this.pendingExplosionDamage.shift()!;
      this.damageInRadius(evt.center, evt.radius, evt.damage);
    }

    // Process one deferred mesh disposal per frame to avoid big GC/GPU stalls.
    if (this.pendingDispose.length > 0) {
      const root = this.pendingDispose.shift()!;
      root.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) child.material.dispose();
        }
      });
    }

    // --- Debris ---
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life -= dt;

      if (d.life <= 0) {
        this.scene.remove(d.mesh);
        // Don't dispose shared geometry/material — they're cached
        this.debris.splice(i, 1);
        continue;
      }

      // Gravity
      d.velocity.y += DEBRIS_GRAVITY * dt;
      d.mesh.position.addScaledVector(d.velocity, dt);

      // Floor bounce at actual floor level
      const groundY = d.floorY + 0.05;
      if (d.mesh.position.y < groundY) {
        d.mesh.position.y = groundY;
        d.velocity.y *= -0.25;
        d.velocity.x *= 0.7;
        d.velocity.z *= 0.7;
        d.rotSpeedX *= 0.8;
        d.rotSpeedY *= 0.8;
        d.rotSpeedZ *= 0.8;
      }

      // Tumble
      d.mesh.rotation.x += d.rotSpeedX * dt;
      d.mesh.rotation.y += d.rotSpeedY * dt;
      d.mesh.rotation.z += d.rotSpeedZ * dt;

      // Fade out in last 30% of life
      const fadeThresh = d.maxLife * 0.3;
      if (d.life < fadeThresh) {
        const opacity = d.life / fadeThresh;
        const mat = d.mesh.material as THREE.MeshBasicMaterial;
        if (!mat.transparent) mat.transparent = true;
        mat.opacity = opacity;
      }
    }

    // --- Barrel flashes (animated in main loop, not separate rAF) ---
    for (let i = this.barrelFlashes.length - 1; i >= 0; i--) {
      const bf = this.barrelFlashes[i];
      bf.elapsed += dt;
      const t = Math.min(1, bf.elapsed / BARREL_FLASH_DURATION);
      bf.light.intensity = 60 * (1 - t);
      const mat = bf.flash.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.9 * (1 - t);
      bf.flash.scale.setScalar(1 + t * 1.5);
      if (t >= 1) {
        this.scene.remove(bf.light);
        globalLightPool.release(bf.light);
        this.scene.remove(bf.flash);
        this.flashMeshPool.push(bf.flash);
        this.barrelFlashes.splice(i, 1);
      }
    }
  }
}
