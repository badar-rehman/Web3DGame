import { CubeState, Direction, DIRECTION_DELTA, RelationEdge, Vec2 } from './types';
import { cubeVisual } from './cubeVisuals';

export interface FormationStatus {
  solved: boolean;
  satisfiedEdges: Set<number>;
  /** Every cube that has at least one satisfied bond (whole-cube "connected" indicator). */
  glowingCubeIds: Set<string>;
  /** Per cube, which cardinal faces currently touch a correctly-bonded neighbor. */
  directionalGlow: Map<string, Set<Direction>>;
}

function directionFromDelta(dx: number, dy: number): Direction | null {
  for (const dir of Object.keys(DIRECTION_DELTA) as Direction[]) {
    const delta = DIRECTION_DELTA[dir];
    if (delta.x === dx && delta.y === dy) return dir;
  }
  return null;
}

function addDirection(map: Map<string, Set<Direction>>, id: string, dir: Direction | null) {
  if (!dir) return;
  if (!map.has(id)) map.set(id, new Set());
  map.get(id)!.add(dir);
}

/**
 * Checks the current cube positions against the goal's relative bonds.
 * The formation is translation-invariant — only the relationships between
 * cubes matter, not where they sit on the board. A cube currently elevated
 * (stacked on another cube, or riding a Wall cell) can never satisfy a bond
 * — it isn't actually resting on the ground plane with its partner, even if
 * their x/y happen to line up.
 */
export function evaluateFormation(
  cubes: CubeState[],
  goal: RelationEdge[],
  isElevated: (cube: CubeState, cubes: CubeState[]) => boolean = () => false,
): FormationStatus {
  const byId = new Map(cubes.map((c) => [c.id, c]));
  const satisfiedEdges = new Set<number>();
  const glowingCubeIds = new Set<string>();
  const directionalGlow = new Map<string, Set<Direction>>();

  goal.forEach((edge, i) => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) return;
    if (isElevated(from, cubes) || isElevated(to, cubes)) return;
    if (from.x - to.x === edge.dx && from.y - to.y === edge.dy) {
      satisfiedEdges.add(i);
      glowingCubeIds.add(edge.from);
      glowingCubeIds.add(edge.to);

      // `from` sits (dx, dy) away from `to` — that's the face of `to` that
      // touches `from`, and the opposite face of `from` that touches `to`.
      addDirection(directionalGlow, edge.to, directionFromDelta(edge.dx, edge.dy));
      addDirection(directionalGlow, edge.from, directionFromDelta(-edge.dx, -edge.dy));
    }
  });

  return {
    solved: goal.length > 0 && satisfiedEdges.size === goal.length,
    satisfiedEdges,
    glowingCubeIds,
    directionalGlow,
  };
}

/**
 * Human-readable description of a bond, for the HUD checklist. Uses each
 * cube's symbol, never its internal letter id. Same-row/same-column bonds
 * read as "left of"/"above" etc. regardless of exact distance — most bonds
 * are unit-distance, but a bond linking two otherwise-separate groups into
 * one connected formation may span further, and should still read naturally.
 */
export function relationText(edge: RelationEdge): string {
  const from = cubeVisual(edge.from).glyph;
  const to = cubeVisual(edge.to).glyph;
  if (edge.dx === 0 && edge.dy < 0) return `${from} above ${to}`;
  if (edge.dx === 0 && edge.dy > 0) return `${from} below ${to}`;
  if (edge.dy === 0 && edge.dx < 0) return `${from} left of ${to}`;
  if (edge.dy === 0 && edge.dx > 0) return `${from} right of ${to}`;
  return `${from} at (${edge.dx}, ${edge.dy}) from ${to}`;
}

/**
 * Lays out every cube referenced by the goal on a small relative grid (one
 * cube is pinned at the origin, the rest follow the bond offsets), for
 * drawing the goal preview diagram in the HUD. A goal can reference more than
 * one independent bonded group with no edge directly linking them (e.g. two
 * separate pairs) — each such connected component gets its own BFS layout,
 * stacked in additional rows below the previous one, so every cube the goal
 * mentions still appears in the preview instead of only the first group.
 */
export function computeRelativeLayout(goal: RelationEdge[]): Map<string, Vec2> {
  const adjacency = new Map<string, { neighbor: string; dx: number; dy: number }[]>();
  const addEdge = (a: string, b: string, dx: number, dy: number) => {
    if (!adjacency.has(a)) adjacency.set(a, []);
    adjacency.get(a)!.push({ neighbor: b, dx, dy });
  };
  goal.forEach((edge) => {
    addEdge(edge.to, edge.from, edge.dx, edge.dy);
    addEdge(edge.from, edge.to, -edge.dx, -edge.dy);
  });

  const positions = new Map<string, Vec2>();
  if (goal.length === 0) return positions;

  const allIds: string[] = [];
  const seenIds = new Set<string>();
  goal.forEach((edge) => {
    for (const id of [edge.to, edge.from]) {
      if (!seenIds.has(id)) {
        seenIds.add(id);
        allIds.push(id);
      }
    }
  });

  let rowOffset = 0;
  for (const startId of allIds) {
    if (positions.has(startId)) continue;

    const componentPositions = new Map<string, Vec2>();
    componentPositions.set(startId, { x: 0, y: 0 });
    const queue = [startId];
    while (queue.length) {
      const current = queue.shift()!;
      const currentPos = componentPositions.get(current)!;
      for (const { neighbor, dx, dy } of adjacency.get(current) ?? []) {
        if (componentPositions.has(neighbor)) continue;
        componentPositions.set(neighbor, { x: currentPos.x + dx, y: currentPos.y + dy });
        queue.push(neighbor);
      }
    }

    const ys = [...componentPositions.values()].map((p) => p.y);
    const minY = Math.min(...ys);
    componentPositions.forEach((pos, id) => positions.set(id, { x: pos.x, y: pos.y - minY + rowOffset }));
    rowOffset += Math.max(...ys) - minY + 2; // +1 blank row gap between components
  }

  return positions;
}
