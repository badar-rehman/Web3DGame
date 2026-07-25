import { Direction, LevelData } from './types';
import { cubeVisual } from './cubeVisuals';
import { computeRelativeLayout, relationText, FormationStatus } from './formation';

const HINT_ARROW_MS = 1600;
const HINT_TOAST_MS = 2200;

const PROGRESS_KEY = 'cube-shift-progress';

interface Progress {
  highestUnlocked: number;
  completed: number[];
}

function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore corrupt storage */
  }
  return { highestUnlocked: 1, completed: [] };
}

function saveProgress(p: Progress) {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable, ignore */
  }
}

export interface UICallbacks {
  onRestart: () => void;
  onNextLevel: () => void;
  onReplay: () => void;
  onSelectLevel: (id: number) => void;
  onOpenLevelSelect: () => void;
  onHint: () => void;
}

export class UIManager {
  private levelLabel = document.getElementById('level-label')!;
  private moveCounter = document.getElementById('move-counter')!;
  private goalGrid = document.getElementById('goal-grid')!;
  private goalRelations = document.getElementById('goal-relations')!;
  private restartBtn = document.getElementById('restart-btn')!;
  private levelsBtn = document.getElementById('levels-btn')!;
  private winOverlay = document.getElementById('win-overlay')!;
  private winMoves = document.getElementById('win-moves')!;
  private nextLevelBtn = document.getElementById('next-level-btn')!;
  private replayLevelBtn = document.getElementById('replay-level-btn')!;
  private failOverlay = document.getElementById('fail-overlay')!;
  private retryLevelBtn = document.getElementById('retry-level-btn')!;
  private levelSelectOverlay = document.getElementById('level-select-overlay')!;
  private levelSelectGrid = document.getElementById('level-select-grid')!;
  private closeLevelSelectBtn = document.getElementById('close-level-select-btn')!;
  private swipeHint = document.getElementById('swipe-hint')!;
  private hintBtn = document.getElementById('hint-btn')! as HTMLButtonElement;
  private hintArrow = document.getElementById('hint-arrow')!;
  private hintToast = document.getElementById('hint-toast')!;

  private goalCubeCells = new Map<string, HTMLDivElement>();
  private relationItems: HTMLDivElement[] = [];
  private progress: Progress;
  private hintArrowTimeout: number | undefined;
  private hintToastTimeout: number | undefined;

  constructor(private callbacks: UICallbacks) {
    this.progress = loadProgress();
    this.restartBtn.addEventListener('click', () => this.callbacks.onRestart());
    this.nextLevelBtn.addEventListener('click', () => this.callbacks.onNextLevel());
    this.replayLevelBtn.addEventListener('click', () => this.callbacks.onReplay());
    this.retryLevelBtn.addEventListener('click', () => this.callbacks.onRestart());
    this.levelsBtn.addEventListener('click', () => this.callbacks.onOpenLevelSelect());
    this.closeLevelSelectBtn.addEventListener('click', () => this.levelSelectOverlay.classList.add('hidden'));
    this.hintBtn.addEventListener('click', () => this.callbacks.onHint());

    window.setTimeout(() => this.swipeHint.classList.add('hidden'), 4000);
  }

  getProgress(): Progress {
    return this.progress;
  }

  markCompleted(levelId: number, totalLevels: number) {
    if (!this.progress.completed.includes(levelId)) this.progress.completed.push(levelId);
    this.progress.highestUnlocked = Math.min(totalLevels, Math.max(this.progress.highestUnlocked, levelId + 1));
    saveProgress(this.progress);
  }

  showLevel(level: LevelData) {
    this.levelLabel.textContent = `Level ${level.id} — ${level.name}`;
    this.hideWin();
    this.hideFail();
    this.buildGoalDiagram(level);
    this.buildRelationChecklist(level);
    window.clearTimeout(this.hintArrowTimeout);
    window.clearTimeout(this.hintToastTimeout);
    this.hintArrow.classList.add('hidden');
    this.hintToast.classList.add('hidden');
    this.setHintLoading(false);
  }

  private buildGoalDiagram(level: LevelData) {
    this.goalGrid.innerHTML = '';
    this.goalCubeCells.clear();

    const layout = computeRelativeLayout(level.goal);
    if (layout.size === 0) return;

    const xs = [...layout.values()].map((p) => p.x);
    const ys = [...layout.values()].map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const width = maxX - minX + 1;
    const height = maxY - minY + 1;

    const grid: (string | null)[][] = Array.from({ length: height }, () => Array(width).fill(null));
    layout.forEach((pos, id) => {
      grid[pos.y - minY][pos.x - minX] = id;
    });

    this.goalGrid.style.gridTemplateColumns = `repeat(${width}, 22px)`;

    grid.forEach((row) => {
      row.forEach((id) => {
        const div = document.createElement('div');
        div.className = 'goal-cell';
        if (id) {
          const visual = cubeVisual(id);
          div.classList.add('cube');
          div.style.setProperty('--cube-color', visual.cssColor);
          div.textContent = visual.glyph;
          this.goalCubeCells.set(id, div);
        }
        this.goalGrid.appendChild(div);
      });
    });
  }

  private buildRelationChecklist(level: LevelData) {
    this.goalRelations.innerHTML = '';
    this.relationItems = level.goal.map((edge) => {
      const item = document.createElement('div');
      item.className = 'relation-item';
      const dot = document.createElement('span');
      dot.className = 'dot';
      const text = document.createElement('span');
      text.textContent = relationText(edge);
      item.appendChild(dot);
      item.appendChild(text);
      this.goalRelations.appendChild(item);
      return item;
    });
  }

  updateFormationStatus(status: FormationStatus) {
    this.goalCubeCells.forEach((div, id) => {
      div.classList.toggle('satisfied', status.glowingCubeIds.has(id));
    });
    this.relationItems.forEach((item, i) => {
      item.classList.toggle('satisfied', status.satisfiedEdges.has(i));
    });
  }

  setMoves(n: number) {
    this.moveCounter.textContent = `Moves: ${n}`;
  }

  showWin(moves: number) {
    this.winMoves.textContent = `Solved in ${moves} move${moves === 1 ? '' : 's'}`;
    this.winOverlay.classList.remove('hidden');
  }

  hideWin() {
    this.winOverlay.classList.add('hidden');
  }

  showFail() {
    this.failOverlay.classList.remove('hidden');
  }

  hideFail() {
    this.failOverlay.classList.add('hidden');
  }

  setNextLevelAvailable(available: boolean) {
    this.nextLevelBtn.style.display = available ? '' : 'none';
  }

  setHintLoading(loading: boolean) {
    this.hintBtn.disabled = loading;
    this.hintBtn.textContent = loading ? '💡 …' : '💡 Hint';
  }

  showHintDirection(direction: Direction) {
    window.clearTimeout(this.hintArrowTimeout);
    this.hintArrow.classList.remove('dir-up', 'dir-down', 'dir-left', 'dir-right', 'hidden');
    this.hintArrow.classList.add(`dir-${direction}`);
    this.hintArrowTimeout = window.setTimeout(() => this.hintArrow.classList.add('hidden'), HINT_ARROW_MS);
  }

  showHintUnavailable() {
    window.clearTimeout(this.hintToastTimeout);
    this.hintToast.classList.remove('hidden');
    this.hintToastTimeout = window.setTimeout(() => this.hintToast.classList.add('hidden'), HINT_TOAST_MS);
  }

  renderLevelSelect(levels: LevelData[], currentId: number) {
    this.levelSelectGrid.innerHTML = '';
    levels.forEach((level) => {
      const btn = document.createElement('button');
      btn.textContent = String(level.id);
      btn.title = level.name;
      const unlocked = level.id <= this.progress.highestUnlocked;
      const completed = this.progress.completed.includes(level.id);
      if (completed) btn.classList.add('completed');
      if (!unlocked) {
        btn.classList.add('locked');
        btn.disabled = true;
      }
      if (level.id === currentId) btn.style.outline = '2px solid var(--accent)';
      btn.addEventListener('click', () => {
        this.levelSelectOverlay.classList.add('hidden');
        this.callbacks.onSelectLevel(level.id);
      });
      this.levelSelectGrid.appendChild(btn);
    });
  }

  openLevelSelect() {
    this.levelSelectOverlay.classList.remove('hidden');
  }
}
