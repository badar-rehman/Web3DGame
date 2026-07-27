import { findNextHintMove } from './HintSolver';
import { CubeState, Direction, LevelData } from './types';

export interface HintRequest {
  requestId: number;
  cubes: CubeState[];
  level: LevelData;
  movePhase: number;
}

export interface HintResponse {
  requestId: number;
  direction: Direction | null;
}

self.onmessage = (e: MessageEvent<HintRequest>) => {
  const { requestId, cubes, level, movePhase } = e.data;
  const direction = findNextHintMove(cubes, level, movePhase);
  const response: HintResponse = { requestId, direction };
  (self as unknown as Worker).postMessage(response);
};
