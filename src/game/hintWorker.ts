import { findNextHintMove } from './HintSolver';
import { CubeState, Direction, LevelData } from './types';

export interface HintRequest {
  requestId: number;
  cubes: CubeState[];
  level: LevelData;
}

export interface HintResponse {
  requestId: number;
  direction: Direction | null;
}

self.onmessage = (e: MessageEvent<HintRequest>) => {
  const { requestId, cubes, level } = e.data;
  const direction = findNextHintMove(cubes, level);
  const response: HintResponse = { requestId, direction };
  (self as unknown as Worker).postMessage(response);
};
