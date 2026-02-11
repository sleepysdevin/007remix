/**
 * 3D model loading via GLTFLoader.
 * Supports GLB/GLTF and VRM (via @pixiv/three-vrm).
 * Models live in public/models/.
 */

import type * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';
import type { VRM } from '@pixiv/three-vrm';

/** Result of loading a GLTF/GLB file */
export interface LoadedGLTF {
  kind: 'gltf';
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
  scenes?: THREE.Group[];
  cameras?: THREE.Camera[];
  asset?: { [key: string]: unknown };
}

/** Result of loading a VRM file */
export interface LoadedVRM {
  kind: 'vrm';
  vrm: VRM;
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

/** Union of loaded character formats */
export type LoadedCharacter = LoadedGLTF | LoadedVRM;

/** Base path for model assets */
export const MODELS_BASE = '/models/';

const gltfLoader = new GLTFLoader();

const vrmLoader = new GLTFLoader();
vrmLoader.register((parser) => new VRMLoaderPlugin(parser));

function toUrl(path: string): string {
  return path.startsWith('/') || path.startsWith('http') ? path : `${MODELS_BASE}${path}`;
}

/**
 * Load a GLB/GLTF model from the models directory.
 */
export function loadModel(path: string): Promise<LoadedGLTF> {
  const url = toUrl(path);
  return new Promise((resolve, reject) => {
    gltfLoader.load(url, (gltf) => {
      resolve({
        kind: 'gltf',
        scene: gltf.scene,
        animations: gltf.animations ?? [],
        scenes: gltf.scenes,
        cameras: gltf.cameras,
        asset: gltf.asset,
      });
    }, undefined, reject);
  });
}

/**
 * Load a VRM model from the models directory.
 */
export function loadVRM(path: string): Promise<LoadedVRM> {
  const url = toUrl(path);
  return new Promise((resolve, reject) => {
    vrmLoader.load(
      url,
      (gltf) => {
        const vrm = gltf.userData.vrm as VRM | undefined;
        if (!vrm?.scene) {
          reject(new Error('VRM loaded but userData.vrm or vrm.scene not found'));
          return;
        }
        resolve({
          kind: 'vrm',
          vrm,
          scene: vrm.scene,
          animations: gltf.animations ?? [],
        });
      },
      undefined,
      reject
    );
  });
}

/**
 * Detect format by extension and load as GLTF or VRM.
 */
export function loadCharacterModel(path: string): Promise<LoadedCharacter> {
  const ext = path.split('.').pop()?.toLowerCase();
  if (ext === 'vrm') return loadVRM(path);
  return loadModel(path);
}

/** Cached custom enemy model (GLTF or VRM) */
let cachedEnemyCharacter: LoadedCharacter | null = null;

/** Cached custom player model for remote players (GLTF or VRM) */
let cachedPlayerCharacter: LoadedCharacter | null = null;

/**
 * Preload a custom enemy model for sync use when spawning.
 * Supports .glb/.gltf and .vrm.
 * If customAnimationsPath is set (via ENEMY_RENDER_CONFIG), loads standalone animations and merges.
 */
export async function preloadCustomEnemyModel(path: string): Promise<LoadedCharacter> {
  const char = await loadCharacterModel(path);
  const animationsPath = (await import('../enemies/enemy-render-config')).ENEMY_RENDER_CONFIG.customAnimationsPath;
  if (animationsPath) {
    try {
      const { loadAndMergeStandaloneAnimations } = await import('./animation-loader');
      const merged = await loadAndMergeStandaloneAnimations(animationsPath, {
        scene: char.scene,
        animations: char.animations,
        vrm: char.kind === 'vrm' ? char.vrm : undefined,
      });
      (char as { animations: THREE.AnimationClip[] }).animations = merged;
      if (merged.length === 0) {
        console.warn('[Animation] No animations loaded — see above for details. Ensure Mixamo exports use "With Skin" and same rig (e.g. X Bot).');
      }
    } catch (e) {
      console.warn('Standalone animations failed to load:', e);
    }
  }
  cachedEnemyCharacter = char;
  return char;
}

/**
 * Preload a custom player model for remote player avatars.
 * Supports .glb/.gltf and .vrm
 */
export function preloadCustomPlayerModel(path: string): Promise<LoadedCharacter> {
  return loadCharacterModel(path).then((char) => {
    cachedPlayerCharacter = char;
    return char;
  });
}

/** Get cached custom enemy model, or null if not loaded. */
export function getCachedEnemyModel(): LoadedCharacter | null {
  return cachedEnemyCharacter;
}

/** Get cached custom player model, or null if not loaded. */
export function getCachedPlayerModel(): LoadedCharacter | null {
  return cachedPlayerCharacter;
}

/** Type guard for LoadedGLTF */
export function isLoadedGLTF(c: LoadedCharacter): c is LoadedGLTF {
  return c.kind === 'gltf';
}

/** Type guard for LoadedVRM */
export function isLoadedVRM(c: LoadedCharacter): c is LoadedVRM {
  return c.kind === 'vrm';
}
