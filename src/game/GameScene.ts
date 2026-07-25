import * as THREE from 'three';
import { CellType, CubeState, Direction, DIRECTION_DELTA, LevelData } from './types';
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
const BUMP_DISTANCE = CELL_SIZE * 0.08;
const BUMP_OUT_MS = 75;
const BUMP_BACK_MS = 130;

// The camera looks toward the level from this fixed diagonal direction,
// rotated 30° around the vertical axis from the plain corner view — this
// pulls the grid's up/down/left/right axes closer to the screen's own
// up/down/left/right so swipe direction reads less ambiguously, and it
// changes the level's on-screen footprint enough to help it fit in frame.
// Background cubes scatter around a full ring for even left/right coverage,
// then any that land in front of the stage get pushed straight back along
// -CAMERA_DIR until they clear a safety margin — guaranteeing every cube
// renders behind the level no matter where it started.
const CAMERA_TILT_DEG = 30;
const CAMERA_DIR = new THREE.Vector3(1, 1.2, 1)
  .normalize()
  // Negative here is what actually reads as an anticlockwise turn on screen
  // (and is the direction that pulls grid up/right toward screen up/right).
  .applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(-CAMERA_TILT_DEG));
const BG_BEHIND_MARGIN = 6;

interface BgLayer {
  count: number;
  radiusMin: number;
  radiusMax: number;
  heightMin: number;
  heightMax: number;
  sizeMin: number;
  sizeMax: number;
  darken: number; // 0 = full color, 1 = fully black — deeper layers are darker for depth cueing
}

// Four depth bands (near/mid/far/deep) instead of one flat scatter, so the
// swarm reads as a dense field of layers floating at different depths rather
// than a single sparse cloud.
const BG_LAYERS: BgLayer[] = [
  { count: 14, radiusMin: 10, radiusMax: 15, heightMin: -7, heightMax: 3, sizeMin: 1.4, sizeMax: 3.2, darken: 0.15 },
  { count: 16, radiusMin: 15, radiusMax: 21, heightMin: -10, heightMax: 4, sizeMin: 2.2, sizeMax: 4.4, darken: 0.4 },
  { count: 18, radiusMin: 21, radiusMax: 28, heightMin: -12, heightMax: 5, sizeMin: 3, sizeMax: 6, darken: 0.62 },
  { count: 20, radiusMin: 28, radiusMax: 38, heightMin: -15, heightMax: 6, sizeMin: 4, sizeMax: 8, darken: 0.8 },
];
const BG_DARK_COLORS = [0x1a2038, 0x202a4a, 0x161b30, 0x252f52];
const BG_ACCENT_COLORS = [0x6ee7f5, 0xf5b26e, 0xf56ea8, 0x8af56e, 0xf5e26e, 0xa56ef5];
const BG_ACCENT_EVERY = 7;
// How much wider the camera frustum is than the level's own tight bounds,
// purely to leave room for the background swarm to be visible around it.
const BG_BREATHING_ROOM = 1.7;

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

/** Advances a single scalar spring tween toward `target`, retargeting mid-flight without jumps. */
function stepScalarTween(tween: ScalarTween, target: number, now: number, durationMs: number): number {
  if (target !== tween.to) {
    const t0 = easeOutBack(Math.min(1, (now - tween.start) / durationMs));
    tween.from = lerp(tween.from, tween.to, t0);
    tween.to = target;
    tween.start = now;
  }
  const t = easeOutBack(Math.min(1, (now - tween.start) / durationMs));
  return Math.max(0, lerp(tween.from, tween.to, t));
}

const COLOR = {
  floor: 0x1c2038,
  wall: 0x4b5580,
  obstacle: 0x8a6a45,
  gridLine: 0xffffff,
};

type AnimPhase = 'move' | 'slide' | 'hang' | 'drop' | 'bump-out' | 'bump-back';

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

interface ScalarTween {
  from: number;
  to: number;
  start: number;
}

const SIDE_DIRECTIONS: Direction[] = ['up', 'down', 'left', 'right'];

interface BackgroundCube {
  mesh: THREE.Mesh;
  basePosition: THREE.Vector3;
  spin: THREE.Vector3;
  bobAmplitude: number;
  bobSpeed: number;
  bobPhase: number;
}

interface CubeEntry {
  group: THREE.Group;
  topMaterial: THREE.MeshStandardMaterial;
  /** One independent material per cardinal side, so only the face touching a satisfied bond's partner glows. */
  sideMaterials: Record<Direction, THREE.MeshStandardMaterial>;
  sideGlow: Record<Direction, ScalarTween>;
  /** Glow bar along each top-face edge — mirrors sideGlow but stays visible even when the side face itself is squeezed between cubes. */
  topEdgeMaterials: Record<Direction, THREE.MeshBasicMaterial>;
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

// Bottom + vertical edges only — the 4 top edges are handled separately below
// as per-direction glow bars, so they aren't duplicated here.
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
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ];
  return pairs.map(([i, j]) => [corners[i], corners[j]]);
})();

// The top face's 4 perimeter edges, one per cardinal grid direction — always
// fully visible from the fixed isometric camera (unlike the vertical side
// faces, which get squeezed out of view between adjacent cubes). Each one
// gets its own glow bar so a satisfied bond is legible by looking straight
// down at the cube, no matter what's blocking its side.
const TOP_EDGE_BY_DIR: Record<Direction, [THREE.Vector3, THREE.Vector3]> = (() => {
  const h = CUBE_SIZE / 2;
  const backLeft = new THREE.Vector3(-h, h, -h);
  const backRight = new THREE.Vector3(h, h, -h);
  const frontRight = new THREE.Vector3(h, h, h);
  const frontLeft = new THREE.Vector3(-h, h, h);
  return {
    up: [backLeft, backRight],
    right: [backRight, frontRight],
    down: [frontRight, frontLeft],
    left: [frontLeft, backLeft],
  };
})();
const TOP_EDGE_RADIUS = EDGE_RADIUS * 1.8;
const TOP_EDGE_LIT_BRIGHTNESS = 3.4;

const GLOW_TEXTURE = createGlowTexture();
const SIDE_TEXTURES = buildSideTextures();

export class GameScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera!: THREE.OrthographicCamera;
  private cubes = new Map<string, CubeEntry>();
  private cubeAnims = new Map<string, CubeAnim>();
  private glowingIds = new Set<string>();
  private directionalGlow = new Map<string, Set<Direction>>();
  private level!: LevelData;
  private levelGroup = new THREE.Group();
  private onSettled: (() => void) | null = null;
  private animating = false;
  private celebrating = false;
  private celebrationStart = 0;
  private bgGroup = new THREE.Group();
  private bgCubes: BackgroundCube[] = [];
  private lastFrameTime = performance.now();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.background = new THREE.Color(0x0b0e1a);
    this.scene.fog = new THREE.Fog(0x0b0e1a, 25, 55);
    this.scene.add(this.levelGroup);
    this.scene.add(this.bgGroup);

    this.setupLights();
    this.setupCamera();
    this.buildBackgroundField();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /**
   * A slow-drifting swarm of large, solid cubes scattered in three depth
   * layers behind the play area — pure atmosphere. Every cube is placed
   * within a wide arc directly behind the stage (relative to the camera's
   * fixed viewing direction) and then nudged further back if needed, so
   * none of them can ever render in front of the level. Deeper layers are
   * darker and bigger, which — combined with the scene fog — reads as
   * depth even though the orthographic camera has no perspective falloff.
   */
  private buildBackgroundField() {
    let index = 0;
    BG_LAYERS.forEach((layer) => {
      for (let i = 0; i < layer.count; i++, index++) {
        const isAccent = index % BG_ACCENT_EVERY === 0;
        const size = THREE.MathUtils.randFloat(layer.sizeMin, layer.sizeMax);
        const geo = new THREE.BoxGeometry(size, size, size);
        const color = new THREE.Color(
          isAccent
            ? BG_ACCENT_COLORS[Math.floor(Math.random() * BG_ACCENT_COLORS.length)]
            : BG_DARK_COLORS[Math.floor(Math.random() * BG_DARK_COLORS.length)],
        );
        // Accent cubes are naturally brighter/more saturated than the dark
        // palette, so they get extra darkening on top of the layer's own
        // depth darkening to stay a faint contrast note, not a focal point.
        color.multiplyScalar(1 - layer.darken).multiplyScalar(isAccent ? 0.5 : 1);
        const material = new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0 });
        const mesh = new THREE.Mesh(geo, material);

        const angle = Math.random() * Math.PI * 2;
        const radius = THREE.MathUtils.randFloat(layer.radiusMin, layer.radiusMax);
        const height = THREE.MathUtils.randFloat(layer.heightMin, layer.heightMax);
        const basePosition = new THREE.Vector3(Math.cos(angle) * radius, height, Math.sin(angle) * radius);

        // Safety net: guarantee this cube sits behind the stage along the
        // camera's view axis, regardless of the angle/height it landed on.
        const dot = basePosition.dot(CAMERA_DIR);
        if (dot > -BG_BEHIND_MARGIN) {
          basePosition.addScaledVector(CAMERA_DIR, -(dot + BG_BEHIND_MARGIN));
        }

        mesh.position.copy(basePosition);
        mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

        this.bgGroup.add(mesh);
        this.bgCubes.push({
          mesh,
          basePosition,
          spin: new THREE.Vector3(
            THREE.MathUtils.randFloat(-0.06, 0.06),
            THREE.MathUtils.randFloat(-0.09, 0.09),
            THREE.MathUtils.randFloat(-0.06, 0.06),
          ),
          bobAmplitude: THREE.MathUtils.randFloat(0.6, 1.8),
          bobSpeed: THREE.MathUtils.randFloat(0.15, 0.35),
          bobPhase: Math.random() * Math.PI * 2,
        });
      }
    });
  }

  private updateBackground(now: number, deltaSeconds: number) {
    const t = now * 0.001;
    this.bgCubes.forEach(({ mesh, basePosition, spin, bobAmplitude, bobSpeed, bobPhase }) => {
      mesh.rotation.x += spin.x * deltaSeconds;
      mesh.rotation.y += spin.y * deltaSeconds;
      mesh.rotation.z += spin.z * deltaSeconds;
      mesh.position.y = basePosition.y + Math.sin(t * bobSpeed + bobPhase) * bobAmplitude;
    });
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
    this.camera.position.copy(CAMERA_DIR.clone().multiplyScalar(30));
    this.camera.lookAt(0, 0, 0);
  }

  private gridCenter(): THREE.Vector3 {
    const x = ((this.level.width - 1) * CELL_SIZE) / 2;
    const z = ((this.level.height - 1) * CELL_SIZE) / 2;
    return new THREE.Vector3(x, 0, z);
  }

  private frameCameraToLevel() {
    const center = this.gridCenter();
    const span = Math.max(this.level.width, this.level.height) * CELL_SIZE;
    const distance = span * 1.6 + 10;
    this.camera.position.copy(center.clone().addScaledVector(CAMERA_DIR, distance));
    this.camera.lookAt(center);
    this.camera.updateMatrixWorld();

    // Project every corner of the level's bounding box (including boundary
    // pipe/cube height) onto the camera's actual screen-space right/up axes,
    // rather than assuming a fixed-angle diamond — this keeps everything in
    // frame regardless of CAMERA_TILT_DEG or a level's width/height ratio.
    const { width, height } = this.level;
    const xMin = -0.5 * CELL_SIZE;
    const xMax = (width - 0.5) * CELL_SIZE;
    const zMin = -0.5 * CELL_SIZE;
    const zMax = (height - 0.5) * CELL_SIZE;
    const yMin = FLOOR_Y - FLOOR_TILE_HEIGHT;
    const yMax = FLOOR_Y + CUBE_SIZE;

    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    this.camera.matrixWorld.extractBasis(right, up, new THREE.Vector3());

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const corner = new THREE.Vector3();
    for (const x of [xMin, xMax]) {
      for (const y of [yMin, yMax]) {
        for (const z of [zMin, zMax]) {
          corner.set(x, y, z).sub(center);
          const sx = corner.dot(right);
          const sy = corner.dot(up);
          minX = Math.min(minX, sx);
          maxX = Math.max(maxX, sx);
          minY = Math.min(minY, sy);
          maxY = Math.max(maxY, sy);
        }
      }
    }

    const PADDING = 1.8;
    const aspect = this.renderer.domElement.clientWidth / Math.max(1, this.renderer.domElement.clientHeight);
    const halfW = Math.max(Math.abs(minX), Math.abs(maxX)) + PADDING;
    const halfH = Math.max(Math.abs(minY), Math.abs(maxY)) + PADDING;
    // Zoom out beyond the level's own tight bounds so the background swarm
    // has real screen space to read as layered depth instead of being
    // clipped by an orthographic frustum sized to just the playfield.
    const halfSize = Math.max(halfH, halfW / aspect) * BG_BREATHING_ROOM;
    this.camera.left = -halfSize * aspect;
    this.camera.right = halfSize * aspect;
    this.camera.top = halfSize;
    this.camera.bottom = -halfSize;
    this.camera.updateProjectionMatrix();

    // Keep the background swarm centered around wherever the camera is looking.
    this.bgGroup.position.set(center.x, 0, center.z);
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
    // Reuses the same carved-panel texture as the cube sides, tinted to the
    // wall color, so maze walls read as being built from the same cube stock.
    const wallMat = new THREE.MeshStandardMaterial({ map: SIDE_TEXTURES.base, color: COLOR.wall, roughness: 0.7 });
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

      const makeSideMat = () =>
        new THREE.MeshStandardMaterial({
          map: SIDE_TEXTURES.base,
          emissiveMap: SIDE_TEXTURES.emissive,
          emissive: baseColor,
          emissiveIntensity: 0,
          color: baseColor,
          roughness: 0.55,
          metalness: 0.08,
        });
      // A separate material per cardinal side, so a satisfied bond only
      // lights up the specific face that touches its partner — not the
      // whole cube.
      const sideMaterials: Record<Direction, THREE.MeshStandardMaterial> = {
        right: makeSideMat(),
        left: makeSideMat(),
        down: makeSideMat(),
        up: makeSideMat(),
      };

      const topTex = getTopTextures(visual.symbol);
      // Base color map tints the near-white carved texture to this cube's
      // hue; emissiveMap masks the glow to just the carved lines/outline.
      const topMat = new THREE.MeshStandardMaterial({
        map: topTex.base,
        emissiveMap: topTex.emissive,
        emissive: baseColor,
        emissiveIntensity: 0,
        color: baseColor,
        roughness: 0.5,
        metalness: 0.08,
      });
      // BoxGeometry face group order: +x, -x, +y (top), -y (bottom), +z, -z.
      // Grid "right"(+x)/"left"(-x)/"down"(+z, dy=+1)/"up"(-z, dy=-1); the
      // bottom face reuses "left" since it's never actually visible.
      const body = new THREE.Mesh(bodyGeo, [
        sideMaterials.right,
        sideMaterials.left,
        topMat,
        sideMaterials.left,
        sideMaterials.down,
        sideMaterials.up,
      ]);
      body.castShadow = true;
      body.receiveShadow = true;
      group.add(body);

      const edgeMat = new THREE.MeshBasicMaterial({ color: baseColor.clone().multiplyScalar(EDGE_BASE_BRIGHTNESS) });
      BOX_EDGES.forEach(([a, b]) => group.add(edgeCylinder(a, b, EDGE_RADIUS, edgeMat)));

      const topEdgeMaterials: Record<Direction, THREE.MeshBasicMaterial> = {} as Record<Direction, THREE.MeshBasicMaterial>;
      SIDE_DIRECTIONS.forEach((dir) => {
        const mat = new THREE.MeshBasicMaterial({ color: baseColor.clone().multiplyScalar(EDGE_BASE_BRIGHTNESS) });
        topEdgeMaterials[dir] = mat;
        const [a, b] = TOP_EDGE_BY_DIR[dir];
        group.add(edgeCylinder(a, b, TOP_EDGE_RADIUS, mat));
      });

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
      const sideGlow = Object.fromEntries(
        SIDE_DIRECTIONS.map((dir) => [dir, { from: 0, to: 0, start: 0 } satisfies ScalarTween]),
      ) as Record<Direction, ScalarTween>;
      this.cubes.set(cube.id, {
        group,
        topMaterial: topMat,
        sideMaterials,
        sideGlow,
        topEdgeMaterials,
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
   * takes over and it drops away. A cube listed in `blockedIds` didn't move
   * at all (a wall, obstacle, edge, or another cube stopped it) — it nudges
   * a little toward the swiped direction and springs back, so the attempt
   * still reads as physical feedback rather than nothing happening. Calls
   * onSettled once every animation finishes.
   */
  animateCubesTo(positions: CubeState[], blockedIds: Set<string>, direction: Direction, onSettled: () => void) {
    const now = performance.now();
    this.onSettled = onSettled;
    this.animating = true;
    const delta = DIRECTION_DELTA[direction];

    positions.forEach((pos, index) => {
      const entry = this.cubes.get(pos.id);
      if (!entry) return;
      const start = now + index * MOVE_STAGGER_MS;

      if (blockedIds.has(pos.id)) {
        const from = entry.group.position.clone();
        const to = from.clone().add(new THREE.Vector3(delta.x * BUMP_DISTANCE, 0, delta.y * BUMP_DISTANCE));
        this.cubeAnims.set(pos.id, { phase: 'bump-out', from, to, start, duration: BUMP_OUT_MS });
        return;
      }

      const falling = this.isOutOfBounds(pos);
      const { wx, wz } = this.toWorld(pos.x, pos.y);
      const to = new THREE.Vector3(wx, FLOOR_Y + CUBE_SIZE / 2, wz);
      this.cubeAnims.set(pos.id, {
        phase: falling ? 'slide' : 'move',
        from: entry.group.position.clone(),
        to,
        start,
        duration: MOVE_DURATION_MS,
      });
    });
  }

  /** Cubes currently satisfying a formation bond get a steady (non-pulsing) symbol glow. */
  setGlowingCubes(ids: Set<string>) {
    this.glowingIds = ids;
  }

  /** Per cube, which cardinal faces currently touch a correctly-bonded neighbor. */
  setBondDirections(directions: Map<string, Set<Direction>>) {
    this.directionalGlow = directions;
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
        } else if (anim.phase === 'bump-out') {
          this.cubeAnims.set(id, { phase: 'bump-back', from: anim.to, to: anim.from, start: now, duration: BUMP_BACK_MS });
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
        entry.topMaterial.emissiveIntensity = symbolIntensity;
        SIDE_DIRECTIONS.forEach((dir) => {
          entry.sideMaterials[dir].emissiveIntensity = symbolIntensity;
          entry.sideGlow[dir] = { from: symbolIntensity, to: symbolIntensity, start: now };
          entry.topEdgeMaterials[dir].color.copy(entry.baseColor).multiplyScalar(edgeBrightness);
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

      entry.topMaterial.emissiveIntensity = symbolIntensity;
      entry.edgeMaterial.color.copy(entry.baseColor).multiplyScalar(edgeBrightness);
      entry.glowDecalMaterial.opacity = decalOpacity;
      entry.glowDecal.position.x = entry.group.position.x;
      entry.glowDecal.position.z = entry.group.position.z;

      // Each side face — and its matching top-edge glow bar, which stays
      // visible even when the side face itself is squeezed out of view
      // between adjacent cubes — lights up independently, only when its own
      // specific bond direction is currently satisfied.
      const satisfiedDirs = this.directionalGlow.get(id);
      SIDE_DIRECTIONS.forEach((dir) => {
        const dirTarget = satisfiedDirs?.has(dir) ? SYMBOL_CONNECTED_INTENSITY : 0;
        const intensity = stepScalarTween(entry.sideGlow[dir], dirTarget, now, GLOW_TRANSITION_MS);
        entry.sideMaterials[dir].emissiveIntensity = intensity;

        const dirBrightness =
          EDGE_BASE_BRIGHTNESS + (TOP_EDGE_LIT_BRIGHTNESS - EDGE_BASE_BRIGHTNESS) * (intensity / SYMBOL_CONNECTED_INTENSITY);
        entry.topEdgeMaterials[dir].color.copy(entry.baseColor).multiplyScalar(dirBrightness);
      });
    });
  }

  isAnimating(): boolean {
    return this.animating;
  }

  render() {
    const now = performance.now();
    const deltaSeconds = Math.min(0.1, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;
    this.updateAnims(now);
    this.updateGlow(now);
    this.updateBackground(now, deltaSeconds);
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
