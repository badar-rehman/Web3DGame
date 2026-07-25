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

export interface LevelData {
  id: number;
  name: string;
  width: number;
  height: number;
  /** Row-major grid: cells[row][col]. */
  cells: CellType[][];
  /** Starting positions of movable cubes. */
  cubes: Vec2[];
  /** Grid cells a cube must occupy to win. */
  targets: Vec2[];
}
