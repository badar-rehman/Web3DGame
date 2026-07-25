import { Direction } from './types';

const SWIPE_THRESHOLD_PX = 28;

const KEY_TO_DIRECTION: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
  W: 'up',
  S: 'down',
  A: 'left',
  D: 'right',
};

export class InputController {
  private touchStart: { x: number; y: number } | null = null;
  private mouseStart: { x: number; y: number } | null = null;
  private onDirection: (dir: Direction) => void;
  private target: HTMLElement;
  private enabled = true;

  constructor(target: HTMLElement, onDirection: (dir: Direction) => void) {
    this.target = target;
    this.onDirection = onDirection;

    window.addEventListener('keydown', this.handleKeyDown);
    target.addEventListener('touchstart', this.handleTouchStart, { passive: true });
    target.addEventListener('touchend', this.handleTouchEnd, { passive: true });
    target.addEventListener('touchcancel', this.handleTouchCancel, { passive: true });

    // Mouse drag mirrors touch swipe: press, drag past the threshold, release.
    // mouseup/mousemove are on window so a drag that ends outside the canvas
    // (fast flick, release past the edge) still resolves correctly.
    target.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('mouseup', this.handleMouseUp);
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (!this.enabled) return;
    const dir = KEY_TO_DIRECTION[e.key];
    if (!dir) return;
    e.preventDefault();
    this.onDirection(dir);
  };

  private handleTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    this.touchStart = { x: t.clientX, y: t.clientY };
  };

  private handleTouchEnd = (e: TouchEvent) => {
    if (!this.touchStart || !this.enabled) {
      this.touchStart = null;
      return;
    }
    const t = e.changedTouches[0];
    const dx = t.clientX - this.touchStart.x;
    const dy = t.clientY - this.touchStart.y;
    this.touchStart = null;

    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD_PX) return;

    const dir: Direction = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    this.onDirection(dir);
  };

  private handleTouchCancel = () => {
    this.touchStart = null;
  };

  private handleMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return; // left click/drag only
    e.preventDefault();
    this.mouseStart = { x: e.clientX, y: e.clientY };
  };

  private handleMouseMove = (e: MouseEvent) => {
    if (!this.mouseStart) return;
    e.preventDefault();
  };

  private handleMouseUp = (e: MouseEvent) => {
    if (!this.mouseStart || !this.enabled) {
      this.mouseStart = null;
      return;
    }
    const dx = e.clientX - this.mouseStart.x;
    const dy = e.clientY - this.mouseStart.y;
    this.mouseStart = null;

    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD_PX) return;

    const dir: Direction = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    this.onDirection(dir);
  };

  dispose() {
    window.removeEventListener('keydown', this.handleKeyDown);
    this.target.removeEventListener('touchstart', this.handleTouchStart);
    this.target.removeEventListener('touchend', this.handleTouchEnd);
    this.target.removeEventListener('touchcancel', this.handleTouchCancel);
    this.target.removeEventListener('mousedown', this.handleMouseDown);
    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('mouseup', this.handleMouseUp);
  }
}
