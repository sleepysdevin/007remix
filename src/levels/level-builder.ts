import * as THREE from 'three';
import { PhysicsWorld } from '../core/physics-world';
import type { LevelSchema, RoomDef, PropDef, DoorDef } from './level-schema';
import { DoorSystem } from './door-system';
import { TriggerSystem } from './trigger-system';
import { ObjectiveSystem } from './objective-system';
import { EnemyManager } from '../enemies/enemy-manager';
import { PickupSystem } from '../levels/pickup-system';
import {
  concreteWallTexture,
  floorTileTexture,
  ceilingPanelTexture,
  woodCrateTexture,
  metalCrateTexture,
  barrelTexture,
} from './procedural-textures';

const WALL_THICKNESS = 0.2;

export interface LevelBuilderDeps {
  scene: THREE.Scene;
  physics: PhysicsWorld;
  doorSystem: DoorSystem;
  triggerSystem: TriggerSystem;
  objectiveSystem: ObjectiveSystem;
  enemyManager: EnemyManager;
  pickupSystem: PickupSystem;
  setPlayerPosition: (x: number, y: number, z: number) => void;
}

/**
 * Build a playable level from schema: geometry, colliders, doors, enemies, pickups, triggers.
 */
export function buildLevel(level: LevelSchema, deps: LevelBuilderDeps): void {
  const {
    scene,
    physics,
    doorSystem,
    triggerSystem,
    objectiveSystem,
    enemyManager,
    pickupSystem,
    setPlayerPosition,
  } = deps;

  // Lights — positioned INSIDE rooms (below ceiling at y≈2.0)
  const ambient = new THREE.AmbientLight(0x8899aa, 1.4);
  scene.add(ambient);

  // Hemisphere light for natural indoor fill (warm from above, cool from floor bounce)
  const hemi = new THREE.HemisphereLight(0xddeeff, 0x445544, 0.6);
  scene.add(hemi);

  // Point lights per room — placed at y=1.5 (well below ceiling at y≈2.1)
  const lightPositions: [number, number, number][] = [
    [0, 1.5, 0],
    [0, 1.5, 16],
    [12, 1.5, 16],
    [12, 1.5, 28],
    [0, 1.5, 28],
    [0, 1.5, 42],
    [0, 1.5, 54],
  ];
  for (const [lx, ly, lz] of lightPositions) {
    const pointLight = new THREE.PointLight(0xffeedd, 60, 20);
    pointLight.position.set(lx, ly, lz);
    pointLight.castShadow = true;
    pointLight.shadow.mapSize.set(512, 512);
    scene.add(pointLight);
  }

  // Materials — procedural Canvas textures with optional color tint
  const floorTex = floorTileTexture();
  const wallTex = concreteWallTexture();
  const ceilTex = ceilingPanelTexture();

  const floorMat = (color = 0x888888) => {
    const tex = floorTex.clone();
    tex.needsUpdate = true;
    tex.repeat.set(3, 3);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return new THREE.MeshStandardMaterial({ map: tex, color, roughness: 0.8, metalness: 0.2 });
  };
  const wallMat = (color = 0x999999) => {
    const tex = wallTex.clone();
    tex.needsUpdate = true;
    tex.repeat.set(3, 1);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return new THREE.MeshStandardMaterial({ map: tex, color, roughness: 0.7, metalness: 0.1 });
  };
  const ceilingMat = (_color = 0x888888) => {
    const tex = ceilTex.clone();
    tex.needsUpdate = true;
    tex.repeat.set(3, 3);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return new THREE.MeshStandardMaterial({ map: tex, color: _color, roughness: 0.9, metalness: 0 });
  };

  // Build each room (pass doors so we can leave gaps)
  for (const room of level.rooms) {
    buildRoom(room, level.doors, scene, physics, floorMat, wallMat, ceilingMat);
  }

  // Doors
  for (const door of level.doors) {
    doorSystem.addDoor(door);
  }

  // Props
  if (level.props) {
    for (const prop of level.props) {
      buildProp(prop, scene, physics);
    }
  }

  // Player spawn
  const { x: px, y: py, z: pz } = level.playerSpawn;
  setPlayerPosition(px, py, pz);

  // Enemies (with optional waypoints for patrol)
  for (const e of level.enemies) {
    enemyManager.spawnEnemy({
      x: e.x,
      y: e.y,
      z: e.z,
      facingAngle: e.facingAngle,
      waypoints: e.waypoints,
    });
  }

  // Pickups
  for (const p of level.pickups) {
    const amount = p.amount ?? (p.type.startsWith('ammo-') ? 20 : p.type.startsWith('weapon-') ? 1 : 25);
    if (p.type === 'key' && p.keyId) {
      pickupSystem.spawnKey(p.keyId, p.x, p.y, p.z);
    } else {
      pickupSystem.spawn(p.type as any, p.x, p.y, p.z, amount);
    }
  }

  // Triggers
  for (const t of level.triggers) {
    triggerSystem.addTrigger(t);
  }

  // Objectives
  objectiveSystem.load(level.objectives);
}

const DOOR_WALL_TOLERANCE = 2;

function buildRoom(
  room: RoomDef,
  doors: DoorDef[],
  scene: THREE.Scene,
  physics: PhysicsWorld,
  floorMat: (c?: number) => THREE.Material,
  wallMat: (c?: number) => THREE.Material,
  ceilingMat: (c?: number) => THREE.Material,
): void {
  const { x, y, z, width, depth, height } = room;
  const fColor = room.floorColor ?? 0x555555;
  const wColor = room.wallColor ?? 0x666666;
  const hw = width / 2;
  const hd = depth / 2;
  const hh = height / 2;

  // Floor
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(width, WALL_THICKNESS, depth),
    floorMat(fColor),
  );
  floor.position.set(x, y - height / 2 - WALL_THICKNESS / 2, z);
  floor.receiveShadow = true;
  scene.add(floor);
  physics.createStaticCuboid(width / 2, WALL_THICKNESS / 2, depth / 2, x, y - height / 2 - WALL_THICKNESS / 2, z);

  // Ceiling
  const ceiling = new THREE.Mesh(
    new THREE.BoxGeometry(width, WALL_THICKNESS, depth),
    ceilingMat(),
  );
  ceiling.position.set(x, y + height / 2 + WALL_THICKNESS / 2, z);
  scene.add(ceiling);
  physics.createStaticCuboid(width / 2, WALL_THICKNESS / 2, depth / 2, x, y + height / 2 + WALL_THICKNESS / 2, z);

  // Walls (4 sides) — skip building wall if a door is on it (door is the only blocker)
  const wallSpecs: [number, number, number, number, number, number][] = [
    [hw, hh, WALL_THICKNESS / 2, x, y, z - hd - WALL_THICKNESS / 2],
    [hw, hh, WALL_THICKNESS / 2, x, y, z + hd + WALL_THICKNESS / 2],
    [WALL_THICKNESS / 2, hh, hd, x - hw - WALL_THICKNESS / 2, y, z],
    [WALL_THICKNESS / 2, hh, hd, x + hw + WALL_THICKNESS / 2, y, z],
  ];

  const doorOnWall = (wallIndex: number, wx: number, wy: number, wz: number): boolean => {
    for (const d of doors) {
      if (wallIndex === 0 && Math.abs(d.z - (z - hd)) <= DOOR_WALL_TOLERANCE && Math.abs(d.x - x) <= hw + 1) return true;
      if (wallIndex === 1 && Math.abs(d.z - (z + hd)) <= DOOR_WALL_TOLERANCE && Math.abs(d.x - x) <= hw + 1) return true;
      if (wallIndex === 2 && Math.abs(d.x - (x - hw)) <= DOOR_WALL_TOLERANCE && Math.abs(d.z - z) <= hd + 1) return true;
      if (wallIndex === 3 && Math.abs(d.x - (x + hw)) <= DOOR_WALL_TOLERANCE && Math.abs(d.z - z) <= hd + 1) return true;
    }
    return false;
  };

  wallSpecs.forEach(([sx, sy, sz, wx, wy, wz], i) => {
    if (doorOnWall(i, wx, wy, wz)) return;
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(sx * 2, sy * 2, sz * 2),
      wallMat(wColor),
    );
    wall.position.set(wx, wy, wz);
    wall.receiveShadow = true;
    scene.add(wall);
    physics.createStaticCuboid(sx, sy, sz, wx, wy, wz);
  });
}


function buildProp(prop: PropDef, scene: THREE.Scene, physics: PhysicsWorld): void {
  const scale = prop.scale ?? 1;
  const { x, y, z } = prop;

  if (prop.type === 'crate' || prop.type === 'crate_metal') {
    const isMetal = prop.type === 'crate_metal';
    const mat = new THREE.MeshStandardMaterial({
      map: isMetal ? metalCrateTexture() : woodCrateTexture(),
      roughness: 0.7,
      metalness: isMetal ? 0.5 : 0.1,
    });
    const size = 1 * scale;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), mat);
    mesh.position.set(x, y + size / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    physics.createStaticCuboid(size / 2, size / 2, size / 2, x, y + size / 2, z);
  } else if (prop.type === 'barrel') {
    const mat = new THREE.MeshStandardMaterial({
      map: barrelTexture(),
      roughness: 0.5,
      metalness: 0.3,
    });
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4 * scale, 0.4 * scale, 1.2 * scale, 12),
      mat,
    );
    mesh.position.set(x, y + 0.6 * scale, z);
    mesh.castShadow = true;
    scene.add(mesh);
    physics.createStaticCuboid(0.4 * scale, 0.6 * scale, 0.4 * scale, x, y + 0.6 * scale, z);
  }
}
