import { DIRECTION_DELTA, Direction, Vec2 } from './types';

export interface GridQuery {
  isBlocked(x: number, y: number): boolean;
}

export interface SlideResult {
  positions: Vec2[];
  moved: boolean;
}

function key(v: Vec2): string {
  return `${v.x},${v.y}`;
}

/**
 * Moves every cube exactly one grid cell in `direction`. A cube steps forward
 * only if the destination is in bounds, not a wall/obstacle, and not occupied
 * by another cube; otherwise it stays put. Cubes furthest along the direction
 * of travel are resolved first, so a cube that can't move (e.g. blocked by a
 * wall) correctly blocks the cube behind it from moving into its cell too.
 */
export function computeStep(cubes: Vec2[], direction: Direction, grid: GridQuery): SlideResult {
  const delta = DIRECTION_DELTA[direction];
  const order = cubes
    .map((_, i) => i)
    .sort((a, b) => {
      if (delta.x !== 0) {
        return delta.x > 0 ? cubes[b].x - cubes[a].x : cubes[a].x - cubes[b].x;
      }
      return delta.y > 0 ? cubes[b].y - cubes[a].y : cubes[a].y - cubes[b].y;
    });

  const positions: Vec2[] = cubes.map((c) => ({ ...c }));
  const occupied = new Set(cubes.map(key));

  for (const idx of order) {
    const start = positions[idx];
    occupied.delete(key(start));

    const next = { x: start.x + delta.x, y: start.y + delta.y };
    const final = grid.isBlocked(next.x, next.y) || occupied.has(key(next)) ? start : next;

    positions[idx] = final;
    occupied.add(key(final));
  }

  const moved = positions.some((p, i) => p.x !== cubes[i].x || p.y !== cubes[i].y);
  return { positions, moved };
}
