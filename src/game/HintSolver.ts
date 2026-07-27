import { computeStep } from './MovementSolver';
import { evaluateFormation } from './formation';
import { isBlockedInLevel, isDesignatedPair, isElevatedInLevel } from './levelRules';
import { CubeState, Direction, LevelData } from './types';

const DIRECTIONS: Direction[] = ['up', 'down', 'left', 'right'];
const MAX_TIME_MS = 4000;
const MAX_DEPTH = 60;

function stateKey(cubes: CubeState[]): string {
  return cubes.map((c) => `${c.x},${c.y}`).join('|');
}

interface Node {
  cubes: CubeState[];
  /** Which direction was swiped first, at the root of this node's path — the move a hint should show. */
  firstMove: Direction;
}

/**
 * Breadth-first search over the exact runtime movement rules, starting from
 * wherever the cubes currently sit — not necessarily the level's start — so
 * a hint stays correct after the player has already made moves. Returns the
 * first step of a shortest solution, or null if none is found within the
 * time/depth budget (either truly unsolvable from here, or just too large
 * to finish in time — both are reported the same way: no hint available).
 */
export function findNextHintMove(cubes: CubeState[], level: LevelData): Direction | null {
  const isBlocked = (x: number, y: number, elevated: boolean): boolean => isBlockedInLevel(level, x, y, elevated);
  const isElevated = (cube: CubeState, cubes: CubeState[]): boolean => isElevatedInLevel(level, cube, cubes);
  const isPair = (a: string, b: string): boolean => isDesignatedPair(level, a, b);
  const isOutOfBounds = (p: CubeState) => p.x < 0 || p.y < 0 || p.x >= level.width || p.y >= level.height;

  if (evaluateFormation(cubes, level.goal).solved) return null;

  const visited = new Set<string>([stateKey(cubes)]);
  const queue: Node[] = [];

  // Depth 1: expand the root once per direction, tagging each branch with
  // the move that started it — every node below inherits that same tag.
  for (const dir of DIRECTIONS) {
    const { positions, moved } = computeStep(cubes, dir, { isBlocked }, { isElevated, isDesignatedPair: isPair });
    if (!moved || positions.some(isOutOfBounds)) continue;
    const k = stateKey(positions);
    if (visited.has(k)) continue;
    visited.add(k);
    if (evaluateFormation(positions, level.goal).solved) return dir;
    queue.push({ cubes: positions, firstMove: dir });
  }

  const start = Date.now();
  let i = 0;
  let levelEnd = queue.length;
  let depth = 1;

  while (i < queue.length) {
    if (i === levelEnd) {
      depth += 1;
      if (depth > MAX_DEPTH || Date.now() - start > MAX_TIME_MS) return null;
      levelEnd = queue.length;
    }

    const node = queue[i++];
    for (const dir of DIRECTIONS) {
      const { positions, moved } = computeStep(node.cubes, dir, { isBlocked }, {
        isElevated,
        isDesignatedPair: isPair,
      });
      if (!moved || positions.some(isOutOfBounds)) continue;
      const k = stateKey(positions);
      if (visited.has(k)) continue;
      visited.add(k);
      if (evaluateFormation(positions, level.goal).solved) return node.firstMove;
      queue.push({ cubes: positions, firstMove: node.firstMove });
    }

    if ((i & 2047) === 0 && Date.now() - start > MAX_TIME_MS) return null;
  }

  return null;
}
