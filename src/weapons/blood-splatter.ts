import * as THREE from 'three';
import { bloodSplatterTexture } from '../levels/procedural-textures';

/**
 * Blood splatter particle system for player/enemy hits.
 * Can spawn in world space OR attached to an enemy (blood emanates from the hit).
 */

interface BloodParticle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
}

interface BloodDecal {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
}

export class BloodSplatterSystem {
  private scene: THREE.Scene;
  private particlePool: THREE.Mesh[] = [];
  private activeParticles: BloodParticle[] = [];
  private decalPool: THREE.Mesh[] = [];
  private activeDecals: BloodDecal[] = [];
  private readonly poolSize = 50; // Increased from 30 for layered particles
  private readonly decalPoolSize = 20; // Increased from 12 for more coverage
  private particleGeo: THREE.PlaneGeometry;
  private decalGeo: THREE.PlaneGeometry;
  private camera: THREE.Camera | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // Shared geometry for all blood particles (varied sizes for depth)
    this.particleGeo = new THREE.PlaneGeometry(0.12, 0.12);

    // Shared decal geometry (billboard quad)
    this.decalGeo = new THREE.PlaneGeometry(0.15, 0.15);

    // Pre-create particle pool with varied textures (12 variants now)
    for (let i = 0; i < this.poolSize; i++) {
      const tex = bloodSplatterTexture(i % 12); // Use all 12 variants
      const pmat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
        alphaTest: 0.08,
      });
      const mesh = new THREE.Mesh(this.particleGeo, pmat);
      mesh.visible = false;
      mesh.renderOrder = 50; // Draw after most scene objects
      this.scene.add(mesh);
      this.particlePool.push(mesh);
    }

    // Pre-create decal pool (blood splatter sprites) with all pattern types
    for (let i = 0; i < this.decalPoolSize; i++) {
      const tex = bloodSplatterTexture(i % 12); // Cycle through all variants
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        depthTest: false, // Always visible (draws on top) — blood should never be occluded
        side: THREE.DoubleSide,
        alphaTest: 0.1, // Discard transparent pixels
      });
      const mesh = new THREE.Mesh(this.decalGeo, mat);
      mesh.renderOrder = 100; // Draw on top of characters
      mesh.visible = false;
      this.scene.add(mesh);
      this.decalPool.push(mesh);
    }
  }

  /** Set camera for decal billboarding (call after construction). */
  setDecalCamera(camera: THREE.Camera): void {
    this.camera = camera;
  }

  /**
   * Spawn blood ON an enemy — particles spray from hit point, decals attach to body.
   * Blood emanates from the enemy in 3D world space.
   * Enhanced with layered particles (large chunks, medium spray, fine mist).
   */
  spawnOnEnemy(
    enemyGroup: THREE.Group,
    hitPointWorld: THREE.Vector3,
    direction: THREE.Vector3,
    count: number = 18, // Increased for more dramatic effect
  ): void {
    const localHit = hitPointWorld.clone();
    enemyGroup.worldToLocal(localHit);

    const sprayDir = direction.clone().negate();

    // Layer 1: Large blood chunks (heavy, slow) — 20% of particles
    let spawned = 0;
    const chunkCount = Math.floor(count * 0.2);
    for (const mesh of this.particlePool) {
      if (mesh.visible) continue;
      if (spawned >= chunkCount) break;

      mesh.position.copy(hitPointWorld);
      mesh.scale.setScalar(0.7 + Math.random() * 0.6); // Large: 0.7–1.3
      mesh.rotation.z = Math.random() * Math.PI * 2;
      mesh.visible = true;
      (mesh.material as THREE.MeshBasicMaterial).opacity = 1;

      // Slower, less spread (heavy chunks)
      const vel = new THREE.Vector3(
        sprayDir.x + (Math.random() - 0.5) * 0.8,
        sprayDir.y + (Math.random() - 0.5) * 0.4 + 0.15,
        sprayDir.z + (Math.random() - 0.5) * 0.8,
      ).normalize().multiplyScalar(3 + Math.random() * 3);

      this.activeParticles.push({ mesh, velocity: vel, life: 0, maxLife: 0.4 + Math.random() * 0.2 });
      spawned++;
    }

    // Layer 2: Medium spray (main blood) — 50% of particles
    const sprayCount = Math.floor(count * 0.5);
    for (const mesh of this.particlePool) {
      if (mesh.visible) continue;
      if (spawned >= chunkCount + sprayCount) break;

      mesh.position.copy(hitPointWorld);
      mesh.scale.setScalar(0.45 + Math.random() * 0.5); // Medium: 0.45–0.95
      mesh.rotation.z = Math.random() * Math.PI * 2;
      mesh.visible = true;
      (mesh.material as THREE.MeshBasicMaterial).opacity = 1;

      // Standard spray with good dispersion
      const horizSpread = 1.6;
      const vertSpread = 0.6;
      const vel = new THREE.Vector3(
        sprayDir.x + (Math.random() - 0.5) * horizSpread,
        sprayDir.y + (Math.random() - 0.5) * vertSpread + 0.25,
        sprayDir.z + (Math.random() - 0.5) * horizSpread,
      ).normalize().multiplyScalar(6 + Math.random() * 7);

      this.activeParticles.push({ mesh, velocity: vel, life: 0, maxLife: 0.35 + Math.random() * 0.15 });
      spawned++;
    }

    // Layer 3: Fine mist (fast, wide spread) — 30% of particles
    const mistCount = Math.floor(count * 0.3);
    for (const mesh of this.particlePool) {
      if (mesh.visible) continue;
      if (spawned >= chunkCount + sprayCount + mistCount) break;

      mesh.position.copy(hitPointWorld);
      mesh.scale.setScalar(0.25 + Math.random() * 0.3); // Small: 0.25–0.55
      mesh.rotation.z = Math.random() * Math.PI * 2;
      mesh.visible = true;
      (mesh.material as THREE.MeshBasicMaterial).opacity = 0.8; // Slightly transparent

      // Fast, very wide spread (mist effect)
      const vel = new THREE.Vector3(
        sprayDir.x + (Math.random() - 0.5) * 2.2,
        sprayDir.y + (Math.random() - 0.5) * 1.0 + 0.3,
        sprayDir.z + (Math.random() - 0.5) * 2.2,
      ).normalize().multiplyScalar(8 + Math.random() * 10);

      this.activeParticles.push({ mesh, velocity: vel, life: 0, maxLife: 0.25 + Math.random() * 0.1 });
      spawned++;
    }

    // Decals — spawn in world space at hit location (NOT attached to enemy)
    let decalsSpawned = 0;
    const decalCount = 4 + Math.floor(Math.random() * 2);
    for (const mesh of this.decalPool) {
      if (decalsSpawned >= decalCount) break;
      const inUse = this.activeDecals.some((d) => d.mesh === mesh);
      if (inUse) continue;

      // Spawn in world space at hit point, offset slightly toward camera
      mesh.position.copy(hitPointWorld).addScaledVector(direction, -0.15);
      mesh.scale.setScalar(0.8 + Math.random() * 0.7); // Large decals: 0.8–1.5
      mesh.rotation.z = Math.random() * Math.PI * 2;
      mesh.visible = true;
      mesh.layers.set(0);
      (mesh.material as THREE.MeshBasicMaterial).opacity = 1;

      // Face camera immediately
      if (this.camera) {
        mesh.lookAt(this.camera.position);
      }

      this.activeDecals.push({
        mesh,
        life: 0,
        maxLife: 0.15 + Math.random() * 0.15, // Almost instant: 0.15-0.3s
      });
      decalsSpawned++;
    }
  }

  /**
   * Spawn blood splatter in world space (enhanced with layered particles).
   */
  spawn(position: THREE.Vector3, direction: THREE.Vector3, count: number = 14): void {
    const sprayDir = direction.clone().negate();

    // Layer 1: Large chunks (20%)
    let spawned = 0;
    const chunkCount = Math.floor(count * 0.2);
    for (const mesh of this.particlePool) {
      if (mesh.visible) continue;
      if (spawned >= chunkCount) break;

      mesh.position.copy(position);
      mesh.scale.setScalar(0.5 + Math.random() * 0.5); // Increased: 0.5–1.0
      mesh.rotation.z = Math.random() * Math.PI * 2;
      mesh.visible = true;
      (mesh.material as THREE.MeshBasicMaterial).opacity = 1;

      const vel = new THREE.Vector3(
        sprayDir.x + (Math.random() - 0.5) * 0.5,
        sprayDir.y + (Math.random() - 0.5) * 0.3 + 0.15,
        sprayDir.z + (Math.random() - 0.5) * 0.5
      ).normalize().multiplyScalar(2.5 + Math.random() * 3);

      this.activeParticles.push({ mesh, velocity: vel, life: 0, maxLife: 0.35 + Math.random() * 0.2 });
      spawned++;
    }

    // Layer 2: Medium spray (50%)
    const sprayCount = Math.floor(count * 0.5);
    for (const mesh of this.particlePool) {
      if (mesh.visible) continue;
      if (spawned >= chunkCount + sprayCount) break;

      mesh.position.copy(position);
      mesh.scale.setScalar(0.35 + Math.random() * 0.4); // Increased: 0.35–0.75
      mesh.rotation.z = Math.random() * Math.PI * 2;
      mesh.visible = true;
      (mesh.material as THREE.MeshBasicMaterial).opacity = 1;

      const spread = 0.9;
      const vel = new THREE.Vector3(
        sprayDir.x + (Math.random() - 0.5) * spread,
        sprayDir.y + (Math.random() - 0.5) * spread + 0.2,
        sprayDir.z + (Math.random() - 0.5) * spread
      ).normalize().multiplyScalar(4 + Math.random() * 5);

      this.activeParticles.push({ mesh, velocity: vel, life: 0, maxLife: 0.3 + Math.random() * 0.2 });
      spawned++;
    }

    // Layer 3: Fine mist (30%)
    const mistCount = Math.floor(count * 0.3);
    for (const mesh of this.particlePool) {
      if (mesh.visible) continue;
      if (spawned >= chunkCount + sprayCount + mistCount) break;

      mesh.position.copy(position);
      mesh.scale.setScalar(0.2 + Math.random() * 0.25); // Increased: 0.2–0.45
      mesh.rotation.z = Math.random() * Math.PI * 2;
      mesh.visible = true;
      (mesh.material as THREE.MeshBasicMaterial).opacity = 0.75;

      const vel = new THREE.Vector3(
        sprayDir.x + (Math.random() - 0.5) * 1.4,
        sprayDir.y + (Math.random() - 0.5) * 0.8 + 0.25,
        sprayDir.z + (Math.random() - 0.5) * 1.4
      ).normalize().multiplyScalar(6 + Math.random() * 8);

      this.activeParticles.push({ mesh, velocity: vel, life: 0, maxLife: 0.22 + Math.random() * 0.12 });
      spawned++;
    }

    // Spawn 2–3 blood splatter decal sprites (varied patterns)
    let decalsSpawned = 0;
    const targetDecals = 2 + Math.floor(Math.random() * 2);
    for (const mesh of this.decalPool) {
      if (decalsSpawned >= targetDecals) break;
      const inUse = this.activeDecals.some((d) => d.mesh === mesh);
      if (inUse) continue;

      // Offset well in front of impact (toward camera) so decal isn't occluded by enemy
      mesh.position.copy(position).addScaledVector(direction, -0.18);
      mesh.scale.setScalar(0.75 + Math.random() * 0.7); // Larger splatters: 0.75–1.45
      mesh.rotation.z = Math.random() * Math.PI * 2;
      mesh.visible = true;
      mesh.layers.set(0); // Ensure default render layer
      (mesh.material as THREE.MeshBasicMaterial).opacity = 1;

      // Face camera immediately so decal is visible from spawn
      if (this.camera) {
        mesh.lookAt(this.camera.position);
      }

      this.activeDecals.push({
        mesh,
        life: 0,
        maxLife: 0.2 + Math.random() * 0.15, // Almost instant: 0.2-0.35s
      });
      decalsSpawned++;
    }
  }

  /**
   * Update active blood particles and decal sprites.
   * Call this each frame from game loop.
   */
  update(dt: number): void {
    const gravity = -18;

    for (let i = this.activeParticles.length - 1; i >= 0; i--) {
      const p = this.activeParticles[i];
      p.life += dt;

      // Apply gravity
      p.velocity.y += gravity * dt;

      // Move particle
      p.mesh.position.addScaledVector(p.velocity, dt);

      // Billboard sprite toward camera
      if (this.camera) p.mesh.lookAt(this.camera.position);

      // Fade out over lifetime
      const t = p.life / p.maxLife;
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - t;

      // Remove if dead — fully reset to avoid any lingering visuals
      if (p.life >= p.maxLife) {
        p.mesh.visible = false;
        p.mesh.scale.setScalar(1);
        this.activeParticles.splice(i, 1);
      }
    }

    // Update decals: billboard toward camera, fade out
    for (let i = this.activeDecals.length - 1; i >= 0; i--) {
      const d = this.activeDecals[i];
      d.life += dt;

      if (this.camera) {
        d.mesh.lookAt(this.camera.position);
      }

      // Fade in first 0.1s, hold, then fade out
      const t = d.life / d.maxLife;
      const fadeOut = t > 0.7 ? (1 - t) / 0.3 : 1;
      (d.mesh.material as THREE.MeshBasicMaterial).opacity = fadeOut;

      if (d.life >= d.maxLife) {
        d.mesh.visible = false;
        this.activeDecals.splice(i, 1);
      }
    }
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    for (const mesh of this.particlePool) {
      this.scene.remove(mesh);
      (mesh.material as THREE.Material).dispose();
    }
    this.particleGeo.dispose();
    this.particlePool = [];
    this.activeParticles = [];

    for (const mesh of this.decalPool) {
      this.scene.remove(mesh);
      (mesh.material as THREE.Material).dispose();
    }
    this.decalGeo.dispose();
    this.decalPool = [];
    this.activeDecals = [];
  }
}
