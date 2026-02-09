import * as THREE from 'three';

export class Renderer {
  readonly instance: THREE.WebGLRenderer;

  constructor(canvas: HTMLCanvasElement) {
    this.instance = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
    });
    this.instance.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.instance.setSize(window.innerWidth, window.innerHeight);
    this.instance.shadowMap.enabled = true;
    this.instance.shadowMap.type = THREE.PCFShadowMap;
    this.instance.toneMapping = THREE.ACESFilmicToneMapping;
    this.instance.toneMappingExposure = 0.9;

    window.addEventListener('resize', this.onResize);
  }

  private onResize = (): void => {
    this.instance.setSize(window.innerWidth, window.innerHeight);
  };

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.instance.render(scene, camera);
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.instance.dispose();
  }
}
