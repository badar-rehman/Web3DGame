import { CubeState, Direction, LevelData } from './types';
import type { HintRequest, HintResponse } from './hintWorker';

/**
 * Runs the hint search on a Web Worker so a slow search (worst case a few
 * seconds on a hard level) never freezes input, animation, or rendering on
 * the main thread. Only the latest request's result is ever delivered —
 * a stale response (level changed, or the player asked again) is dropped.
 */
export class HintManager {
  private worker = new Worker(new URL('./hintWorker.ts', import.meta.url), { type: 'module' });
  private nextRequestId = 1;
  private pending: { requestId: number; resolve: (dir: Direction | null) => void } | null = null;

  constructor() {
    this.worker.onmessage = (e: MessageEvent<HintResponse>) => {
      if (!this.pending || e.data.requestId !== this.pending.requestId) return;
      const { resolve } = this.pending;
      this.pending = null;
      resolve(e.data.direction);
    };
  }

  /**
   * Hints are free for now. Kept as its own check so a later cap (e.g. N
   * free hints per level, or a paid unlock) has a single place to plug in
   * without touching the request/UI plumbing.
   */
  canUseHint(): boolean {
    return true;
  }

  requestHint(cubes: CubeState[], level: LevelData, movePhase: number): Promise<Direction | null> {
    // Superseding a still-pending request resolves it with null rather than
    // leaving it dangling, so callers awaiting it don't hang.
    this.pending?.resolve(null);

    const requestId = this.nextRequestId++;
    const request: HintRequest = { requestId, cubes, level, movePhase };
    return new Promise((resolve) => {
      this.pending = { requestId, resolve };
      this.worker.postMessage(request);
    });
  }

  dispose() {
    this.worker.terminate();
  }
}
