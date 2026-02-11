import * as THREE from 'three';

export interface NameTagTarget {
  id: string;
  username: string;
  getPosition(): THREE.Vector3;
  isDead?: boolean;
}

/**
 * Renders floating name tags above remote players.
 * Projects 3D positions to screen space each frame.
 */
export class NameTagManager {
  private container: HTMLDivElement;
  private tags: Map<string, HTMLDivElement> = new Map();
  private camera: THREE.PerspectiveCamera;
  private readonly tagOffset = new THREE.Vector3(0, 1.8, 0); // Above head (model root at feet)

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.container = document.createElement('div');
    this.container.id = 'name-tags';
    this.container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 50;
    `;
    document.body.appendChild(this.container);
  }

  /**
   * Update name tags for all targets. Call each frame.
   */
  update(targets: NameTagTarget[]): void {
    const toRemove = new Set(this.tags.keys());
    const pos = new THREE.Vector3();
    const proj = new THREE.Vector3();

    for (const target of targets) {
      toRemove.delete(target.id);

      if (target.isDead) continue;

      // Get head position (above player center)
      pos.copy(target.getPosition()).add(this.tagOffset);

      // Project to NDC
      proj.copy(pos).project(this.camera);

      let tag = this.tags.get(target.id);
      if (!tag) {
        tag = this.createTag(target.username);
        this.tags.set(target.id, tag);
        this.container.appendChild(tag);
      }

      tag.textContent = target.username;

      // Behind camera - hide
      if (proj.z > 1) {
        tag.style.visibility = 'hidden';
        continue;
      }

      // Convert NDC (-1 to 1) to screen pixels
      const x = (proj.x * 0.5 + 0.5) * window.innerWidth;
      const y = (1 - (proj.y * 0.5 + 0.5)) * window.innerHeight;

      // Only show if on screen
      const margin = 20;
      if (x < -margin || x > window.innerWidth + margin || y < -margin || y > window.innerHeight + margin) {
        tag.style.visibility = 'hidden';
      } else {
        tag.style.visibility = 'visible';
        tag.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      }
    }

    // Remove tags for players that left
    for (const id of toRemove) {
      const tag = this.tags.get(id);
      if (tag?.parentNode) tag.parentNode.removeChild(tag);
      this.tags.delete(id);
    }
  }

  private createTag(username: string): HTMLDivElement {
    const tag = document.createElement('div');
    tag.style.cssText = `
      position: absolute;
      left: 0;
      top: 0;
      padding: 4px 10px;
      background: rgba(0, 0, 0, 0.75);
      border: 1px solid rgba(212, 175, 55, 0.5);
      color: #c4b896;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      white-space: nowrap;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
    `;
    tag.textContent = username;
    return tag;
  }

  dispose(): void {
    this.tags.clear();
    document.body.removeChild(this.container);
  }
}
