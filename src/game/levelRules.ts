import { CellType, CubeState, LevelData } from './types';

export type ElevationKind = 'ground' | 'wall' | 'stacked';

/**
 * Whether `cube` is currently riding: coincident with any other cube (only
 * the level's one designated rider can ever be elevated, so there's no
 * ambiguity about which of two coincident cubes is "on top"), or standing on
 * a Wall cell. A rider can freely mount a different ground cube than its
 * original carrier, or transfer straight from one cube to another, or from a
 * wall onto any cube it meets — purely derived from current positions +
 * level geometry, never stored.
 */
export function elevationKind(level: LevelData, cube: CubeState, cubes: CubeState[]): ElevationKind {
  const pair = level.stackedPair;
  if (!pair || cube.id !== pair.rider) return 'ground';
  const coincidentWithAny = cubes.some((c) => c.id !== cube.id && c.x === cube.x && c.y === cube.y);
  if (coincidentWithAny) return 'stacked';
  if (level.cells[cube.y]?.[cube.x] === CellType.Wall) return 'wall';
  return 'ground';
}

export function isElevatedInLevel(level: LevelData, cube: CubeState, cubes: CubeState[]): boolean {
  return elevationKind(level, cube, cubes) !== 'ground';
}

/**
 * Obstacle blocks everyone. Wall and the outer boundary pipe both block only
 * non-elevated cubes — an elevated cube climbs over either one, so a rider
 * pushed toward an enclosed level's edge goes over the boundary and falls off
 * exactly like it would on an open edge, rather than stopping there.
 */
export function isBlockedInLevel(level: LevelData, x: number, y: number, elevated: boolean): boolean {
  if (x < 0 || y < 0 || x >= level.width || y >= level.height) return level.hasBoundary && !elevated;
  const cell = level.cells[y][x];
  if (cell === CellType.Obstacle) return true;
  if (cell === CellType.Wall) return !elevated;
  return false;
}
