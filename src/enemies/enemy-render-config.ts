/**
 * Config for enemy rendering: 3D model vs 2D sprite, and sprite source.
 *
 * To use 2D sprites, call setEnemyRenderConfig before spawning:
 *   setEnemyRenderConfig({ mode: 'sprite', spriteSource: 'baked' });  // runtime 3D→2D
 *   setEnemyRenderConfig({ mode: 'sprite', spriteSource: 'procedural' });  // Canvas 2D
 *   // For image: preloadEnemySpriteSheet('/sprites/enemy-guard.png') at init, then:
 *   setEnemyRenderConfig({ mode: 'sprite', spriteSource: 'image', spriteImageUrl: '/sprites/enemy-guard.png' });
 */

export type EnemyRenderMode = 'model' | 'sprite';

export type SpriteSource = 'procedural' | 'baked' | 'image';

export interface EnemyRenderConfig {
  /** Use 2D billboard sprites instead of 3D models */
  mode: EnemyRenderMode;
  /** When mode is 'sprite': procedural (Canvas), baked (runtime 3D→2D), or image (PNG) */
  spriteSource: SpriteSource;
  /** When spriteSource is 'image': URL to sprite sheet (e.g. '/sprites/enemy-guard.png') */
  spriteImageUrl?: string;
  /** When mode is 'model': path to custom GLB or VRM (e.g. 'enemies/void_4003GasMask.glb', 'characters/agent.vrm'). Omit for procedural. */
  customModelPath?: string;
  /** Path to custom player/remote avatar model (GLB or VRM). Omit for procedural. */
  customPlayerModelPath?: string;
  /** Folder with standalone animation GLBs (idle.glb, walk.glb, run.glb, death.glb, attack.glb, hit.glb). Uses Mixamo bone names; retargets to VRM. */
  customAnimationsPath?: string;
}

export const ENEMY_RENDER_CONFIG: EnemyRenderConfig = {
  mode: 'model',
  spriteSource: 'procedural',
  customModelPath: 'enemies/voyager_1262MOTU.vrm',
  customAnimationsPath: 'animations',
};

export function setEnemyRenderConfig(config: Partial<EnemyRenderConfig>): void {
  if (config.mode !== undefined) ENEMY_RENDER_CONFIG.mode = config.mode;
  if (config.spriteSource !== undefined) ENEMY_RENDER_CONFIG.spriteSource = config.spriteSource;
  if (config.spriteImageUrl !== undefined) ENEMY_RENDER_CONFIG.spriteImageUrl = config.spriteImageUrl;
  if (config.customModelPath !== undefined) ENEMY_RENDER_CONFIG.customModelPath = config.customModelPath;
  if (config.customPlayerModelPath !== undefined) ENEMY_RENDER_CONFIG.customPlayerModelPath = config.customPlayerModelPath;
  if (config.customAnimationsPath !== undefined) ENEMY_RENDER_CONFIG.customAnimationsPath = config.customAnimationsPath;
}
