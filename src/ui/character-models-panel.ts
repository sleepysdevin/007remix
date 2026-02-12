/**
 * Character Models panel — drag-and-drop VRM/GLB for enemies, player, and character.
 */

import {
  loadAndCacheEnemyModelFromBuffer,
  loadCharacterModelFromBuffer,
  preloadCustomEnemyModel,
  setCachedPlayerModel,
  setCachedCharacterModel,
  clearCachedEnemyModel,
  clearCachedPlayerModel,
  clearCachedCharacterModel,
  getCachedEnemyModel,
  getCachedPlayerModel,
  getCachedCharacterModel,
} from '../core/model-loader';
import {
  persistEnemyModel,
  persistPlayerModel,
  persistCharacterModel,
  clearPersistedEnemyModel,
  clearPersistedPlayerModel,
  clearPersistedCharacterModel,
} from '../core/persisted-models';
import { setEnemyRenderConfig, DEFAULT_ENEMY_MODEL_PATH } from '../enemies/enemy-render-config';

type ModelSlot = 'enemy' | 'player' | 'character';

const ACCEPT_TYPES = '.vrm,.glb,.gltf';

function createDropZone(
  label: string,
  slot: ModelSlot,
  onUpdate: () => void,
): HTMLDivElement {
  const getCached = () => {
    if (slot === 'enemy') return getCachedEnemyModel();
    if (slot === 'player') return getCachedPlayerModel();
    return getCachedCharacterModel();
  };

  const statusEl = document.createElement('div');
  statusEl.style.cssText = 'font-size: 11px; color: rgba(255,255,255,0.6); margin-top: 4px;';

  const updateStatus = () => {
    const cached = getCached();
    statusEl.textContent = cached ? 'Custom model loaded' : 'Default model';
  };

  const zone = document.createElement('div');
  zone.style.cssText = `
    padding: 16px;
    margin-bottom: 12px;
    background: rgba(0,0,0,0.3);
    border: 2px dashed rgba(212, 175, 55, 0.4);
    border-radius: 4px;
    text-align: center;
    cursor: pointer;
    transition: border-color 0.2s, background 0.2s;
  `;
  zone.dataset.slot = slot;

  const labelEl = document.createElement('div');
  labelEl.style.cssText = 'font-size: 12px; letter-spacing: 2px; margin-bottom: 4px;';
  labelEl.textContent = label;
  zone.appendChild(labelEl);

  const hint = document.createElement('div');
  hint.style.cssText = 'font-size: 11px; color: rgba(255,255,255,0.5);';
  hint.textContent = 'Drop VRM/GLB here or click to browse';
  zone.appendChild(hint);
  zone.appendChild(statusEl);

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = ACCEPT_TYPES;
  input.style.display = 'none';

  const handleFile = async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !['vrm', 'glb', 'gltf'].includes(ext)) {
      statusEl.textContent = 'Invalid: use .vrm, .glb, or .gltf';
      statusEl.style.color = '#e44';
      return;
    }
    statusEl.textContent = 'Loading…';
    statusEl.style.color = 'rgba(255,255,255,0.6)';
    try {
      const buf = await file.arrayBuffer();
      if (slot === 'enemy') {
        setEnemyRenderConfig({ customModelPath: undefined });
        await loadAndCacheEnemyModelFromBuffer(buf, file.name);
        persistEnemyModel(buf, file.name).catch(() => {});
      } else if (slot === 'player') {
        setEnemyRenderConfig({ customPlayerModelPath: undefined });
        const char = await loadCharacterModelFromBuffer(buf, file.name);
        setCachedPlayerModel(char);
        persistPlayerModel(buf, file.name).catch(() => {});
      } else {
        setEnemyRenderConfig({ customCharacterModelPath: undefined });
        const char = await loadCharacterModelFromBuffer(buf, file.name);
        setCachedCharacterModel(char);
        persistCharacterModel(buf, file.name).catch(() => {});
      }
      updateStatus();
      onUpdate();
    } catch (e) {
      statusEl.textContent = `Error: ${(e as Error).message}`;
      statusEl.style.color = '#e44';
    }
  };

  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.style.borderColor = 'rgba(212, 175, 55, 0.8)';
    zone.style.background = 'rgba(212, 175, 55, 0.08)';
  });
  zone.addEventListener('dragleave', () => {
    zone.style.borderColor = 'rgba(212, 175, 55, 0.4)';
    zone.style.background = 'rgba(0,0,0,0.3)';
  });
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.style.borderColor = 'rgba(212, 175, 55, 0.4)';
    zone.style.background = 'rgba(0,0,0,0.3)';
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  });
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) handleFile(file);
    input.value = '';
  });

  const clearBtn = document.createElement('button');
  clearBtn.textContent = 'Use default';
  clearBtn.style.cssText = `
    margin-top: 8px;
    padding: 4px 12px;
    font-size: 10px;
    font-family: 'Courier New', monospace;
    letter-spacing: 1px;
    background: transparent;
    color: rgba(255,255,255,0.6);
    border: 1px solid rgba(212, 175, 55, 0.4);
    cursor: pointer;
  `;
  clearBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (slot === 'enemy') {
      clearCachedEnemyModel();
      setEnemyRenderConfig({ customModelPath: DEFAULT_ENEMY_MODEL_PATH });
      clearPersistedEnemyModel().catch(() => {});
      preloadCustomEnemyModel(DEFAULT_ENEMY_MODEL_PATH).catch(() => {}).then(() => {
        updateStatus();
        onUpdate();
      });
    } else {
      if (slot === 'player') {
        clearCachedPlayerModel();
        setEnemyRenderConfig({ customPlayerModelPath: undefined });
        clearPersistedPlayerModel().catch(() => {});
      } else {
        clearCachedCharacterModel();
        setEnemyRenderConfig({ customCharacterModelPath: undefined });
        clearPersistedCharacterModel().catch(() => {});
      }
      updateStatus();
      onUpdate();
    }
  });
  zone.appendChild(clearBtn);

  updateStatus();
  return zone;
}

export function createCharacterModelsPanel(onModelsChanged: () => void): HTMLDivElement {
  const section = document.createElement('div');
  section.style.cssText = `
    padding: 16px 24px;
    background: rgba(0,0,0,0.4);
    border: 1px solid rgba(212, 175, 55, 0.3);
    border-radius: 4px;
    min-width: 280px;
  `;

  const title = document.createElement('div');
  title.style.cssText = 'font-size: 12px; letter-spacing: 2px; margin-bottom: 12px;';
  title.textContent = 'CUSTOM MODELS (VRM / GLB)';
  section.appendChild(title);

  const desc = document.createElement('p');
  desc.style.cssText = 'font-size: 11px; color: rgba(255,255,255,0.6); margin-bottom: 16px; line-height: 1.4;';
  desc.textContent = 'Drag and drop or click to upload. Works in 2D and 3D modes. Omit to use default guard/player models.';
  section.appendChild(desc);

  section.appendChild(createDropZone('ENEMIES', 'enemy', onModelsChanged));
  section.appendChild(createDropZone('PLAYER', 'player', onModelsChanged));
  section.appendChild(createDropZone('CHARACTER', 'character', onModelsChanged));

  return section;
}
