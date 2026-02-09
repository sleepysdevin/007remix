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

async function init(): Promise<void> {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  if (!canvas) throw new Error('Canvas not found');

  const physics = await PhysicsWorld.create();

  // Quick Play: single room, click to start
  document.getElementById('btn-quick-play')!.addEventListener('click', () => {
    const game = new Game(canvas, physics, {});
    document.getElementById('start-screen')!.style.display = 'none';
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
        const level = await loadLevel('/levels/facility.json');
        const game = new Game(canvas, physics, { levelMode: true });
        game.showBriefing(level);
        game.onMissionComplete = () => {
          document.getElementById('mission-complete')!.style.display = 'flex';
        };
        canvas.addEventListener('click', () => game.start());
      } catch (err) {
        console.error('Mission load failed:', err);
        btn.textContent = origText ?? 'MISSION — FACILITY';
        btn.disabled = false;
        alert('Could not load mission. Make sure you run with "npm run dev" so /levels/facility.json is served.');
      }
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
