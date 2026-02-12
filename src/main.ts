// Patch Three.js Object3D to make position/rotation/quaternion/scale writable.
// Fixes conflict with browser extensions (e.g. React DevTools) that use
// Object.assign on Three.js objects — Object.assign fails on non-writable props.
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
import { loadLevel } from './levels/level-loader';
import { CCTVBackground } from './ui/cctv-background';
import { ScreenGlitch } from './ui/screen-glitch';
import { NetworkManager } from './network/network-manager';
import { LobbyScreen } from './ui/lobby-screen';
import { SettingsMenu } from './ui/settings-menu';
import { CharacterModelsScreen } from './ui/character-models-screen';
import { setEnemyRenderConfig, ENEMY_RENDER_CONFIG } from './enemies/enemy-render-config';
import { preloadEnemySpriteSheet } from './enemies/sprite/guard-sprite-sheet';
import { preloadCustomEnemyModel, preloadCustomPlayerModel, loadAndCacheEnemyModelFromBuffer, loadCharacterModelFromBuffer, setCachedPlayerModel, setCachedCharacterModel } from './core/model-loader';
import { loadPersistedEnemyModel, loadPersistedPlayerModel, loadPersistedCharacterModel } from './core/persisted-models';

const STORAGE_RENDER_MODE = '007remix_enemy_render_mode';

function getRenderMode(): '2d' | '3d' {
  try {
    const s = localStorage.getItem(STORAGE_RENDER_MODE);
    if (s === '2d' || s === '3d') return s;
  } catch {}
  return '3d';
}

function setRenderMode(mode: '2d' | '3d'): void {
  try {
    localStorage.setItem(STORAGE_RENDER_MODE, mode);
  } catch {}
  if (mode === '2d') {
    setEnemyRenderConfig({ mode: 'sprite', spriteSource: 'image', spriteImageUrl: '/sprites/enemy-guard.png' });
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

async function init(): Promise<void> {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  if (!canvas) throw new Error('Canvas not found');

  const physics = await PhysicsWorld.create();

  // Preload 2D sprite sheet (for when user selects 2D)
  preloadEnemySpriteSheet('/sprites/enemy-guard.png').catch(() => {
    // Fallback: baked PNG may not exist; runtime bake will be used
  });

  // Restore persisted uploaded models (survives reload, works in 2D and 3D)
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
      return loadCharacterModelFromBuffer(p.arrayBuffer, p.fileName).then((char) => {
        setCachedPlayerModel(char);
      }).catch((e) => console.warn('Persisted player model failed:', e));
    }
  }).catch(() => {});

  loadPersistedCharacterModel().then((p) => {
    if (p) {
      setEnemyRenderConfig({ customCharacterModelPath: undefined });
      return loadCharacterModelFromBuffer(p.arrayBuffer, p.fileName).then((char) => {
        setCachedCharacterModel(char);
      }).catch((e) => console.warn('Persisted character model failed:', e));
    }
  }).catch(() => {});

  // Preload custom player model (for remote player avatars in multiplayer)
  const playerPath = ENEMY_RENDER_CONFIG.customPlayerModelPath;
  let customPlayerModelReady: Promise<void> = Promise.resolve();
  if (playerPath) {
    customPlayerModelReady = preloadCustomPlayerModel(playerPath)
      .then(() => {})
      .catch((err) => {
        console.warn('Custom player model failed to load:', err);
      });
  }

  // Apply saved render mode and set up 2D/3D toggle
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

  // Helper to hide CCTV background
  const hideCCTVBackground = () => {
    const cctvCanvas = document.getElementById('cctv-render-canvas');
    if (cctvCanvas) {
      cctvCanvas.style.display = 'none';
    }
    cctvBackground.stop();
    screenGlitch.stop();
  };

  // Quick Play: single room, click to start
  document.getElementById('btn-quick-play')!.addEventListener('click', async () => {
    await customModelReady;
    const game = new Game(canvas, physics, {});
    document.getElementById('start-screen')!.style.display = 'none';
    hideCCTVBackground();
    game.start();
    canvas.addEventListener('click', () => game.start());
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
        game.showBriefing(level);
        game.onMissionComplete = () => {
          document.getElementById('mission-complete')!.style.display = 'flex';
        };
        canvas.addEventListener('click', () => {
          document.getElementById('start-screen')!.style.display = 'none';
          hideCCTVBackground();
          game.start();
        });
      } catch (err) {
        console.error('Mission load failed:', err);
        btn.textContent = origText ?? 'MISSION — FACILITY';
        btn.disabled = false;
        alert('Could not load mission. Make sure you run with "npm run dev" so /levels/facility.json is served.');
      }
    });
  }

  // Custom Models: accessible from main menu
  const characterModelsScreen = new CharacterModelsScreen();
  characterModelsScreen.onBack = () => {
    characterModelsScreen.hide();
    setRenderMode(getRenderMode()); // Re-sync so uploaded-model doesn't override 2D/3D choice
    document.getElementById('start-screen')!.style.display = 'flex';
  };
  document.getElementById('btn-models')?.addEventListener('click', () => {
    document.getElementById('start-screen')!.style.display = 'none';
    characterModelsScreen.show();
  });

  // Settings: accessible from main menu
  const settingsMenu = new SettingsMenu();
  settingsMenu.onBack = () => {
    settingsMenu.hide();
    setRenderMode(getRenderMode()); // Re-sync so uploaded-model doesn't override 2D/3D choice
    document.getElementById('start-screen')!.style.display = 'flex';
  };
  document.getElementById('btn-settings')?.addEventListener('click', () => {
    document.getElementById('start-screen')!.style.display = 'none';
    settingsMenu.show();
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
            if (ENEMY_RENDER_CONFIG.customPlayerModelPath) await customPlayerModelReady;
            const networkManager = new NetworkManager(username);
            await networkManager.connect();

            console.log('[Main] Connected to server as:', networkManager.playerId);

            lobbyScreen.hide();
            hideCCTVBackground();

            const game = new Game(canvas, physics, {
              networkMode: 'client',
              networkManager,
            });
            game.start();
            canvas.addEventListener('click', () => game.start());
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
