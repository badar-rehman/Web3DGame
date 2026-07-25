export interface CubeVisual {
  color: number;
  cssColor: string;
  label: string;
}

// Every cube id maps to a stable color + label across all levels, so players
// learn to recognize "A" on sight regardless of which level it appears in.
export const CUBE_PALETTE: Record<string, CubeVisual> = {
  A: { color: 0x6ee7f5, cssColor: '#6ee7f5', label: 'A' },
  B: { color: 0xf5b26e, cssColor: '#f5b26e', label: 'B' },
  C: { color: 0xf56ea8, cssColor: '#f56ea8', label: 'C' },
  D: { color: 0x8af56e, cssColor: '#8af56e', label: 'D' },
  E: { color: 0xf5e26e, cssColor: '#f5e26e', label: 'E' },
  F: { color: 0xa56ef5, cssColor: '#a56ef5', label: 'F' },
};

export function cubeVisual(id: string): CubeVisual {
  return CUBE_PALETTE[id] ?? { color: 0xffffff, cssColor: '#ffffff', label: id };
}
