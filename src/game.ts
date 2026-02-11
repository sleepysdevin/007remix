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
import { PickupSystem } from './levels/pickup-system';
import { DoorSystem } from './levels/door-system';
import { TriggerSystem } from './levels/trigger-system';
import { ObjectiveSystem } from './levels/objective-system';
import { buildLevel } from './levels/level-builder';
import type { LevelSchema } from './levels/level-schema';
import { DestructibleSystem } from './levels/destructible-system';
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
import { playDestruction } from './audio/sound-effects';
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
  woodCrateTexture,
  metalCrateTexture,
  barrelTexture,
} from './levels/procedural-textures';
import type { NetworkManager } from './network/network-manager';
import { RemotePlayerManager } from './player/remote-player-manager';
import { NetworkConfig } from './network/network-config';
import { GameSettings } from './core/game-settings';

const PHYSICS_STEP = 1 / 60;

/** Map weapon name to canonical network type (for weapon fire and player state sync). */
function getCanonicalWeaponType(weaponName: string): 'pistol' | 'rifle' | 'shotgun' | 'sniper' {
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
  private gasGrenadeCount = 3;
  private fragGrenadeCount = 2;
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
  private levelMode: boolean;
  private missionComplete = false;
  private missionElapsed = 0;
  private levelName = '';

  // Reusable vectors to avoid per-frame heap allocations
  private readonly _playerVec = new THREE.Vector3();
  private readonly _aimAssistLookDir = new THREE.Vector3();
  private readonly _aimAssistToTarget = new THREE.Vector3();

  // Multiplayer networking
  private networkMode: 'local' | 'client';
  private networkManager: NetworkManager | null = null;
  private remotePlayerManager: RemotePlayerManager | null = null;
  private lastNetworkUpdate = 0;
  private networkUpdateRate = NetworkConfig.UPDATE_RATES.PLAYER_STATE; // Hz
  private localPlayerKills = 0;
  private processedDestructibleIds = new Set<string>();

  /** Called when all objectives are done and player reaches extraction (mission:complete). */
  onMissionComplete: (() => void) | null = null;

  private readonly canvas: HTMLCanvasElement;

  constructor(
    canvas: HTMLCanvasElement,
    physics: PhysicsWorld,
    options: GameOptions = {},
  ) {
    this.canvas = canvas;
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

    // Flashlight — toggleable SpotLight attached to camera (V key)
    // Positioned at weapon area so it also illuminates the held weapon
    this.flashlight = new THREE.SpotLight(0xffe8cc, 0, 30, Math.PI / 6, 0.35, 1.5);
    this.flashlight.position.set(0.3, -0.1, -0.3);
    this.flashlight.target.position.set(0, 0, -5);
    this.fpsCamera.camera.add(this.flashlight);
    this.fpsCamera.camera.add(this.flashlight.target);

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

    // Blood splatter system (visual effect for player hits)
    this.bloodSplatterSystem = new BloodSplatterSystem(this.scene);

    // Destructible system (crates, barrels)
    this.destructibleSystem = new DestructibleSystem(this.scene, this.physics);

    // Pickup system
    this.pickupSystem = new PickupSystem(this.scene);
    this.pickupSystem.onPickupCollected = (type, amount, keyId) => {
      this.handlePickup(type, amount, keyId);
    };
    // Build actual 3D weapon models for ground pickups (set after weaponManager exists)
    this.pickupSystem.weaponModelBuilder = (weaponType: string) => {
      return this.weaponManager.getPreviewMesh(weaponType as any, 'default');
    };

    // Damage indicator + scope overlay + tactical (NV/gas mask)
    this.damageIndicator = new DamageIndicator();
    this.scopeOverlay = new ScopeOverlay();
    this.tacticalOverlay = new TacticalOverlay();

    // Multiplayer UI (death overlay, hit markers, kill feed, scoreboard)
    this.deathOverlay = new DeathOverlay();
    this.hitMarker = new HitMarker();
    this.killFeed = new KillFeed();
    this.scoreboard = new Scoreboard();
    this.gameOverOverlay = new GameOverOverlay();

    // Gas damage — mask protects when tactical overlay (NV/gas mask) is on
    this.grenadeSystem.onPlayerInGas = (damage) => {
      if (!this.tacticalOverlay.visible) {
        this.player.takeDamage(damage);
        this.damageIndicator.flash();
      }
    };

    // When enemy shoots player
    this.enemyManager.onPlayerHit = (damage, _fromPos) => {
      this.player.takeDamage(damage);
      this.hud.flashCrosshair();
      this.damageIndicator.flash();
    };

    // Skip decals/impact particles on enemy hits (no lingering effects) and use enemy collider for hit test
    this.projectileSystem.isEnemyCollider = (c) => this.enemyManager.getEnemyByCollider(c) !== null;

    // When player shoots: check if it hit an enemy OR a destructible prop
    const HEADSHOT_MULTIPLIER = 2;
    const HEADSHOT_Y_THRESHOLD = 1.2; // above enemy group.y — head zone is ~1.2–1.7
    const HEADSHOT_INSTAKILL = 999;   // Sniper/shotgun headshots = 1-shot kill
    this.projectileSystem.onHitCollider = (collider, _point, _normal) => {
      // Check enemies first
      const enemy = this.enemyManager.getEnemyByCollider(collider);
      if (enemy && !enemy.dead) {
        const weapon = this.weaponManager.currentWeapon;
        const weaponType = getCanonicalWeaponType(weapon.stats.name);
        let dmg = weapon.stats.damage;
        const hitY = _point.y - enemy.group.position.y;
        if (hitY >= HEADSHOT_Y_THRESHOLD) {
          if (weaponType === 'sniper' || weaponType === 'shotgun') {
            dmg = HEADSHOT_INSTAKILL;
          } else {
            dmg *= HEADSHOT_MULTIPLIER;
          }
        }
        enemy.takeDamage(dmg);
        this.hud.flashCrosshair(); // Red flash = hit confirmed

        if (enemy.dead) {
          this.enemyManager.removeEnemyPhysics(enemy); // So player doesn't get stuck on corpses
          this.events.emit('enemy:killed', {
            position: enemy.group.position.clone(),
          });
        }
        return;
      }

      // Check destructible props
      const prop = this.destructibleSystem.getByColliderHandle(collider.handle);
      if (prop) {
        const weapon = this.weaponManager.currentWeapon;
        this.destructibleSystem.damage(prop, weapon.stats.damage);
      }
    };

    // When a frag grenade explodes: also damage destructible props in radius
    this.grenadeSystem.onExplosion = (position, radius, damage) => {
      this.destructibleSystem.damageInRadius(position, radius, damage);
    };

    // When grenade lands: send explosion event to server in multiplayer
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

    // When a barrel explodes: damage enemies and player in radius
    this.destructibleSystem.onBarrelExplode = (position, radius, damage) => {
      // Damage enemies
      this.enemyManager.damageEnemiesInRadius(position, radius, damage);
      // Damage player if in range
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
      // Visual explosion sprite from grenade system
      this.grenadeSystem.spawnExplosion(position);
    };

    // Destruction sounds
    this.destructibleSystem.onPropDestroyed = (type, _position) => {
      playDestruction(type);
    };

    // When destructible is destroyed: send event to server in multiplayer
    this.destructibleSystem.onPropDestroyedFull = (prop) => {
      if (this.networkMode === 'client' && this.networkManager) {
        // Generate prop ID from position (for simplicity, in production use UUID)
        const propId = `${prop.type}_${Math.floor(prop.position.x * 10)}_${Math.floor(prop.position.y * 10)}_${Math.floor(prop.position.z * 10)}`;

        this.networkManager.sendDestructibleDestroyed({
          propId,
          position: { x: prop.position.x, y: prop.position.y, z: prop.position.z },
          type: prop.type,
          timestamp: performance.now(),
        });
      }
    };

    // Loot drops from destroyed props
    this.destructibleSystem.onLootDrop = (lootType, amount, position) => {
      this.pickupSystem.spawn(lootType as any, position.x, position.y, position.z, amount);
    };

    // HUD
    this.hud = new HUD();

    // Inventory (Tab to open/close)
    this.inventoryScreen = new InventoryScreen();

    // Pause menu (Escape key)
    this.pauseMenu = new PauseMenu();
    this.pauseMenu.onResume = () => {
      this.resumeGame();
    };
    this.pauseMenu.onExit = () => {
      this.exitToMenu();
    };

    // Click canvas to re-engage pointer lock (e.g. after screenshot, clicking outside)
    this.canvas.addEventListener('click', this.onCanvasClick);

    // Mission complete screen
    this.missionCompleteScreen = new MissionCompleteScreen();
    this.missionCompleteScreen.onExit = () => {
      this.exitToMenu();
    };

    // Mobile touch controls (when supported)
    if (MobileControls.isSupported()) {
      this.mobileControls = new MobileControls();
      this.input.setMobileInputProvider(() => this.mobileControls?.getState() ?? null);
    }

    if (this.levelMode) {
      this.doorSystem = new DoorSystem(
        this.scene,
        this.physics,
        () => this.player.getPosition(),
        (id) => this.player.hasKey(id),
        (id) => this.objectiveSystem?.isCompleted(id) ?? false,
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

    // Initialize multiplayer components if in network mode
    if (this.networkMode === 'client' && this.networkManager) {
      this.remotePlayerManager = new RemotePlayerManager(this.scene, this.physics);
      this.remotePlayerManager.setLocalPlayerId(this.networkManager.playerId ?? '');
      this.nameTagManager = new NameTagManager(this.fpsCamera.camera);

      // Handle game state snapshots from server
      this.networkManager.onGameStateSnapshot = (snapshot) => {
        this.remotePlayerManager?.updateFromSnapshot(snapshot);
        this.updateScoreboardFromSnapshot(snapshot);
        this.syncDestroyedDestructibles(snapshot.destroyedDestructibles);
      };

      // Handle weapon fire events (Phase 4: animations + spatial audio)
      this.networkManager.onWeaponFire = (event) => {
        const isLocalPlayer = event.playerId === this.networkManager?.playerId;

        // Don't show fire animation for local player (they see their own first-person effects)
        if (!isLocalPlayer) {
          const remotePlayer = this.remotePlayerManager?.getPlayer(event.playerId);
          if (remotePlayer) {
            remotePlayer.playFireAnimation();

            // Play spatial audio for remote gunshot
            const soundPosition = remotePlayer.getPosition();
            const listenerPosition = this.player.getPosition();
            // Map weapon name to sound type
            const weaponType = event.weaponType.toLowerCase().replace(/\s+/g, '-') as any;
            (async () => {
              const { playPositionalGunshot } = await import('./audio/sound-effects');
              playPositionalGunshot(weaponType, soundPosition, listenerPosition);
            })();

            console.log(`[Game] Remote player ${event.playerId} fired weapon`);
          }
        }
      };

      // Handle combat events (Phase 3 + 4)
      this.networkManager.onPlayerDamaged = (event) => {
        const isLocalPlayer = event.victimId === this.networkManager?.playerId;
        const isLocalShooter = event.shooterId === this.networkManager?.playerId;

        if (isLocalPlayer) {
          // Apply damage to local player
          this.player.takeDamage(event.damage);
          this.damageIndicator.flash();
          console.log(`[Game] Took ${event.damage} damage from ${event.shooterId}`);
        }

        // Show hit marker if we're the shooter
        if (isLocalShooter) {
          if (event.wasHeadshot) {
            this.hitMarker.showHeadshot();
          } else {
            this.hitMarker.show();
          }
        }

        // Show blood splatter for remote player hits
        if (!isLocalPlayer && this.remotePlayerManager) {
          const remotePlayer = this.remotePlayerManager.getPlayer(event.victimId);
          if (remotePlayer) {
            const position = remotePlayer.getPosition();
            // Get shooter direction (approximate - from shooter to victim)
            const shooter = this.remotePlayerManager.getPlayer(event.shooterId);
            const direction = new THREE.Vector3(0, 0, 1); // Default forward
            if (shooter) {
              direction.subVectors(position, shooter.getPosition()).normalize();
            }
            this.bloodSplatterSystem.spawn(position, direction, 8);
          }
        }
      };

      this.networkManager.onPlayerDied = (event) => {
        const isLocalPlayer = event.victimId === this.networkManager?.playerId;
        const isLocalShooter = event.killerId === this.networkManager?.playerId;

        if (isLocalPlayer) {
          // Mark local player as dead (disables movement)
          this.player.setDead(true);

          // Show death overlay with killer name
          const killerPlayer = this.remotePlayerManager?.getPlayer(event.killerId);
          const killerName = killerPlayer?.username ?? 'Unknown';
          this.deathOverlay.show(killerName);
          console.log(`[Game] You were killed by ${killerName}`);
        } else {
          // Play death animation for remote player
          const victimPlayer = this.remotePlayerManager?.getPlayer(event.victimId);
          if (victimPlayer) {
            victimPlayer.playDeathAnimation();
          }
        }

        // Optimistic kill count update for local player (server snapshot will confirm)
        if (event.killerId === this.networkManager?.playerId) {
          this.localPlayerKills += 1;
        }

        // Add to kill feed (with weapon type from server)
        const killerPlayer = event.killerId === this.networkManager?.playerId
          ? { username: 'You' }
          : this.remotePlayerManager?.getPlayer(event.killerId);
        const victimPlayer = event.victimId === this.networkManager?.playerId
          ? { username: 'You' }
          : this.remotePlayerManager?.getPlayer(event.victimId);

        const killerName = killerPlayer?.username ?? 'Unknown';
        const victimName = victimPlayer?.username ?? 'Unknown';
        const weaponType = event.weaponType ?? 'pistol';

        this.killFeed.addKill(killerName, victimName, weaponType);
      };

      // Handle respawn events (Phase 4)
      this.networkManager.onPlayerRespawned = (event) => {
        const isLocalPlayer = event.playerId === this.networkManager?.playerId;

        if (isLocalPlayer) {
          // Respawn local player (reset health, armor, enable movement)
          this.player.respawn();
          this.player.setPosition(event.position.x, event.position.y, event.position.z);

          // Hide death overlay
          this.deathOverlay.hide();

          console.log(`[Game] Respawned at (${event.position.x}, ${event.position.y}, ${event.position.z})`);
        } else {
          // Reset remote player after respawn
          const remotePlayer = this.remotePlayerManager?.getPlayer(event.playerId);
          if (remotePlayer) {
            remotePlayer.resetAfterRespawn();
          }
          console.log(`[Game] Player ${event.playerId} respawned`);
        }
      };

      // Handle grenade throw events (Phase 5)
      this.networkManager.onGrenadeThrow = (event) => {
        const isLocalPlayer = event.playerId === this.networkManager?.playerId;

        // Don't throw grenade for local player (already thrown locally)
        if (!isLocalPlayer) {
          const origin = new THREE.Vector3(event.origin.x, event.origin.y, event.origin.z);
          const direction = new THREE.Vector3(event.direction.x, event.direction.y, event.direction.z);
          this.grenadeSystem.throw(origin, direction, event.grenadeType);
          console.log(`[Game] Remote player ${event.playerId} threw ${event.grenadeType} grenade`);
        }
      };

      // Handle grenade explosion events (Phase 5)
      this.networkManager.onGrenadeExplosion = (event) => {
        const isLocalPlayer = event.playerId === this.networkManager?.playerId;

        // Show explosion visual for all players (server handles damage)
        // Note: local player already spawned explosion via grenadeLanded callback
        if (!isLocalPlayer) {
          const position = new THREE.Vector3(event.position.x, event.position.y, event.position.z);
          if (event.grenadeType === 'frag') {
            this.grenadeSystem.spawnExplosion(position);
          }
          // Gas clouds are already spawned by grenade physics simulation
        }
      };

      // Handle flashlight toggle events (Phase 5)
      this.networkManager.onFlashlightToggle = (event) => {
        const isLocalPlayer = event.playerId === this.networkManager?.playerId;

        // Update remote player's flashlight
        if (!isLocalPlayer) {
          const remotePlayer = this.remotePlayerManager?.getPlayer(event.playerId);
          if (remotePlayer) {
            remotePlayer.setFlashlight(event.isOn);
            console.log(`[Game] Remote player ${event.playerId} flashlight: ${event.isOn ? 'ON' : 'OFF'}`);
          }
        }
      };

      // Handle game over (Phase 4 - win conditions)
      this.networkManager.onGameOver = (event) => {
        document.exitPointerLock();
        const isLocalWinner = event.winnerId === this.networkManager?.playerId;
        this.gameOverOverlay.setCallbacks({
          onExit: () => this.exitToMenu(),
        });
        this.gameOverOverlay.show(event.winnerUsername, event.reason, isLocalWinner);
      };

      // Handle destructible destroyed events (Phase 5)
      this.networkManager.onDestructibleDestroyed = (event) => {
        if (this.processedDestructibleIds.has(event.propId)) return;
        this.processedDestructibleIds.add(event.propId);

        const destroyed = this.destructibleSystem.destroyByPositionAndType(
          event.position,
          event.type,
          1.0, // Wider tolerance for position sync
          true
        );
        if (destroyed) {
          console.log(`[Game] Destructible ${event.type} destroyed at (${event.position.x}, ${event.position.y}, ${event.position.z})`);
        }
      };

      console.log('[Game] Multiplayer mode initialized with combat sync');
    }

    // Game loop
    this.loop = new GameLoop((dt) => this.tick(dt));

    // Event listeners
    this.events.on('weapon:fired', (data: any) => {
      this.hud.flashCrosshairFire();

      // Send weapon fire event to server in multiplayer mode (Phase 3)
      if (this.networkMode === 'client' && this.networkManager) {
        // Check if we hit a remote player
        let hitPlayerId: string | undefined;
        if (data.hit && data.hit.collider) {
          const remotePlayer = this.remotePlayerManager?.getPlayerByCollider(data.hit.collider);
          if (remotePlayer) {
            hitPlayerId = remotePlayer.id;
            console.log(`[Game] Hit remote player: ${hitPlayerId}`);
          }
        }

        const weaponType = getCanonicalWeaponType(this.weaponManager.currentWeapon.stats.name);

        console.log(`[Game] Sending weapon fire: ${weaponType}, hitPlayerId: ${hitPlayerId ?? 'none'}`);

        this.networkManager.sendWeaponFire({
          playerId: this.networkManager.playerId!,
          timestamp: performance.now(),
          weaponType,
          origin: {
            x: data.position.x,
            y: data.position.y,
            z: data.position.z,
          },
          direction: {
            x: data.direction.x,
            y: data.direction.y,
            z: data.direction.z,
          },
          hitPlayerId,
          hitPoint: data.hit?.point
            ? { x: data.hit.point.x, y: data.hit.point.y, z: data.hit.point.z }
            : undefined,
        });
      }
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
    if (this.started) return;
    this.started = true;
    if (!MobileControls.isSupported()) {
      this.input.requestPointerLock();
    }
    this.mobileControls?.show();
    document.getElementById('start-screen')!.style.display = 'none';
    this.hud.show();
    if (this.networkMode === 'client') this.hud.setMultiplayerHint(true);
    if (this.levelMode && this.objectivesDisplay) this.objectivesDisplay.show();
    this.loop.start();
    // Start the spy-thriller background music
    startMusic();
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
    if (!MobileControls.isSupported()) {
      this.input.requestPointerLock();
    }
    this.mobileControls?.show();
    this.input.resetMouse();
  }

  private onCanvasClick = (): void => {
    if (MobileControls.isSupported()) return;
    if (!this.started || this.paused || this.missionComplete) return;
    if (this.inventoryScreen.isOpen || this.scoreboard.visible) return;
    if (this.input.pointerLocked) return;
    this.input.requestPointerLock();
  };

  private exitToMenu(): void {
    this.paused = false;
    this.loop.stop();
    stopMusic();
    // Reload the page to cleanly reset everything (physics, scene, etc.)
    window.location.reload();
  }

  /**
   * Update scoreboard from server game state snapshot (multiplayer only).
   */
  /**
   * Apply destroyed destructibles from server (for new joiners + sync).
   */
  private syncDestroyedDestructibles(destroyed?: Array<{ propId: string; position: { x: number; y: number; z: number }; type: 'crate' | 'crate_metal' | 'barrel' }>): void {
    if (!destroyed) return;
    for (const d of destroyed) {
      if (this.processedDestructibleIds.has(d.propId)) continue;
      this.processedDestructibleIds.add(d.propId);
      // Silent=true: no explosions/debris when syncing for new joiners
      this.destructibleSystem.destroyByPositionAndType(d.position, d.type, 1.0, true, true);
    }
  }

  private updateScoreboardFromSnapshot(snapshot: { players: Record<string, { playerId?: string; username?: string; kills?: number; deaths?: number }> }): void {
    if (!this.networkManager) return;

    const localId = this.networkManager.playerId ?? '';
    const localState = snapshot.players[localId] as { kills?: number } | undefined;
    if (localState?.kills !== undefined) this.localPlayerKills = localState.kills;

    const players: ScoreboardPlayer[] = [];
    const localPing = this.networkManager.ping ?? 0;
    const localUsername = this.networkManager.localUsername;

    for (const [playerId, state] of Object.entries(snapshot.players)) {
      const p = state as { playerId?: string; username?: string; kills?: number; deaths?: number };
      players.push({
        id: playerId,
        username: p.username ?? playerId,
        kills: p.kills ?? 0,
        deaths: p.deaths ?? 0,
        ping: playerId === localId ? localPing : undefined,
        isLocalPlayer: playerId === localId,
      });
    }

    // If no server data yet, add local player
    if (players.length === 0 && localId) {
      players.push({
        id: localId,
        username: localUsername,
        kills: 0,
        deaths: 0,
        ping: localPing,
        isLocalPlayer: true,
      });
    }

    this.scoreboard.update(players);
  }

  private handleTrigger(event: string): void {
    const parts = event.split(':');
    if (parts[0] === 'objective' && parts[1] === 'complete' && this.objectiveSystem) {
      this.objectiveSystem.complete(parts[2]);
    } else if (parts[0] === 'door' && parts[1] === 'unlock' && this.doorSystem) {
      this.doorSystem.unlockDoor(parts[2]);
    } else if (event === 'mission:complete') {
      if (!this.missionComplete) {
        // Complete the extraction objective before showing the screen
        this.objectiveSystem?.complete('obj3');
        this.missionComplete = true;
        document.exitPointerLock();
        stopMusic();
        this.missionCompleteScreen.show(this.levelName, this.missionElapsed);
        this.onMissionComplete?.();
      }
    }
  }

  private tick(dt: number): void {
    // Poll gamepad and merge mobile input
    this.input.update(dt);

    // Pause toggle (Escape)
    if (this.input.wasKeyJustPressed('escape')) {
      if (this.pauseMenu.isOpen) {
        this.resumeGame();
      } else if (!this.inventoryScreen.isOpen) {
        this.pauseGame();
      }
    }

    // While paused or mission complete, only render (frozen frame)
    if (this.paused || this.missionComplete) {
      this.input.resetMouse();
      this.renderer.render(this.scene, this.fpsCamera.camera);
      return;
    }

    // Track mission time
    if (this.levelMode) this.missionElapsed += dt;

    // Scoreboard: hold Q to view, release to close - multiplayer only (Q avoids browser Tab conflict)
    if (this.networkMode === 'client' && this.networkManager) {
      if (this.input.isKeyDown('q')) {
        if (!this.scoreboard.visible) {
          document.exitPointerLock();
          this.mobileControls?.hide();
          this.scoreboard.show();
        }
      } else {
        if (this.scoreboard.visible) {
          this.scoreboard.hide();
          if (this.started) {
            this.input.requestPointerLock();
            this.mobileControls?.show();
          }
        }
      }
    }

    // Inventory toggle (Tab in single-player, I in multiplayer)
    const inventoryKey = this.networkMode === 'client' ? 'i' : 'tab';
    if (this.input.wasKeyJustPressed(inventoryKey)) {
      if (this.inventoryScreen.isOpen) {
        this.inventoryScreen.hide();
        if (this.started) {
          this.input.requestPointerLock();
          this.mobileControls?.show();
        }
        this.input.resetMouse(); // So same key doesn't reopen next frame
      } else {
        document.exitPointerLock();
        this.mobileControls?.hide();
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
            if (this.started) {
              this.input.requestPointerLock();
              this.mobileControls?.show();
            }
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

    // Aim assist (single-player only)
    let aimAssistDelta: { yaw: number; pitch: number } | undefined;
    let lookScale = 1;
    const aimStrength = GameSettings.getAimAssistStrength();
    const aimMode = GameSettings.getAimAssistMode();
    if (aimStrength > 0 && aimMode !== 'off' && this.networkMode !== 'client') {
      this.fpsCamera.getLookDirection(this._aimAssistLookDir);
      const hit = this.enemyManager.getBestAimAssistTarget(
        this.fpsCamera.camera.position,
        this._aimAssistLookDir,
        0.12, // ~7° cone
        35,
      );
      if (hit) {
        this._aimAssistToTarget.subVectors(hit.target, this.fpsCamera.camera.position).normalize();
        const targetYaw = Math.atan2(this._aimAssistToTarget.x, -this._aimAssistToTarget.z);
        const targetPitch = Math.asin(Math.max(-1, Math.min(1, this._aimAssistToTarget.y)));
        const curYaw = Math.atan2(this._aimAssistLookDir.x, -this._aimAssistLookDir.z);
        const curPitch = Math.asin(Math.max(-1, Math.min(1, this._aimAssistLookDir.y)));
        let dYaw = targetYaw - curYaw;
        while (dYaw > Math.PI) dYaw -= Math.PI * 2;
        while (dYaw < -Math.PI) dYaw += Math.PI * 2;
        const dPitch = targetPitch - curPitch;
        if (aimMode === 'pull') {
          const pull = aimStrength * 0.15;
          aimAssistDelta = { yaw: dYaw * pull, pitch: dPitch * pull };
        } else if (aimMode === 'slowdown') {
          lookScale = 1 - aimStrength * 0.7;
        }
      }
    }

    // Update camera from mouse input (scales sensitivity by FOV when scoped)
    this.fpsCamera.update(this.input, aimAssistDelta, lookScale);

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

      // Send grenade throw event in multiplayer
      if (this.networkMode === 'client' && this.networkManager) {
        this.networkManager.sendGrenadeThrow({
          playerId: this.networkManager.playerId!,
          timestamp: performance.now(),
          grenadeType: 'gas',
          origin: { x: this._throwOrigin.x, y: this._throwOrigin.y, z: this._throwOrigin.z },
          direction: { x: this._throwDir.x, y: this._throwDir.y, z: this._throwDir.z },
        });
      }
    }
    if (this.input.wasKeyJustPressed('f') && this.fragGrenadeCount > 0) {
      this._throwOrigin.copy(this.fpsCamera.camera.position);
      this.fpsCamera.getLookDirection(this._throwDir);
      this.grenadeSystem.throw(this._throwOrigin, this._throwDir, 'frag');
      this.fragGrenadeCount--;

      // Send grenade throw event in multiplayer
      if (this.networkMode === 'client' && this.networkManager) {
        this.networkManager.sendGrenadeThrow({
          playerId: this.networkManager.playerId!,
          timestamp: performance.now(),
          grenadeType: 'frag',
          origin: { x: this._throwOrigin.x, y: this._throwOrigin.y, z: this._throwOrigin.z },
          direction: { x: this._throwDir.x, y: this._throwDir.y, z: this._throwDir.z },
        });
      }
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
    this.grenadeSystem.setPlayerPosition(
      this._playerVec.x,
      this._playerVec.y,
      this._playerVec.z,
    );
    this.grenadeSystem.update(dt, this.fpsCamera.camera);

    // Blood splatter system: update particle effects
    this.bloodSplatterSystem.update(dt);

    // Light pool: auto-release expired pooled lights (muzzle flashes, etc.)
    globalLightPool.update();

    // Destructible props: debris physics + cleanup
    this.destructibleSystem.update(dt);

    // Scope overlay
    this.scopeOverlay.visible = this.weaponManager.scoped;

    // Tactical overlay (N key — night vision + gas mask)
    if (this.input.wasKeyJustPressed('n')) {
      this.tacticalOverlay.visible = !this.tacticalOverlay.visible;
    }

    // Flashlight toggle (V key)
    if (this.input.wasKeyJustPressed('v')) {
      this.flashlightOn = !this.flashlightOn;
      this.flashlight.intensity = this.flashlightOn ? 40 : 0;

      // Send flashlight toggle event in multiplayer
      if (this.networkMode === 'client' && this.networkManager) {
        this.networkManager.sendFlashlightToggle({
          playerId: this.networkManager.playerId!,
          isOn: this.flashlightOn,
          timestamp: performance.now(),
        });
      }
    }

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
    // Show ping and kills only in multiplayer
    if (this.networkMode === 'client' && this.networkManager) {
      this.hud.updatePing(this.networkManager.ping);
      this.hud.updateKills(this.localPlayerKills, 25);
    } else {
      this.hud.updatePing(null);
      this.hud.updateKills(null);
    }
    this.hud.update(dt);

    // Multiplayer: Send player state to server + update remote players
    if (this.networkMode === 'client' && this.networkManager) {
      // Variable update rate: faster when moving, slower when idle (bandwidth optimization)
      const isMoving = this.input.isKeyDown('w') || this.input.isKeyDown('a') ||
                       this.input.isKeyDown('s') || this.input.isKeyDown('d');
      this.networkUpdateRate = isMoving
        ? NetworkConfig.UPDATE_RATES.PLAYER_STATE
        : NetworkConfig.UPDATE_RATES.PLAYER_STATE_IDLE;

      // Send local player state at configured rate
      const now = performance.now();
      const updateInterval = 1000 / this.networkUpdateRate;
      if (now - this.lastNetworkUpdate >= updateInterval) {
        const playerPos = this.player.getPosition();
        this.networkManager.sendPlayerState({
          playerId: this.networkManager.playerId!,
          position: { x: playerPos.x, y: playerPos.y, z: playerPos.z },
          rotation: this.fpsCamera.getYRotation(),
          health: this.player.health,
          armor: this.player.armor,
          currentWeapon: getCanonicalWeaponType(this.weaponManager.currentWeapon.stats.name),
          crouching: this.player.isCrouching,
          isMoving,
          timestamp: now,
        });
        this.lastNetworkUpdate = now;
      }

      // Update remote players
      this.remotePlayerManager?.update(dt);

      // Update name tags (project 3D positions to screen)
      if (this.nameTagManager) {
        const targets = this.remotePlayerManager!.getAll().map((p) => ({
          id: p.id,
          username: p.username,
          getPosition: () => p.getPosition(),
          isDead: p.isDead,
        }));
        this.nameTagManager.update(targets);
      }
    }

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
    const pointLight = new THREE.PointLight(0xffffee, 40, 35);
    pointLight.position.set(0, 4.5, 0);
    pointLight.castShadow = true;
    pointLight.shadow.mapSize.set(512, 512);
    this.scene.add(pointLight);

    // Secondary lights in corners
    const cornerLight1 = new THREE.PointLight(0xffe0a0, 20, 22);
    cornerLight1.position.set(-7, 3, -7);
    this.scene.add(cornerLight1);

    const cornerLight2 = new THREE.PointLight(0xa0d0ff, 20, 22);
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

    // Crates scattered around (destructible)
    const crateData: { w: number; h: number; d: number; x: number; y: number; z: number; mat: THREE.Material; type: 'crate' | 'crate_metal' }[] = [
      { w: 1.2, h: 1.2, d: 1.2, x: 4, y: 0.6, z: 3, mat: crateMat, type: 'crate' },
      { w: 1, h: 1, d: 1, x: 4.8, y: 0.5, z: 4.2, mat: crateMat, type: 'crate' },
      { w: 0.8, h: 0.8, d: 0.8, x: 3.5, y: 1.6, z: 3.3, mat: crateMat, type: 'crate' },
      { w: 1.5, h: 1, d: 1.5, x: -6, y: 0.5, z: -5, mat: metalCrateMat, type: 'crate_metal' },
      { w: 1, h: 0.8, d: 1, x: -5.5, y: 0.4, z: -3.5, mat: metalCrateMat, type: 'crate_metal' },
      { w: 2, h: 1.5, d: 0.8, x: -3, y: 0.75, z: 7, mat: crateMat, type: 'crate' },
      { w: 0.6, h: 2, d: 0.6, x: 7, y: 1, z: -7, mat: metalCrateMat, type: 'crate_metal' },
      { w: 0.6, h: 2, d: 0.6, x: -7, y: 1, z: -7, mat: metalCrateMat, type: 'crate_metal' },
    ];

    for (const c of crateData) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(c.w, c.h, c.d), c.mat);
      crate.position.set(c.x, c.y, c.z);
      crate.castShadow = true;
      crate.receiveShadow = true;
      this.scene.add(crate);
      const collider = this.physics.createStaticCuboid(c.w / 2, c.h / 2, c.d / 2, c.x, c.y, c.z);
      this.destructibleSystem.register(crate, collider, c.type, undefined, Math.max(c.w, c.h, c.d));
    }

    // Barrels (destructible + explosive)
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
        barrelMat.clone(), // clone so each barrel can flash independently
      );
      barrel.position.set(bx, by, bz);
      barrel.castShadow = true;
      barrel.receiveShadow = true;
      this.scene.add(barrel);
      const collider = this.physics.createStaticCuboid(0.4, 0.6, 0.4, bx, by, bz);
      this.destructibleSystem.register(barrel, collider, 'barrel', undefined, 0.8);
    }
  }
}
