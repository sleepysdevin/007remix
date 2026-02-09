import RAPIER from '@dimforge/rapier3d-compat';

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

  /** Remove a collider from the world (e.g. when a door opens). */
  removeCollider(collider: RAPIER.Collider, wakeBodies = true): void {
    this.world.removeCollider(collider, wakeBodies);
  }

  /** Create a static cuboid collider (walls, floors, etc.) */
  createStaticCuboid(
    hx: number,
    hy: number,
    hz: number,
    x: number,
    y: number,
    z: number,
  ): RAPIER.Collider {
    const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z);
    const body = this.world.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.cuboid(hx, hy, hz);
    return this.world.createCollider(colliderDesc, body);
  }

  /** Cast a ray and return the first hit */
  castRay(
    originX: number,
    originY: number,
    originZ: number,
    dirX: number,
    dirY: number,
    dirZ: number,
    maxToi: number,
    excludeCollider?: RAPIER.Collider,
  ): { point: RAPIER.Vector3; collider: RAPIER.Collider; toi: number } | null {
    const ray = new RAPIER.Ray(
      new RAPIER.Vector3(originX, originY, originZ),
      new RAPIER.Vector3(dirX, dirY, dirZ),
    );

    const filterFlags = undefined;
    const filterGroups = undefined;
    const filterExcludeCollider = excludeCollider ?? undefined;

    const hit = this.world.castRay(
      ray,
      maxToi,
      true,
      filterFlags,
      filterGroups,
      filterExcludeCollider,
    );

    if (hit) {
      const point = ray.pointAt(hit.timeOfImpact);
      return { point, collider: hit.collider, toi: hit.timeOfImpact };
    }

    return null;
  }

  dispose(): void {
    this.world.free();
  }
}
