// src/core/physics-world.ts
import RAPIER from '@dimforge/rapier3d-compat';

// Collision groups
export const GROUP_WORLD  = 0x0001;
export const GROUP_ENEMY  = 0x0002;
export const GROUP_PLAYER = 0x0004;

/**
 * Rapier groups bit layout: (memberships << 16) | filter
 */
export function createCollisionFilter(memberships: number, filter: number): number {
  return (memberships << 16) | filter;
}

export class PhysicsWorld {
  readonly world: RAPIER.World;
  readonly rapier: typeof RAPIER;

  private constructor(rapier: typeof RAPIER, world: RAPIER.World) {
    this.rapier = rapier;
    this.world = world;
  }

  static async create(): Promise<PhysicsWorld> {
    await RAPIER.init();
    const gravity = new RAPIER.Vector3(0, -9.81, 0);
    const world = new RAPIER.World(gravity);
    return new PhysicsWorld(RAPIER, world);
  }

  step(): void {
    this.world.step();
  }

  removeCollider(collider: RAPIER.Collider, wakeBodies = true): void {
    this.world.removeCollider(collider, wakeBodies);
  }

  removeRigidBody(body: RAPIER.RigidBody): void {
    this.world.removeRigidBody(body);
  }

  /** Create a static cuboid collider (walls, floors, etc.) */
  createStaticCuboid(
    hx: number, hy: number, hz: number,
    x: number, y: number, z: number,
  ): RAPIER.Collider {
    const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z);
    const body = this.world.createRigidBody(bodyDesc);

    const groups = createCollisionFilter(
      GROUP_WORLD,
      GROUP_WORLD | GROUP_PLAYER | GROUP_ENEMY
    );

    const colliderDesc = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      .setCollisionGroups(groups)
      .setSolverGroups(groups);

    return this.world.createCollider(colliderDesc, body);
  }

  /**
   * Create a kinematic cuboid (for moving doors, platforms, etc.)
   * Returns both body + collider so caller can move the body safely.
   */
  createKinematicCuboid(
    hx: number, hy: number, hz: number,
    x: number, y: number, z: number,
    memberships: number = GROUP_WORLD,
    filter: number = GROUP_PLAYER | GROUP_ENEMY,
  ): { body: RAPIER.RigidBody; collider: RAPIER.Collider } {
    const bodyDesc = RAPIER.RigidBodyDesc
      .kinematicPositionBased()
      .setTranslation(x, y, z);

    const body = this.world.createRigidBody(bodyDesc);

    const groups = createCollisionFilter(memberships, filter);

    const colliderDesc = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      .setCollisionGroups(groups)
      .setSolverGroups(groups);

    const collider = this.world.createCollider(colliderDesc, body);
    return { body, collider };
  }

  /**
   * Dynamic capsule helper (enemies).
   * Note: Rapier capsule(halfHeight, radius) total height = 2*halfHeight + 2*radius.
   */
  createDynamicCapsule(
    halfHeight: number,
    radius: number,
    x: number,
    y: number,
    z: number,
    opts?: { lockRotations?: boolean; linearDamping?: number; friction?: number }
  ): { body: RAPIER.RigidBody; collider: RAPIER.Collider } {
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y, z)
      .setCcdEnabled(true);

    // compat-safe: lockRotations() takes no args
    if (opts?.lockRotations !== false) bodyDesc.lockRotations();
    if (typeof opts?.linearDamping === 'number') bodyDesc.setLinearDamping(opts.linearDamping);

    const body = this.world.createRigidBody(bodyDesc);

    const groups = createCollisionFilter(GROUP_ENEMY, GROUP_WORLD | GROUP_PLAYER | GROUP_ENEMY);

    const colliderDesc = RAPIER.ColliderDesc.capsule(halfHeight, radius)
      .setDensity(1.0)
      .setFriction(typeof opts?.friction === 'number' ? opts.friction : 1.0)
      .setRestitution(0.0)
      .setCollisionGroups(groups)
      .setSolverGroups(groups);

    const collider = this.world.createCollider(colliderDesc, body);
    return { body, collider };
  }

  createKinematicCapsule(
    halfHeight: number,
    radius: number,
    x: number,
    y: number,
    z: number,
    opts?: { friction?: number }
  ): { body: RAPIER.RigidBody; collider: RAPIER.Collider } {
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(x, y, z)
      .setCcdEnabled(true);

    const body = this.world.createRigidBody(bodyDesc);

    const groups = createCollisionFilter(GROUP_ENEMY, GROUP_WORLD | GROUP_PLAYER | GROUP_ENEMY);
    const colliderDesc = RAPIER.ColliderDesc.capsule(halfHeight, radius)
      .setDensity(1.0)
      .setFriction(typeof opts?.friction === 'number' ? opts.friction : 1.0)
      .setRestitution(0.0)
      .setCollisionGroups(groups)
      .setSolverGroups(groups);

    const collider = this.world.createCollider(colliderDesc, body);
    return { body, collider };
  }

  /**
   * Raycast helper for rapier3d-compat.
   *
   * Uses plain JS vectors for the ray and returns plain JS hit point data.
   */
  castRay(
    originX: number,
    originY: number,
    originZ: number,
    dirX: number,
    dirY: number,
    dirZ: number,
    maxToi: number,
    excludeCollider?: RAPIER.Collider,
    groups?: number, // optional collision groups mask (from createCollisionFilter)
    includeColliderHandle = false,
  ): { point: { x: number; y: number; z: number }; colliderHandle?: number; toi: number } | null {
    const ray = new RAPIER.Ray(
      { x: originX, y: originY, z: originZ },
      { x: dirX, y: dirY, z: dirZ },
    );

    let hit: any = null;
    try {
      if (includeColliderHandle && typeof (this.world as any).castRayAndGetNormal === 'function') {
        hit = (this.world as any).castRayAndGetNormal(
          ray,
          maxToi,
          true,          // solid
          undefined,     // filterFlags
          groups,        // filterGroups
          excludeCollider,
          undefined      // excludeRigidBody
        );
      } else {
        hit = this.world.castRay(
          ray,
          maxToi,
          true,          // solid
          undefined,     // filterFlags
          groups,        // filterGroups
          excludeCollider,
          undefined      // excludeRigidBody
        );
      }

      if (!hit) return null;

      const toi = hit.timeOfImpact;
      const point = {
        x: originX + dirX * toi,
        y: originY + dirY * toi,
        z: originZ + dirZ * toi,
      };

      if (includeColliderHandle) {
        const raw = hit as any;
        let colliderHandle: number | undefined;

        if (typeof raw.colliderHandle === 'number') {
          colliderHandle = raw.colliderHandle;
        } else if (typeof raw.collider === 'number') {
          colliderHandle = raw.collider;
        } else if (typeof raw.collider?.handle === 'number') {
          colliderHandle = raw.collider.handle;
        } else if (typeof raw.collider?.handle === 'function') {
          try {
            const maybe = raw.collider.handle();
            if (typeof maybe === 'number') colliderHandle = maybe;
          } catch {}
        } else if (typeof raw.collider === 'function') {
          try {
            const c = raw.collider();
            if (typeof c?.handle === 'number') colliderHandle = c.handle;
            else if (typeof c?.handle === 'function') {
              const maybe = c.handle();
              if (typeof maybe === 'number') colliderHandle = maybe;
            }
            (c as any)?.free?.();
          } catch {}
        }

        return { point, colliderHandle, toi };
      }

      return { point, toi };
    } finally {
      if (hit) (hit as any).free?.();
      (ray as any).free?.();
    }
  }

  dispose(): void {
    this.world.free();
  }
}
