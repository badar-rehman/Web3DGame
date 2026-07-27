import { CellType, CubeState, LevelData } from './types';

export type ElevationKind = 'ground' | 'wall' | 'stacked';

/**
 * The terrain type actually in effect at (x, y) right now. Identical to
 * `level.cells[y][x]` everywhere except an Elevator tile, whose effective
 * type flips between Wall (up) and Floor (down) every completed move,
 * sharing one clock across the whole level — `movePhase` is that clock's
 * parity (only ever 0 or 1 in practice; only parity matters). Never cached,
 * never written back to `level.cells` — `level` objects are long-lived
 * singletons shared across restarts and hypothetical BFS futures (hints,
 * offline solvers), so phase must stay a pure function of the phase passed
 * in, not stored state.
 */
export function effectiveCellAt(level: LevelData, x: number, y: number, movePhase: number): CellType {
  const tile = level.elevatorTiles?.find((t) => t.x === x && t.y === y);
  if (tile) {
    const up = (movePhase % 2 === 0) === tile.startsUp;
    return up ? CellType.Wall : CellType.Floor;
  }
  return level.cells[y]?.[x] ?? CellType.Floor;
}

/**
 * Whether `cube` is currently riding: standing on a cell that currently
 * reads as Wall (a static Wall, or an Elevator tile mid-"up") — true for
 * *any* cube, not just a level's designated stacked-pair rider, since
 * terrain type is unambiguous, no tiebreaker needed — or coincident with
 * another cube, which *does* need a fixed tiebreaker: two coincident cubes
 * are symmetric from position alone (this is exactly the case at a stacked
 * level's start, where carrier and rider both sit on the same plain-floor
 * cell, neither one on a Wall), so only the level's designated rider is ever
 * "the one on top" when coincident — matching the original stacking
 * mechanic exactly, with zero regression risk.
 */
export function elevationKind(
  level: LevelData,
  cube: CubeState,
  cubes: CubeState[],
  movePhase: number,
): ElevationKind {
  const pair = level.stackedPair;
  if (pair && cube.id === pair.rider) {
    const coincidentWithAny = cubes.some((c) => c.id !== cube.id && c.x === cube.x && c.y === cube.y);
    if (coincidentWithAny) return 'stacked';
  }
  if (effectiveCellAt(level, cube.x, cube.y, movePhase) === CellType.Wall) return 'wall';
  return 'ground';
}

export function isElevatedInLevel(
  level: LevelData,
  cube: CubeState,
  cubes: CubeState[],
  movePhase: number,
): boolean {
  return elevationKind(level, cube, cubes, movePhase) !== 'ground';
}

/**
 * Obstacle blocks everyone. Wall and the outer boundary pipe both block only
 * non-elevated cubes — an elevated cube climbs over either one, so a rider
 * pushed toward an enclosed level's edge goes over the boundary and falls off
 * exactly like it would on an open edge, rather than stopping there.
 */
export function isBlockedInLevel(
  level: LevelData,
  x: number,
  y: number,
  elevated: boolean,
  movePhase: number,
): boolean {
  if (x < 0 || y < 0 || x >= level.width || y >= level.height) return level.hasBoundary && !elevated;
  const cell = effectiveCellAt(level, x, y, movePhase);
  if (cell === CellType.Obstacle) return true;
  if (cell === CellType.Wall) return !elevated;
  return false;
}
