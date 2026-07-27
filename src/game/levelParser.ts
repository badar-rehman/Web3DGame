import { CellType, LevelData, RelationEdge } from './types';
import { CUBE_PALETTE } from './cubeVisuals';

// '.' floor · '#' wall · 'O' obstacle · '^'/'v' elevator (starts up/down) ·
// any letter in CUBE_PALETTE (A, B, C, ...) is a cube start
const CHAR_TO_CELL: Record<string, CellType> = {
  '.': CellType.Floor,
  '#': CellType.Wall,
  O: CellType.Obstacle,
};

// value = the tile's phase at move 0 (true = starts up/wall, false = starts down/floor)
const ELEVATOR_CHARS: Record<string, boolean> = { '^': true, v: false };

export function parseLevel(
  id: number,
  name: string,
  rows: string[],
  goal: RelationEdge[],
  hasBoundary: boolean,
  par: number,
  stackedPair?: { carrier: string; rider: string },
): LevelData {
  const height = rows.length;
  const width = Math.max(...rows.map((r) => r.length));
  const cells: CellType[][] = [];
  const cubes: LevelData['cubes'] = [];
  const elevatorTiles: NonNullable<LevelData['elevatorTiles']> = [];

  rows.forEach((row, y) => {
    const cellRow: CellType[] = [];
    for (let x = 0; x < width; x++) {
      const ch = row[x] ?? '.';
      if (ch in CUBE_PALETTE) {
        cellRow.push(CellType.Floor);
        cubes.push({ id: ch, x, y });
      } else if (ch in ELEVATOR_CHARS) {
        // Placeholder base type — the effective type is never read raw for
        // an elevator cell, it's always derived from elevatorTiles + phase.
        cellRow.push(CellType.Floor);
        elevatorTiles.push({ x, y, startsUp: ELEVATOR_CHARS[ch] });
      } else {
        cellRow.push(CHAR_TO_CELL[ch] ?? CellType.Floor);
      }
    }
    cells.push(cellRow);
  });

  // The rider never appears in `rows` — it starts coincident with its
  // carrier, placed here rather than authored as its own grid character.
  if (stackedPair) {
    const carrierCube = cubes.find((c) => c.id === stackedPair.carrier);
    if (carrierCube) cubes.push({ id: stackedPair.rider, x: carrierCube.x, y: carrierCube.y });
  }

  return {
    id,
    name,
    width,
    height,
    cells,
    cubes,
    goal,
    hasBoundary,
    par,
    stackedPair,
    elevatorTiles: elevatorTiles.length ? elevatorTiles : undefined,
  };
}
