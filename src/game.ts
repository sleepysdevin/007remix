// src/game.ts  (FULL FILE, updated to fix "walking in place" + calls enemy fixedUpdate/syncFromPhysics)
import * as THREE from 'three';
import { Renderer } from './core/renderer';
import { GameLoop } from './core/game-loop';
import { InputManager } from './core/input-manager';
import { PhysicsWorld } from './core/physics-world';
import { EventBus } from './core/event-bus';
import { globalLightPool } from './core/light-pool';
import { FPSCamera } from './player/fps-camera';
import { PlayerController } from './player/player-controller';
import { WeaponManager } from './weapons/weapon-manager';
import { ProjectileSystem } from './weapons/projectile-system';
import { GrenadeSystem } from './weapons/grenade-system';
import { BloodSplatterSystem } from './weapons/blood-splatter';
import { EnemyManager } from './enemies/enemy-manager';
import { PickupSystem } from './levels/systems/pickup-system';
import { DoorSystem } from './levels/systems/door-system';
import { TriggerSystem } from './levels/systems/trigger-system';
import { ObjectiveSystem } from './levels/systems/objective-system';
import { buildLevel } from './levels/types/level-builder';
import type { LevelSchema } from './levels/types/level-schema';
import { DestructibleSystem } from './levels/systems/destructible-system';
import { HUD } from './ui/hud';
import { DamageIndicator } from './ui/damage-indicator';
import { ScopeOverlay } from './ui/scope-overlay';
import { TacticalOverlay } from './ui/tactical-overlay';
import { DeathOverlay } from './ui/death-overlay';
import { HitMarker } from './ui/hit-marker';
import { KillFeed } from './ui/kill-feed';
import { Scoreboard, type ScoreboardPlayer } from './ui/scoreboard';
import { NameTagManager } from './ui/name-tags';
import { GameOverOverlay } from './ui/game-over-overlay';
import { playDestruction, prewarmSoundEffects } from './audio/sound-effects';
import { startMusic, stopMusic } from './audio/music';
import { BriefingScreen } from './ui/briefing-screen';
import { ObjectivesDisplay } from './ui/objectives-display';
import { InventoryScreen } from './ui/inventory-screen';
import { PauseMenu } from './ui/pause-menu';
import { MissionCompleteScreen } from './ui/mission-complete-screen';
import { MobileControls } from './ui/mobile-controls';
import { renderWeaponPreviewToCanvas } from './weapons/weapon-preview-renderer';
import {
  concreteWallTexture,
  floorTileTexture,
  ceilingPanelTexture,
  metalCrateTexture,
  woodCrateTexture,
  barrelTexture,
} from './levels/utils/procedural-textures';
import type { NetworkManager } from './network/network-manager';
import { RemotePlayerManager } from './player/remote-player-manager';
import { NetworkConfig } from './network/network-config';

const PHYSICS_STEP = 1 / 60;

/** Map weapon name to canonical network type (for weapon fire and player state sync). */
function getCanonicalWeaponType(
  weaponName: string
): 'pistol' | 'rifle' | 'shotgun' | 'sniper' {
  const name = weaponName.toLowerCase();
  if (name.includes('sniper')) return 'sniper';
  if (name.includes('shotgun')) return 'shotgun';
  if (name.includes('soviet') || name.includes('rifle')) return 'rifle';
  if (name.includes('pistol') || name.includes('pp7')) return 'pistol';
  return 'pistol';
}

export interface GameOptions {
  levelMode?: boolean;
  networkMode?: 'local' | 'client';
  networkManager?: NetworkManager;
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
  private bloodSplatterSystem: BloodSplatterSystem;
  private enemyManager: EnemyManager;
  private pickupSystem: PickupSystem;

  private gasGrenadeCount = 4;
  private fragGrenadeCount = 4;
  private readonly _throwOrigin = new THREE.Vector3();
  private readonly _throwDir = new THREE.Vector3();

  private hud: HUD;
  private damageIndicator: DamageIndicator;
  private scopeOverlay: ScopeOverlay;
  private tacticalOverlay: TacticalOverlay;
  private deathOverlay: DeathOverlay;
  private hitMarker: HitMarker;
  private killFeed: KillFeed;
  private scoreboard: Scoreboard;
  private nameTagManager: NameTagManager | null = null;
  private gameOverOverlay: GameOverOverlay;

  private destructibleSystem: DestructibleSystem;
  private doorSystem: DoorSystem | null = null;
  private triggerSystem: TriggerSystem | null = null;
  private objectiveSystem: ObjectiveSystem | null = null;
  private briefingScreen: BriefingScreen | null = null;
  private objectivesDisplay: ObjectivesDisplay | null = null;
  private inventoryScreen: InventoryScreen;
  private weaponPreviewMeshCache = new Map<string, THREE.Group>();

  private flashlight: THREE.SpotLight;
  private flashlightOn = false;

  private pauseMenu: PauseMenu;
  private missionCompleteScreen: MissionCompleteScreen;
  private mobileControls: MobileControls | null = null;
  private paused = false;

  private physicsAccumulator = 0;
  private started = false;
  private running = false;
  private runtimePipelinesPrewarmed = false;

  private levelMode: boolean;
  private missionComplete = false;
  private missionElapsed = 0;
  private levelName = '';

  private readonly _playerVec = new THREE.Vector3();

  // Multiplayer networking
  private networkMode: 'local' | 'client';
  private networkManager: NetworkManager | null = null;
  private remotePlayerManager: RemotePlayerManager | null = null;
  private lastNetworkUpdate = 0;
  private networkUpdateRate = NetworkConfig.UPDATE_RATES.PLAYER_STATE;
  private localPlayerKills = 0;
  private processedDestructibleIds = new Set<string>();

  onMissionComplete: (() => void) | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    physics: PhysicsWorld,
    options: GameOptions = {}
  ) {
    this.levelMode = options.levelMode ?? false;
    this.networkMode = options.networkMode ?? 'local';
    this.networkManager = options.networkManager ?? null;

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

    // Flashlight
    this.flashlight = new THREE.SpotLight(
      0xffe8cc,
      0,
      30,
      Math.PI / 6,
      0.35,
      1.5
    );
    this.flashlight.position.set(0.3, -0.1, -0.3);
    this.flashlight.target.position.set(0, 0, -5);
    this.fpsCamera.camera.add(this.flashlight);
    this.fpsCamera.camera.add(this.flashlight.target);

    // Player
    this.player = new PlayerController(this.physics, this.fpsCamera, 0, -3.5, 0);

    // Projectile system
    this.projectileSystem = new ProjectileSystem(this.scene, this.physics);

    // Weapon manager
    this.weaponManager = new WeaponManager(
      this.scene,
      this.fpsCamera,
      this.projectileSystem,
      this.events,
      this.player.getCollider(),
      () => this.player.isCrouching
    );

    // Enemy manager
    this.enemyManager = new EnemyManager(
      this.scene,
      this.physics,
      this.events,
      this.player.getCollider()
    );

    // Grenades
    this.grenadeSystem = new GrenadeSystem(this.scene, this.physics);
    this.grenadeSystem.prewarmEffects();
    this.grenadeSystem.setEnemyManager(this.enemyManager);
    this.grenadeSystem.setPlayerCollider(this.player.getCollider());

    // Blood splatter
    this.bloodSplatterSystem = new BloodSplatterSystem(this.scene);

    // Destructibles
    this.destructibleSystem = new DestructibleSystem(this.scene, this.physics);
    this.destructibleSystem.prewarmBarrelExplosionPath();

    // Pickups
    this.pickupSystem = new PickupSystem(this.scene);
    this.pickupSystem.onPickupCollected = (type, amount, keyId) => {
      this.handlePickup(type, amount, keyId);
    };
    this.pickupSystem.weaponModelBuilder = (weaponType: string) => {
      const key = `${weaponType}:default`;
      let base = this.weaponPreviewMeshCache.get(key);
      if (!base) {
        base = this.weaponManager.getPreviewMesh(weaponType as any, 'default');
        this.weaponPreviewMeshCache.set(key, base);
      }
      return base.clone(true);
    };
    this.prewarmWeaponPickupModels();

    // UI
    this.damageIndicator = new DamageIndicator();
    this.scopeOverlay = new ScopeOverlay();
    this.tacticalOverlay = new TacticalOverlay();
    this.deathOverlay = new DeathOverlay();
    this.hitMarker = new HitMarker();
    this.killFeed = new KillFeed();
    this.scoreboard = new Scoreboard();
    this.gameOverOverlay = new GameOverOverlay();
    this.hud = new HUD();
    this.inventoryScreen = new InventoryScreen();

    // Pause/Mission complete
    this.pauseMenu = new PauseMenu();
    this.pauseMenu.onResume = () => this.resumeGame();
    this.pauseMenu.onExit = () => this.exitToMenu();

    this.missionCompleteScreen = new MissionCompleteScreen();
    this.missionCompleteScreen.onExit = () => this.exitToMenu();

    // Gas damage
    this.grenadeSystem.onPlayerInGas = (damage) => {
      if (!this.tacticalOverlay.visible) {
        this.player.takeDamage(damage);
        this.damageIndicator.flash();
      }
    };

    // Enemy shoots player
    this.enemyManager.onPlayerHit = (damage) => {
      this.player.takeDamage(damage);
      this.hud.flashCrosshair();
      this.damageIndicator.flash();
    };

    this.projectileSystem.isEnemyCollider = (colliderHandle) =>
      this.enemyManager.getEnemyByColliderHandle(colliderHandle) !== null;

    // Player shoots: enemy + destructible
    const HEADSHOT_MULTIPLIER = 2;
    const HEADSHOT_Y_THRESHOLD = 1.2;
    const HEADSHOT_INSTAKILL = 999;

    this.projectileSystem.onHitCollider = (colliderHandle, point) => {
      const enemy = this.enemyManager.getEnemyByColliderHandle(colliderHandle);
      if (enemy && !enemy.dead) {
        const weapon = this.weaponManager.currentWeapon;
        const weaponType = getCanonicalWeaponType(weapon.stats.name);

        let dmg = Number(weapon.stats.damage);
        if (!Number.isFinite(dmg) || dmg <= 0) dmg = 25;
        const hitY = point.y - enemy.group.position.y;

        if (hitY >= HEADSHOT_Y_THRESHOLD) {
          if (weaponType === 'sniper' || weaponType === 'shotgun') dmg = HEADSHOT_INSTAKILL;
          else dmg *= HEADSHOT_MULTIPLIER;
        }

        enemy.takeDamage(dmg);
        this.hud.flashCrosshair();

        if (enemy.dead) {
          this.enemyManager.removeEnemyPhysics(enemy);
          this.events.emit('enemy:killed', { position: enemy.group.position.clone() });
        }
        return;
      }

      const prop = this.destructibleSystem.getByColliderHandle(colliderHandle);
      if (prop) {
        const weapon = this.weaponManager.currentWeapon;
        this.destructibleSystem.damage(prop, weapon.stats.damage);
      }
    };

    this.grenadeSystem.onExplosion = (position, radius, damage) => {
      this.destructibleSystem.damageInRadius(position, radius, damage);
    };

    this.grenadeSystem.onGrenadeLanded = (position, type) => {
      if (this.networkMode === 'client' && this.networkManager) {
        this.networkManager.sendGrenadeExplosion({
          playerId: this.networkManager.playerId!,
          timestamp: performance.now(),
          grenadeType: type,
          position: { x: position.x, y: position.y, z: position.z },
        });
      }
    };

    // Barrel explosions
    this.destructibleSystem.onBarrelExplode = (position, radius, damage) => {
      this.enemyManager.damageEnemiesInRadius(position, radius, damage);

      const playerPos = this.player.getPosition();
      const dx = playerPos.x - position.x;
      const dy = playerPos.y - position.y;
      const dz = playerPos.z - position.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (dist <= radius) {
        const falloff = 1 - dist / radius;
        const playerDmg = damage * falloff;
        this.player.takeDamage(playerDmg);
        this.damageIndicator.flash();
      }

      this.grenadeSystem.spawnExplosion(position);
    };

    this.destructibleSystem.onPropDestroyed = (type) => {
      playDestruction(type);
    };

    this.destructibleSystem.onPropDestroyedFull = (prop) => {
      if (this.networkMode === 'client' && this.networkManager) {
        const propId = `${prop.type}_${Math.floor(prop.position.x * 10)}_${Math.floor(
          prop.position.y * 10
        )}_${Math.floor(prop.position.z * 10)}`;

        this.networkManager.sendDestructibleDestroyed({
          propId,
          position: { x: prop.position.x, y: prop.position.y, z: prop.position.z },
          type: prop.type,
          timestamp: performance.now(),
        });
      }
    };

    this.destructibleSystem.onLootDrop = (lootType, amount, position) => {
      this.pickupSystem.spawn(lootType as any, position.x, position.y, position.z, amount);
    };

    // Mobile
    if (MobileControls.isSupported()) {
      this.mobileControls = new MobileControls();
      this.input.setMobileInputProvider(() => this.mobileControls?.getState() ?? null);
    }

    // Level vs test scene
    if (this.levelMode) {
      this.doorSystem = new DoorSystem(
        this.scene,
        this.physics,
        () => this.player.getPosition(),
        (id) => this.player.hasKey(id),
        (id) => this.objectiveSystem?.isCompleted(id) ?? false
      );

      this.objectiveSystem = new ObjectiveSystem();
      this.triggerSystem = new TriggerSystem(() => this.player.getPosition(), this.objectiveSystem);
      this.triggerSystem.onTrigger = (event) => this.handleTrigger(event);

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
  }

  showBriefing(level: LevelSchema): void {
    if (!this.briefingScreen) return;
    this.briefingScreen.show(level);
    this.briefingScreen.setOnStart(() => {
      this.loadLevel(level);
      this.start();
    });
  }

  loadLevel(level: LevelSchema): void {
    if (!this.doorSystem || !this.triggerSystem || !this.objectiveSystem) return;
    this.levelName = level.name;
    this.missionElapsed = 0;

    buildLevel(level, {
      scene: this.scene,
      physics: this.physics,
      doorSystem: this.doorSystem,
      triggerSystem: this.triggerSystem,
      objectiveSystem: this.objectiveSystem,
      enemyManager: this.enemyManager,
      pickupSystem: this.pickupSystem,
      destructibleSystem: this.destructibleSystem,
      setPlayerPosition: (x, y, z) => this.player.setPosition(x, y, z),
    });
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.started = true;

    const canvas = this.renderer.instance.domElement;
    canvas?.focus();

    if (!MobileControls.isSupported()) {
      this.input.requestPointerLock();
    }
    this.mobileControls?.show();

    const startScreen = document.getElementById('start-screen');
    if (startScreen) startScreen.style.display = 'none';
    prewarmSoundEffects();
    this.prewarmRuntimePipelines();

    this.hud.show();
    if (this.networkMode === 'client') this.hud.setMultiplayerHint(true);
    if (this.levelMode && this.objectivesDisplay) this.objectivesDisplay.show();

    this.loop.start();
    startMusic();
  }

  private prewarmRuntimePipelines(): void {
    if (this.runtimePipelinesPrewarmed) return;
    this.runtimePipelinesPrewarmed = true;
    // Warm the *actual* first-barrel runtime path (destroy callbacks, VFX, audio, physics remove).
    const offscreen = new THREE.Vector3(0, -9999, 0);
    const warmMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.28, 0.9, 10),
      new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.7, metalness: 0.3 }),
    );
    warmMesh.position.copy(offscreen);
    this.scene.add(warmMesh);
    const warmCollider = this.physics.createStaticCuboid(0.28, 0.45, 0.28, offscreen.x, offscreen.y + 0.45, offscreen.z);

    // Suppress network echo during warmup while keeping gameplay callback chain intact.
    const onPropDestroyedFull = this.destructibleSystem.onPropDestroyedFull;
    this.destructibleSystem.onPropDestroyedFull = null;
    try {
      const warmProp = this.destructibleSystem.register(warmMesh, warmCollider, 'barrel', 1, 0.9);
      this.destructibleSystem.damage(warmProp, 999);

      // Also warm standalone grenade sprite path.
      this.grenadeSystem.spawnExplosion(offscreen);

      // Step effect systems and force one actual render so GPU programs/textures upload now.
      this.destructibleSystem.update(0.016);
      this.grenadeSystem.update(0.6, this.fpsCamera.camera);
      this.renderer.instance.compile(this.scene, this.fpsCamera.camera);
      this.renderer.instance.render(this.scene, this.fpsCamera.camera);
      this.destructibleSystem.update(0.016);
      this.grenadeSystem.update(0.016, this.fpsCamera.camera);
    } finally {
      this.destructibleSystem.onPropDestroyedFull = onPropDestroyedFull;
      warmMesh.geometry.dispose();
      const warmMat = warmMesh.material;
      if (Array.isArray(warmMat)) {
        warmMat.forEach((m) => m.dispose());
      } else {
        warmMat.dispose();
      }
    }
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.paused = false;
    this.loop.stop();
  }

  private pauseGame(): void {
    this.paused = true;
    document.exitPointerLock();
    this.mobileControls?.hide();
    this.pauseMenu.show();
  }

  private resumeGame(): void {
    this.paused = false;
    this.pauseMenu.hide();
    if (!MobileControls.isSupported()) this.input.requestPointerLock();
    this.mobileControls?.show();
    this.input.resetMouse();
  }

  private exitToMenu(): void {
    this.paused = false;
    this.loop.stop();
    stopMusic();
    window.location.reload();
  }

  private handleTrigger(event: string): void {
    const commands = event.split(',').map((cmd) => cmd.trim());

    for (const cmd of commands) {
      const parts = cmd.split(':');

      if (parts[0] === 'objective' && parts[1] === 'complete' && this.objectiveSystem) {
        this.objectiveSystem.complete(parts[2]);
      } else if (parts[0] === 'door' && parts[1] === 'unlock' && this.doorSystem) {
        this.doorSystem.unlockDoor(parts[2]);
      } else if (cmd === 'mission:complete') {
        if (!this.missionComplete) {
          this.missionComplete = true;
          document.exitPointerLock();
          stopMusic();
          this.missionCompleteScreen.show(this.levelName, this.missionElapsed);
          this.onMissionComplete?.();
        }
      }
    }
  }

  private tick(dt: number): void {
    this.input.update(dt);

    if (this.input.wasKeyJustPressed('escape')) {
      if (this.pauseMenu.isOpen) this.resumeGame();
      else if (!this.inventoryScreen.isOpen) this.pauseGame();
    }

    if (this.paused || this.missionComplete) {
      this.input.resetMouse();
      this.renderer.render(this.scene, this.fpsCamera.camera);
      return;
    }

    if (this.levelMode) this.missionElapsed += dt;

    if (this.input.wasKeyJustPressed('g')) this.tryThrowGrenade('gas');
    if (this.input.wasKeyJustPressed('f')) this.tryThrowGrenade('frag');

    // Main updates
    this.fpsCamera.update(this.input);
    this.weaponManager.update(this.input, dt);
    this.player.updateInput(this.input);

    // Fixed-step physics with max steps to prevent spiral of death
    this.physicsAccumulator += dt;
    const maxSteps = 5;
    let steps = 0;

    while (this.physicsAccumulator >= PHYSICS_STEP && steps < maxSteps) {
      // Feed AI the latest player state/collider every fixed step.
      const stepPlayerPos = this.player.getPosition();
      const stepIsMoving =
        this.input.isKeyDown('w') ||
        this.input.isKeyDown('a') ||
        this.input.isKeyDown('s') ||
        this.input.isKeyDown('d');
      this._playerVec.set(stepPlayerPos.x, stepPlayerPos.y, stepPlayerPos.z);
      this.enemyManager.setPlayerState(this._playerVec, stepIsMoving);
      this.enemyManager.setPlayerCollider(this.player.getCollider());
      this.enemyManager.setCameraPosition(this.fpsCamera.camera.position);

      // ✅ enemies decide + set velocity BEFORE stepping physics
      this.enemyManager.fixedUpdate(PHYSICS_STEP);

      // player
      this.player.updatePhysics(PHYSICS_STEP);

      // ✅ PhysicsWorld.step() takes NO args in your code
      this.physics.step();

      // ✅ sync transforms AFTER stepping physics
      this.player.syncFromPhysics();
      this.enemyManager.syncFromPhysics();

      this.physicsAccumulator -= PHYSICS_STEP;
      steps++;
    }

    if (this.physicsAccumulator > PHYSICS_STEP * maxSteps) {
      this.physicsAccumulator = PHYSICS_STEP * maxSteps;
    }

    // Enemy manager (visual + cleanup + muzzle flashes)
    this.enemyManager.update(dt);
    const playerPosNow = this.player.getPosition();
    this.grenadeSystem.setPlayerPosition(playerPosNow.x, playerPosNow.y, playerPosNow.z);
    this.grenadeSystem.update(dt, this.fpsCamera.camera);

    // Level systems (doors, triggers, pickups, destructibles)
    this.doorSystem?.update(dt);
    this.triggerSystem?.update();
    this.pickupSystem.update(dt, this._playerVec);
    this.destructibleSystem.update(dt);

    this.hud.updateHealth(this.player.health);
    this.hud.updateArmor(this.player.armor);
    this.hud.updateWeapon(this.weaponManager.currentWeapon);
    this.hud.updateGrenades(this.gasGrenadeCount, this.fragGrenadeCount);
    this.hud.update(dt);

    this.input.resetMouse();
    this.renderer.render(this.scene, this.fpsCamera.camera);
  }

  // ──────────── Test Scene ────────────
  private buildTestScene(): void {
    const ambient = new THREE.AmbientLight(0x404060, 0.6);
    this.scene.add(ambient);

    const pointLight = new THREE.PointLight(0xffffee, 40, 35);
    pointLight.position.set(0, 4.5, 0);
    pointLight.castShadow = true;
    pointLight.shadow.mapSize.set(512, 512);
    this.scene.add(pointLight);

    const floorTex = floorTileTexture();
    floorTex.repeat.set(5, 5);
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: 0.8,
      metalness: 0.2,
    });

    const ROOM_W = 20;
    const ROOM_D = 20;

    const floor = new THREE.Mesh(new THREE.BoxGeometry(ROOM_W, 0.2, ROOM_D), floorMat);
    floor.position.set(0, -0.1, 0);
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.physics.createStaticCuboid(ROOM_W / 2, 0.1, ROOM_D / 2, 0, -0.1, 0);
  }

  private spawnTestEnemies(): void {
    this.enemyManager.spawnEnemy({ x: 5, y: -2.5, z: 5, facingAngle: Math.PI + 0.5 });
    this.enemyManager.spawnEnemy({ x: -6, y: -2.5, z: -6, facingAngle: Math.PI / 4 });
  }

  private spawnTestPickups(): void {}

  private prewarmWeaponPickupModels(): void {
    const weaponTypes: Array<'pistol' | 'rifle' | 'shotgun' | 'sniper'> = [
      'pistol',
      'rifle',
      'shotgun',
      'sniper',
    ];
    for (const weaponType of weaponTypes) {
      const key = `${weaponType}:default`;
      if (this.weaponPreviewMeshCache.has(key)) continue;
      const preview = this.weaponManager.getPreviewMesh(weaponType, 'default');
      this.weaponPreviewMeshCache.set(key, preview);
    }
  }

  private tryThrowGrenade(type: 'gas' | 'frag'): void {
    if (type === 'gas') {
      if (this.gasGrenadeCount <= 0) return;
      this.gasGrenadeCount--;
    } else {
      if (this.fragGrenadeCount <= 0) return;
      this.fragGrenadeCount--;
    }

    this.fpsCamera.camera.getWorldPosition(this._throwOrigin);
    this.fpsCamera.getLookDirection(this._throwDir);
    this._throwDir.normalize();
    this._throwOrigin.addScaledVector(this._throwDir, 0.6);

    this.grenadeSystem.throw(this._throwOrigin, this._throwDir, type);
  }

  private handlePickup(t: string, a: number, k?: string): void {
    switch (t) {
      case 'health':
        this.player.heal(a);
        this.hud.showPickupNotification(`+${a} Health`);
        break;
      case 'armor':
        this.player.addArmor(a);
        this.hud.showPickupNotification(`+${a} Armor`);
        break;
      case 'ammo-pistol':
        this.weaponManager.addAmmo('pistol', a);
        this.hud.showPickupNotification(`+${a} Pistol Ammo`);
        break;
      case 'ammo-rifle':
        this.weaponManager.addAmmo('rifle', a);
        this.hud.showPickupNotification(`+${a} Rifle Ammo`);
        break;
      case 'ammo-shotgun':
        this.weaponManager.addAmmo('shotgun', a);
        this.hud.showPickupNotification(`+${a} Shotgun Ammo`);
        break;
      case 'ammo-sniper':
        this.weaponManager.addAmmo('sniper', a);
        this.hud.showPickupNotification(`+${a} Sniper Ammo`);
        break;
      case 'weapon-rifle':
        this.weaponManager.addWeapon('rifle');
        this.hud.showPickupNotification('Picked up Rifle');
        break;
      case 'weapon-shotgun':
        this.weaponManager.addWeapon('shotgun');
        this.hud.showPickupNotification('Picked up Shotgun');
        break;
      case 'weapon-sniper':
        this.weaponManager.addWeapon('sniper');
        this.hud.showPickupNotification('Picked up Sniper');
        break;
      case 'key':
        if (k) {
          this.player.giveKey(k);
          this.hud.showPickupNotification(`Picked up ${k}`);
        }
        break;
      default:
        break;
    }
  }
}
