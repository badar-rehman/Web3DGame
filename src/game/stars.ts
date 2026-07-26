/**
 * 3 stars for matching the true optimal solve, 2 for a decent margin above
 * it (bigger levels get a proportionally bigger margin, capped at a small
 * minimum so short levels aren't overly strict), 1 for finishing at all.
 */
export function starsForMoves(moves: number, par: number): 1 | 2 | 3 {
  if (moves <= par) return 3;
  const goodThreshold = par + Math.max(2, Math.ceil(par * 0.5));
  if (moves <= goodThreshold) return 2;
  return 1;
}
