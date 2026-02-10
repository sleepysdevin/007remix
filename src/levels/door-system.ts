import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsWorld } from '../core/physics-world';
import type { DoorDef } from './level-schema';
import {
  facilityDoorTexture,
  lockedDoorTexture,
  doorFrameTexture,
} from './procedural-textures';

const DOOR_THICKNESS = 0.15;
const OPEN_SPEED = 2.5;
const FRAME_WIDTH = 0.12;

interface DoorState {
  def: DoorDef;
  mesh: THREE.Group;
  doorPanel: THREE.Mesh;
  collider: RAPIER.Collider | null;
  openAmount: number;
  open: boolean;
  unlocked: boolean;
  /** Y position of the door bottom (floor level) */
  floorY: number;
}

export class DoorSystem {
  private doors = new Map<string, DoorState>();
  private scene: THREE.Scene;
  private physics: PhysicsWorld;
  private getPlayerPos: () => { x: number; y: number; z: number };
  private hasKey: (keyId: string) => boolean;
  private isObjectiveComplete: (id: string) => boolean;

  constructor(
    scene: THREE.Scene,
    physics: PhysicsWorld,
    getPlayerPos: () => { x: number; y: number; z: number },
    hasKey: (keyId: string) => boolean,
    isObjectiveComplete: (id: string) => boolean = () => false,
  ) {
    this.scene = scene;
    this.physics = physics;
    this.getPlayerPos = getPlayerPos;
    this.hasKey = hasKey;
    this.isObjectiveComplete = isObjectiveComplete;
  }

  /** Add a door from level definition. Call after physics world is ready. */
  addDoor(def: DoorDef): void {
    const group = new THREE.Group();

    // Compute door placement — door sits on the floor, reaching up to near ceiling
    // Rooms have y=0, height=4 → floor at y=-2.0 (approx), ceiling at y=2.0
    // Door def.y is the center of the room (typically 0)
    // We position the door so its bottom sits at floor level
    const roomHalfHeight = 2.0; // half of typical room height=4
    const floorY = def.y - roomHalfHeight;
    const doorHeight = def.height;
    const doorCenterY = floorY + doorHeight / 2;

    // Door panel with texture
    const isLocked = def.type === 'locked';
    const doorTex = isLocked ? lockedDoorTexture() : facilityDoorTexture();
    const texClone = doorTex.clone();
    texClone.needsUpdate = true;

    const doorMat = new THREE.MeshStandardMaterial({
      map: texClone,
      roughness: 0.6,
      metalness: 0.4,
    });

    const doorPanel = new THREE.Mesh(
      new THREE.BoxGeometry(def.width, doorHeight, DOOR_THICKNESS),
      doorMat,
    );
    doorPanel.castShadow = true;
    doorPanel.receiveShadow = true;
    group.add(doorPanel);

    // Door frame — two vertical posts and a header
    const frameTex = doorFrameTexture();
    const frameTexClone = frameTex.clone();
    frameTexClone.needsUpdate = true;
    const frameMat = new THREE.MeshStandardMaterial({
      map: frameTexClone,
      roughness: 0.5,
      metalness: 0.5,
    });

    // Left frame post
    const framePostGeo = new THREE.BoxGeometry(FRAME_WIDTH, doorHeight, DOOR_THICKNESS + 0.08);
    const leftPost = new THREE.Mesh(framePostGeo, frameMat);
    leftPost.position.set(-def.width / 2 - FRAME_WIDTH / 2, 0, 0);
    leftPost.receiveShadow = true;
    group.add(leftPost);

    // Right frame post
    const rightPost = new THREE.Mesh(framePostGeo, frameMat);
    rightPost.position.set(def.width / 2 + FRAME_WIDTH / 2, 0, 0);
    rightPost.receiveShadow = true;
    group.add(rightPost);

    // Header beam
    const headerGeo = new THREE.BoxGeometry(
      def.width + FRAME_WIDTH * 2,
      FRAME_WIDTH,
      DOOR_THICKNESS + 0.08,
    );
    const header = new THREE.Mesh(headerGeo, frameMat);
    header.position.set(0, doorHeight / 2 + FRAME_WIDTH / 2, 0);
    header.receiveShadow = true;
    group.add(header);

    // Position the whole group
    group.position.set(def.x, doorCenterY, def.z);

    // Rotate the door group if it slides along X (wall faces Z)
    if (def.axis === 'x') {
      group.rotation.y = Math.PI / 2;
    }

    this.scene.add(group);

    // Physics collider for the door panel
    const hx = def.width / 2;
    const hy = doorHeight / 2;
    const hz = DOOR_THICKNESS / 2;

    // For physics, use the actual axis-aligned dimensions
    let physHx = hx, physHz = hz;
    if (def.axis === 'x') {
      physHx = hz;
      physHz = hx;
    }
    const collider = this.physics.createStaticCuboid(
      physHx, hy, physHz,
      def.x, doorCenterY, def.z,
    );

    this.doors.set(def.id, {
      def,
      mesh: group,
      doorPanel,
      collider,
      openAmount: 0,
      open: false,
      unlocked: def.type !== 'locked',
      floorY,
    });
  }

  /** Unlock a door by id (e.g. from trigger). */
  unlockDoor(doorId: string): void {
    const state = this.doors.get(doorId);
    if (state) state.unlocked = true;
  }

  /** Open a door by id (e.g. from trigger). */
  openDoor(doorId: string): void {
    const state = this.doors.get(doorId);
    if (state) state.open = true;
  }

  update(dt: number): void {
    const player = this.getPlayerPos();
    const playerVec = new THREE.Vector3(player.x, player.y, player.z);

    for (const state of this.doors.values()) {
      const { def, mesh, collider } = state;
      const radius = def.proximityRadius ?? 2.5;
      const dist = playerVec.distanceTo(new THREE.Vector3(def.x, def.y, def.z));

      if (!state.open) {
        const inRange = dist <= radius;

        // Objective-gated doors stay locked until required objectives are complete
        if (def.requireObjectives?.length) {
          const allDone = def.requireObjectives.every((id) => this.isObjectiveComplete(id));
          if (!allDone) continue;
        }

        let canOpen = false;
        if (def.requireObjectives?.length) {
          // Objectives met — opens on proximity (no key needed)
          canOpen = inRange;
        } else if (def.type === 'proximity') {
          canOpen = inRange;
        } else if (def.type === 'locked') {
          canOpen = state.unlocked && inRange && (def.keyId ? this.hasKey(def.keyId) : true);
        }

        if (canOpen) {
          state.open = true;
        }
      }

      if (state.open) {
        if (state.openAmount < 1) {
          state.openAmount = Math.min(1, state.openAmount + OPEN_SPEED * dt);

          // Slide the door panel sideways within the group's local space
          const slide = (def.width + 0.2) * state.openAmount;
          state.doorPanel.position.x = slide;

          if (state.openAmount >= 1 && collider) {
            this.physics.removeCollider(collider, true);
            state.collider = null;
          }
        }
      }
    }
  }
}
