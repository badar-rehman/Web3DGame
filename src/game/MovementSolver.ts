import { DIRECTION_DELTA, Direction, Vec2 } from './types';

export interface GridQuery {
  isBlocked(x: number, y: number, elevated: boolean): boolean;
}

export interface ComputeStepOptions<T> {
  /** Is this cube currently riding (not blocked by Wall)? Defaults to "never" — every existing level is unaffected. */
  isElevated?: (cube: T, cubes: T[]) => boolean;
  /** Are these two ids the level's one authored carrier/rider pair? Only consulted when they were already coincident at turn start. Defaults to "never". */
  isDesignatedPair?: (idA: string, idB: string) => boolean;
}

export interface SlideResult<T extends Vec2> {
  positions: T[];
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
 *
 * Elevation and "who started this turn where" are frozen from the
 * pre-mutation `cubes` array before the loop runs, never recomputed
 * mid-loop — this is what keeps the stacked-pair collision exception below
 * independent of processing order (see MovementSolver's stacking design).
 */
export function computeStep<T extends Vec2 & { id: string }>(
  cubes: T[],
  direction: Direction,
  grid: GridQuery,
  options: ComputeStepOptions<T> = {},
): SlideResult<T> {
  const isElevated = options.isElevated ?? (() => false);
  const isDesignatedPair = options.isDesignatedPair ?? (() => false);

  const delta = DIRECTION_DELTA[direction];
  const order = cubes
    .map((_, i) => i)
    .sort((a, b) => {
      if (delta.x !== 0) {
        return delta.x > 0 ? cubes[b].x - cubes[a].x : cubes[a].x - cubes[b].x;
      }
      return delta.y > 0 ? cubes[b].y - cubes[a].y : cubes[a].y - cubes[b].y;
    });

  const elevatedFlags = new Map<string, boolean>(cubes.map((c) => [c.id, isElevated(c, cubes)]));
  const startKeyById = new Map<string, string>(cubes.map((c) => [c.id, key(c)]));

  const positions: T[] = cubes.map((c) => ({ ...c }));
  // Cell -> ids of cubes currently there. A cell can briefly hold 2 ids only
  // for a still-coincident stacked pair; everywhere else this behaves exactly
  // like the old Set<string> of occupied keys.
  const occupied = new Map<string, Set<string>>();
  for (const c of cubes) {
    if (!occupied.has(key(c))) occupied.set(key(c), new Set());
    occupied.get(key(c))!.add(c.id);
  }

  for (const idx of order) {
    const start = positions[idx];
    const id = start.id;
    occupied.get(key(start))?.delete(id);

    const next = { x: start.x + delta.x, y: start.y + delta.y };
    const occupants = occupied.get(key(next));
    const collisionBlocked = occupants
      ? [...occupants].some((otherId) => {
          const sameCellAtTurnStart = startKeyById.get(id) === startKeyById.get(otherId);
          const excused = sameCellAtTurnStart && isDesignatedPair(id, otherId);
          return !excused;
        })
      : false;

    const blocked = grid.isBlocked(next.x, next.y, elevatedFlags.get(id)!) || collisionBlocked;
    const final: T = blocked ? start : { ...start, x: next.x, y: next.y };

    positions[idx] = final;
    const finalKey = key(final);
    if (!occupied.has(finalKey)) occupied.set(finalKey, new Set());
    occupied.get(finalKey)!.add(id);
  }

  const moved = positions.some((p, i) => p.x !== cubes[i].x || p.y !== cubes[i].y);
  return { positions, moved };
}
