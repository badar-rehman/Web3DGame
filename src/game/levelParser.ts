import { CellType, LevelData, RelationEdge } from './types';
import { CUBE_PALETTE } from './cubeVisuals';

// '.' floor · '#' wall · 'O' obstacle · any letter in CUBE_PALETTE (A, B, C, ...) is a cube start
const CHAR_TO_CELL: Record<string, CellType> = {
  '.': CellType.Floor,
  '#': CellType.Wall,
  O: CellType.Obstacle,
};

export function parseLevel(
  id: number,
  name: string,
  rows: string[],
  goal: RelationEdge[],
  hasBoundary: boolean,
): LevelData {
  const height = rows.length;
  const width = Math.max(...rows.map((r) => r.length));
  const cells: CellType[][] = [];
  const cubes: LevelData['cubes'] = [];

  rows.forEach((row, y) => {
    const cellRow: CellType[] = [];
    for (let x = 0; x < width; x++) {
      const ch = row[x] ?? '.';
      if (ch in CUBE_PALETTE) {
        cellRow.push(CellType.Floor);
        cubes.push({ id: ch, x, y });
      } else {
        cellRow.push(CHAR_TO_CELL[ch] ?? CellType.Floor);
      }
    }
    cells.push(cellRow);
  });

  return { id, name, width, height, cells, cubes, goal, hasBoundary };
}
