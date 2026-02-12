// Patch Three.js Object3D to make position/rotation/quaternion/scale writable.
const _origDefineProperties = Object.defineProperties;
Object.defineProperties = function<T>(obj: T, props: PropertyDescriptorMap & ThisType<any>): T {
  if (props.position && props.rotation && props.quaternion && props.scale) {
    for (const key of Object.keys(props)) {
      const desc = props[key];
      if ('value' in desc && !('writable' in desc)) {
        desc.writable = true;
      }
    }
  }
  return _origDefineProperties.call(Object, obj, props) as T;
};

import { PhysicsWorld } from './core/physics-world';
import { Game } from './game';
import { loadLevel } from "./levels/types/level-loader";
import { LevelGenerator } from './levels';
import type { LevelSchema } from './levels/types/level-schema';
import { CCTVBackground } from './ui/cctv-background';
import { ScreenGlitch } from './ui/screen-glitch';
import { NetworkManager } from './network/network-manager';
import { LobbyScreen } from './ui/lobby-screen';
import { SettingsMenu } from './ui/settings-menu';
import { CharacterModelsScreen } from './ui/character-models-screen';
import { setEnemyRenderConfig, ENEMY_RENDER_CONFIG } from './enemies/enemy-render-config';
import { preloadEnemySpriteSheet } from './enemies/sprite/guard-sprite-sheet';
import {
  preloadCustomEnemyModel,
  preloadCustomPlayerModel,
  loadAndCacheEnemyModelFromBuffer,
  loadCharacterModelFromBuffer,
  setCachedPlayerModel,
  setCachedCharacterModel,
} from './core/model-loader';
import {
  loadPersistedEnemyModel,
  loadPersistedPlayerModel,
  loadPersistedCharacterModel,
} from './core/persisted-models';

const STORAGE_RENDER_MODE = '007remix_enemy_render_mode';

function getRenderMode(): '2d' | '3d' {
  try {
    const s = localStorage.getItem(STORAGE_RENDER_MODE);
    if (s === '2d' || s === '3d') return s;
  } catch {
    // ignore storage access failures
  }
  return '3d';
}

function setRenderMode(mode: '2d' | '3d'): void {
  try {
    localStorage.setItem(STORAGE_RENDER_MODE, mode);
  } catch {
    // ignore storage access failures
  }
  if (mode === '2d') {
    setEnemyRenderConfig({
      mode: 'sprite',
      spriteSource: 'image',
      spriteImageUrl: '/sprites/enemy-guard.png',
    });
  } else {
    setEnemyRenderConfig({ mode: 'model' });
  }
}

function applyRenderModeUI(mode: '2d' | '3d'): void {
  const btn2d = document.getElementById('btn-render-2d');
  const btn3d = document.getElementById('btn-render-3d');
  if (btn2d) btn2d.classList.toggle('active', mode === '2d');
  if (btn3d) btn3d.classList.toggle('active', mode === '3d');
}

function buildRandomGenerationOptions() {
  // Vary room counts per mission so layout size/profile changes each run.
  const minRooms = 5 + Math.floor(Math.random() * 5); // 5..9
  const maxRooms = minRooms + 3 + Math.floor(Math.random() * 6); // min+3..min+8
  const minEnemies = Math.max(2, Math.floor(minRooms * 0.6));
  const maxEnemies = Math.max(minEnemies + 2, Math.floor(maxRooms * 1.4));
  const difficulties: Array<'easy' | 'medium' | 'hard'> = ['easy', 'medium', 'hard'];
  const difficulty = difficulties[Math.floor(Math.random() * difficulties.length)];
  return { minRooms, maxRooms, minEnemies, maxEnemies, difficulty };
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

async function init(): Promise<void> {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  if (!canvas) throw new Error('Canvas not found');

  const physics = await PhysicsWorld.create();
  let activeGame: Game | null = null;

  const activateGame = (game: Game): void => {
    if (activeGame && activeGame !== game) {
      activeGame.stop();
    }
    activeGame = game;
  };

  preloadEnemySpriteSheet('/sprites/enemy-guard.png').catch(() => {
    // Fallback to procedural/baked sprites if PNG is missing.
  });

  // Restore persisted uploaded models (survives reload and keeps dev behavior).
  const customPath = ENEMY_RENDER_CONFIG.customModelPath;
  const customModelReady = (async () => {
    const persisted = await loadPersistedEnemyModel().catch(() => null);
    if (persisted) {
      setEnemyRenderConfig({ customModelPath: undefined });
      try {
        await loadAndCacheEnemyModelFromBuffer(persisted.arrayBuffer, persisted.fileName);
      } catch (e) {
        console.warn('Persisted enemy model failed to restore:', e);
      }
      return;
    }
    if (customPath) {
      await preloadCustomEnemyModel(customPath).catch((err) => {
        console.warn('Custom enemy model failed to load:', err);
      });
    }
  })();

  loadPersistedPlayerModel().then((p) => {
    if (p) {
      setEnemyRenderConfig({ customPlayerModelPath: undefined });
      return loadCharacterModelFromBuffer(p.arrayBuffer, p.fileName)
        .then((char) => setCachedPlayerModel(char))
        .catch((e) => console.warn('Persisted player model failed:', e));
    }
  }).catch(() => {});

  loadPersistedCharacterModel().then((p) => {
    if (p) {
      setEnemyRenderConfig({ customCharacterModelPath: undefined });
      return loadCharacterModelFromBuffer(p.arrayBuffer, p.fileName)
        .then((char) => setCachedCharacterModel(char))
        .catch((e) => console.warn('Persisted character model failed:', e));
    }
  }).catch(() => {});

  const playerPath = ENEMY_RENDER_CONFIG.customPlayerModelPath;
  let customPlayerModelReady: Promise<void> = Promise.resolve();
  if (playerPath) {
    customPlayerModelReady = preloadCustomPlayerModel(playerPath)
      .then(() => {})
      .catch((err) => {
        console.warn('Custom player model failed to load:', err);
      });
  }

  const initialMode = getRenderMode();
  setRenderMode(initialMode);
  applyRenderModeUI(initialMode);
  document.getElementById('btn-render-2d')?.addEventListener('click', () => {
    setRenderMode('2d');
    applyRenderModeUI('2d');
  });
  document.getElementById('btn-render-3d')?.addEventListener('click', () => {
    setRenderMode('3d');
    applyRenderModeUI('3d');
  });

  // Create CCTV background for main menu
  const cctvPhysics = await PhysicsWorld.create();
  const cctvBackground = new CCTVBackground(cctvPhysics);
  cctvBackground.start();

  // Create screen glitch effect for CCTV feed
  const screenGlitch = new ScreenGlitch();
  screenGlitch.start();

  // Helper to hide CCTV background and show game canvas
  const hideCCTVBackground = () => {
    const cctvCanvas = document.getElementById('cctv-render-canvas');
    if (cctvCanvas) {
      cctvCanvas.style.display = 'none';
    }
    cctvBackground.stop();
    screenGlitch.stop();
    
    // Show game canvas
    canvas.style.display = 'block';
  };

  // Helper to show CCTV background and hide game canvas
  const showCCTVBackground = () => {
    const cctvCanvas = document.getElementById('cctv-render-canvas');
    if (cctvCanvas) {
      cctvCanvas.style.display = 'block';
    }
    cctvBackground.start();
    screenGlitch.start();
    
    // Hide game canvas
    canvas.style.display = 'none';
  };

  // Quick Play: single-room test scene (matches pulled dev behavior)
  document.getElementById('btn-quick-play')!.addEventListener('click', async () => {
    await customModelReady;
    const game = new Game(canvas, physics, {});
    activateGame(game);
    document.getElementById('start-screen')!.style.display = 'none';
    hideCCTVBackground();
    game.start();
  });

  // Mission: load facility, briefing, then play
  const missionBtn = document.getElementById('btn-mission');

  if (missionBtn) {
    missionBtn.addEventListener('click', async () => {
      const btn = missionBtn as HTMLButtonElement;
      const origText = btn.textContent;
      btn.textContent = 'LOADING...';
      btn.disabled = true;
      try {
        await customModelReady;
        const level = await loadLevel('/levels/facility.json');
        const game = new Game(canvas, physics, { levelMode: true });
        activateGame(game);
        document.getElementById('start-screen')!.style.display = 'none';
        hideCCTVBackground();
        game.showBriefing(level);
        game.onMissionComplete = () => {
          document.getElementById('mission-complete')!.style.display = 'flex';
        };
      } catch (err) {
        console.error('Mission load failed:', err);
        btn.textContent = origText ?? 'MISSION – FACILITY';
        btn.disabled = false;
        alert('Could not load mission. Make sure you run with "npm run dev" so /levels/facility.json is served.');
      }
    });
  }

  // Random Level: generate and play a new procedural level
  const randomLevelBtn = document.getElementById('btn-random-level');
  if (randomLevelBtn) {
    randomLevelBtn.addEventListener('click', async () => {
      const btn = randomLevelBtn as HTMLButtonElement;
      const origText = btn.textContent;
      btn.textContent = 'GENERATING...';
      btn.disabled = true;
      
      try {
        await customModelReady;
        console.log('[Main] Generating random level...');
        await nextFrame();

        // Generate with a fresh seed and varied bounds each click.
        const seed = (Date.now() ^ Math.floor(performance.now() * 1000) ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
        const generator = new LevelGenerator(seed);
        const level = generator.generate(buildRandomGenerationOptions());
        
        console.log(`[Main] Level generated: ${level.name}`);
        console.log(`[Main] - Rooms: ${level.rooms.length}`);
        console.log(`[Main] - Enemies: ${level.enemies.length}`);
        console.log(`[Main] - Props: ${level.props?.length ?? 0}`);
        console.log(`[Main] - Pickups: ${level.pickups.length}`);
        
        // Create game with level
        const game = new Game(canvas, physics, { levelMode: true });
        activateGame(game);
        game.onMissionComplete = () => {
          document.getElementById('mission-complete')!.style.display = 'flex';
        };
        
        // Hide start screen and CCTV BEFORE showing briefing
        const startScreen = document.getElementById('start-screen');
        if (startScreen) {
          startScreen.style.display = 'none';
        }
        hideCCTVBackground();

        // Spread heavy work over upcoming frames while briefing is visible.
        const preloadPromise = (async () => {
          await nextFrame();
          game.loadLevel(level);
          await nextFrame();
          game.prewarmForGameplay();
        })();
        
        // Show briefing (will be immediately visible)
        game.showBriefing(level, {
          beforeStart: async () => {
            await preloadPromise;
          },
        });
        
        // Reset button
        btn.textContent = origText ?? 'RANDOM LEVEL';
        btn.disabled = false;
        
      } catch (err) {
        // Show error and restore UI
        if (err instanceof Error) {
          console.error('Random level generation failed:', err.message);
          console.error(err.stack);
        } else {
          console.error('Random level generation failed:', err);
        }
        
        // Restore start screen and CCTV
        const startScreen = document.getElementById('start-screen');
        if (startScreen) {
          startScreen.style.display = 'flex';
        }
        showCCTVBackground();
        
        btn.textContent = origText ?? 'RANDOM LEVEL';
        btn.disabled = false;
        alert('Could not generate random level. Please try again.');
      }
    });
  }

  // Multiplayer: show lobby first, then connect
  const settingsMenu = new SettingsMenu();
  settingsMenu.onBack = () => {
    settingsMenu.hide();
    setRenderMode(getRenderMode());
    applyRenderModeUI(getRenderMode());
    const startScreen = document.getElementById('start-screen');
    if (startScreen) startScreen.style.display = 'flex';
  };
  document.getElementById('btn-settings')?.addEventListener('click', () => {
    const startScreen = document.getElementById('start-screen');
    if (startScreen) startScreen.style.display = 'none';
    settingsMenu.show();
  });

  // Custom Models: restore dev behavior and keep menu flow.
  const characterModelsScreen = new CharacterModelsScreen();
  characterModelsScreen.onBack = () => {
    characterModelsScreen.hide();
    setRenderMode(getRenderMode());
    applyRenderModeUI(getRenderMode());
    const startScreen = document.getElementById('start-screen');
    if (startScreen) startScreen.style.display = 'flex';
  };
  document.getElementById('btn-models')?.addEventListener('click', () => {
    const startScreen = document.getElementById('start-screen');
    if (startScreen) startScreen.style.display = 'none';
    characterModelsScreen.show();
  });

  // Multiplayer: show lobby first, then connect
  const lobbyScreen = new LobbyScreen();
  const multiplayerBtn = document.getElementById('btn-multiplayer');
  if (multiplayerBtn) {
    multiplayerBtn.addEventListener('click', () => {
      document.getElementById('start-screen')!.style.display = 'none';
      lobbyScreen.show({
        onJoin: async (username) => {
          try {
            await customModelReady;
            if (ENEMY_RENDER_CONFIG.customPlayerModelPath) {
              await customPlayerModelReady;
            }
            const networkManager = new NetworkManager(username);
            await networkManager.connect();

            console.log('[Main] Connected to server as:', networkManager.playerId);

            lobbyScreen.hide();
            hideCCTVBackground();

            const game = new Game(canvas, physics, {
              networkMode: 'client',
              networkManager,
            });
            activateGame(game);
            game.start();
          } catch (err) {
            console.error('[Main] Multiplayer connection failed:', err);
            lobbyScreen.setStatus('Connection failed. Is the server running? (npm run server)');
            lobbyScreen.setJoinEnabled(true);
          }
        },
        onBack: () => {
          lobbyScreen.hide();
          document.getElementById('start-screen')!.style.display = 'flex';
        },
      });
    });
  }

  // Mission Complete screen handlers
  const nextLevelBtn = document.getElementById('btn-next-level');
  if (nextLevelBtn) {
    nextLevelBtn.addEventListener('click', async () => {
      document.getElementById('mission-complete')!.style.display = 'none';
      const btn = nextLevelBtn as HTMLButtonElement;
      const origText = btn.textContent;
      btn.textContent = 'GENERATING...';
      btn.disabled = true;
      
      try {
        await customModelReady;
        console.log('[Main] Generating next level...');
        await nextFrame();

        const seed = (Date.now() ^ Math.floor(performance.now() * 1000) ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
        const generator = new LevelGenerator(seed);
        const level = generator.generate(buildRandomGenerationOptions());
        
        console.log(`[Main] Next level generated: ${level.name}`);
        
        const game = new Game(canvas, physics, { levelMode: true });
        activateGame(game);
        game.onMissionComplete = () => {
          document.getElementById('mission-complete')!.style.display = 'flex';
        };
        const preloadPromise = (async () => {
          await nextFrame();
          game.loadLevel(level);
          await nextFrame();
          game.prewarmForGameplay();
        })();
        
        // Show briefing
        game.showBriefing(level, {
          beforeStart: async () => {
            await preloadPromise;
          },
        });
        
        btn.textContent = origText ?? 'NEXT LEVEL';
        btn.disabled = false;
        
      } catch (err) {
        if (err instanceof Error) {
          console.error('Next level generation failed:', err.message);
          console.error(err.stack);
        } else {
          console.error('Next level generation failed:', err);
        }
        
        btn.textContent = origText ?? 'NEXT LEVEL';
        btn.disabled = false;
        alert('Could not generate next level. Please try again.');
        
        // Return to menu
        document.getElementById('mission-complete')!.style.display = 'none';
        document.getElementById('start-screen')!.style.display = 'flex';
        showCCTVBackground();
      }
    });
  }

  const returnMenuBtn = document.getElementById('btn-return-menu');
  if (returnMenuBtn) {
    returnMenuBtn.addEventListener('click', () => {
      document.getElementById('mission-complete')!.style.display = 'none';
      document.getElementById('start-screen')!.style.display = 'flex';
      showCCTVBackground();
    });
  }
}

init().catch((err) => {
  console.error('Init failed:', err);
  const startScreen = document.getElementById('start-screen');
  if (startScreen) {
    const errDiv = document.createElement('div');
    errDiv.style.cssText = 'color:#ff4444;font-size:14px;margin-top:20px;max-width:600px;word-break:break-word;';
    errDiv.textContent = `Error: ${err?.message ?? err}`;
    startScreen.appendChild(errDiv);
  }
});
