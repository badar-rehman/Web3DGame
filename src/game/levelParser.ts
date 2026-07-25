import { CellType, LevelData, Vec2 } from './types';

// '.' floor · '#' wall · 'O' obstacle · 'C' cube start · 'T' target · 'X' cube start on a target
const CHAR_TO_CELL: Record<string, CellType> = {
  '.': CellType.Floor,
  '#': CellType.Wall,
  O: CellType.Obstacle,
  C: CellType.Floor,
  T: CellType.Floor,
  X: CellType.Floor,
};

export function parseLevel(id: number, name: string, rows: string[]): LevelData {
  const height = rows.length;
  const width = Math.max(...rows.map((r) => r.length));
  const cells: CellType[][] = [];
  const cubes: Vec2[] = [];
  const targets: Vec2[] = [];

  rows.forEach((row, y) => {
    const cellRow: CellType[] = [];
    for (let x = 0; x < width; x++) {
      const ch = row[x] ?? '.';
      cellRow.push(CHAR_TO_CELL[ch] ?? CellType.Floor);
      if (ch === 'C' || ch === 'X') cubes.push({ x, y });
      if (ch === 'T' || ch === 'X') targets.push({ x, y });
    }
    cells.push(cellRow);
  });

  return { id, name, width, height, cells, cubes, targets };
}
