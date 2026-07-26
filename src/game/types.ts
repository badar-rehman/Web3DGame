export enum CellType {
  Floor = 0,
  Wall = 1,
  Obstacle = 2,
}

export interface Vec2 {
  x: number;
  y: number;
}

export type Direction = 'up' | 'down' | 'left' | 'right';

export const DIRECTION_DELTA: Record<Direction, Vec2> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/** A movable, identifiable cube. Each id has a fixed color/label (see cubeVisuals.ts). */
export interface CubeState extends Vec2 {
  id: string;
}

/**
 * A required bond between two cubes: `from` must sit exactly one cardinal
 * step (dx, dy) away from `to` — e.g. {from:'A', to:'B', dx:0, dy:-1} means
 * "A sits directly above B". Goals are translation-invariant: the whole
 * formation can be assembled anywhere on the board.
 */
export interface RelationEdge {
  from: string;
  to: string;
  dx: number;
  dy: number;
}

export interface LevelData {
  id: number;
  name: string;
  width: number;
  height: number;
  /** Row-major grid: cells[row][col]. Interior maze walls only — the outer edge is not part of this grid. */
  cells: CellType[][];
  /** Starting positions of movable, identified cubes. */
  cubes: CubeState[];
  /** The relative formation that must be assembled to win. */
  goal: RelationEdge[];
  /**
   * Whether the level's outer edge is enclosed. When true, a boundary pipe
   * traces the perimeter and cubes can't be pushed past it. When false,
   * there's no rail — a cube pushed past the edge falls and the level fails.
   */
  hasBoundary: boolean;
  /** The true optimal (BFS-shortest) move count, precomputed offline — used to award stars. */
  par: number;
}
