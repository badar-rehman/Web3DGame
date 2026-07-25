import * as THREE from 'three';
import { CellType, CubeState, LevelData } from './types';
import { SymbolShape, buildSymbolPath, cubeVisual } from './cubeVisuals';

export const CELL_SIZE = 1.5;
const FLOOR_Y = 0.1;
const FLOOR_TILE_HEIGHT = 1.3;
const WALL_HEIGHT = 1.1;
const OBSTACLE_HEIGHT = 0.65;
const CUBE_SIZE = 1.32;
const MOVE_DURATION_MS = 160;
const MOVE_STAGGER_MS = 30;
const MOVE_OVERSHOOT = 0.55;
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
const DECAL_CELEBRATE_PEAK = 0.85;
const GLOW_TRANSITION_MS = 420;
const CELEBRATION_PULSE_COUNT = 3;
const CELEBRATION_PULSE_MS = 700;

/** Overshoots slightly past the target before settling — a springy "pop". */
function easeOutBack(t: number, overshoot = 1.70158): number {
  const c3 = overshoot + 1;
  const x = t - 1;
  return 1 + c3 * x * x * x + overshoot * x * x;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

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

interface GlowValues {
  symbol: number;
  edge: number;
  decal: number;
}

interface CubeEntry {
  group: THREE.Group;
  faceMaterials: THREE.MeshStandardMaterial[];
  edgeMaterial: THREE.MeshBasicMaterial;
  glowDecal: THREE.Mesh;
  glowDecalMaterial: THREE.MeshBasicMaterial;
  baseColor: THREE.Color;
  glowFrom: GlowValues;
  glowTo: GlowValues;
  glowStart: number;
}

interface SeamTexturePair {
  base: THREE.CanvasTexture;
  emissive: THREE.CanvasTexture;
}

const SEAM_TEX_SIZE = 128;
const SEAM_INSET = SEAM_TEX_SIZE * 0.08;
const SEAM_BASE_WIDTH = 4.5;
const SEAM_GLOW_WIDTH = 5.5;

/**
 * A cube face is built from two textures: a light base fill with carved
 * grooves (a shadow + highlight bevel, so the line reads as physically cut
 * even under flat lighting), and a matching "emissive map" — black
 * everywhere except those same groove lines, drawn bright white. Only the
 * masked lines glow when the material's emissiveIntensity rises, so the
 * light visibly comes out of the carved lines rather than washing the whole
 * face.
 */
function buildSeamTextures(draw: (ctx: CanvasRenderingContext2D, emissive: boolean) => void): SeamTexturePair {
  const size = SEAM_TEX_SIZE;

  const baseCanvas = document.createElement('canvas');
  baseCanvas.width = baseCanvas.height = size;
  const baseCtx = baseCanvas.getContext('2d')!;
  baseCtx.fillStyle = '#eef0f8';
  baseCtx.fillRect(0, 0, size, size);
  draw(baseCtx, false);

  const emCanvas = document.createElement('canvas');
  emCanvas.width = emCanvas.height = size;
  const emCtx = emCanvas.getContext('2d')!;
  emCtx.fillStyle = '#000000';
  emCtx.fillRect(0, 0, size, size);
  draw(emCtx, true);

  const base = new THREE.CanvasTexture(baseCanvas);
  base.colorSpace = THREE.SRGBColorSpace;
  const emissive = new THREE.CanvasTexture(emCanvas);
  emissive.colorSpace = THREE.SRGBColorSpace;
  return { base, emissive };
}

/** Carved groove: a dark shadow offset one way, a light highlight offset the other, plus a dark core line. */
function strokeCarvedGroove(ctx: CanvasRenderingContext2D, path: Path2D) {
  ctx.lineWidth = SEAM_BASE_WIDTH;

  ctx.save();
  ctx.translate(1.5, 1.5);
  ctx.strokeStyle = 'rgba(4, 5, 12, 0.65)';
  ctx.stroke(path);
  ctx.restore();

  ctx.save();
  ctx.translate(-1.2, -1.2);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.lineWidth = SEAM_BASE_WIDTH * 0.8;
  ctx.stroke(path);
  ctx.restore();

  ctx.strokeStyle = 'rgba(6, 8, 16, 0.7)';
  ctx.lineWidth = SEAM_BASE_WIDTH * 0.85;
  ctx.stroke(path);
}

function strokeGlowLine(ctx: CanvasRenderingContext2D, path: Path2D) {
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = SEAM_GLOW_WIDTH;
  ctx.stroke(path);
}

function buildBorderPath(): Path2D {
  const path = new Path2D();
  path.rect(SEAM_INSET, SEAM_INSET, SEAM_TEX_SIZE - SEAM_INSET * 2, SEAM_TEX_SIZE - SEAM_INSET * 2);
  return path;
}

function buildCrossPath(): Path2D {
  const mid = SEAM_TEX_SIZE / 2;
  const path = new Path2D();
  path.moveTo(mid, SEAM_INSET);
  path.lineTo(mid, SEAM_TEX_SIZE - SEAM_INSET);
  path.moveTo(SEAM_INSET, mid);
  path.lineTo(SEAM_TEX_SIZE - SEAM_INSET, mid);
  return path;
}

/** Side faces: an inset border plus a 2x2 cross seam, like carved panel plating. */
function buildSideTextures(): SeamTexturePair {
  const combined = new Path2D();
  combined.addPath(buildBorderPath());
  combined.addPath(buildCrossPath());
  return buildSeamTextures((ctx, emissive) => (emissive ? strokeGlowLine(ctx, combined) : strokeCarvedGroove(ctx, combined)));
}

/** Top face: an inset border plus the cube's symbol carved as an outline (never filled). */
const topTextureCache = new Map<SymbolShape, SeamTexturePair>();
function getTopTextures(shape: SymbolShape): SeamTexturePair {
  let pair = topTextureCache.get(shape);
  if (!pair) {
    const combined = new Path2D();
    combined.addPath(buildBorderPath());
    combined.addPath(buildSymbolPath(shape, SEAM_TEX_SIZE));
    pair = buildSeamTextures((ctx, emissive) => (emissive ? strokeGlowLine(ctx, combined) : strokeCarvedGroove(ctx, combined)));
    topTextureCache.set(shape, pair);
  }
  return pair;
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
const SIDE_TEXTURES = buildSideTextures();

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
  private celebrationStart = 0;

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

      const topTex = getTopTextures(visual.symbol);
      // Base color map tints the near-white carved texture to this cube's
      // hue; emissiveMap masks the glow to just the carved lines/outline.
      const sideMat = new THREE.MeshStandardMaterial({
        map: SIDE_TEXTURES.base,
        emissiveMap: SIDE_TEXTURES.emissive,
        emissive: baseColor,
        emissiveIntensity: 0,
        color: baseColor,
        roughness: 0.55,
        metalness: 0.08,
      });
      const topMat = new THREE.MeshStandardMaterial({
        map: topTex.base,
        emissiveMap: topTex.emissive,
        emissive: baseColor,
        emissiveIntensity: 0,
        color: baseColor,
        roughness: 0.5,
        metalness: 0.08,
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

      const baseline: GlowValues = { symbol: 0, edge: EDGE_BASE_BRIGHTNESS, decal: 0 };
      this.cubes.set(cube.id, {
        group,
        faceMaterials: [topMat, sideMat],
        edgeMaterial: edgeMat,
        glowDecal,
        glowDecalMaterial,
        baseColor,
        glowFrom: { ...baseline },
        glowTo: { ...baseline },
        glowStart: 0,
      });
    });
  }

  private toWorld(x: number, y: number): { wx: number; wz: number } {
    return { wx: x * CELL_SIZE, wz: y * CELL_SIZE };
  }

  private isOutOfBounds(pos: CubeState): boolean {
    return pos.x < 0 || pos.y < 0 || pos.x >= this.level.width || pos.y >= this.level.height;
  }

  /**
   * Animate cubes to new grid positions. Each cube's move starts a beat
   * after the previous one (a tiny stagger) rather than all snapping at
   * once, and eases with a slight overshoot-and-settle for a springier,
   * more satisfying feel. A cube that ends up outside the level bounds (an
   * open edge with no boundary) first slides out over the empty space at
   * normal height and hangs there briefly — coyote time — before gravity
   * takes over and it drops away. Calls onSettled once every animation
   * finishes.
   */
  animateCubesTo(positions: CubeState[], onSettled: () => void) {
    const now = performance.now();
    this.onSettled = onSettled;
    this.animating = true;
    positions.forEach((pos, index) => {
      const entry = this.cubes.get(pos.id);
      if (!entry) return;
      const falling = this.isOutOfBounds(pos);
      const { wx, wz } = this.toWorld(pos.x, pos.y);
      const to = new THREE.Vector3(wx, FLOOR_Y + CUBE_SIZE / 2, wz);
      this.cubeAnims.set(pos.id, {
        phase: falling ? 'slide' : 'move',
        from: entry.group.position.clone(),
        to,
        start: now + index * MOVE_STAGGER_MS,
        duration: MOVE_DURATION_MS,
      });
    });
  }

  /** Cubes currently satisfying a formation bond get a steady (non-pulsing) symbol glow. */
  setGlowingCubes(ids: Set<string>) {
    this.glowingIds = ids;
  }

  /** Pulses every cube's edges and symbol brightly a few times, then calls onDone. */
  playWinCelebration(onDone: () => void) {
    this.celebrating = true;
    this.celebrationStart = performance.now();
    window.setTimeout(() => {
      this.celebrating = false;
      onDone();
    }, CELEBRATION_PULSE_COUNT * CELEBRATION_PULSE_MS);
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

      const t = Math.max(0, Math.min(1, (now - anim.start) / anim.duration));
      const eased = anim.phase === 'drop' ? t * t : easeOutBack(t, MOVE_OVERSHOOT);
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

  private updateGlow(now: number) {
    if (this.celebrating) {
      // Rhythmic pulses (bypassing the normal per-cube tween) — each pulse
      // rises and falls on a smooth sine envelope, like a heartbeat.
      const elapsed = now - this.celebrationStart;
      const cycle = (elapsed % CELEBRATION_PULSE_MS) / CELEBRATION_PULSE_MS;
      const envelope = Math.sin(Math.min(1, cycle) * Math.PI);
      const symbolIntensity = SYMBOL_CELEBRATE_INTENSITY * envelope;
      const edgeBrightness = EDGE_BASE_BRIGHTNESS + (EDGE_CELEBRATE_BRIGHTNESS - EDGE_BASE_BRIGHTNESS) * envelope;
      const decalOpacity = DECAL_CELEBRATE_PEAK * envelope;

      this.cubes.forEach((entry) => {
        entry.faceMaterials.forEach((mat) => {
          mat.emissiveIntensity = symbolIntensity;
        });
        entry.edgeMaterial.color.copy(entry.baseColor).multiplyScalar(edgeBrightness);
        entry.glowDecalMaterial.opacity = decalOpacity;
        entry.glowDecal.position.x = entry.group.position.x;
        entry.glowDecal.position.z = entry.group.position.z;
        // Keep the tween state in sync so normal glow resumes smoothly once celebration ends.
        const current: GlowValues = { symbol: symbolIntensity, edge: edgeBrightness, decal: decalOpacity };
        entry.glowFrom = { ...current };
        entry.glowTo = { ...current };
        entry.glowStart = now;
      });
      return;
    }

    this.cubes.forEach((entry, id) => {
      const connected = this.glowingIds.has(id);
      const target: GlowValues = {
        symbol: connected ? SYMBOL_CONNECTED_INTENSITY : 0,
        edge: EDGE_BASE_BRIGHTNESS,
        decal: connected ? 0.45 : 0,
      };

      if (target.symbol !== entry.glowTo.symbol || target.edge !== entry.glowTo.edge || target.decal !== entry.glowTo.decal) {
        // Target changed mid-transition — restart the tween from wherever it currently is, so it doesn't jump.
        const t0 = easeOutBack(Math.min(1, (now - entry.glowStart) / GLOW_TRANSITION_MS));
        entry.glowFrom = {
          symbol: lerp(entry.glowFrom.symbol, entry.glowTo.symbol, t0),
          edge: lerp(entry.glowFrom.edge, entry.glowTo.edge, t0),
          decal: lerp(entry.glowFrom.decal, entry.glowTo.decal, t0),
        };
        entry.glowTo = target;
        entry.glowStart = now;
      }

      const t = easeOutBack(Math.min(1, (now - entry.glowStart) / GLOW_TRANSITION_MS));
      const symbolIntensity = Math.max(0, lerp(entry.glowFrom.symbol, entry.glowTo.symbol, t));
      const edgeBrightness = Math.max(0, lerp(entry.glowFrom.edge, entry.glowTo.edge, t));
      const decalOpacity = Math.min(1, Math.max(0, lerp(entry.glowFrom.decal, entry.glowTo.decal, t)));

      entry.faceMaterials.forEach((mat) => {
        mat.emissiveIntensity = symbolIntensity;
      });
      entry.edgeMaterial.color.copy(entry.baseColor).multiplyScalar(edgeBrightness);
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
    this.updateGlow(now);
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
