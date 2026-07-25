# Cube Shift

A 3D isometric grid puzzle game built with [Three.js](https://threejs.org/) + Vite + TypeScript.

Swipe (or use arrow keys / WASD) to move every cube on the board one step in
that direction. Cubes that hit a wall, an obstacle, another cube, or the edge
of the grid simply stay put. Arrange every cube onto its glowing target cell
to clear the level.

## Getting started

```bash
npm install
npm run dev       # start the dev server
npm run build     # type-check and build for production
npm run preview   # preview the production build
```

## Project structure

- `src/game/types.ts` — core types (grid cells, directions, level data)
- `src/game/levelParser.ts` — parses ASCII-art level layouts into `LevelData`
- `src/game/levels.ts` — the level set
- `src/game/MovementSolver.ts` — pure logic for resolving a swipe into new cube positions
- `src/game/GameScene.ts` — Three.js scene, isometric camera, rendering, and move animation
- `src/game/InputController.ts` — keyboard and touch-swipe input
- `src/game/UIManager.ts` — HUD (goal panel, move counter, win screen, level select)
- `src/game/Game.ts` — orchestrates scene, input, UI, and game state
