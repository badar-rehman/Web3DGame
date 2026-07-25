import * as THREE from 'three';
import { CellType, CubeState, LevelData } from './types';
import { cubeVisual, drawSymbol } from './cubeVisuals';

export const CELL_SIZE = 1.5;
const FLOOR_Y = 0.1;
const FLOOR_TILE_HEIGHT = 0.3;
const WALL_HEIGHT = 1.1;
const OBSTACLE_HEIGHT = 0.65;
const CUBE_SIZE = 0.92;
const MOVE_DURATION_MS = 160;
const COYOTE_MS = 230;
const FALL_DURATION_MS = 620;
const FALL_DROP = 14;

const PIPE_RADIUS = 0.07;
const PIPE_Y = FLOOR_Y + 0.32;
const BOUNDARY_COLOR = 0x6ee7f5;

const EDGE_RADIUS = 0.035;
const EDGE_BASE_BRIGHTNESS = 0.55;
const EDGE_CELEBRATE_BRIGHTNESS = 2.2;
const SYMBOL_CONNECTED_INTENSITY = 0.7;
const SYMBOL_CELEBRATE_INTENSITY = 2.4;

const COLOR = {
  floor: 0x1c2038,
  wall: 0x4b5580,
  obstacle: 0x8a6a45,
  gridLine: 0xffffff,
};

type AnimPhase = 'move' | 'slide' | 'hang' | 'drop';

interface CubeAnim {
  phase: AnimPhase;
  from: THREE.Vector3;
  to: THREE.Vector3;
  start: number;
  duration: number;
}

interface CubeEntry {
  group: THREE.Group;
  topMaterial: THREE.MeshStandardMaterial;
  edgeMaterial: THREE.MeshBasicMaterial;
  glowDecal: THREE.Mesh;
  glowDecalMaterial: THREE.MeshBasicMaterial;
  baseColor: THREE.Color;
}

function createSymbolTexture(shape: Parameters<typeof drawSymbol>[1], bgColor: string): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, size, size);
  drawSymbol(ctx, shape, size, 'rgba(11, 14, 26, 0.85)');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createGlowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

/** A straight tube mesh connecting two points, used for both the boundary rail and cube neon edges. */
function edgeCylinder(a: THREE.Vector3, b: THREE.Vector3, radius: number, material: THREE.Material): THREE.Mesh {
  const dir = new THREE.Vector3().subVectors(b, a);
  const length = dir.length();
  const geo = new THREE.CylinderGeometry(radius, radius, length, 6);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  return mesh;
}

const BOX_EDGES: [THREE.Vector3, THREE.Vector3][] = (() => {
  const h = CUBE_SIZE / 2;
  const corners = [
    [-h, -h, -h],
    [h, -h, -h],
    [h, -h, h],
    [-h, -h, h],
    [-h, h, -h],
    [h, h, -h],
    [h, h, h],
    [-h, h, h],
  ].map((p) => new THREE.Vector3(...p));
  const pairs: [number, number][] = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ];
  return pairs.map(([i, j]) => [corners[i], corners[j]]);
})();

const GLOW_TEXTURE = createGlowTexture();

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
  private celebrating = false;

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
    this.celebrating = false;

    while (this.levelGroup.children.length) {
      const child = this.levelGroup.children.pop()!;
      disposeObject(child);
    }
    this.cubes.forEach((entry) => disposeObject(entry.group));
    this.cubes.clear();

    this.buildFloor();
    this.buildWallsAndObstacles();
    if (level.hasBoundary) this.buildBoundaryPipe();
    this.buildCubes(cubes);
    this.frameCameraToLevel();
  }

  private buildFloor() {
    // The floor is a real grid of 3D tile blocks, not a flat plane — so an
    // open edge is an actual physical drop-off (nothing to visually clip
    // through) rather than a cube sliding past a paper-thin sheet.
    const tileGeo = new THREE.BoxGeometry(CELL_SIZE, FLOOR_TILE_HEIGHT, CELL_SIZE);
    const tileMat = new THREE.MeshStandardMaterial({ color: COLOR.floor, roughness: 0.95 });
    for (let y = 0; y < this.level.height; y++) {
      for (let x = 0; x < this.level.width; x++) {
        const { wx, wz } = this.toWorld(x, y);
        const tile = new THREE.Mesh(tileGeo, tileMat);
        tile.position.set(wx, FLOOR_Y - FLOOR_TILE_HEIGHT / 2, wz);
        tile.receiveShadow = true;
        tile.castShadow = true;
        this.levelGroup.add(tile);
      }
    }
    this.levelGroup.add(this.buildGridLines());
  }

  private buildGridLines(): THREE.LineSegments {
    const { width, height } = this.level;
    const xMin = -0.5 * CELL_SIZE;
    const xMax = (width - 0.5) * CELL_SIZE;
    const zMin = -0.5 * CELL_SIZE;
    const zMax = (height - 0.5) * CELL_SIZE;
    const y = FLOOR_Y + 0.01;
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= width; i++) {
      const x = (i - 0.5) * CELL_SIZE;
      points.push(new THREE.Vector3(x, y, zMin), new THREE.Vector3(x, y, zMax));
    }
    for (let j = 0; j <= height; j++) {
      const z = (j - 0.5) * CELL_SIZE;
      points.push(new THREE.Vector3(xMin, y, z), new THREE.Vector3(xMax, y, z));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color: COLOR.gridLine, transparent: true, opacity: 0.16 });
    return new THREE.LineSegments(geo, mat);
  }

  private buildBoundaryPipe() {
    const { width, height } = this.level;
    const xMin = -0.5 * CELL_SIZE;
    const xMax = (width - 0.5) * CELL_SIZE;
    const zMin = -0.5 * CELL_SIZE;
    const zMax = (height - 0.5) * CELL_SIZE;
    const corners = [
      new THREE.Vector3(xMin, PIPE_Y, zMin),
      new THREE.Vector3(xMax, PIPE_Y, zMin),
      new THREE.Vector3(xMax, PIPE_Y, zMax),
      new THREE.Vector3(xMin, PIPE_Y, zMax),
    ];
    const mat = new THREE.MeshBasicMaterial({ color: BOUNDARY_COLOR });
    const group = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      group.add(edgeCylinder(corners[i], corners[(i + 1) % 4], PIPE_RADIUS, mat));
    }
    corners.forEach((c) => {
      const joint = new THREE.Mesh(new THREE.SphereGeometry(PIPE_RADIUS, 8, 8), mat);
      joint.position.copy(c);
      group.add(joint);
    });
    this.levelGroup.add(group);
  }

  private buildWallsAndObstacles() {
    const wallGeo = new THREE.BoxGeometry(CELL_SIZE, WALL_HEIGHT, CELL_SIZE);
    const wallMat = new THREE.MeshStandardMaterial({ color: COLOR.wall, roughness: 0.7 });
    const obstacleGeo = new THREE.IcosahedronGeometry(CELL_SIZE * 0.34, 0);
    const obstacleMat = new THREE.MeshStandardMaterial({ color: COLOR.obstacle, roughness: 0.8, flatShading: true });

    for (let y = 0; y < this.level.height; y++) {
      for (let x = 0; x < this.level.width; x++) {
        const cell = this.level.cells[y][x];
        const { wx, wz } = this.toWorld(x, y);

        if (cell === CellType.Wall) {
          const wall = new THREE.Mesh(wallGeo, wallMat);
          wall.position.set(wx, FLOOR_Y + WALL_HEIGHT / 2, wz);
          wall.castShadow = true;
          wall.receiveShadow = true;
          this.levelGroup.add(wall);
        } else if (cell === CellType.Obstacle) {
          const rock = new THREE.Mesh(obstacleGeo, obstacleMat);
          rock.position.set(wx, FLOOR_Y + OBSTACLE_HEIGHT * 0.4, wz);
          rock.rotation.set(Math.random() * 0.4, Math.random() * Math.PI, Math.random() * 0.4);
          rock.castShadow = true;
          rock.receiveShadow = true;
          this.levelGroup.add(rock);
        }
      }
    }
  }

  private buildCubes(cubes: CubeState[]) {
    const bodyGeo = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);

    cubes.forEach((cube) => {
      const visual = cubeVisual(cube.id);
      const baseColor = new THREE.Color(visual.color);
      const group = new THREE.Group();

      const sideMat = new THREE.MeshStandardMaterial({ color: visual.color, roughness: 0.45, metalness: 0.1 });
      const topMat = new THREE.MeshStandardMaterial({
        map: createSymbolTexture(visual.symbol, visual.cssColor),
        roughness: 0.3,
        metalness: 0.1,
        emissive: baseColor,
        emissiveIntensity: 0,
      });
      // BoxGeometry face group order: +x, -x, +y (top), -y (bottom), +z, -z
      const body = new THREE.Mesh(bodyGeo, [sideMat, sideMat, topMat, sideMat, sideMat, sideMat]);
      body.castShadow = true;
      body.receiveShadow = true;
      group.add(body);

      const edgeMat = new THREE.MeshBasicMaterial({ color: baseColor.clone().multiplyScalar(EDGE_BASE_BRIGHTNESS) });
      BOX_EDGES.forEach(([a, b]) => group.add(edgeCylinder(a, b, EDGE_RADIUS, edgeMat)));

      const { wx, wz } = this.toWorld(cube.x, cube.y);
      group.position.set(wx, FLOOR_Y + CUBE_SIZE / 2, wz);
      this.levelGroup.add(group);

      const glowDecalMaterial = new THREE.MeshBasicMaterial({
        map: GLOW_TEXTURE,
        color: baseColor,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const glowDecal = new THREE.Mesh(new THREE.PlaneGeometry(CELL_SIZE * 1.3, CELL_SIZE * 1.3), glowDecalMaterial);
      glowDecal.rotation.x = -Math.PI / 2;
      glowDecal.position.set(wx, FLOOR_Y + 0.02, wz);
      this.levelGroup.add(glowDecal);

      this.cubes.set(cube.id, { group, topMaterial: topMat, edgeMaterial: edgeMat, glowDecal, glowDecalMaterial, baseColor });
    });
  }

  private toWorld(x: number, y: number): { wx: number; wz: number } {
    return { wx: x * CELL_SIZE, wz: y * CELL_SIZE };
  }

  private isOutOfBounds(pos: CubeState): boolean {
    return pos.x < 0 || pos.y < 0 || pos.x >= this.level.width || pos.y >= this.level.height;
  }

  /**
   * Animate cubes to new grid positions. A cube that ends up outside the
   * level bounds (an open edge with no boundary) first slides out over the
   * empty space at normal height and hangs there briefly — coyote time —
   * before gravity takes over and it drops away. Calls onSettled once every
   * animation finishes.
   */
  animateCubesTo(positions: CubeState[], onSettled: () => void) {
    const now = performance.now();
    this.onSettled = onSettled;
    this.animating = true;
    positions.forEach((pos) => {
      const entry = this.cubes.get(pos.id);
      if (!entry) return;
      const falling = this.isOutOfBounds(pos);
      const { wx, wz } = this.toWorld(pos.x, pos.y);
      const to = new THREE.Vector3(wx, FLOOR_Y + CUBE_SIZE / 2, wz);
      this.cubeAnims.set(pos.id, {
        phase: falling ? 'slide' : 'move',
        from: entry.group.position.clone(),
        to,
        start: now,
        duration: MOVE_DURATION_MS,
      });
    });
  }

  /** Cubes currently satisfying a formation bond get a steady (non-pulsing) symbol glow. */
  setGlowingCubes(ids: Set<string>) {
    this.glowingIds = ids;
  }

  /** Flashes every cube's edges and symbol to full brightness for `durationMs`, then calls onDone. */
  playWinCelebration(durationMs: number, onDone: () => void) {
    this.celebrating = true;
    window.setTimeout(() => {
      this.celebrating = false;
      onDone();
    }, durationMs);
  }

  private updateAnims(now: number) {
    if (this.cubeAnims.size === 0) return;

    for (const [id, anim] of [...this.cubeAnims]) {
      const entry = this.cubes.get(id);
      if (!entry) {
        this.cubeAnims.delete(id);
        continue;
      }

      if (anim.phase === 'hang') {
        if (now - anim.start >= anim.duration) {
          const from = entry.group.position.clone();
          const to = from.clone().setY(from.y - FALL_DROP);
          this.cubeAnims.set(id, { phase: 'drop', from, to, start: now, duration: FALL_DURATION_MS });
        }
        continue;
      }

      const t = Math.min(1, (now - anim.start) / anim.duration);
      const eased = anim.phase === 'drop' ? t * t : 1 - Math.pow(1 - t, 3);
      entry.group.position.lerpVectors(anim.from, anim.to, eased);
      if (anim.phase === 'drop') {
        entry.group.rotation.x += 0.14;
        entry.group.rotation.z += 0.09;
      }

      if (t >= 1) {
        if (anim.phase === 'slide') {
          this.cubeAnims.set(id, { phase: 'hang', from: anim.to, to: anim.to, start: now, duration: COYOTE_MS });
        } else {
          this.cubeAnims.delete(id);
        }
      }
    }

    if (this.cubeAnims.size === 0) {
      this.animating = false;
      const cb = this.onSettled;
      this.onSettled = null;
      cb?.();
    }
  }

  private updateGlow() {
    this.cubes.forEach((entry, id) => {
      const connected = this.glowingIds.has(id);
      const symbolIntensity = this.celebrating ? SYMBOL_CELEBRATE_INTENSITY : connected ? SYMBOL_CONNECTED_INTENSITY : 0;
      const edgeBrightness = this.celebrating ? EDGE_CELEBRATE_BRIGHTNESS : EDGE_BASE_BRIGHTNESS;

      entry.topMaterial.emissiveIntensity = symbolIntensity;
      entry.edgeMaterial.color.copy(entry.baseColor).multiplyScalar(edgeBrightness);

      const decalOpacity = this.celebrating ? 0.85 : connected ? 0.45 : 0;
      entry.glowDecalMaterial.opacity = decalOpacity;
      entry.glowDecal.position.x = entry.group.position.x;
      entry.glowDecal.position.z = entry.group.position.z;
    });
  }

  isAnimating(): boolean {
    return this.animating;
  }

  render() {
    const now = performance.now();
    this.updateAnims(now);
    this.updateGlow();
    this.renderer.render(this.scene, this.camera);
  }
}

function disposeObject(obj: THREE.Object3D) {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
      else child.material.dispose();
    }
  });
}
