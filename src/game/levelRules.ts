import { CellType, CubeState, LevelData } from './types';

export type ElevationKind = 'ground' | 'wall' | 'stacked';

/**
 * Whether `cube` is currently riding: still stacked on its carrier (only
 * relevant while they remain coincident), or standing on a Wall cell (either
 * mid-crossing, or permanently after separating from its carrier there).
 * Purely derived from the current positions + level geometry — never stored.
 */
export function elevationKind(level: LevelData, cube: CubeState, cubes: CubeState[]): ElevationKind {
  const pair = level.stackedPair;
  if (pair && cube.id === pair.rider) {
    const carrier = cubes.find((c) => c.id === pair.carrier);
    if (carrier && carrier.x === cube.x && carrier.y === cube.y) return 'stacked';
  }
  if (level.cells[cube.y]?.[cube.x] === CellType.Wall) return 'wall';
  return 'ground';
}

export function isElevatedInLevel(level: LevelData, cube: CubeState, cubes: CubeState[]): boolean {
  return elevationKind(level, cube, cubes) !== 'ground';
}

/** Obstacle blocks everyone; Wall blocks only non-elevated cubes; the boundary rule is unaffected by elevation. */
export function isBlockedInLevel(level: LevelData, x: number, y: number, elevated: boolean): boolean {
  if (x < 0 || y < 0 || x >= level.width || y >= level.height) return level.hasBoundary;
  const cell = level.cells[y][x];
  if (cell === CellType.Obstacle) return true;
  if (cell === CellType.Wall) return !elevated;
  return false;
}

/** Order-independent: true iff idA/idB (in either order) are the level's one authored carrier/rider pair. */
export function isDesignatedPair(level: LevelData, idA: string, idB: string): boolean {
  const pair = level.stackedPair;
  if (!pair) return false;
  return (idA === pair.carrier && idB === pair.rider) || (idA === pair.rider && idB === pair.carrier);
}
