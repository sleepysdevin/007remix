import * as THREE from 'three';
import { PhysicsWorld } from '../core/physics-world';
import {
  concreteWallTexture,
  floorTileTexture,
  ceilingPanelTexture,
  woodCrateTexture,
  metalCrateTexture,
  barrelTexture,
} from '../levels/utils/procedural-textures';

/**
 * CCTV Background System
 * Creates a panning camera feed from the quick play level to use as menu background.
 */
export class CCTVBackground {
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private renderTarget: THREE.WebGLRenderTarget;
  private panAngle = 0;
  private panRadius = 7; // Keep camera inside 20x20 room (walls at ±10)
  private panHeight = 2.5; // Good viewing angle
  private panSpeed = 0.15; // radians per second (slower rotation)
  private animationId: number | null = null;
  private resizeHandler: () => void;
  private lastFrameTime = 0;

  constructor(physics: PhysicsWorld) {
    try {
      console.log('[CCTV] Initializing CCTV background...');
      
      // Create renderer canvas
      const canvas = document.createElement('canvas');
      canvas.id = 'cctv-render-canvas';
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      canvas.style.position = 'fixed';
      canvas.style.top = '0';
      canvas.style.left = '0';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.zIndex = '1';
      canvas.style.objectFit = 'cover';
      canvas.style.display = 'block';
      canvas.style.pointerEvents = 'none'; // Allow clicks to pass through
      document.body.insertBefore(canvas, document.body.firstChild);
      
      console.log('[CCTV] Creating WebGL renderer...');
      this.renderer = new THREE.WebGLRenderer({ 
        canvas, 
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance'
      });
      
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limit for performance
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.15;
      
      console.log('[CCTV] Renderer created successfully');

      // Create render target (for potential future use)
      this.renderTarget = new THREE.WebGLRenderTarget(
        window.innerWidth, 
        window.innerHeight, 
        {
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          format: THREE.RGBAFormat,
        }
      );

      console.log('[CCTV] Creating scene...');
      // Create scene
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x1a1a2e);
      this.scene.fog = new THREE.Fog(0x1a1a2e, 15, 40);

      console.log('[CCTV] Building test scene...');
      // Build the test scene
      this.buildTestScene(physics);

      console.log('[CCTV] Setting up camera...');
      // Create panning camera
      this.camera = new THREE.PerspectiveCamera(
        60, 
        window.innerWidth / window.innerHeight, 
        0.1, 
        50
      );
      this.updateCameraPosition();

      // Handle window resize
      this.resizeHandler = () => {
        if (!this.renderer || !this.camera) return;
        
        const width = window.innerWidth;
        const height = window.innerHeight;
        
        this.renderer.setSize(width, height);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        
        // Update render target size
        this.renderTarget.setSize(width, height);
      };
      
      window.addEventListener('resize', this.resizeHandler);
      
      // Initial resize
      this.resizeHandler();
      
      console.log('[CCTV] CCTV background initialized successfully');
    } catch (error) {
      console.error('[CCTV] Error initializing CCTV background:', error);
      this.cleanup();
      throw error;
    }
  }

  private buildTestScene(physics: PhysicsWorld): void {
    // Ambient light (dim, blue-ish)
    const ambient = new THREE.AmbientLight(0x404060, 0.6);
    this.scene.add(ambient);

    // Main overhead light
    const pointLight = new THREE.PointLight(0xffffee, 40, 35);
    pointLight.position.set(0, 4.5, 0);
    pointLight.castShadow = true;
    pointLight.shadow.mapSize.set(512, 512);
    pointLight.shadow.camera.near = 0.5;
    pointLight.shadow.camera.far = 15;
    this.scene.add(pointLight);

    // Secondary lights in corners
    const cornerLight1 = new THREE.PointLight(0xffe0a0, 20, 22);
    cornerLight1.position.set(-7, 3, -7);
    this.scene.add(cornerLight1);

    const cornerLight2 = new THREE.PointLight(0xa0d0ff, 20, 22);
    cornerLight2.position.set(7, 3, 7);
    this.scene.add(cornerLight2);

    // Materials — procedural Canvas textures
    const floorTex = floorTileTexture();
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(5, 5);
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: 0.8,
      metalness: 0.2,
    });

    const wallTex = concreteWallTexture();
    wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
    wallTex.repeat.set(4, 1);
    const wallMat = new THREE.MeshStandardMaterial({
      map: wallTex,
      roughness: 0.7,
      metalness: 0.1,
    });

    const ceilTex = ceilingPanelTexture();
    ceilTex.wrapS = ceilTex.wrapT = THREE.RepeatWrapping;
    ceilTex.repeat.set(5, 5);
    const ceilingMat = new THREE.MeshStandardMaterial({
      map: ceilTex,
      roughness: 0.9,
      metalness: 0.0,
    });

    const crateMat = new THREE.MeshStandardMaterial({
      map: woodCrateTexture(),
      roughness: 0.7,
      metalness: 0.1,
    });

    const metalCrateMat = new THREE.MeshStandardMaterial({
      map: metalCrateTexture(),
      roughness: 0.3,
      metalness: 0.7,
    });

    const ROOM_W = 20;
    const ROOM_D = 20;
    const ROOM_H = 5;
    const WALL_T = 0.3;

    // Floor
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(ROOM_W, 0.2, ROOM_D),
      floorMat,
    );
    floor.position.set(0, -0.1, 0);
    floor.receiveShadow = true;
    this.scene.add(floor);
    physics.createStaticCuboid(ROOM_W / 2, 0.1, ROOM_D / 2, 0, -0.1, 0);

    // Ceiling
    const ceiling = new THREE.Mesh(
      new THREE.BoxGeometry(ROOM_W, 0.2, ROOM_D),
      ceilingMat,
    );
    ceiling.position.set(0, ROOM_H + 0.1, 0);
    ceiling.receiveShadow = true;
    this.scene.add(ceiling);
    physics.createStaticCuboid(ROOM_W / 2, 0.1, ROOM_D / 2, 0, ROOM_H + 0.1, 0);

    // Walls: front, back, left, right
    const walls: [number, number, number, number, number, number][] = [
      [ROOM_W / 2, ROOM_H / 2, WALL_T / 2, 0, ROOM_H / 2, -ROOM_D / 2],
      [ROOM_W / 2, ROOM_H / 2, WALL_T / 2, 0, ROOM_H / 2, ROOM_D / 2],
      [WALL_T / 2, ROOM_H / 2, ROOM_D / 2, -ROOM_W / 2, ROOM_H / 2, 0],
      [WALL_T / 2, ROOM_H / 2, ROOM_D / 2, ROOM_W / 2, ROOM_H / 2, 0],
    ];

    for (const [hx, hy, hz, x, y, z] of walls) {
      const wallMesh = new THREE.Mesh(
        new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2),
        wallMat,
      );
      wallMesh.position.set(x, y, z);
      wallMesh.receiveShadow = true;
      wallMesh.castShadow = true;
      this.scene.add(wallMesh);
      physics.createStaticCuboid(hx, hy, hz, x, y, z);
    }

    // Crates scattered around
    const crateData: { w: number; h: number; d: number; x: number; y: number; z: number; mat: THREE.Material }[] = [
      { w: 1.2, h: 1.2, d: 1.2, x: 4, y: 0.6, z: 3, mat: crateMat },
      { w: 1, h: 1, d: 1, x: 4.8, y: 0.5, z: 4.2, mat: crateMat },
      { w: 0.8, h: 0.8, d: 0.8, x: 3.5, y: 1.6, z: 3.3, mat: crateMat },
      { w: 1.5, h: 1, d: 1.5, x: -6, y: 0.5, z: -5, mat: metalCrateMat },
      { w: 1, h: 0.8, d: 1, x: -5.5, y: 0.4, z: -3.5, mat: metalCrateMat },
      { w: 2, h: 1.5, d: 0.8, x: -3, y: 0.75, z: 7, mat: crateMat },
      { w: 0.6, h: 2, d: 0.6, x: 7, y: 1, z: -7, mat: metalCrateMat },
      { w: 0.6, h: 2, d: 0.6, x: -7, y: 1, z: -7, mat: metalCrateMat },
    ];

    for (const c of crateData) {
      const crate = new THREE.Mesh(
        new THREE.BoxGeometry(c.w, c.h, c.d), 
        c.mat
      );
      crate.position.set(c.x, c.y, c.z);
      crate.castShadow = true;
      crate.receiveShadow = true;
      this.scene.add(crate);
      physics.createStaticCuboid(c.w / 2, c.h / 2, c.d / 2, c.x, c.y, c.z);
    }

    // Barrels
    const barrelMat = new THREE.MeshStandardMaterial({
      map: barrelTexture(),
      roughness: 0.5,
      metalness: 0.3,
    });
    
    const barrelPositions: [number, number, number][] = [
      [6, 0.6, -4],
      [6.8, 0.6, -3.5],
      [-2, 0.6, -8],
    ];
    
    for (const [bx, by, bz] of barrelPositions) {
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.4, 1.2, 8),
        barrelMat.clone(),
      );
      barrel.position.set(bx, by, bz);
      barrel.castShadow = true;
      barrel.receiveShadow = true;
      this.scene.add(barrel);
      physics.createStaticCuboid(0.4, 0.6, 0.4, bx, by, bz);
    }
  }

  private updateCameraPosition(): void {
    // Pan camera in a circle around the room center
    const x = Math.cos(this.panAngle) * this.panRadius;
    const z = Math.sin(this.panAngle) * this.panRadius;
    this.camera.position.set(x, this.panHeight, z);
    this.camera.lookAt(0, 1.5, 0); // Look at center of room, slightly above floor
  }

  private animate = (currentTime: number): void => {
    try {
      if (this.animationId === null) return;

      // Calculate delta time (capped at 100ms to prevent huge jumps)
      const deltaTime = this.lastFrameTime 
        ? Math.min((currentTime - this.lastFrameTime) / 1000, 0.1)
        : 0.016;
      this.lastFrameTime = currentTime;

      // Update pan angle with delta time for smooth rotation
      this.panAngle += this.panSpeed * deltaTime;
      
      // Keep angle in reasonable range
      if (this.panAngle > Math.PI * 2) {
        this.panAngle -= Math.PI * 2;
      }
      
      this.updateCameraPosition();

      // Render directly to canvas
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.camera);

      this.animationId = requestAnimationFrame(this.animate);
    } catch (error) {
      console.error('[CCTV] Error in animation loop:', error);
      this.stop();
    }
  };

  /**
   * Start the CCTV animation loop.
   */
  start(): void {
    try {
      console.log('[CCTV] Starting animation...');
      
      if (this.animationId !== null) {
        console.log('[CCTV] Animation already running');
        return;
      }
      
      // Ensure canvas is visible
      const canvas = this.renderer?.domElement;
      if (canvas) {
        canvas.style.display = 'block';
        canvas.style.visibility = 'visible';
        console.log('[CCTV] Canvas made visible');
      }
      
      // Reset frame time
      this.lastFrameTime = 0;
      
      // Start animation loop
      this.animationId = requestAnimationFrame(this.animate);
      console.log('[CCTV] Animation started successfully');
    } catch (error) {
      console.error('[CCTV] Failed to start animation:', error);
    }
  }

  /**
   * Stop the CCTV animation loop.
   */
  stop(): void {
    try {
      console.log('[CCTV] Stopping animation...');
      
      if (this.animationId !== null) {
        cancelAnimationFrame(this.animationId);
        this.animationId = null;
        this.lastFrameTime = 0;
        console.log('[CCTV] Animation stopped');
      }
    } catch (error) {
      console.error('[CCTV] Error stopping animation:', error);
    }
  }

  /**
   * Hide the CCTV canvas without stopping the animation.
   */
  hide(): void {
    const canvas = this.renderer?.domElement;
    if (canvas) {
      canvas.style.display = 'none';
    }
  }

  /**
   * Show the CCTV canvas.
   */
  show(): void {
    const canvas = this.renderer?.domElement;
    if (canvas) {
      canvas.style.display = 'block';
      canvas.style.visibility = 'visible';
    }
  }

  /**
   * Clean up resources (internal helper).
   */
  private cleanup(): void {
    try {
      const canvas = document.getElementById('cctv-render-canvas');
      if (canvas) {
        canvas.remove();
      }
      
      if (this.renderTarget) {
        this.renderTarget.dispose();
      }
      
      if (this.renderer) {
        this.renderer.dispose();
      }
    } catch (error) {
      console.error('[CCTV] Error during cleanup:', error);
    }
  }

  /**
   * Dispose of all resources.
   */
  dispose(): void {
    try {
      console.log('[CCTV] Disposing CCTV background...');
      
      this.stop();
      
      window.removeEventListener('resize', this.resizeHandler);
      
      this.cleanup();
      
      console.log('[CCTV] CCTV background disposed');
    } catch (error) {
      console.error('[CCTV] Error disposing resources:', error);
    }
  }

  /**
   * Get the render target texture (for advanced use cases).
   */
  getTexture(): THREE.Texture {
    return this.renderTarget.texture;
  }
}