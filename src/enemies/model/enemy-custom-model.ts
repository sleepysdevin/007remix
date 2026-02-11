/**
 * Custom 3D enemy model from loaded GLB or VRM.
 * Same interface as EnemyModel: mesh, shadowMesh, update(), play(), triggerHitFlash().
 * Uses animation clips when present; otherwise stays in default pose.
 * Uses SkeletonUtils.clone for proper per-instance skeleton (required for animation).
 */

import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { LoadedCharacter } from '../../core/model-loader';

const TARGET_HEIGHT = 1.7;

function getSceneAndAnimations(char: LoadedCharacter): { scene: THREE.Group; animations: THREE.AnimationClip[] } {
  return { scene: char.scene, animations: char.animations };
}

function collectMeshes(obj: THREE.Object3D, out: THREE.Mesh[]): void {
  if (obj instanceof THREE.Mesh && obj.material) {
    out.push(obj);
  }
  obj.children.forEach((c) => collectMeshes(c, out));
}

function fixMaterials(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh && child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) {
        if (mat instanceof THREE.Material) {
          mat.side = THREE.DoubleSide;
          mat.depthWrite = true;
          if (mat instanceof THREE.MeshStandardMaterial) {
            if (mat.color.getHex() === 0 && mat.emissive.getHex() === 0) mat.emissive.setHex(0x333333);
          }
        }
      }
    }
  });
}

function findSkinnedMesh(obj: THREE.Object3D): THREE.SkinnedMesh | null {
  if (obj instanceof THREE.SkinnedMesh) return obj;
  for (const c of obj.children) {
    const found = findSkinnedMesh(c);
    if (found) return found;
  }
  return null;
}

export class EnemyCustomModel {
  readonly mesh: THREE.Group;
  readonly shadowMesh: THREE.Mesh;

  private hitFlashMeshes: THREE.Mesh[] = [];
  private hitTintTimer = 0;
  private mixer: THREE.AnimationMixer | null = null;
  private clipMap = new Map<string, { clip: THREE.AnimationClip; duration: number }>();
  private currentAction: THREE.AnimationAction | null = null;

  constructor(char: LoadedCharacter) {
    const { scene, animations } = getSceneAndAnimations(char);
    try {
      this.mesh = cloneSkinned(scene) as THREE.Group;
    } catch {
      this.mesh = scene.clone(true);
    }
    fixMaterials(this.mesh);

    // VRM uses layers 9/10 by default — force layer 0 so camera sees the model
    this.mesh.traverse((child) => child.layers.set(0));

    // VRM/GLB typically faces -Z; our facing uses +Z forward — rotate 180° so model faces correct way
    this.mesh.rotation.y = Math.PI;

    const box = new THREE.Box3().setFromObject(this.mesh);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale = TARGET_HEIGHT / Math.max(size.y, 0.01);
    this.mesh.scale.setScalar(scale);
    this.mesh.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);

    collectMeshes(this.mesh, this.hitFlashMeshes);
    for (const m of this.hitFlashMeshes) {
      const mat = m.material as THREE.MeshStandardMaterial;
      if (mat?.color) {
        (m.userData as Record<string, number>).originalColor = mat.color.getHex();
      }
    }

    if (animations?.length) {
      const skinnedMesh = findSkinnedMesh(this.mesh);
      const mixerRoot = skinnedMesh ?? this.mesh;
      this.mixer = new THREE.AnimationMixer(mixerRoot);
      const first = animations[0];
      const fallback = { clip: first, duration: first.duration };
      for (const clip of animations) {
        const nm = clip.name.toLowerCase().replace(/\s+/g, '_');
        if (!this.clipMap.has(nm)) this.clipMap.set(nm, { clip, duration: clip.duration });
        if (/\bidle\b|stand|default|pose|bind|tpose|t-pose|breathing/i.test(clip.name)) this.clipMap.set('idle', { clip, duration: clip.duration });
        if (/\bwalk\b|locomotion|move|forward|run\b/i.test(clip.name)) this.clipMap.set('walk', { clip, duration: clip.duration });
        if (/\bdeath\b|die|dead|dying/i.test(clip.name)) this.clipMap.set('death', { clip, duration: clip.duration });
        if (/\b(attack|shoot|fire|aim|aiming)\b/i.test(clip.name)) {
          this.clipMap.set('shoot', { clip, duration: clip.duration });
          this.clipMap.set('alert', { clip, duration: clip.duration });
        }
        if (/\bhit\b|hurt|damage|recoil/i.test(clip.name)) this.clipMap.set('hit', { clip, duration: clip.duration });
        if (/\brun\b/i.test(clip.name) && !this.clipMap.has('walk')) this.clipMap.set('walk', { clip, duration: clip.duration });
      }
      if (!this.clipMap.has('idle')) this.clipMap.set('idle', fallback);
      if (!this.clipMap.has('walk')) this.clipMap.set('walk', fallback);
    }

    const shadowGeo = new THREE.PlaneGeometry(0.8, 0.4);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    });
    this.shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    this.shadowMesh.position.y = 0.02;
  }

  update(dt: number): void {
    if (this.mixer) {
      this.mixer.update(dt);
    }
    if (this.hitTintTimer > 0) {
      this.hitTintTimer -= dt;
      for (const m of this.hitFlashMeshes) {
        const mat = m.material as THREE.MeshStandardMaterial;
        if (mat?.color) mat.color.setHex(0xff4444);
      }
    } else {
      for (const m of this.hitFlashMeshes) {
        const orig = (m.userData as Record<string, number>).originalColor;
        const mat = m.material as THREE.MeshStandardMaterial;
        if (typeof orig === 'number' && mat?.color) {
          mat.color.setHex(orig);
        }
      }
    }
  }

  triggerHitFlash(): void {
    this.hitTintTimer = 0.12;
  }

  play(name: string, force = false): void {
    if (!this.mixer) return;
    const key = name.toLowerCase();
    let entry = this.clipMap.get(key);
    if (!entry) {
      entry = this.clipMap.get(key === 'alert' ? 'shoot' : key === 'shoot' ? 'attack' : key);
    }
    if (!entry) return;
    if (this.currentAction?.getClip().name === entry.clip.name && !force) return;
    this.currentAction?.stop();
    this.currentAction = this.mixer.clipAction(entry.clip);
    this.currentAction.reset();
    this.currentAction.setLoop(name === 'death' || name === 'hit' ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    this.currentAction.clampWhenFinished = name === 'death' || name === 'hit';
    this.currentAction.play();
  }
}
