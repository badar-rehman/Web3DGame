# Cube Shift

A 3D isometric grid puzzle game built with [Three.js](https://threejs.org/) + Vite + TypeScript, deployed to GitHub Pages straight from `main`.

Swipe (or use arrow keys / WASD) to move every cube on the board one step in
that direction at once. Cubes that hit a wall, an obstacle, another cube, or
the edge of the grid simply stay put — and a cube that slides off the grid's
open edge falls and fails the level. Each level defines a target **formation**:
a set of relative relations between cubes (e.g. "● left of ▲", "★ below ■").
Slide the cubes until every relation is satisfied to clear the level.

## Features

- 20 hand-authored levels, from a two-cube first bond up to multi-cube grids and mazes
- Relation-based goal panel with a live checklist and glowing connection bonds
- Free hints — a Web Worker runs a BFS solver in the background and suggests the next move without blocking the UI
- Undo, with a full move history stack
- Synthesized sound effects (Web Audio, no audio files) and Android haptics (vibration API; not available on iOS)
- Star ratings per level, based on a precomputed optimal ("par") move count
- Settings menu: sound toggle, reduced-motion toggle, and progress reset
- Progress/best-moves/stars persisted to `localStorage`
- Compact, mobile-friendly HUD: goal panel top-left, level name + move counter top-center, and a vertical column of square action buttons (Settings, Levels, Restart, Hint, Undo) top-right

## Getting started

```bash
npm install
npm run dev       # start the dev server
npm run build     # type-check and build for production
npm run preview   # preview the production build
```

## Deployment

Every push to `main` triggers `.github/workflows/static.yml`, which builds
the Vite production bundle and deploys it to GitHub Pages. There is
intentionally only one long-lived branch (`main`) so every push is
immediately testable live on Pages.

## Project structure

- `src/game/types.ts` — core types (grid cells, directions, level data, formation goals)
- `src/game/levelParser.ts` — parses ASCII-art level layouts into `LevelData`
- `src/game/levels.ts` — the 20-level set, including each level's precomputed `par` move count
- `src/game/MovementSolver.ts` — pure logic for resolving a swipe into new cube positions
- `src/game/formation.ts` — evaluates whether the cubes' relative positions satisfy the level's goal relations
- `src/game/HintSolver.ts` — BFS search over game states to find the next optimal move
- `src/game/hintWorker.ts` / `HintManager.ts` — runs the hint solver off the main thread and exposes it as a promise
- `src/game/stars.ts` — maps a completed level's move count + par into a 1–3 star rating
- `src/game/GameScene.ts` — Three.js scene, isometric camera, cube/tile rendering, glow/bond effects, and move animation
- `src/game/cubeVisuals.ts` — per-cube color and symbol assignment, symbol path generation
- `src/game/InputController.ts` — keyboard and touch-swipe input
- `src/game/SoundManager.ts` — synthesized Web Audio sound effects
- `src/game/HapticsManager.ts` — Android-only vibration feedback
- `src/game/UIManager.ts` — HUD (goal panel, move counter, win/fail screens, level select, settings)
- `src/game/Game.ts` — orchestrates scene, input, UI, hints, undo, and game state
