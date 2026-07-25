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

/** Draws a cube's symbol into a 2D canvas context, centered in a `size`x`size` box. */
export function drawSymbol(ctx: CanvasRenderingContext2D, shape: SymbolShape, size: number, fgColor: string) {
  const c = size / 2;
  const r = size * 0.3;
  ctx.fillStyle = fgColor;
  ctx.strokeStyle = fgColor;
  ctx.lineWidth = size * 0.08;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  switch (shape) {
    case 'circle':
      ctx.beginPath();
      ctx.arc(c, c, r, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'square':
      ctx.fillRect(c - r, c - r, r * 2, r * 2);
      break;
    case 'diamond':
      ctx.beginPath();
      ctx.moveTo(c, c - r * 1.2);
      ctx.lineTo(c + r * 1.2, c);
      ctx.lineTo(c, c + r * 1.2);
      ctx.lineTo(c - r * 1.2, c);
      ctx.closePath();
      ctx.fill();
      break;
    case 'triangle':
      ctx.beginPath();
      ctx.moveTo(c, c - r * 1.25);
      ctx.lineTo(c + r * 1.15, c + r * 0.8);
      ctx.lineTo(c - r * 1.15, c + r * 0.8);
      ctx.closePath();
      ctx.fill();
      break;
    case 'star': {
      const spikes = 5;
      const outerR = r * 1.25;
      const innerR = r * 0.5;
      ctx.beginPath();
      for (let i = 0; i < spikes * 2; i++) {
        const radius = i % 2 === 0 ? outerR : innerR;
        const angle = (Math.PI / spikes) * i - Math.PI / 2;
        const px = c + Math.cos(angle) * radius;
        const py = c + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'plus': {
      const arm = r * 0.42;
      const len = r * 1.2;
      ctx.fillRect(c - arm, c - len, arm * 2, len * 2);
      ctx.fillRect(c - len, c - arm, len * 2, arm * 2);
      break;
    }
  }
}
