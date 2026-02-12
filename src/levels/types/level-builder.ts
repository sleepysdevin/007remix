import * as THREE from 'three';
import { PhysicsWorld } from '../../core/physics-world';
import type { LevelSchema, RoomDef, PropDef, DoorDef } from './level-schema';
import { DoorSystem } from '../systems/door-system';
import { TriggerSystem } from '../systems/trigger-system';
import { ObjectiveSystem } from '../systems/objective-system';
import { EnemyManager } from '../../enemies/enemy-manager';
import { GUARD_VARIANTS } from '../../enemies/sprite/guard-sprite-sheet';
import { PickupSystem } from '../systems/pickup-system';
import { DestructibleSystem } from '../systems/destructible-system';
import {
  concreteWallTexture,
  floorTileTexture,
  ceilingPanelTexture,
  woodCrateTexture,
  metalCrateTexture,
  barrelTexture,
} from "../utils/procedural-textures";

const WALL_THICKNESS = 0.2;

export interface LevelBuilderDeps {
  scene: THREE.Scene;
  physics: PhysicsWorld;
  doorSystem: DoorSystem;
  triggerSystem: TriggerSystem;
  objectiveSystem: ObjectiveSystem;
  enemyManager: EnemyManager;
  pickupSystem: PickupSystem;
  destructibleSystem: DestructibleSystem;
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

  // Base ambient light with slight variation
  const ambient = new THREE.AmbientLight(0x8899aa, 1.8 + Math.random() * 0.7);
  scene.add(ambient);

  // Hemisphere light with more variation
  const hemi = new THREE.HemisphereLight(
    0xddeeff, 0x445544, 
    0.8 + Math.random() * 0.8  // Intensity between 0.8-1.6
  );
  scene.add(hemi);

  // Point lights per room with variations
  for (const room of level.rooms) {
    // Randomize light position within room (not perfectly centered)
    const x = room.x + (Math.random() - 0.5) * room.width * 0.6;
    const z = room.z + (Math.random() - 0.5) * room.depth * 0.6;
    
    // Randomize intensity (80-160) and distance (20-40)
    const intensity = 80 + Math.random() * 80;
    const distance = 20 + Math.random() * 20;
    
    // Slight color variation
    const color = new THREE.Color(0xffeedd)
      .offsetHSL(0, 0, (Math.random() - 0.5) * 0.1);
    
    const pointLight = new THREE.PointLight(color, intensity, distance);
    pointLight.position.set(x, 1.5, z);
    pointLight.castShadow = true;
    pointLight.shadow.mapSize.set(512, 512);
    pointLight.shadow.bias = -0.001; // Reduce shadow acne
    
    // Add some random flicker to some lights (20% chance)
    if (Math.random() < 0.2) {
      const baseIntensity = intensity;
      const flickerSpeed = 0.5 + Math.random() * 2;
      const flickerAmount = 0.1 + Math.random() * 0.2;
      
      const flicker = (timestamp: number) => {
        const flickerVal = Math.sin(timestamp * 0.001 * flickerSpeed) * flickerAmount + 1;
        pointLight.intensity = baseIntensity * (0.9 + flickerVal * 0.1);
        requestAnimationFrame(flicker);
      };
      requestAnimationFrame(flicker);
    }
    
    scene.add(pointLight);
  }

  // Materials — procedural Canvas textures with optional color tint
  const floorTex = floorTileTexture();
  const wallTex = concreteWallTexture();
  const ceilTex = ceilingPanelTexture();

  const floorMat = (color = 0x888888) => {
    const tex = floorTex.clone();
    tex.needsUpdate = true;
    tex.repeat.set(5, 5); // Match quickplay style
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return new THREE.MeshStandardMaterial({ map: tex, color, roughness: 0.8, metalness: 0.2 });
  };
  const wallMat = (color = 0x999999) => {
    const tex = wallTex.clone();
    tex.needsUpdate = true;
    tex.repeat.set(4, 1); // Match quickplay style
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return new THREE.MeshStandardMaterial({ map: tex, color, roughness: 0.7, metalness: 0.1 });
  };
  const ceilingMat = (_color = 0x888888) => {
    const tex = ceilTex.clone();
    tex.needsUpdate = true;
    tex.repeat.set(5, 5); // Match quickplay style
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

  // Props (destructible)
  if (level.props) {
    for (const prop of level.props) {
      buildProp(prop, scene, physics, deps.destructibleSystem);
    }
  }

  // Rapier's query pipeline needs a step() to index newly-created colliders.
  // Without this, castRay misses floors/walls that were just built above.
  physics.step();

  // Player spawn (IMPORTANT: PlayerController.setPosition expects FEET Y)
  const { x: px, y: py, z: pz } = level.playerSpawn;

  // IMPORTANT: start INSIDE the room (below ceiling). A value of 1.5 above
  // py keeps the ray origin below the ceiling for rooms with height >= 3.
  // Starting too high (e.g. 30) hits the ceiling first and places player on top of it.
  const RAY_START_ABOVE = 1.5;
  const RAY_LEN = 10;
  const FEET_EPS = 0.06; // Must be > floor thickness jitter and ground-ray eps

  const startY = py + RAY_START_ABOVE;

  const hit = physics.castRay(
    px, startY, pz,
    0, -1, 0,
    RAY_LEN,
    undefined
  );

  if (hit) {
    // Rapier ray hit point y = startY - toi (because dir is -Y)
    const groundY = startY - hit.toi;

    // Pass FEET y into player setter
    setPlayerPosition(px, groundY + FEET_EPS, pz);
  } else {
    console.warn(`[LevelBuilder] No ground hit for player at (${px.toFixed(2)},${py.toFixed(2)},${pz.toFixed(2)}). Using schema y (FEET).`);
    setPlayerPosition(px, py, pz); // assume schema y is feet-y (may be wrong)
  }

  // Enemies (with optional waypoints for patrol, variant for appearance)
  console.log(`[LevelBuilder] Spawning ${level.enemies.length} enemies`);
  for (const e of level.enemies) {
    console.log(`[LevelBuilder] Spawning enemy ${e.id} at (${e.x}, ${e.y}, ${e.z})`);
    
    // Convert string variant to full GuardVariant object
    const variant = e.variant ? GUARD_VARIANTS[e.variant] : undefined;

    const room = level.rooms.find((r) => r.id === e.roomId);
    const roomEdgePadding = 0.85;
    const roomBounds = room
      ? {
          minX: room.x - room.width / 2 + roomEdgePadding,
          maxX: room.x + room.width / 2 - roomEdgePadding,
          minZ: room.z - room.depth / 2 + roomEdgePadding,
          maxZ: room.z + room.depth / 2 - roomEdgePadding,
        }
      : undefined;
    
    // Convert waypoints from {x, z} to {x, y, z} format
    const waypoints = e.waypoints?.map(wp => ({ x: wp.x, y: e.y, z: wp.z }));
    
    enemyManager.spawnEnemy({
      x: e.x,
      y: e.y,
      z: e.z,
      facingAngle: e.facingAngle,
      health: e.health,
      speed: e.speed,
      waypoints,
      variant,
      roomBounds,
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

  // Triggers — also place extraction marker at mission:complete trigger
  for (const t of level.triggers) {
    triggerSystem.addTrigger(t);
    const hasMissionComplete = t.onEnter
      .split(',')
      .map((cmd) => cmd.trim())
      .includes('mission:complete');
    if (hasMissionComplete) {
      buildExtractionMarker(scene, t.x, t.y, t.z);
    }
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

  // Walls (4 sides) — split around door openings instead of skipping entire walls

  // Helper: find doors on a given wall
  const getDoorsOnWall = (wallIndex: number): DoorDef[] => {
    const found: DoorDef[] = [];
    for (const d of doors) {
      if (wallIndex === 0 && Math.abs(d.z - (z - hd)) <= DOOR_WALL_TOLERANCE && Math.abs(d.x - x) <= hw + 1) found.push(d);
      if (wallIndex === 1 && Math.abs(d.z - (z + hd)) <= DOOR_WALL_TOLERANCE && Math.abs(d.x - x) <= hw + 1) found.push(d);
      if (wallIndex === 2 && Math.abs(d.x - (x - hw)) <= DOOR_WALL_TOLERANCE && Math.abs(d.z - z) <= hd + 1) found.push(d);
      if (wallIndex === 3 && Math.abs(d.x - (x + hw)) <= DOOR_WALL_TOLERANCE && Math.abs(d.z - z) <= hd + 1) found.push(d);
    }
    return found;
  };

  // Helper: build a single wall segment (mesh + physics)
  const addWallSeg = (halfW: number, halfH: number, halfD: number, px: number, py: number, pz: number) => {
    if (halfW < 0.15 && halfD < 0.15) return; // too thin to bother
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(halfW * 2, halfH * 2, halfD * 2),
      wallMat(wColor),
    );
    wall.position.set(px, py, pz);
    wall.receiveShadow = true;
    scene.add(wall);
    physics.createStaticCuboid(halfW, halfH, halfD, px, py, pz);
  };

  const wt = WALL_THICKNESS / 2;

  // Wall 0 (z-south) and Wall 1 (z-north): span along X, thin in Z
  for (let wi = 0; wi < 2; wi++) {
    const wallZ = wi === 0 ? z - hd - wt : z + hd + wt;
    const wallDoors = getDoorsOnWall(wi);
    if (wallDoors.length === 0) {
      addWallSeg(hw, hh, wt, x, y, wallZ);
    } else {
      // Wall runs from (x - hw) to (x + hw) along X
      const wallStart = x - hw;
      const wallEnd = x + hw;
      // Sort doors by x position
      const sorted = wallDoors.slice().sort((a, b) => a.x - b.x);
      let cursor = wallStart;
      for (const d of sorted) {
        const doorLeft = d.x - d.width / 2 - 0.1; // small gap for frame
        const doorRight = d.x + d.width / 2 + 0.1;
        // Segment before this door
        if (doorLeft > cursor + 0.3) {
          const segW = (doorLeft - cursor) / 2;
          const segCx = cursor + segW;
          addWallSeg(segW, hh, wt, segCx, y, wallZ);
        }
        cursor = doorRight;
      }
      // Segment after last door
      if (wallEnd > cursor + 0.3) {
        const segW = (wallEnd - cursor) / 2;
        const segCx = cursor + segW;
        addWallSeg(segW, hh, wt, segCx, y, wallZ);
      }
    }
  }

  // Wall 2 (x-west) and Wall 3 (x-east): span along Z, thin in X
  for (let wi = 2; wi < 4; wi++) {
    const wallX = wi === 2 ? x - hw - wt : x + hw + wt;
    const wallDoors = getDoorsOnWall(wi);
    if (wallDoors.length === 0) {
      addWallSeg(wt, hh, hd, wallX, y, z);
    } else {
      const wallStart = z - hd;
      const wallEnd = z + hd;
      const sorted = wallDoors.slice().sort((a, b) => a.z - b.z);
      let cursor = wallStart;
      for (const d of sorted) {
        const doorFront = d.z - d.width / 2 - 0.1;
        const doorBack = d.z + d.width / 2 + 0.1;
        if (doorFront > cursor + 0.3) {
          const segD = (doorFront - cursor) / 2;
          const segCz = cursor + segD;
          addWallSeg(wt, hh, segD, wallX, y, segCz);
        }
        cursor = doorBack;
      }
      if (wallEnd > cursor + 0.3) {
        const segD = (wallEnd - cursor) / 2;
        const segCz = cursor + segD;
        addWallSeg(wt, hh, segD, wallX, y, segCz);
      }
    }
  }
}


function buildProp(
  prop: PropDef,
  scene: THREE.Scene,
  physics: PhysicsWorld,
  destructible: DestructibleSystem,
): void {
  const scale = prop.scale ?? 1;
  const { x, y, z } = prop;

  if (prop.type === 'crate' || prop.type === 'crate_metal' || prop.type === 'crate_wood') {
    const isMetal = prop.type === 'crate_metal';
    const mat = new THREE.MeshStandardMaterial({
      map: isMetal ? metalCrateTexture() : woodCrateTexture(),
      roughness: 0.7,
      metalness: isMetal ? 0.5 : 0.1,
    });
    const size = 1 * scale;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), mat);
    mesh.position.set(x, y + size / 2, z);
    if (prop.rotY !== undefined) mesh.rotation.y = prop.rotY;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    const collider = physics.createStaticCuboid(size / 2, size / 2, size / 2, x, y + size / 2, z);
    const destructibleType = prop.type === 'crate_wood' ? 'crate' : prop.type;
    destructible.register(mesh, collider, destructibleType, undefined, size, prop.loot);
  } else if (prop.type === 'barrel' || prop.type === 'barrel_metal' || prop.type === 'barrel_explosive') {
    const isExplosive = prop.type === 'barrel_explosive';
    const mat = new THREE.MeshStandardMaterial({
      map: barrelTexture(),
      roughness: isExplosive ? 0.3 : 0.5,
      metalness: isExplosive ? 0.1 : 0.3,
      color: isExplosive ? new THREE.Color(0xff4444) : undefined, // Red tint for explosive barrels
    });
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4 * scale, 0.4 * scale, 1.2 * scale, 12),
      mat,
    );
    mesh.position.set(x, y + 0.6 * scale, z);
    mesh.castShadow = true;
    scene.add(mesh);
    const collider = physics.createStaticCuboid(0.4 * scale, 0.6 * scale, 0.4 * scale, x, y + 0.6 * scale, z);
    const destructibleType = prop.type === 'barrel_explosive' || prop.type === 'barrel_metal' ? 'barrel' : prop.type;
    destructible.register(mesh, collider, destructibleType, undefined, 0.8 * scale, prop.loot);
  } else if (prop.type.startsWith('weapon_')) {
    // Weapons are pickups, not destructible props - they should be handled by pickup system
    console.log(`[buildProp] Weapon ${prop.type} should be handled as pickup, not prop`);
  } else {
    console.warn(`[buildProp] Unknown prop type: ${prop.type}`);
  }
}

/**
 * Build a floating, glowing downward arrow at the extraction point.
 * Animated: bobs up and down and rotates slowly.
 */
function buildExtractionMarker(scene: THREE.Scene, x: number, y: number, z: number): void {
  const group = new THREE.Group();
  group.position.set(x, y + 1.8, z);

  // Arrow built from two boxes: vertical shaft + arrowhead (chevron from two angled boxes)
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0x44ff66,
    transparent: true,
    opacity: 0.85,
  });

  // Shaft
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.6, 0.12), glowMat);
  shaft.position.y = 0.3;
  group.add(shaft);

  // Arrowhead — two angled boxes forming a V pointing down
  const headMat = new THREE.MeshBasicMaterial({
    color: 0x66ffaa,
    transparent: true,
    opacity: 0.9,
  });

  const leftWing = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.12), headMat);
  leftWing.position.set(-0.15, -0.05, 0);
  leftWing.rotation.z = -0.6;
  group.add(leftWing);

  const rightWing = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.12), headMat);
  rightWing.position.set(0.15, -0.05, 0);
  rightWing.rotation.z = 0.6;
  group.add(rightWing);

  // Point light for the glow effect
  const glow = new THREE.PointLight(0x44ff66, 15, 8);
  glow.position.set(0, 0, 0);
  group.add(glow);

  scene.add(group);

  // Animate: bob up/down and rotate slowly
  const baseY = group.position.y;
  const update = () => {
    const t = performance.now() * 0.001;
    group.position.y = baseY + Math.sin(t * 2) * 0.15;
    group.rotation.y = t * 0.8;
    // Pulse the glow
    glow.intensity = 12 + Math.sin(t * 3) * 5;
    glowMat.opacity = 0.7 + Math.sin(t * 3) * 0.15;
    headMat.opacity = 0.75 + Math.sin(t * 3) * 0.15;
    requestAnimationFrame(update);
  };
  update();
}
