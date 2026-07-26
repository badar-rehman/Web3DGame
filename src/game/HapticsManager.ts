// The Vibration API (navigator.vibrate) is a real, working standard on
// Android (Chrome, Firefox, Samsung Internet, etc). iOS Safari — and every
// other browser engine on iOS, since they're all required to use WebKit —
// has never implemented it; there is no public web API for the Taptic
// Engine, only for native apps. That's a platform limitation, not a bug
// here, so this deliberately stays a no-op everywhere except Android rather
// than reaching for an unreliable undocumented trick (e.g. toggling hidden
// form controls) that could silently break on any iOS update.
const IS_ANDROID = /Android/i.test(navigator.userAgent);

export class HapticsManager {
  private enabled = IS_ANDROID && typeof navigator.vibrate === 'function';

  private vibrate(pattern: number | number[]) {
    if (!this.enabled) return;
    try {
      navigator.vibrate(pattern);
    } catch {
      /* not supported on this device after all — ignore */
    }
  }

  /** A cube actually slid. */
  playMove() {
    this.vibrate(10);
  }

  /** A swipe that couldn't move anything. */
  playBump() {
    this.vibrate([0, 12, 25, 12]);
  }

  /** Stepping a move back. */
  playUndo() {
    this.vibrate(10);
  }

  /** A new bond in the goal just became satisfied. */
  playBondConnect() {
    this.vibrate(15);
  }

  /** Level solved. */
  playWin() {
    this.vibrate([0, 30, 40, 30, 40, 60]);
  }

  /** Fell off an open edge. */
  playFail() {
    this.vibrate([0, 60, 50, 60]);
  }

  /** A hint direction was found. */
  playHintFound() {
    this.vibrate(12);
  }
}
