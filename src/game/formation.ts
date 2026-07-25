import { CubeState, RelationEdge, Vec2 } from './types';

export interface FormationStatus {
  solved: boolean;
  satisfiedEdges: Set<number>;
  glowingCubeIds: Set<string>;
}

/**
 * Checks the current cube positions against the goal's relative bonds.
 * The formation is translation-invariant — only the relationships between
 * cubes matter, not where they sit on the board.
 */
export function evaluateFormation(cubes: CubeState[], goal: RelationEdge[]): FormationStatus {
  const byId = new Map(cubes.map((c) => [c.id, c]));
  const satisfiedEdges = new Set<number>();
  const glowingCubeIds = new Set<string>();

  goal.forEach((edge, i) => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) return;
    if (from.x - to.x === edge.dx && from.y - to.y === edge.dy) {
      satisfiedEdges.add(i);
      glowingCubeIds.add(edge.from);
      glowingCubeIds.add(edge.to);
    }
  });

  return {
    solved: goal.length > 0 && satisfiedEdges.size === goal.length,
    satisfiedEdges,
    glowingCubeIds,
  };
}

/** Human-readable description of a bond, for the HUD checklist. */
export function relationText(edge: RelationEdge): string {
  if (edge.dx === 0 && edge.dy === -1) return `${edge.from} above ${edge.to}`;
  if (edge.dx === 0 && edge.dy === 1) return `${edge.from} below ${edge.to}`;
  if (edge.dx === -1 && edge.dy === 0) return `${edge.from} left of ${edge.to}`;
  if (edge.dx === 1 && edge.dy === 0) return `${edge.from} right of ${edge.to}`;
  return `${edge.from} at (${edge.dx}, ${edge.dy}) from ${edge.to}`;
}

/**
 * Lays out every cube referenced by the goal on a small relative grid (one
 * cube is pinned at the origin, the rest follow the bond offsets), for
 * drawing the goal preview diagram in the HUD.
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

  const root = goal[0].to;
  positions.set(root, { x: 0, y: 0 });
  const queue = [root];
  while (queue.length) {
    const current = queue.shift()!;
    const currentPos = positions.get(current)!;
    for (const { neighbor, dx, dy } of adjacency.get(current) ?? []) {
      if (positions.has(neighbor)) continue;
      positions.set(neighbor, { x: currentPos.x + dx, y: currentPos.y + dy });
      queue.push(neighbor);
    }
  }
  return positions;
}
