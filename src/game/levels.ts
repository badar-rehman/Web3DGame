import { LevelData, RelationEdge } from './types';
import { parseLevel } from './levelParser';

// Layouts are authored as ASCII art and parsed into LevelData.
// '.' floor · '#' wall · 'O' obstacle · a letter (A, B, C, ...) is a cube start.
// Every layout + goal below has been verified solvable via BFS over the exact
// move rules used at runtime (see MovementSolver.computeStep / formation.ts).
interface RawLevel {
  name: string;
  rows: string[];
  goal: RelationEdge[];
}

const RAW_LEVELS: RawLevel[] = [
  {
    name: 'First Bond',
    rows: ['#######', '#.....#', '#.....#', '#A..B.#', '#.....#', '#.....#', '#######'],
    goal: [{ from: 'A', to: 'B', dx: -1, dy: 0 }],
  },
  {
    name: 'L Formation',
    rows: ['#######', '#.....#', '#CA...#', '#.....#', '#.B...#', '#.....#', '#######'],
    goal: [
      { from: 'A', to: 'B', dx: 0, dy: -1 },
      { from: 'C', to: 'B', dx: -1, dy: 0 },
    ],
  },
  {
    name: 'Vertical Chain',
    rows: ['#######', '#A....#', '#..O..#', '#.....#', '#B....#', '#..C..#', '#######'],
    goal: [
      { from: 'A', to: 'B', dx: 0, dy: -1 },
      { from: 'B', to: 'C', dx: 0, dy: -1 },
    ],
  },
  {
    name: 'Maze Bond',
    rows: [
      '########',
      '#A.....#',
      '#.####.#',
      '#.#B#..#',
      '#.#.##.#',
      '#....#.#',
      '#.####C#',
      '#......#',
      '########',
    ],
    goal: [
      { from: 'A', to: 'B', dx: 0, dy: -1 },
      { from: 'C', to: 'B', dx: 1, dy: 0 },
    ],
  },
  {
    name: 'Staggered Square',
    rows: ['########', '#A....D#', '#.OO...#', '#..O...#', '#...O..#', '#B....C#', '########'],
    goal: [
      { from: 'A', to: 'B', dx: 0, dy: -1 },
      { from: 'C', to: 'B', dx: -1, dy: 0 },
      { from: 'D', to: 'C', dx: 0, dy: -1 },
    ],
  },
  {
    name: 'Full Square',
    rows: ['########', '#A....D#', '#.OO...#', '#.OO...#', '#B....C#', '########'],
    goal: [
      { from: 'A', to: 'B', dx: 0, dy: -1 },
      { from: 'C', to: 'B', dx: -1, dy: 0 },
      { from: 'D', to: 'C', dx: 0, dy: -1 },
      { from: 'D', to: 'A', dx: -1, dy: 0 },
    ],
  },
];

export const LEVELS: LevelData[] = RAW_LEVELS.map((raw, i) => parseLevel(i + 1, raw.name, raw.rows, raw.goal));

export function getLevel(id: number): LevelData | undefined {
  return LEVELS.find((l) => l.id === id);
}
