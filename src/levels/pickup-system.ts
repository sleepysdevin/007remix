import * as THREE from 'three';
import {
  healthTexture,
  armorTexture,
  ammoTexture,
  weaponTexture,
  keyTexture,
} from './pickup-textures';

export type PickupType =
  | 'health'
  | 'armor'
  | 'ammo-pistol'
  | 'ammo-rifle'
  | 'ammo-shotgun'
  | 'ammo-sniper'
  | 'weapon-rifle'
  | 'weapon-shotgun'
  | 'weapon-sniper'
  | 'key';

interface Pickup {
  type: PickupType;
  mesh: THREE.Group;
  position: THREE.Vector3;
  collected: boolean;
  amount: number;
  bobPhase: number;
  keyId?: string;
}

const COLLECT_RADIUS = 1.2;

export class PickupSystem {
  private pickups: Pickup[] = [];
  private scene: THREE.Scene;

  onPickupCollected: ((type: PickupType, amount: number, keyId?: string) => void) | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /** Spawn a key pickup (opens locked doors). */
  spawnKey(keyId: string, x: number, y: number, z: number): void {
    this.spawn('key', x, y, z, 1);
    const p = this.pickups[this.pickups.length - 1];
    p.keyId = keyId;
  }

  spawn(type: PickupType, x: number, y: number, z: number, amount: number): void {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    const mesh = buildPickupMesh(type);
    group.add(mesh);

    this.scene.add(group);
    this.pickups.push({
      type,
      mesh: group,
      position: new THREE.Vector3(x, y, z),
      collected: false,
      amount,
      bobPhase: Math.random() * Math.PI * 2,
    });
  }

  update(dt: number, playerPos: THREE.Vector3): void {
    for (const pickup of this.pickups) {
      if (pickup.collected) continue;

      // Bob and rotate
      pickup.bobPhase += dt * 3;
      pickup.mesh.position.y = pickup.position.y + Math.sin(pickup.bobPhase) * 0.1 + 0.15;
      pickup.mesh.rotation.y += dt * 2;

      // Check collection distance
      const dist = playerPos.distanceTo(pickup.mesh.position);
      if (dist < COLLECT_RADIUS) {
        pickup.collected = true;
        this.scene.remove(pickup.mesh);
        this.onPickupCollected?.(pickup.type, pickup.amount, pickup.keyId);
      }
    }
  }
}

// ─── Per-type mesh builders ───

function buildPickupMesh(type: PickupType): THREE.Group {
  if (type === 'health') return buildHealthMesh();
  if (type === 'armor') return buildArmorMesh();
  if (type === 'key') return buildKeyMesh();
  if (type.startsWith('weapon-')) return buildWeaponMesh(type);
  return buildAmmoMesh(type);
}

function buildHealthMesh(): THREE.Group {
  const g = new THREE.Group();
  const tex = healthTexture();
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.95 });

  // Cross shape: two intersecting boxes
  const h = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.08), mat);
  const v = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.24, 0.08), mat);
  g.add(h);
  g.add(v);
  return g;
}

function buildArmorMesh(): THREE.Group {
  const g = new THREE.Group();
  const tex = armorTexture();
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.3,
    metalness: 0.6,
  });

  // Wider, flatter box — shield-like
  const shield = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.24, 0.06), mat);
  g.add(shield);
  return g;
}

function buildAmmoMesh(type: PickupType): THREE.Group {
  const g = new THREE.Group();
  const tex = ammoTexture();

  // Color tint per ammo type
  const tints: Record<string, number> = {
    'ammo-pistol': 0xddaa33,
    'ammo-rifle': 0xddaa33,
    'ammo-shotgun': 0xdd6633,
    'ammo-sniper': 0x33ddaa,
  };
  const tint = tints[type] ?? 0xddaa33;

  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    color: tint,
    transparent: true,
    opacity: 0.95,
  });

  // Small ammo crate shape
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.16), mat);
  g.add(box);
  return g;
}

function buildWeaponMesh(type: PickupType): THREE.Group {
  const g = new THREE.Group();
  const tex = weaponTexture();

  // Color tint per weapon
  const tints: Record<string, number> = {
    'weapon-rifle': 0x99ff44,
    'weapon-shotgun': 0xff8844,
    'weapon-sniper': 0x44aaff,
  };
  const tint = tints[type] ?? 0x99ff44;

  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    color: tint,
    transparent: true,
    opacity: 0.95,
  });

  // Elongated weapon crate
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.14), mat);
  g.add(box);
  return g;
}

function buildKeyMesh(): THREE.Group {
  const g = new THREE.Group();
  const tex = keyTexture();
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.95 });

  // Flat card shape
  const card = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.02), mat);
  g.add(card);
  return g;
}
