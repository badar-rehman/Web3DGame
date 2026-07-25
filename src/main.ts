import { Game } from './game/Game';
import './style.css';

// Safari on iOS only applies CSS :active styles to elements once a
// touchstart listener exists somewhere in the document — otherwise button
// press feedback never shows up on tap. This no-op listener switches it on.
document.addEventListener('touchstart', () => {}, { passive: true });

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
new Game(canvas);
