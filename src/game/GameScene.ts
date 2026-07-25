import * as THREE from 'three';
import { CellType, CubeState, LevelData } from './types';
import { cubeVisual } from './cubeVisuals';

export const CELL_SIZE = 1.5;
const TILE_HEIGHT = 0.25;
const WALL_HEIGHT = 1.1;
const OBSTACLE_HEIGHT = 0.65;
const CUBE_SIZE = 0.92;
const MOVE_DURATION_MS = 160;

const COLOR = {
  floorA: 0x2a3150,
  floorB: 0x313a5e,
  wall: 0x4b5580,
  obstacle: 0x8a6a45,
};

const GLOW_COLOR = 0xffffff;

interface CubeAnim {
  from: THREE.Vector3;
  to: THREE.Vector3;
  start: number;
}

interface CubeEntry {
  mesh: THREE.Mesh;
  materials: THREE.MeshStandardMaterial[];
}

function createLabelTexture(label: string, bgColor: string): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(11, 14, 26, 0.85)';
  ctx.font = 'bold 76px -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, size / 2, size / 2 + 4);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class GameScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera!: THREE.OrthographicCamera;
  private cubes = new Map<string, CubeEntry>();
  private cubeAnims = new Map<string, CubeAnim>();
  private glowingIds = new Set<string>();
  private level!: LevelData;
  private levelGroup = new THREE.Group();
  private onSettled: (() => void) | null = null;
  private animating = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.background = new THREE.Color(0x0b0e1a);
    this.scene.fog = new THREE.Fog(0x0b0e1a, 25, 55);
    this.scene.add(this.levelGroup);

    this.setupLights();
    this.setupCamera();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private setupLights() {
    const ambient = new THREE.AmbientLight(0x8891c4, 0.65);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(10, 18, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -20;
    sun.shadow.camera.right = 20;
    sun.shadow.camera.top = 20;
    sun.shadow.camera.bottom = -20;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 60;
    sun.shadow.bias = -0.0015;
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(0x6ee7f5, 0.25);
    fill.position.set(-8, 6, -10);
    this.scene.add(fill);
  }

  private setupCamera() {
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    const dir = new THREE.Vector3(1, 1.2, 1).normalize();
    this.camera.position.copy(dir.multiplyScalar(30));
    this.camera.lookAt(0, 0, 0);
  }

  private gridCenter(): THREE.Vector3 {
    const x = ((this.level.width - 1) * CELL_SIZE) / 2;
    const z = ((this.level.height - 1) * CELL_SIZE) / 2;
    return new THREE.Vector3(x, 0, z);
  }

  private frameCameraToLevel() {
    const center = this.gridCenter();
    const dir = new THREE.Vector3(1, 1.2, 1).normalize();
    const span = Math.max(this.level.width, this.level.height) * CELL_SIZE;
    const distance = span * 1.6 + 10;
    this.camera.position.copy(center.clone().add(dir.multiplyScalar(distance)));
    this.camera.lookAt(center);

    const halfSize = span * 0.72 + 2.2;
    const aspect = this.renderer.domElement.clientWidth / Math.max(1, this.renderer.domElement.clientHeight);
    this.camera.left = -halfSize * aspect;
    this.camera.right = halfSize * aspect;
    this.camera.top = halfSize;
    this.camera.bottom = -halfSize;
    this.camera.updateProjectionMatrix();
  }

  resize() {
    const canvas = this.renderer.domElement;
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height, false);
    if (this.level) this.frameCameraToLevel();
  }

  loadLevel(level: LevelData, cubes: CubeState[]) {
    this.level = level;
    this.cubeAnims.clear();
    this.glowingIds.clear();
    this.animating = false;

    while (this.levelGroup.children.length) {
      const child = this.levelGroup.children.pop()!;
      disposeObject(child);
    }
    this.cubes.forEach((entry) => disposeObject(entry.mesh));
    this.cubes.clear();

    this.buildBoard();
    this.buildCubes(cubes);
    this.frameCameraToLevel();
  }

  private buildBoard() {
    const floorGeo = new THREE.BoxGeometry(CELL_SIZE * 0.96, TILE_HEIGHT, CELL_SIZE * 0.96);
    const wallGeo = new THREE.BoxGeometry(CELL_SIZE, WALL_HEIGHT, CELL_SIZE);
    const obstacleGeo = new THREE.IcosahedronGeometry(CELL_SIZE * 0.34, 0);

    const floorMatA = new THREE.MeshStandardMaterial({ color: COLOR.floorA, roughness: 0.9 });
    const floorMatB = new THREE.MeshStandardMaterial({ color: COLOR.floorB, roughness: 0.9 });
    const wallMat = new THREE.MeshStandardMaterial({ color: COLOR.wall, roughness: 0.7 });
    const obstacleMat = new THREE.MeshStandardMaterial({ color: COLOR.obstacle, roughness: 0.8, flatShading: true });

    for (let y = 0; y < this.level.height; y++) {
      for (let x = 0; x < this.level.width; x++) {
        const cell = this.level.cells[y][x];
        const { wx, wz } = this.toWorld(x, y);

        if (cell === CellType.Wall) {
          const wall = new THREE.Mesh(wallGeo, wallMat);
          wall.position.set(wx, WALL_HEIGHT / 2, wz);
          wall.castShadow = true;
          wall.receiveShadow = true;
          this.levelGroup.add(wall);
          continue;
        }

        const floor = new THREE.Mesh(floorGeo, (x + y) % 2 === 0 ? floorMatA : floorMatB);
        floor.position.set(wx, TILE_HEIGHT / 2, wz);
        floor.receiveShadow = true;
        this.levelGroup.add(floor);

        if (cell === CellType.Obstacle) {
          const rock = new THREE.Mesh(obstacleGeo, obstacleMat);
          rock.position.set(wx, TILE_HEIGHT + OBSTACLE_HEIGHT * 0.4, wz);
          rock.rotation.set(Math.random() * 0.4, Math.random() * Math.PI, Math.random() * 0.4);
          rock.castShadow = true;
          rock.receiveShadow = true;
          this.levelGroup.add(rock);
        }
      }
    }
  }

  private buildCubes(cubes: CubeState[]) {
    const geo = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
    cubes.forEach((cube) => {
      const visual = cubeVisual(cube.id);
      const sideMat = new THREE.MeshStandardMaterial({ color: visual.color, roughness: 0.4, metalness: 0.1 });
      const topMat = new THREE.MeshStandardMaterial({
        map: createLabelTexture(visual.label, visual.cssColor),
        roughness: 0.3,
        metalness: 0.1,
      });
      // BoxGeometry face group order: +x, -x, +y (top), -y (bottom), +z, -z
      const materials = [sideMat, sideMat, topMat, sideMat, sideMat, sideMat];

      const mesh = new THREE.Mesh(geo, materials);
      const { wx, wz } = this.toWorld(cube.x, cube.y);
      mesh.position.set(wx, TILE_HEIGHT + CUBE_SIZE / 2, wz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.levelGroup.add(mesh);
      this.cubes.set(cube.id, { mesh, materials });
    });
  }

  private toWorld(x: number, y: number): { wx: number; wz: number } {
    return { wx: x * CELL_SIZE, wz: y * CELL_SIZE };
  }

  /** Animate cubes to new grid positions. Calls onSettled once the animation finishes. */
  animateCubesTo(positions: CubeState[], onSettled: () => void) {
    const now = performance.now();
    this.onSettled = onSettled;
    this.animating = true;
    positions.forEach((pos) => {
      const entry = this.cubes.get(pos.id);
      if (!entry) return;
      const { wx, wz } = this.toWorld(pos.x, pos.y);
      this.cubeAnims.set(pos.id, {
        from: entry.mesh.position.clone(),
        to: new THREE.Vector3(wx, TILE_HEIGHT + CUBE_SIZE / 2, wz),
        start: now,
      });
    });
  }

  /** Cubes currently participating in a satisfied formation bond get a pulsing glow. */
  setGlowingCubes(ids: Set<string>) {
    this.glowingIds = ids;
  }

  private updateAnims(now: number) {
    if (this.cubeAnims.size === 0) return;
    let allDone = true;
    for (const [id, anim] of this.cubeAnims) {
      const entry = this.cubes.get(id);
      if (!entry) continue;
      const t = Math.min(1, (now - anim.start) / MOVE_DURATION_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      entry.mesh.position.lerpVectors(anim.from, anim.to, eased);
      if (t < 1) allDone = false;
    }
    if (allDone) {
      this.cubeAnims.clear();
      this.animating = false;
      const cb = this.onSettled;
      this.onSettled = null;
      cb?.();
    }
  }

  private updateGlow(now: number) {
    const pulse = 0.35 + Math.sin(now * 0.006) * 0.2;
    this.cubes.forEach((entry, id) => {
      const isGlowing = this.glowingIds.has(id);
      const intensity = isGlowing ? pulse : 0;
      const color = isGlowing ? GLOW_COLOR : 0x000000;
      entry.materials.forEach((mat) => {
        mat.emissive.setHex(color);
        mat.emissiveIntensity = intensity;
      });
    });
  }

  isAnimating(): boolean {
    return this.animating;
  }

  render() {
    const now = performance.now();
    this.updateAnims(now);
    this.updateGlow(now);
    this.renderer.render(this.scene, this.camera);
  }
}

function disposeObject(obj: THREE.Object3D) {
  if (obj instanceof THREE.Mesh) {
    obj.geometry.dispose();
    if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
    else obj.material.dispose();
  }
}
