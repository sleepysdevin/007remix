import * as THREE from 'three';
import { Renderer } from './core/renderer';
import { GameLoop } from './core/game-loop';
import { InputManager } from './core/input-manager';
import { PhysicsWorld } from './core/physics-world';
import { EventBus } from './core/event-bus';
import { FPSCamera } from './player/fps-camera';
import { PlayerController } from './player/player-controller';
import { WeaponManager } from './weapons/weapon-manager';
import { ProjectileSystem } from './weapons/projectile-system';
import { GrenadeSystem } from './weapons/grenade-system';
import { EnemyManager } from './enemies/enemy-manager';
import { PickupSystem } from './levels/pickup-system';
import { DoorSystem } from './levels/door-system';
import { TriggerSystem } from './levels/trigger-system';
import { ObjectiveSystem } from './levels/objective-system';
import { buildLevel } from './levels/level-builder';
import type { LevelSchema } from './levels/level-schema';
import { HUD } from './ui/hud';
import { DamageIndicator } from './ui/damage-indicator';
import { ScopeOverlay } from './ui/scope-overlay';
import { BriefingScreen } from './ui/briefing-screen';
import { ObjectivesDisplay } from './ui/objectives-display';
import { InventoryScreen } from './ui/inventory-screen';
import { renderWeaponPreviewToCanvas } from './weapons/weapon-preview-renderer';
import {
  concreteWallTexture,
  floorTileTexture,
  ceilingPanelTexture,
  woodCrateTexture,
  metalCrateTexture,
  barrelTexture,
} from './levels/procedural-textures';

const PHYSICS_STEP = 1 / 60;

export interface GameOptions {
  levelMode?: boolean;
}

export class Game {
  private renderer: Renderer;
  private loop: GameLoop;
  private input: InputManager;
  private physics: PhysicsWorld;
  private events: EventBus;
  private scene: THREE.Scene;
  private fpsCamera: FPSCamera;
  private player: PlayerController;
  private weaponManager: WeaponManager;
  private projectileSystem: ProjectileSystem;
  private grenadeSystem: GrenadeSystem;
  private enemyManager: EnemyManager;
  private pickupSystem: PickupSystem;
  private gasGrenadeCount = 3;
  private fragGrenadeCount = 2;
  private readonly _throwOrigin = new THREE.Vector3();
  private readonly _throwDir = new THREE.Vector3();
  private hud: HUD;
  private damageIndicator: DamageIndicator;
  private scopeOverlay: ScopeOverlay;

  private doorSystem: DoorSystem | null = null;
  private triggerSystem: TriggerSystem | null = null;
  private objectiveSystem: ObjectiveSystem | null = null;
  private briefingScreen: BriefingScreen | null = null;
  private objectivesDisplay: ObjectivesDisplay | null = null;
  private inventoryScreen: InventoryScreen;
  private weaponPreviewMeshCache = new Map<string, THREE.Group>();

  private physicsAccumulator = 0;
  private started = false;
  private levelMode: boolean;
  private missionComplete = false;

  // Reusable vector to avoid per-frame heap allocations
  private readonly _playerVec = new THREE.Vector3();

  /** Called when all objectives are done and player reaches extraction (mission:complete). */
  onMissionComplete: (() => void) | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    physics: PhysicsWorld,
    options: GameOptions = {},
  ) {
    this.levelMode = options.levelMode ?? false;
    this.physics = physics;
    this.events = new EventBus();
    this.renderer = new Renderer(canvas);
    this.input = new InputManager(canvas);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);
    this.scene.fog = new THREE.Fog(0x1a1a2e, 20, 60);

    // Camera
    this.fpsCamera = new FPSCamera();
    this.scene.add(this.fpsCamera.camera);

    // Player
    this.player = new PlayerController(
      this.physics,
      this.fpsCamera,
      0, 0.5, 0,
    );

    // Projectile system (raycasting + decals)
    this.projectileSystem = new ProjectileSystem(this.scene, this.physics);

    // Weapon manager
    this.weaponManager = new WeaponManager(
      this.scene,
      this.fpsCamera,
      this.projectileSystem,
      this.events,
      this.player.getCollider(),
      () => this.player.isCrouching,
    );

    // Enemy manager
    this.enemyManager = new EnemyManager(
      this.scene,
      this.physics,
      this.events,
      this.player.getCollider(),
    );

    // Grenade system (gas grenades)
    this.grenadeSystem = new GrenadeSystem(this.scene, this.physics);
    this.grenadeSystem.setEnemyManager(this.enemyManager);
    this.grenadeSystem.setPlayerCollider(this.player.getCollider());

    // Pickup system
    this.pickupSystem = new PickupSystem(this.scene);
    this.pickupSystem.onPickupCollected = (type, amount, keyId) => {
      this.handlePickup(type, amount, keyId);
    };

    // Damage indicator + scope overlay
    this.damageIndicator = new DamageIndicator();
    this.scopeOverlay = new ScopeOverlay();

    // When enemy shoots player
    this.enemyManager.onPlayerHit = (damage, _fromPos) => {
      this.player.takeDamage(damage);
      this.hud.flashCrosshair();
      this.damageIndicator.flash();
    };

    // Skip decals/impact particles on enemy hits (no lingering effects) and use enemy collider for hit test
    this.projectileSystem.isEnemyCollider = (c) => this.enemyManager.getEnemyByCollider(c) !== null;

    // When player shoots: check if it hit an enemy
    this.projectileSystem.onHitCollider = (collider, _point, _normal) => {
      const enemy = this.enemyManager.getEnemyByCollider(collider);
      if (enemy && !enemy.dead) {
        const weapon = this.weaponManager.currentWeapon;
        enemy.takeDamage(weapon.stats.damage);
        this.hud.flashCrosshair(); // Red flash = hit confirmed

        if (enemy.dead) {
          this.enemyManager.removeEnemyPhysics(enemy); // So player doesn't get stuck on corpses
          this.events.emit('enemy:killed', {
            position: enemy.group.position.clone(),
          });
        }
      }
    };

    // HUD
    this.hud = new HUD();

    // Inventory (Tab to open/close)
    this.inventoryScreen = new InventoryScreen();

    if (this.levelMode) {
      this.doorSystem = new DoorSystem(
        this.scene,
        this.physics,
        () => this.player.getPosition(),
        (id) => this.player.hasKey(id),
      );
      this.triggerSystem = new TriggerSystem(() => this.player.getPosition());
      this.triggerSystem.onTrigger = (event) => this.handleTrigger(event);
      this.objectiveSystem = new ObjectiveSystem();
      this.briefingScreen = new BriefingScreen();
      this.objectivesDisplay = new ObjectivesDisplay();
      this.objectivesDisplay.attach();
    } else {
      this.buildTestScene();
      this.spawnTestEnemies();
      this.spawnTestPickups();
    }

    // Game loop
    this.loop = new GameLoop((dt) => this.tick(dt));

    // Event listeners
    this.events.on('weapon:fired', () => {
      this.hud.flashCrosshairFire();
    });
  }

  /** Show mission briefing (level mode only). Call before start(). */
  showBriefing(level: LevelSchema): void {
    if (!this.briefingScreen) return;
    this.briefingScreen.show(level);
    this.briefingScreen.setOnStart(() => {
      this.loadLevel(level);
      this.start();
    });
  }

  /** Build level from schema (level mode). Call after showBriefing → user clicks Start. */
  loadLevel(level: LevelSchema): void {
    if (!this.doorSystem || !this.triggerSystem || !this.objectiveSystem) return;
    buildLevel(level, {
      scene: this.scene,
      physics: this.physics,
      doorSystem: this.doorSystem,
      triggerSystem: this.triggerSystem,
      objectiveSystem: this.objectiveSystem,
      enemyManager: this.enemyManager,
      pickupSystem: this.pickupSystem,
      setPlayerPosition: (x, y, z) => this.player.setPosition(x, y, z),
    });
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.input.requestPointerLock();
    document.getElementById('start-screen')!.style.display = 'none';
    this.hud.show();
    if (this.levelMode && this.objectivesDisplay) this.objectivesDisplay.show();
    this.loop.start();
  }

  private handleTrigger(event: string): void {
    const parts = event.split(':');
    if (parts[0] === 'objective' && parts[1] === 'complete' && this.objectiveSystem) {
      this.objectiveSystem.complete(parts[2]);
    } else if (parts[0] === 'door' && parts[1] === 'unlock' && this.doorSystem) {
      this.doorSystem.unlockDoor(parts[2]);
    } else if (event === 'mission:complete') {
      this.missionComplete = true;
      this.onMissionComplete?.();
    }
  }

  private tick(dt: number): void {
    // Inventory toggle (Tab)
    if (this.input.wasKeyJustPressed('Tab')) {
      if (this.inventoryScreen.isOpen) {
        this.inventoryScreen.hide();
        if (this.started) this.input.requestPointerLock();
        this.input.resetMouse(); // So same Tab doesn't reopen next frame
      } else {
        document.exitPointerLock();
        this.inventoryScreen.show(
          {
            weapons: this.weaponManager.getOwnedWeapons(),
            keys: this.player.getKeys(),
          },
          (type, skin) => {
            this.weaponManager.setWeaponSkin(type, skin);
            this.inventoryScreen.updateState({
              weapons: this.weaponManager.getOwnedWeapons(),
              keys: this.player.getKeys(),
            });
          },
          () => {
            this.inventoryScreen.hide();
            if (this.started) this.input.requestPointerLock();
          },
          (type, skin, rotationY, canvas) => {
            const key = `${type}:${skin}`;
            let mesh = this.weaponPreviewMeshCache.get(key);
            if (!mesh) {
              mesh = this.weaponManager.getPreviewMesh(type, skin);
              this.weaponPreviewMeshCache.set(key, mesh);
            }
            mesh.rotation.y = rotationY;
            renderWeaponPreviewToCanvas(mesh, type, skin, rotationY, canvas);
          },
        );
      }
    }

    if (this.inventoryScreen.isOpen) {
      this.input.resetMouse();
      return; // Don't update camera, weapons, or gameplay while inventory is open
    }

    // Update camera from mouse input
    this.fpsCamera.update(this.input);

    // Weapons (before physics, so fire input is responsive)
    this.weaponManager.update(this.input, dt);

    // Fixed-step physics
    this.physicsAccumulator += dt;
    while (this.physicsAccumulator >= PHYSICS_STEP) {
      this.player.update(this.input, PHYSICS_STEP);
      this.physics.step();
      this.physicsAccumulator -= PHYSICS_STEP;
    }

    // Grenades — after physics so throw origin matches current camera/eye position
    if (this.input.wasKeyJustPressed('g') && this.gasGrenadeCount > 0) {
      this._throwOrigin.copy(this.fpsCamera.camera.position);
      this.fpsCamera.getLookDirection(this._throwDir);
      this.grenadeSystem.throw(this._throwOrigin, this._throwDir, 'gas');
      this.gasGrenadeCount--;
    }
    if (this.input.wasKeyJustPressed('f') && this.fragGrenadeCount > 0) {
      this._throwOrigin.copy(this.fpsCamera.camera.position);
      this.fpsCamera.getLookDirection(this._throwDir);
      this.grenadeSystem.throw(this._throwOrigin, this._throwDir, 'frag');
      this.fragGrenadeCount--;
    }

    // Update enemy manager with player state
    const playerPos = this.player.getPosition();
    const isMoving =
      this.input.isKeyDown('w') ||
      this.input.isKeyDown('a') ||
      this.input.isKeyDown('s') ||
      this.input.isKeyDown('d');

    this._playerVec.set(playerPos.x, playerPos.y, playerPos.z);
    this.enemyManager.setPlayerState(this._playerVec, isMoving);
    this.enemyManager.setCameraPosition(this.fpsCamera.camera.position);
    this.enemyManager.update(dt);

    // Pickups
    this.pickupSystem.update(dt, this._playerVec);

    // Projectile system: particles + decal cleanup
    this.projectileSystem.update(dt);

    // Grenade system: thrown arcs + gas clouds + explosions
    this.grenadeSystem.update(dt, this.fpsCamera.camera);

    // Scope overlay
    this.scopeOverlay.visible = this.weaponManager.scoped;

    // Damage indicator
    this.damageIndicator.update(dt);

    // Level systems (doors, triggers, objectives)
    if (this.doorSystem) this.doorSystem.update(dt);
    if (this.triggerSystem) this.triggerSystem.update();
    if (this.objectiveSystem && this.objectivesDisplay) {
      this.objectivesDisplay.update(this.objectiveSystem.getAll());
    }

    // HUD
    this.hud.updateHealth(this.player.health);
    this.hud.updateArmor(this.player.armor);
    this.hud.updateGrenades(this.gasGrenadeCount, this.fragGrenadeCount);
    this.hud.updateWeapon(this.weaponManager.currentWeapon);
    this.hud.update(dt);

    // Reset per-frame input
    this.input.resetMouse();

    // Render
    this.renderer.render(this.scene, this.fpsCamera.camera);
  }

  // ──────────── Enemy Spawns ────────────

  private spawnTestEnemies(): void {
    // Guard near the crate stack (facing player spawn)
    this.enemyManager.spawnEnemy({
      x: 5, y: 0, z: 5,
      facingAngle: Math.PI + 0.5,
    });

    // Guard behind barrels (facing center)
    this.enemyManager.spawnEnemy({
      x: -6, y: 0, z: -6,
      facingAngle: Math.PI / 4,
    });

    // Guard near far wall (patrolling area)
    this.enemyManager.spawnEnemy({
      x: 7, y: 0, z: -5,
      facingAngle: Math.PI,
    });

    // Guard near table crate
    this.enemyManager.spawnEnemy({
      x: -4, y: 0, z: 6,
      facingAngle: -Math.PI / 2,
    });
  }

  // ──────────── Pickups ────────────

  private handlePickup(type: string, amount: number, keyId?: string): void {
    if (type === 'key' && keyId) {
      this.player.giveKey(keyId);
      this.hud.showPickupNotification(`Key card acquired`);
      return;
    }
    switch (type) {
      case 'health':
        this.player.heal(amount);
        this.hud.showPickupNotification(`+${amount} Health`);
        break;
      case 'armor':
        this.player.addArmor(amount);
        this.hud.showPickupNotification(`+${amount} Armor`);
        break;
      case 'ammo-pistol':
        this.weaponManager.addAmmo('pistol', amount);
        this.hud.showPickupNotification(`+${amount} Pistol Ammo`);
        break;
      case 'ammo-rifle':
        this.weaponManager.addAmmo('rifle', amount);
        this.hud.showPickupNotification(`+${amount} Rifle Ammo`);
        break;
      case 'ammo-shotgun':
        this.weaponManager.addAmmo('shotgun', amount);
        this.hud.showPickupNotification(`+${amount} Shotgun Shells`);
        break;
      case 'ammo-sniper':
        this.weaponManager.addAmmo('sniper', amount);
        this.hud.showPickupNotification(`+${amount} Sniper Rounds`);
        break;
      case 'weapon-rifle':
        this.weaponManager.addWeapon('rifle');
        this.hud.showPickupNotification('KF7 Soviet');
        break;
      case 'weapon-shotgun':
        this.weaponManager.addWeapon('shotgun');
        this.hud.showPickupNotification('Shotgun');
        break;
      case 'weapon-sniper':
        this.weaponManager.addWeapon('sniper');
        this.hud.showPickupNotification('Sniper Rifle');
        break;
    }
  }

  private spawnTestPickups(): void {
    // Weapons scattered around the room
    this.pickupSystem.spawn('weapon-rifle', -3, 0, -3, 0);
    this.pickupSystem.spawn('weapon-shotgun', 6, 0, 6, 0);
    this.pickupSystem.spawn('weapon-sniper', -7, 0, 7, 0);

    // Health packs
    this.pickupSystem.spawn('health', 0, 0, 8, 25);
    this.pickupSystem.spawn('health', -8, 0, 0, 25);

    // Armor
    this.pickupSystem.spawn('armor', 8, 0, 0, 50);

    // Ammo
    this.pickupSystem.spawn('ammo-pistol', 3, 0, -7, 14);
    this.pickupSystem.spawn('ammo-rifle', -2, 0, 4, 30);
    this.pickupSystem.spawn('ammo-shotgun', 5, 0, -2, 10);
    this.pickupSystem.spawn('ammo-sniper', -5, 0, 2, 5);
  }

  // ──────────── Test Scene ────────────

  private buildTestScene(): void {
    // Ambient light (dim, blue-ish)
    const ambient = new THREE.AmbientLight(0x404060, 0.6);
    this.scene.add(ambient);

    // Main overhead light
    const pointLight = new THREE.PointLight(0xffffee, 40, 30);
    pointLight.position.set(0, 4.5, 0);
    pointLight.castShadow = true;
    pointLight.shadow.mapSize.set(512, 512);
    this.scene.add(pointLight);

    // Secondary lights in corners
    const cornerLight1 = new THREE.PointLight(0xffe0a0, 15, 20);
    cornerLight1.position.set(-7, 3, -7);
    this.scene.add(cornerLight1);

    const cornerLight2 = new THREE.PointLight(0xa0d0ff, 15, 20);
    cornerLight2.position.set(7, 3, 7);
    this.scene.add(cornerLight2);

    // Materials — procedural Canvas textures (256×256 canvases)
    const floorTex = floorTileTexture();
    floorTex.repeat.set(5, 5);
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: 0.8,
      metalness: 0.2,
    });

    const wallTex = concreteWallTexture();
    wallTex.repeat.set(4, 1);
    const wallMat = new THREE.MeshStandardMaterial({
      map: wallTex,
      roughness: 0.7,
      metalness: 0.1,
    });

    const ceilTex = ceilingPanelTexture();
    ceilTex.repeat.set(5, 5);
    const ceilingMat = new THREE.MeshStandardMaterial({
      map: ceilTex,
      roughness: 0.9,
      metalness: 0.0,
    });

    const crateMat = new THREE.MeshStandardMaterial({
      map: woodCrateTexture(),
      roughness: 0.7,
      metalness: 0.1,
    });

    const metalCrateMat = new THREE.MeshStandardMaterial({
      map: metalCrateTexture(),
      roughness: 0.3,
      metalness: 0.7,
    });

    const ROOM_W = 20;
    const ROOM_D = 20;
    const ROOM_H = 5;
    const WALL_T = 0.3;

    // Floor
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(ROOM_W, 0.2, ROOM_D),
      floorMat,
    );
    floor.position.set(0, -0.1, 0);
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.physics.createStaticCuboid(ROOM_W / 2, 0.1, ROOM_D / 2, 0, -0.1, 0);

    // Ceiling
    const ceiling = new THREE.Mesh(
      new THREE.BoxGeometry(ROOM_W, 0.2, ROOM_D),
      ceilingMat,
    );
    ceiling.position.set(0, ROOM_H + 0.1, 0);
    this.scene.add(ceiling);
    this.physics.createStaticCuboid(ROOM_W / 2, 0.1, ROOM_D / 2, 0, ROOM_H + 0.1, 0);

    // Walls: front, back, left, right
    const walls: [number, number, number, number, number, number][] = [
      [ROOM_W / 2, ROOM_H / 2, WALL_T / 2, 0, ROOM_H / 2, -ROOM_D / 2],
      [ROOM_W / 2, ROOM_H / 2, WALL_T / 2, 0, ROOM_H / 2, ROOM_D / 2],
      [WALL_T / 2, ROOM_H / 2, ROOM_D / 2, -ROOM_W / 2, ROOM_H / 2, 0],
      [WALL_T / 2, ROOM_H / 2, ROOM_D / 2, ROOM_W / 2, ROOM_H / 2, 0],
    ];

    for (const [hx, hy, hz, x, y, z] of walls) {
      const wallMesh = new THREE.Mesh(
        new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2),
        wallMat,
      );
      wallMesh.position.set(x, y, z);
      wallMesh.receiveShadow = true;
      this.scene.add(wallMesh);
      this.physics.createStaticCuboid(hx, hy, hz, x, y, z);
    }

    // Crates scattered around
    const crates: [number, number, number, number, number, number, THREE.Material][] = [
      [1.2, 1.2, 1.2, 4, 0.6, 3, crateMat],
      [1, 1, 1, 4.8, 0.5, 4.2, crateMat],
      [0.8, 0.8, 0.8, 3.5, 1.6, 3.3, crateMat],
      [1.5, 1, 1.5, -6, 0.5, -5, metalCrateMat],
      [1, 0.8, 1, -5.5, 0.4, -3.5, metalCrateMat],
      [2, 1.5, 0.8, -3, 0.75, 7, crateMat],
      [0.6, 2, 0.6, 7, 1, -7, metalCrateMat],
      [0.6, 2, 0.6, -7, 1, -7, metalCrateMat],
    ];

    for (const [w, h, d, x, y, z, mat] of crates) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      crate.position.set(x, y, z);
      crate.castShadow = true;
      crate.receiveShadow = true;
      this.scene.add(crate);
      this.physics.createStaticCuboid(w / 2, h / 2, d / 2, x, y, z);
    }

    // Barrels
    const barrelMat = new THREE.MeshStandardMaterial({
      map: barrelTexture(),
      roughness: 0.5,
      metalness: 0.3,
    });
    const barrelPositions = [
      [6, 0.6, -4],
      [6.8, 0.6, -3.5],
      [-2, 0.6, -8],
    ];
    for (const [bx, by, bz] of barrelPositions) {
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.4, 1.2, 8),
        barrelMat,
      );
      barrel.position.set(bx, by, bz);
      barrel.castShadow = true;
      barrel.receiveShadow = true;
      this.scene.add(barrel);
      this.physics.createStaticCuboid(0.4, 0.6, 0.4, bx, by, bz);
    }
  }
}
