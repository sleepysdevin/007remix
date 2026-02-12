import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {
  PhysicsWorld,
  createCollisionFilter,
  GROUP_WORLD,
  GROUP_PLAYER,
  GROUP_ENEMY,
} from '../../core/physics-world';
import type { Collider } from '@dimforge/rapier3d-compat';
import type { DoorDef } from '../types/level-schema';
import {
  facilityDoorTexture,
  lockedDoorTexture,
  doorFrameTexture,
} from "../utils/procedural-textures";

const DOOR_THICKNESS = 0.15;
const OPEN_SPEED = 2.5;
const FRAME_WIDTH = 0.12;

// When open at least this much, door becomes non-blocking sensor
const UNBLOCK_AT = 0.20;
const REBLOCK_AT = 0.12;

interface DoorColliders {
  panel: Collider | null;
  panelBody: RAPIER.RigidBody | null;
  floor: Collider | null;
}

interface DoorState {
  def: DoorDef;
  mesh: THREE.Group;
  doorPanel: THREE.Mesh;
  colliders: DoorColliders;
  openAmount: number;
  open: boolean;
  unlocked: boolean;
  floorY: number;
  doorCenterY: number;
  playerWasNear: boolean;
  timeSincePlayerNear: number;
  closeTimer: number;
  autoClose: boolean;
  panelIsSensor: boolean;
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

  addDoor(def: DoorDef): void {
    const group = new THREE.Group();

    const roomHalfHeight = 2.0;
    const floorY = def.y - roomHalfHeight;
    const doorHeight = def.height;
    const doorCenterY = floorY + doorHeight / 2;

    // Door panel visuals
    const isLocked = def.type === 'locked';
    const doorTex = isLocked ? lockedDoorTexture() : facilityDoorTexture();
    const doorMat = new THREE.MeshStandardMaterial({
      map: doorTex.clone(),
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

    // Frame visuals
    const frameTex = doorFrameTexture();
    const frameMat = new THREE.MeshStandardMaterial({
      map: frameTex.clone(),
      roughness: 0.5,
      metalness: 0.5,
    });

    const framePostGeo = new THREE.BoxGeometry(FRAME_WIDTH, doorHeight, DOOR_THICKNESS + 0.08);

    const leftPost = new THREE.Mesh(framePostGeo, frameMat);
    leftPost.position.set(-def.width / 2 - FRAME_WIDTH / 2, 0, 0);
    leftPost.receiveShadow = true;
    group.add(leftPost);

    const rightPost = new THREE.Mesh(framePostGeo, frameMat);
    rightPost.position.set(def.width / 2 + FRAME_WIDTH / 2, 0, 0);
    rightPost.receiveShadow = true;
    group.add(rightPost);

    const headerGeo = new THREE.BoxGeometry(
      def.width + FRAME_WIDTH * 2,
      FRAME_WIDTH,
      DOOR_THICKNESS + 0.08,
    );
    const header = new THREE.Mesh(headerGeo, frameMat);
    header.position.set(0, doorHeight / 2 + FRAME_WIDTH / 2, 0);
    header.receiveShadow = true;
    group.add(header);

    group.position.set(def.x, doorCenterY, def.z);
    if (def.axis === 'x') group.rotation.y = Math.PI / 2;

    this.scene.add(group);

    // Physics sizes (axis-aware)
    const hx = def.width / 2;
    const hy = doorHeight / 2;
    const hz = DOOR_THICKNESS / 2;

    let physHx = hx, physHz = hz;
    if (def.axis === 'x') {
      physHx = hz;
      physHz = hx;
    }

    // PANEL: kinematic
    const panelGroups = createCollisionFilter(GROUP_WORLD, GROUP_PLAYER | GROUP_ENEMY);
    const { body: panelBody, collider: panelCollider } = this.physics.createKinematicCuboid(
      physHx, hy, physHz,
      def.x, doorCenterY, def.z,
      GROUP_WORLD,
      GROUP_PLAYER | GROUP_ENEMY
    );

    panelCollider.setCollisionGroups(panelGroups);
    panelCollider.setSolverGroups(panelGroups);
    panelCollider.setSensor(false);

    // FLOOR: make it very thin & slightly BELOW floor so it never snags
    // (this collider is optional — keeping it but making it harmless)
    const floorColliderWidth = def.axis === 'x' ? def.width / 2 + 0.45 : 0.45;
    const floorColliderDepth = def.axis === 'x' ? 0.45 : def.width / 2 + 0.45;
    const floorColliderHeight = 0.05;
    const floorYPos = floorY - 0.06; // below walk plane

    const floorCollider = this.physics.createStaticCuboid(
      floorColliderWidth, floorColliderHeight, floorColliderDepth,
      def.x, floorYPos, def.z
    );

    const floorGroups = createCollisionFilter(GROUP_WORLD, GROUP_PLAYER | GROUP_ENEMY);
    floorCollider.setCollisionGroups(floorGroups);
    floorCollider.setSolverGroups(floorGroups);

    this.doors.set(def.id, {
      def,
      mesh: group,
      doorPanel,
      colliders: { panel: panelCollider, panelBody, floor: floorCollider },
      openAmount: 0,
      open: false,
      unlocked: def.type !== 'locked',
      floorY,
      doorCenterY,
      playerWasNear: false,
      timeSincePlayerNear: 0,
      closeTimer: 0,
      autoClose: true,
      panelIsSensor: false,
    });
  }

  unlockDoor(doorId: string): void {
    const state = this.doors.get(doorId);
    if (state) state.unlocked = true;
  }

  openDoor(doorId: string): void {
    const state = this.doors.get(doorId);
    if (state) state.open = true;
  }

  removeDoor(doorId: string): void {
    const state = this.doors.get(doorId);
    if (!state) return;

    if (state.colliders.panel) this.physics.removeCollider(state.colliders.panel, true);
    if (state.colliders.panelBody) this.physics.removeRigidBody(state.colliders.panelBody);
    if (state.colliders.floor) this.physics.removeCollider(state.colliders.floor, true);

    state.mesh.removeFromParent();
    this.doors.delete(doorId);
  }

  update(dt: number): void {
    const player = this.getPlayerPos();
    const px = player.x, py = player.y, pz = player.z;
    const playerRadius = 0.5;

    for (const state of this.doors.values()) {
      const { def, colliders } = state;

      const radius = def.proximityRadius ?? 2.5;

      // distance in XZ only (more stable)
      const dx = px - def.x;
      const dz = pz - def.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const isPlayerNear = dist <= radius + playerRadius;

      if (isPlayerNear) {
        state.playerWasNear = true;
        state.timeSincePlayerNear = 0;
        state.closeTimer = 0;
      } else if (state.playerWasNear) {
        state.timeSincePlayerNear += dt;
      }

      if (state.autoClose && state.open && !isPlayerNear) {
        state.closeTimer += dt;
        if (state.closeTimer >= 2.0) state.open = false;
      }

      // opening rules
      if (!state.open) {
        if (def.requireObjectives?.length) {
          const allDone = def.requireObjectives.every((id) => this.isObjectiveComplete(id));
          if (!allDone) continue;
        }

        let canOpen = false;
        if (def.requireObjectives?.length) {
          canOpen = isPlayerNear;
        } else if (def.type === 'proximity') {
          canOpen = isPlayerNear;
        } else if (def.type === 'locked') {
          canOpen = state.unlocked && isPlayerNear && (def.keyId ? this.hasKey(def.keyId) : true);
        }

        if (canOpen) {
          state.open = true;
          state.closeTimer = 0;
        }
      }

      // open/close animation
      if (state.open) {
        state.openAmount = Math.min(1, state.openAmount + OPEN_SPEED * dt);
      } else {
        state.openAmount = Math.max(0, state.openAmount - OPEN_SPEED * dt);
      }

      // Visual slide
      const slide = (def.width + 0.2) * state.openAmount;
      state.doorPanel.position.x = slide;

      // Physics slide
      if (colliders.panelBody) {
        let newX = def.x;
        let newZ = def.z;

        if (def.axis === 'x') newZ += slide;
        else newX += slide;

        colliders.panelBody.setNextKinematicTranslation({ x: newX, y: state.doorCenterY, z: newZ });
      }

      // ✅ make passable when open enough
      if (colliders.panel) {
        if (!state.panelIsSensor && state.openAmount >= UNBLOCK_AT) {
          colliders.panel.setSensor(true);
          state.panelIsSensor = true;
        } else if (state.panelIsSensor && state.openAmount <= REBLOCK_AT) {
          colliders.panel.setSensor(false);
          state.panelIsSensor = false;
        }
      }
    }
  }
}
