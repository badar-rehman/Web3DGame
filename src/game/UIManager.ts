import { Direction, LevelData } from './types';
import { cubeVisual } from './cubeVisuals';
import { computeRelativeLayout, relationText, FormationStatus } from './formation';
import { starsForMoves } from './stars';

const HINT_ARROW_MS = 1600;
const HINT_TOAST_MS = 2200;

const PROGRESS_KEY = 'cube-shift-progress';

interface Progress {
  highestUnlocked: number;
  completed: number[];
  /** Fewest moves ever used to solve each level, keyed by level id — stars are derived from this vs. par. */
  bestMoves: Record<number, number>;
}

function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    // `bestMoves` is defaulted in even for progress saved before it existed.
    if (raw) return { bestMoves: {}, ...JSON.parse(raw) };
  } catch {
    /* ignore corrupt storage */
  }
  return { highestUnlocked: 1, completed: [], bestMoves: {} };
}

function saveProgress(p: Progress) {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable, ignore */
  }
}

const REDUCED_MOTION_KEY = 'cube-shift-reduced-motion';

function loadReducedMotion(): boolean {
  try {
    return localStorage.getItem(REDUCED_MOTION_KEY) === '1';
  } catch {
    return false;
  }
}

function saveReducedMotion(enabled: boolean) {
  try {
    localStorage.setItem(REDUCED_MOTION_KEY, enabled ? '1' : '0');
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
  onUndo: () => void;
  onToggleMute: () => void;
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
  private winStars = document.getElementById('win-stars')!;
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
  private undoBtn = document.getElementById('undo-btn')! as HTMLButtonElement;
  private settingsBtn = document.getElementById('settings-btn')!;
  private settingsOverlay = document.getElementById('settings-overlay')!;
  private closeSettingsBtn = document.getElementById('close-settings-btn')!;
  private soundToggleBtn = document.getElementById('settings-sound-btn')! as HTMLButtonElement;
  private motionToggleBtn = document.getElementById('settings-motion-btn')! as HTMLButtonElement;
  private resetProgressBtn = document.getElementById('settings-reset-btn')!;

  private goalCubeCells = new Map<string, HTMLDivElement>();
  private relationItems: HTMLDivElement[] = [];
  private progress: Progress;
  private hintArrowTimeout: number | undefined;
  private hintToastTimeout: number | undefined;
  private reducedMotion = loadReducedMotion();

  constructor(private callbacks: UICallbacks) {
    this.progress = loadProgress();
    this.restartBtn.addEventListener('click', () => this.callbacks.onRestart());
    this.nextLevelBtn.addEventListener('click', () => this.callbacks.onNextLevel());
    this.replayLevelBtn.addEventListener('click', () => this.callbacks.onReplay());
    this.retryLevelBtn.addEventListener('click', () => this.callbacks.onRestart());
    this.levelsBtn.addEventListener('click', () => this.callbacks.onOpenLevelSelect());
    this.closeLevelSelectBtn.addEventListener('click', () => this.levelSelectOverlay.classList.add('hidden'));
    this.hintBtn.addEventListener('click', () => this.callbacks.onHint());
    this.undoBtn.addEventListener('click', () => this.callbacks.onUndo());
    this.settingsBtn.addEventListener('click', () => this.settingsOverlay.classList.remove('hidden'));
    this.closeSettingsBtn.addEventListener('click', () => this.settingsOverlay.classList.add('hidden'));
    this.soundToggleBtn.addEventListener('click', () => this.callbacks.onToggleMute());
    this.motionToggleBtn.addEventListener('click', () => this.toggleReducedMotion());
    this.resetProgressBtn.addEventListener('click', () => this.resetProgress());

    this.applyReducedMotion();
    this.setMotionToggleLabel();

    window.setTimeout(() => this.swipeHint.classList.add('hidden'), 4000);
  }

  getProgress(): Progress {
    return this.progress;
  }

  markCompleted(levelId: number, totalLevels: number, moves: number) {
    if (!this.progress.completed.includes(levelId)) this.progress.completed.push(levelId);
    this.progress.highestUnlocked = Math.min(totalLevels, Math.max(this.progress.highestUnlocked, levelId + 1));
    const best = this.progress.bestMoves[levelId];
    if (best === undefined || moves < best) this.progress.bestMoves[levelId] = moves;
    saveProgress(this.progress);
  }

  /** Stars earned so far for a level, or 0 if it's never been solved. */
  private starsFor(level: LevelData): 0 | 1 | 2 | 3 {
    const best = this.progress.bestMoves[level.id];
    return best === undefined ? 0 : starsForMoves(best, level.par);
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
    this.setUndoAvailable(false);
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

  showWin(moves: number, stars: 1 | 2 | 3) {
    this.winMoves.textContent = `Solved in ${moves} move${moves === 1 ? '' : 's'}`;
    this.renderStars(this.winStars, stars);
    this.winOverlay.classList.remove('hidden');
  }

  private renderStars(container: HTMLElement, count: number) {
    container.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const star = document.createElement('span');
      star.className = 'star' + (i < count ? ' filled' : '');
      star.textContent = i < count ? '★' : '☆';
      container.appendChild(star);
    }
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
    this.hintBtn.textContent = loading ? '⏳' : '💡';
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

  setUndoAvailable(available: boolean) {
    this.undoBtn.disabled = !available;
  }

  setMuted(muted: boolean) {
    this.soundToggleBtn.textContent = muted ? 'Off' : 'On';
    this.soundToggleBtn.classList.toggle('on', !muted);
  }

  private setMotionToggleLabel() {
    this.motionToggleBtn.textContent = this.reducedMotion ? 'On' : 'Off';
    this.motionToggleBtn.classList.toggle('on', this.reducedMotion);
  }

  private applyReducedMotion() {
    document.documentElement.classList.toggle('reduce-motion', this.reducedMotion);
  }

  private toggleReducedMotion() {
    this.reducedMotion = !this.reducedMotion;
    saveReducedMotion(this.reducedMotion);
    this.applyReducedMotion();
    this.setMotionToggleLabel();
  }

  /** Wipes saved progress (levels unlocked, completed, best-move stars) after a confirm, then reloads fresh. */
  private resetProgress() {
    const ok = window.confirm('Reset all progress and stars? This cannot be undone.');
    if (!ok) return;
    try {
      localStorage.removeItem(PROGRESS_KEY);
    } catch {
      /* storage unavailable, ignore */
    }
    window.location.reload();
  }

  renderLevelSelect(levels: LevelData[], currentId: number) {
    this.levelSelectGrid.innerHTML = '';
    levels.forEach((level) => {
      const btn = document.createElement('button');
      btn.title = level.name;

      const num = document.createElement('span');
      num.className = 'level-num';
      num.textContent = String(level.id);
      btn.appendChild(num);

      const unlocked = level.id <= this.progress.highestUnlocked;
      const completed = this.progress.completed.includes(level.id);
      if (completed) {
        btn.classList.add('completed');
        const starsRow = document.createElement('div');
        starsRow.className = 'level-stars';
        this.renderStars(starsRow, this.starsFor(level));
        btn.appendChild(starsRow);
      }
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
