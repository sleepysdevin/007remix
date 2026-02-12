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
import { CCTVBackground } from './ui/cctv-background';
import { ScreenGlitch } from './ui/screen-glitch';
import { NetworkManager } from './network/network-manager';
import { LobbyScreen } from './ui/lobby-screen';

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

  // Quick Play: single room, click to start
  document.getElementById('btn-quick-play')!.addEventListener('click', () => {
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
        console.log('[Main] Generating random level...');
        
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
        
        // Show briefing (will be immediately visible)
        game.showBriefing(level);
        
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
  const lobbyScreen = new LobbyScreen();
  const multiplayerBtn = document.getElementById('btn-multiplayer');
  if (multiplayerBtn) {
    multiplayerBtn.addEventListener('click', () => {
      document.getElementById('start-screen')!.style.display = 'none';
      lobbyScreen.show({
        onJoin: async (username) => {
          try {
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
        console.log('[Main] Generating next level...');
        
        const seed = (Date.now() ^ Math.floor(performance.now() * 1000) ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
        const generator = new LevelGenerator(seed);
        const level = generator.generate(buildRandomGenerationOptions());
        
        console.log(`[Main] Next level generated: ${level.name}`);
        
        const game = new Game(canvas, physics, { levelMode: true });
        activateGame(game);
        game.onMissionComplete = () => {
          document.getElementById('mission-complete')!.style.display = 'flex';
        };
        
        // Show briefing
        game.showBriefing(level);
        
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
