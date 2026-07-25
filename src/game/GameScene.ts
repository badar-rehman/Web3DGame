import * as THREE from 'three';
import { CellType, LevelData, Vec2 } from './types';

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
  target: 0xf5b26e,
  cube: 0x6ee7f5,
  cubeOnTarget: 0x6ef58e,
};

interface CubeAnim {
  from: THREE.Vector3;
  to: THREE.Vector3;
  start: number;
}

export class GameScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera!: THREE.OrthographicCamera;
  private cubeMeshes: THREE.Mesh[] = [];
  private cubeAnims = new Map<number, CubeAnim>();
  private targetSet = new Set<string>();
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

  loadLevel(level: LevelData, cubes: Vec2[]) {
    this.level = level;
    this.targetSet = new Set(level.targets.map((t) => `${t.x},${t.y}`));
    this.cubeAnims.clear();
    this.animating = false;

    while (this.levelGroup.children.length) {
      const child = this.levelGroup.children.pop()!;
      disposeObject(child);
    }
    this.cubeMeshes = [];

    this.buildBoard();
    this.buildCubes(cubes);
    this.frameCameraToLevel();
  }

  private buildBoard() {
    const floorGeo = new THREE.BoxGeometry(CELL_SIZE * 0.96, TILE_HEIGHT, CELL_SIZE * 0.96);
    const wallGeo = new THREE.BoxGeometry(CELL_SIZE, WALL_HEIGHT, CELL_SIZE);
    const obstacleGeo = new THREE.IcosahedronGeometry(CELL_SIZE * 0.34, 0);
    const targetGeo = new THREE.RingGeometry(CELL_SIZE * 0.28, CELL_SIZE * 0.38, 24);
    targetGeo.rotateX(-Math.PI / 2);

    const floorMatA = new THREE.MeshStandardMaterial({ color: COLOR.floorA, roughness: 0.9 });
    const floorMatB = new THREE.MeshStandardMaterial({ color: COLOR.floorB, roughness: 0.9 });
    const wallMat = new THREE.MeshStandardMaterial({ color: COLOR.wall, roughness: 0.7 });
    const obstacleMat = new THREE.MeshStandardMaterial({ color: COLOR.obstacle, roughness: 0.8, flatShading: true });
    const targetMat = new THREE.MeshStandardMaterial({
      color: COLOR.target,
      emissive: COLOR.target,
      emissiveIntensity: 0.6,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });

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

        if (this.targetSet.has(`${x},${y}`)) {
          const ring = new THREE.Mesh(targetGeo, targetMat);
          ring.position.set(wx, TILE_HEIGHT + 0.02, wz);
          ring.userData.isTargetMarker = true;
          this.levelGroup.add(ring);
        }

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

  private buildCubes(cubes: Vec2[]) {
    const geo = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
    cubes.forEach((pos) => {
      const mat = new THREE.MeshStandardMaterial({
        color: this.isOnTarget(pos) ? COLOR.cubeOnTarget : COLOR.cube,
        roughness: 0.35,
        metalness: 0.15,
      });
      const mesh = new THREE.Mesh(geo, mat);
      const { wx, wz } = this.toWorld(pos.x, pos.y);
      mesh.position.set(wx, TILE_HEIGHT + CUBE_SIZE / 2, wz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.levelGroup.add(mesh);
      this.cubeMeshes.push(mesh);
    });
  }

  private isOnTarget(pos: Vec2): boolean {
    return this.targetSet.has(`${pos.x},${pos.y}`);
  }

  private toWorld(x: number, y: number): { wx: number; wz: number } {
    return { wx: x * CELL_SIZE, wz: y * CELL_SIZE };
  }

  /** Animate cubes to new grid positions. Calls onSettled once the animation finishes. */
  animateCubesTo(positions: Vec2[], onSettled: () => void) {
    const now = performance.now();
    this.onSettled = onSettled;
    this.animating = true;
    positions.forEach((pos, i) => {
      const mesh = this.cubeMeshes[i];
      if (!mesh) return;
      const { wx, wz } = this.toWorld(pos.x, pos.y);
      this.cubeAnims.set(i, {
        from: mesh.position.clone(),
        to: new THREE.Vector3(wx, TILE_HEIGHT + CUBE_SIZE / 2, wz),
        start: now,
      });
      (mesh.material as THREE.MeshStandardMaterial).color.set(this.isOnTarget(pos) ? COLOR.cubeOnTarget : COLOR.cube);
    });
  }

  private updateAnims(now: number) {
    if (this.cubeAnims.size === 0) return;
    let allDone = true;
    for (const [i, anim] of this.cubeAnims) {
      const mesh = this.cubeMeshes[i];
      const t = Math.min(1, (now - anim.start) / MOVE_DURATION_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      mesh.position.lerpVectors(anim.from, anim.to, eased);
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

  isAnimating(): boolean {
    return this.animating;
  }

  render() {
    const now = performance.now();
    this.updateAnims(now);
    this.levelGroup.children.forEach((child) => {
      if (child.userData.isTargetMarker) {
        child.scale.setScalar(1 + Math.sin(now * 0.003) * 0.06);
      }
    });
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
