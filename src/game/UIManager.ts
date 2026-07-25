import { CellType, LevelData, Vec2 } from './types';

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
}

export class UIManager {
  private levelLabel = document.getElementById('level-label')!;
  private moveCounter = document.getElementById('move-counter')!;
  private goalGrid = document.getElementById('goal-grid')!;
  private restartBtn = document.getElementById('restart-btn')!;
  private levelsBtn = document.getElementById('levels-btn')!;
  private winOverlay = document.getElementById('win-overlay')!;
  private winMoves = document.getElementById('win-moves')!;
  private nextLevelBtn = document.getElementById('next-level-btn')!;
  private replayLevelBtn = document.getElementById('replay-level-btn')!;
  private levelSelectOverlay = document.getElementById('level-select-overlay')!;
  private levelSelectGrid = document.getElementById('level-select-grid')!;
  private closeLevelSelectBtn = document.getElementById('close-level-select-btn')!;
  private swipeHint = document.getElementById('swipe-hint')!;

  private goalCells = new Map<string, HTMLDivElement>();
  private progress: Progress;

  constructor(private callbacks: UICallbacks) {
    this.progress = loadProgress();
    this.restartBtn.addEventListener('click', () => this.callbacks.onRestart());
    this.nextLevelBtn.addEventListener('click', () => this.callbacks.onNextLevel());
    this.replayLevelBtn.addEventListener('click', () => this.callbacks.onReplay());
    this.levelsBtn.addEventListener('click', () => this.callbacks.onOpenLevelSelect());
    this.closeLevelSelectBtn.addEventListener('click', () => this.levelSelectOverlay.classList.add('hidden'));

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
    this.buildGoalGrid(level);
  }

  private buildGoalGrid(level: LevelData) {
    this.goalGrid.innerHTML = '';
    this.goalCells.clear();
    this.goalGrid.style.gridTemplateColumns = `repeat(${level.width}, 16px)`;

    const targetSet = new Set(level.targets.map((t) => `${t.x},${t.y}`));
    for (let y = 0; y < level.height; y++) {
      for (let x = 0; x < level.width; x++) {
        const div = document.createElement('div');
        div.className = 'goal-cell';
        const isTarget = targetSet.has(`${x},${y}`);
        if (level.cells[y][x] === CellType.Wall) div.classList.add('wall');
        if (isTarget) {
          div.classList.add('target');
          this.goalCells.set(`${x},${y}`, div);
        }
        this.goalGrid.appendChild(div);
      }
    }
  }

  updateGoalFill(cubes: Vec2[]) {
    const occupied = new Set(cubes.map((c) => `${c.x},${c.y}`));
    this.goalCells.forEach((div, key) => {
      div.classList.toggle('filled', occupied.has(key));
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

  setNextLevelAvailable(available: boolean) {
    this.nextLevelBtn.style.display = available ? '' : 'none';
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
