export type SymbolShape = 'circle' | 'triangle' | 'diamond' | 'square' | 'star' | 'plus';

export interface CubeVisual {
  color: number;
  cssColor: string;
  symbol: SymbolShape;
  /** Unicode glyph used for the compact HUD chips. */
  glyph: string;
}

// Every cube id maps to a stable color + symbol across all levels, so players
// learn to recognize "the circle cube" on sight regardless of the level.
export const CUBE_PALETTE: Record<string, CubeVisual> = {
  A: { color: 0x6ee7f5, cssColor: '#6ee7f5', symbol: 'circle', glyph: '●' },
  B: { color: 0xf5b26e, cssColor: '#f5b26e', symbol: 'triangle', glyph: '▲' },
  C: { color: 0xf56ea8, cssColor: '#f56ea8', symbol: 'diamond', glyph: '◆' },
  D: { color: 0x8af56e, cssColor: '#8af56e', symbol: 'square', glyph: '■' },
  E: { color: 0xf5e26e, cssColor: '#f5e26e', symbol: 'star', glyph: '★' },
  F: { color: 0xa56ef5, cssColor: '#a56ef5', symbol: 'plus', glyph: '✚' },
};

export function cubeVisual(id: string): CubeVisual {
  return CUBE_PALETTE[id] ?? { color: 0xffffff, cssColor: '#ffffff', symbol: 'circle', glyph: '?' };
}

/** Builds the outline path for a symbol, centered in a `size`x`size` box. */
function buildSymbolPath(shape: SymbolShape, size: number): Path2D {
  const c = size / 2;
  const r = size * 0.3;
  const path = new Path2D();

  switch (shape) {
    case 'circle':
      path.arc(c, c, r, 0, Math.PI * 2);
      break;
    case 'square':
      path.rect(c - r, c - r, r * 2, r * 2);
      break;
    case 'diamond':
      path.moveTo(c, c - r * 1.2);
      path.lineTo(c + r * 1.2, c);
      path.lineTo(c, c + r * 1.2);
      path.lineTo(c - r * 1.2, c);
      path.closePath();
      break;
    case 'triangle':
      path.moveTo(c, c - r * 1.25);
      path.lineTo(c + r * 1.15, c + r * 0.8);
      path.lineTo(c - r * 1.15, c + r * 0.8);
      path.closePath();
      break;
    case 'star': {
      const spikes = 5;
      const outerR = r * 1.25;
      const innerR = r * 0.5;
      for (let i = 0; i < spikes * 2; i++) {
        const radius = i % 2 === 0 ? outerR : innerR;
        const angle = (Math.PI / spikes) * i - Math.PI / 2;
        const px = c + Math.cos(angle) * radius;
        const py = c + Math.sin(angle) * radius;
        if (i === 0) path.moveTo(px, py);
        else path.lineTo(px, py);
      }
      path.closePath();
      break;
    }
    case 'plus': {
      const arm = r * 0.42;
      const len = r * 1.2;
      // A single 12-point outline so a stroke traces a clean plus shape
      // instead of two overlapping rectangles.
      const pts: [number, number][] = [
        [c - arm, c - len],
        [c + arm, c - len],
        [c + arm, c - arm],
        [c + len, c - arm],
        [c + len, c + arm],
        [c + arm, c + arm],
        [c + arm, c + len],
        [c - arm, c + len],
        [c - arm, c + arm],
        [c - len, c + arm],
        [c - len, c - arm],
        [c - arm, c - arm],
      ];
      pts.forEach(([px, py], i) => (i === 0 ? path.moveTo(px, py) : path.lineTo(px, py)));
      path.closePath();
      break;
    }
  }
  return path;
}

/** Fills a cube's symbol into a 2D canvas context, centered in a `size`x`size` box. */
export function drawSymbol(ctx: CanvasRenderingContext2D, shape: SymbolShape, size: number, fgColor: string) {
  ctx.fillStyle = fgColor;
  ctx.fill(buildSymbolPath(shape, size));
}

/** Strokes a cube's symbol as a carved outline into a 2D canvas context. */
export function drawSymbolOutline(
  ctx: CanvasRenderingContext2D,
  shape: SymbolShape,
  size: number,
  strokeColor: string,
  lineWidth: number,
) {
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke(buildSymbolPath(shape, size));
}
