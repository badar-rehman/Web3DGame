import { GameScene } from './GameScene';
import { InputController } from './InputController';
import { UIManager } from './UIManager';
import { computeStep } from './MovementSolver';
import { evaluateFormation } from './formation';
import { HintManager } from './HintManager';
import { LEVELS, getLevel } from './levels';
import { CellType, CubeState, Direction, LevelData } from './types';

export class Game {
  private scene: GameScene;
  private input: InputController;
  private ui: UIManager;
  private hints = new HintManager();
  private level!: LevelData;
  private cubes: CubeState[] = [];
  private moves = 0;
  private won = false;
  private failed = false;
  private hintPending = false;

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new GameScene(canvas);
    this.ui = new UIManager({
      onRestart: () => this.restartLevel(),
      onNextLevel: () => this.goToLevel(this.level.id + 1),
      onReplay: () => this.restartLevel(),
      onSelectLevel: (id) => this.goToLevel(id),
      onOpenLevelSelect: () => {
        this.ui.renderLevelSelect(LEVELS, this.level.id);
        this.ui.openLevelSelect();
      },
      onHint: () => this.requestHint(),
    });
    this.input = new InputController(canvas, (dir) => this.handleDirection(dir));

    const progress = this.ui.getProgress();
    const startId = Math.min(Math.max(progress.highestUnlocked, 1), LEVELS.length);
    this.goToLevel(startId);

    this.loop();
  }

  private isBlocked = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= this.level.width || y >= this.level.height) return this.level.hasBoundary;
    const cell = this.level.cells[y][x];
    return cell === CellType.Wall || cell === CellType.Obstacle;
  };

  private isOutOfBounds(pos: CubeState): boolean {
    return pos.x < 0 || pos.y < 0 || pos.x >= this.level.width || pos.y >= this.level.height;
  }

  private goToLevel(id: number) {
    const level = getLevel(id) ?? LEVELS[0];
    this.level = level;
    this.cubes = level.cubes.map((c) => ({ ...c }));
    this.moves = 0;
    this.won = false;
    this.failed = false;
    this.hintPending = false;

    this.scene.loadLevel(level, this.cubes);
    this.ui.showLevel(level);
    this.ui.setMoves(0);
    this.ui.setNextLevelAvailable(id < LEVELS.length);
    this.input.setEnabled(true);
    this.refreshFormationStatus();
  }

  private restartLevel() {
    this.goToLevel(this.level.id);
  }

  private handleDirection(dir: Direction) {
    if (this.won || this.failed || this.scene.isAnimating()) return;

    const { positions, moved } = computeStep(this.cubes, dir, { isBlocked: this.isBlocked });
    // Every cube attempts to move each swipe — one that ends up exactly
    // where it started was blocked by a wall, obstacle, edge, or another
    // cube, and gets a little "tried and couldn't" bump instead of nothing.
    const blockedIds = new Set(
      this.cubes.filter((c, i) => positions[i].x === c.x && positions[i].y === c.y).map((c) => c.id),
    );

    if (!moved) {
      this.input.setEnabled(false);
      this.scene.animateCubesTo(positions, blockedIds, dir, () => this.input.setEnabled(true));
      return;
    }

    this.cubes = positions;
    this.moves += 1;
    this.ui.setMoves(this.moves);
    this.input.setEnabled(false);

    const fell = positions.some((p) => this.isOutOfBounds(p));

    this.scene.animateCubesTo(positions, blockedIds, dir, () => {
      if (fell) {
        this.handleFail();
        return;
      }
      this.input.setEnabled(true);
      const solved = this.refreshFormationStatus();
      if (solved) this.handleWin();
    });
  }

  private requestHint() {
    if (this.won || this.failed || this.hintPending || !this.hints.canUseHint()) return;
    this.hintPending = true;
    this.ui.setHintLoading(true);

    const requestedLevelId = this.level.id;
    const cubesSnapshot = this.cubes.map((c) => ({ ...c }));
    this.hints.requestHint(cubesSnapshot, this.level).then((direction) => {
      this.hintPending = false;
      // The player may have restarted, switched levels, or already won by
      // the time this resolves — a stale hint would be actively misleading.
      if (this.level.id !== requestedLevelId || this.won || this.failed) {
        this.ui.setHintLoading(false);
        return;
      }
      this.ui.setHintLoading(false);
      if (direction) {
        this.ui.showHintDirection(direction);
      } else {
        this.ui.showHintUnavailable();
      }
    });
  }

  private refreshFormationStatus(): boolean {
    const status = evaluateFormation(this.cubes, this.level.goal);
    this.ui.updateFormationStatus(status);
    this.scene.setGlowingCubes(status.glowingCubeIds);
    this.scene.setBondDirections(status.directionalGlow);
    return status.solved;
  }

  private handleFail() {
    this.failed = true;
    this.ui.showFail();
  }

  private handleWin() {
    this.won = true;
    this.scene.playWinCelebration(() => {
      this.ui.markCompleted(this.level.id, LEVELS.length);
      this.ui.setNextLevelAvailable(this.level.id < LEVELS.length);
      this.ui.showWin(this.moves);
    });
  }

  private loop = () => {
    this.scene.render();
    requestAnimationFrame(this.loop);
  };
}
