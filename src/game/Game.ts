import { GameScene } from './GameScene';
import { InputController } from './InputController';
import { UIManager } from './UIManager';
import { computeStep } from './MovementSolver';
import { LEVELS, getLevel } from './levels';
import { CellType, Direction, LevelData, Vec2 } from './types';

export class Game {
  private scene: GameScene;
  private input: InputController;
  private ui: UIManager;
  private level!: LevelData;
  private cubes: Vec2[] = [];
  private moves = 0;
  private won = false;

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
    });
    this.input = new InputController(canvas, (dir) => this.handleDirection(dir));

    const progress = this.ui.getProgress();
    const startId = Math.min(Math.max(progress.highestUnlocked, 1), LEVELS.length);
    this.goToLevel(startId);

    this.loop();
  }

  private isBlocked = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= this.level.width || y >= this.level.height) return true;
    const cell = this.level.cells[y][x];
    return cell === CellType.Wall || cell === CellType.Obstacle;
  };

  private goToLevel(id: number) {
    const level = getLevel(id) ?? LEVELS[0];
    this.level = level;
    this.cubes = level.cubes.map((c) => ({ ...c }));
    this.moves = 0;
    this.won = false;

    this.scene.loadLevel(level, this.cubes);
    this.ui.showLevel(level);
    this.ui.setMoves(0);
    this.ui.updateGoalFill(this.cubes);
    this.ui.setNextLevelAvailable(id < LEVELS.length);
    this.input.setEnabled(true);
  }

  private restartLevel() {
    this.goToLevel(this.level.id);
  }

  private handleDirection(dir: Direction) {
    if (this.won || this.scene.isAnimating()) return;

    const { positions, moved } = computeStep(this.cubes, dir, { isBlocked: this.isBlocked });
    if (!moved) return;

    this.cubes = positions;
    this.moves += 1;
    this.ui.setMoves(this.moves);
    this.input.setEnabled(false);

    this.scene.animateCubesTo(positions, () => {
      this.ui.updateGoalFill(this.cubes);
      this.input.setEnabled(true);
      if (this.checkWin()) this.handleWin();
    });
  }

  private checkWin(): boolean {
    const targetSet = new Set(this.level.targets.map((t) => `${t.x},${t.y}`));
    return this.cubes.every((c) => targetSet.has(`${c.x},${c.y}`));
  }

  private handleWin() {
    this.won = true;
    this.ui.markCompleted(this.level.id, LEVELS.length);
    this.ui.setNextLevelAvailable(this.level.id < LEVELS.length);
    this.ui.showWin(this.moves);
  }

  private loop = () => {
    this.scene.render();
    requestAnimationFrame(this.loop);
  };
}
