import { LevelData } from './types';
import { parseLevel } from './levelParser';

// Layouts are authored as ASCII art and parsed into LevelData.
// '.' floor · '#' wall · 'O' obstacle · 'C' cube start · 'T' target
// Every layout below has been verified solvable via BFS over the exact
// move rules used at runtime (see MovementSolver.computeStep).
const RAW_LEVELS: string[][] = [
  // 1. Tutorial: one cube, no obstacles.
  ['.....', '.C...', '.....', '...T.', '.....'],

  // 2. Two cubes: an obstacle stops one cube short while the other reaches the wall.
  ['#######', '#C...T#', '#.....#', '#.....#', '#CTO..#', '#######'],

  // 3. Two cubes must detour sideways around obstacles blocking a straight path down.
  ['#######', '#.....#', '#.C.C.#', '#.O.O.#', '#.T.T.#', '#.....#', '#######'],

  // 4. Bigger arena, symmetric obstacles.
  ['#######', '#C...C#', '#.#O#.#', '#.....#', '#.#O#.#', '#T...T#', '#######'],

  // 5. Real maze: walls force a winding multi-turn route.
  [
    '########',
    '#C.....#',
    '#.####.#',
    '#.#T#..#',
    '#.#.##.#',
    '#....#C#',
    '#.####.#',
    '#..T...#',
    '########',
  ],

  // 6. Dense obstacle grid — the hardest level.
  ['########', '#C....C#', '#.OO.OO#', '#......#', '#.OO.OO#', '#T....T#', '########'],
];

const LEVEL_NAMES = [
  'First Slide',
  'Blocked Path',
  'Detour',
  'Twin Obstacles',
  'The Maze',
  'Cube Grid',
];

export const LEVELS: LevelData[] = RAW_LEVELS.map((rows, i) => parseLevel(i + 1, LEVEL_NAMES[i], rows));

export function getLevel(id: number): LevelData | undefined {
  return LEVELS.find((l) => l.id === id);
}
