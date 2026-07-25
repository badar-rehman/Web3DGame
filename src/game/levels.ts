import { LevelData, RelationEdge } from './types';
import { parseLevel } from './levelParser';

// Layouts are authored as ASCII art and parsed into LevelData.
// '.' floor · '#' interior wall (maze only, never the outer edge) · 'O' obstacle
// a letter (A, B, C, ...) is a cube start. The grid IS the playable area —
// there's no border ring; `hasBoundary` controls whether the edge is enclosed
// (a boundary pipe renders around it) or open (pushing a cube past the edge
// makes it fall and fails the level).
// Every layout + goal below has been verified solvable via BFS over the exact
// move rules used at runtime, including a version that only accepts paths
// that never push a cube off an open edge (see MovementSolver / formation.ts).
interface RawLevel {
  name: string;
  rows: string[];
  goal: RelationEdge[];
  hasBoundary: boolean;
}

const RAW_LEVELS: RawLevel[] = [
  {
    name: 'First Bond',
    rows: ['.....', '.....', 'A..B.', '.....', '.....'],
    goal: [{ from: 'A', to: 'B', dx: -1, dy: 0 }],
    hasBoundary: true,
  },
  {
    name: 'Open Ledge',
    rows: ['......', '......', '.A.B.O', '......'],
    goal: [{ from: 'A', to: 'B', dx: -1, dy: 0 }],
    hasBoundary: false,
  },
  {
    name: 'L Formation',
    rows: ['.....', 'CA...', '.....', '.B...', '.....'],
    goal: [
      { from: 'A', to: 'B', dx: 0, dy: -1 },
      { from: 'C', to: 'B', dx: -1, dy: 0 },
    ],
    hasBoundary: true,
  },
  {
    name: 'Vertical Chain',
    rows: ['A....', '..O..', '.....', 'B....', '..C..'],
    goal: [
      { from: 'A', to: 'B', dx: 0, dy: -1 },
      { from: 'B', to: 'C', dx: 0, dy: -1 },
    ],
    hasBoundary: true,
  },
  {
    name: 'Maze Bond',
    rows: ['A.....', '.####.', '.#B#..', '.#.##.', '....#.', '.####C', '......'],
    goal: [
      { from: 'A', to: 'B', dx: 0, dy: -1 },
      { from: 'C', to: 'B', dx: 1, dy: 0 },
    ],
    hasBoundary: true,
  },
  {
    name: 'Staggered Square',
    rows: ['A....D', '.OO...', '..O...', '...O..', 'B....C'],
    goal: [
      { from: 'A', to: 'B', dx: 0, dy: -1 },
      { from: 'C', to: 'B', dx: -1, dy: 0 },
      { from: 'D', to: 'C', dx: 0, dy: -1 },
    ],
    hasBoundary: true,
  },
  {
    name: 'Full Square',
    rows: ['A....D', '.OO...', '.OO...', 'B....C'],
    goal: [
      { from: 'A', to: 'B', dx: 0, dy: -1 },
      { from: 'C', to: 'B', dx: -1, dy: 0 },
      { from: 'D', to: 'C', dx: 0, dy: -1 },
      { from: 'D', to: 'A', dx: -1, dy: 0 },
    ],
    hasBoundary: true,
  },
  {
    name: 'Fifth Wheel',
    rows: ['A.....', '....B.', '..C...', '.....D', '.E....', '......'],
    goal: [
      { from: 'A', to: 'B', dx: 0, dy: -1 },
      { from: 'B', to: 'C', dx: 0, dy: -1 },
      { from: 'C', to: 'D', dx: 0, dy: -1 },
      { from: 'D', to: 'E', dx: 0, dy: -1 },
    ],
    hasBoundary: true,
  },
  {
    name: 'Open Trio Plus',
    rows: ['......', '..A...', '......', '.O....', '.OB..C', '..O..O'],
    goal: [
      { from: 'A', to: 'B', dx: 0, dy: -1 },
      { from: 'C', to: 'B', dx: 1, dy: 0 },
    ],
    hasBoundary: false,
  },
  {
    name: 'Cross Roads',
    rows: ['A......', '.......', '..O....', 'E..C..B', '....O..', '.......', '....D..'],
    goal: [
      { from: 'A', to: 'C', dx: 0, dy: -1 },
      { from: 'D', to: 'C', dx: 0, dy: 1 },
      { from: 'B', to: 'C', dx: 1, dy: 0 },
      { from: 'E', to: 'C', dx: -1, dy: 0 },
    ],
    hasBoundary: true,
  },
  {
    name: 'Boxed Maze',
    rows: ['A.#...D', '..#.#..', '..#.#..', '.......', '..#.#..', '..#.#..', 'B.#...C'],
    goal: [
      { from: 'A', to: 'B', dx: 0, dy: -1 },
      { from: 'C', to: 'B', dx: -1, dy: 0 },
      { from: 'D', to: 'C', dx: 0, dy: -1 },
      { from: 'D', to: 'A', dx: -1, dy: 0 },
    ],
    hasBoundary: true,
  },
  {
    name: 'Six of One',
    rows: ['A.....C', '.......', '..B....', '.......', '.D...F.', '....E..'],
    goal: [
      { from: 'B', to: 'A', dx: 1, dy: 0 },
      { from: 'C', to: 'B', dx: 1, dy: 0 },
      { from: 'D', to: 'A', dx: 0, dy: 1 },
      { from: 'E', to: 'B', dx: 0, dy: 1 },
      { from: 'F', to: 'C', dx: 0, dy: 1 },
    ],
    hasBoundary: true,
  },
  {
    name: 'Narrow Escape',
    rows: ['.......', '..A.O..', '.O.....', '.B.D.C.', '.....O.', '..O....'],
    goal: [
      { from: 'A', to: 'D', dx: 0, dy: -1 },
      { from: 'C', to: 'D', dx: 1, dy: 0 },
      { from: 'B', to: 'D', dx: -1, dy: 0 },
    ],
    hasBoundary: false,
  },
  {
    name: 'Z-Formation',
    rows: ['A....D', '.OO...', '..O...', '...O..', 'B....C'],
    goal: [
      { from: 'B', to: 'A', dx: 1, dy: 0 },
      { from: 'C', to: 'B', dx: 0, dy: 1 },
      { from: 'D', to: 'C', dx: 1, dy: 0 },
    ],
    hasBoundary: true,
  },
  {
    name: 'Six-Cube Square',
    rows: ['A...O..C', '........', '..O.B...', '........', '.D..O.F.', '........', '...E....'],
    goal: [
      { from: 'B', to: 'A', dx: 1, dy: 0 },
      { from: 'C', to: 'B', dx: 1, dy: 0 },
      { from: 'D', to: 'A', dx: 0, dy: 1 },
      { from: 'E', to: 'B', dx: 0, dy: 1 },
      { from: 'F', to: 'C', dx: 0, dy: 1 },
      { from: 'E', to: 'D', dx: 1, dy: 0 },
      { from: 'F', to: 'E', dx: 1, dy: 0 },
    ],
    hasBoundary: true,
  },
  {
    name: 'Twisting Halls',
    rows: ['A.#.....', '..#.###.', '..#.#B#.', '....#.#.', '###.#.#.', 'C...#...', '.###.###', 'D.......'],
    goal: [
      { from: 'A', to: 'B', dx: 0, dy: -1 },
      { from: 'B', to: 'C', dx: 0, dy: -1 },
      { from: 'C', to: 'D', dx: 0, dy: -1 },
    ],
    hasBoundary: true,
  },
  {
    name: 'Zigzag',
    rows: ['A......', '..O....', '....B..', 'O......', '...O..C', '.D.....', '....E.O'],
    goal: [
      { from: 'B', to: 'A', dx: 1, dy: 0 },
      { from: 'C', to: 'B', dx: 0, dy: 1 },
      { from: 'D', to: 'C', dx: 1, dy: 0 },
      { from: 'E', to: 'D', dx: 0, dy: 1 },
    ],
    hasBoundary: true,
  },
  {
    name: 'Twin Triangles',
    rows: ['A....D', '..O...', 'B....F', '......', '..C.E.', '...O..'],
    goal: [
      { from: 'A', to: 'B', dx: 0, dy: -1 },
      { from: 'C', to: 'B', dx: -1, dy: 0 },
      { from: 'D', to: 'E', dx: 0, dy: -1 },
      { from: 'F', to: 'E', dx: -1, dy: 0 },
      { from: 'D', to: 'B', dx: 1, dy: 0 },
    ],
    hasBoundary: true,
  },
  {
    name: 'Grand Maze',
    rows: ['A.#....', '.#.....', '.......', '..#.#..', '.......', '.....#.', 'D..C..B'],
    goal: [
      { from: 'A', to: 'C', dx: 0, dy: -1 },
      { from: 'D', to: 'C', dx: -1, dy: 0 },
      { from: 'B', to: 'C', dx: 1, dy: 0 },
    ],
    hasBoundary: true,
  },
  {
    name: 'Final Challenge',
    rows: ['........', '.OA.B.C.', '........', '........', '........', '..DEF...', '..OOO...', '........'],
    goal: [
      { from: 'B', to: 'A', dx: 1, dy: 0 },
      { from: 'C', to: 'B', dx: 1, dy: 0 },
      { from: 'D', to: 'A', dx: 0, dy: 1 },
      { from: 'E', to: 'B', dx: 0, dy: 1 },
      { from: 'F', to: 'C', dx: 0, dy: 1 },
    ],
    hasBoundary: false,
  },
];

export const LEVELS: LevelData[] = RAW_LEVELS.map((raw, i) =>
  parseLevel(i + 1, raw.name, raw.rows, raw.goal, raw.hasBoundary),
);

export function getLevel(id: number): LevelData | undefined {
  return LEVELS.find((l) => l.id === id);
}
