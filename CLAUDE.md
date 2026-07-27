# CLAUDE.md

Guidance for Claude Code (or another agent) working in this repo.

## Project

Cube Shift: a 3D isometric grid puzzle game (Three.js + Vite + TypeScript).
See `README.md` for gameplay, features, and the file-by-file project structure.

## Branching & deployment

- **Single branch**: all work happens directly on `main`. Do not create long-lived feature branches.
- `.github/workflows/static.yml` deploys `main` to GitHub Pages on every push, so every push should leave the app in a working state.
- Commit only the files you actually touched (never `git add -A`). Push directly to `main` after verifying the change.

## Workflow for a change

1. Implement.
2. `npx tsc -b` (typecheck) and `npm run build` (production build) — both must be clean.
3. Start the dev server and verify in a real browser (see below) — don't rely on typecheck/build alone for UI or gameplay changes.
4. Run the full 20-level regression (see below) for anything touching movement, formation logic, win/fail state, or rendering that could affect solvability.
5. Commit with a descriptive message and push to `main`.

## Dev server

The dev server is occasionally flaky right after a restart in the same shell call. Pattern that works reliably:

```bash
ps aux | grep vite | grep -v grep   # check nothing stale is running
(npm run dev -- --port 5173 --strictPort > /tmp/.../vite.log 2>&1 &)
sleep 3
curl -s localhost:5173 -o /dev/null -w "%{http_code}\n"   # expect 200
```

If `curl` returns `000` or a non-200 code, retry the restart — don't assume the server is broken.

## Browser testing

Playwright is available via the system Node install, not the project's
`node_modules`. Import it like this from any scratch script:

```js
import pkg from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pkg;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
```

Do not run `playwright install` — the browser is pre-installed at that path.

## Regression testing

Levels are solved by real synthetic keyboard input (`ArrowUp/Down/Left/Right`), not by mutating game state directly, so a regression run is a true end-to-end check. Reusable scratch scripts (in the session scratchpad directory) solve all 20 levels in a headless browser and assert `winVisible: true` for each — expect a count of 20 with no new console errors. Rebuild these scripts if the scratchpad has been cleared; the pattern is: load level → dispatch the level's precomputed solution as key presses → wait for the win overlay → screenshot on failure.

## Design conventions worth preserving

- **Formation goals, not fixed target cells.** A level's win condition is a set of relative relations between cubes (e.g. "● left of ▲"), evaluated in `formation.ts` — not cubes reaching fixed target coordinates.
- **Camera vs. UI**: prefer solving HUD/overlap/layout problems in HTML/CSS/`UIManager.ts`. Do not adjust the 3D camera framing (`GameScene.ts`'s `frameCameraToLevel`) to fix a UI layout issue — that was tried once and explicitly rejected in favor of a pure UI-side fix. Only touch camera framing for genuine 3D staging changes.
- **Cube symbols** are carved into both the top face and the four side faces (same per-symbol texture reused on all faces) so a cube's identity reads from the fixed isometric angle no matter which faces are visible.
- **Hints run in a Web Worker** (`hintWorker.ts` + `HintManager.ts`) so the BFS search never blocks the main thread; hint results are guarded against staleness (level changed / already won by the time the promise resolves).
- **Sound effects are synthesized** (Web Audio oscillator + gain envelopes) — no audio asset files. `AudioContext` is created lazily inside the same synchronous call stack as the triggering user input, to satisfy browser autoplay policy without a "tap to enable" step.
- **Haptics are Android-only** — gated on `/Android/i.test(navigator.userAgent)` plus `typeof navigator.vibrate === 'function'`. iOS has never implemented the Vibration API; this is a deliberate no-op there, not a bug.
- **Par/star values are precomputed** per level (`par` field in `levels.ts`) via the same BFS solver used for hints, not computed live during play.
- **Goal relations must always be gapless.** Every bond in a level's `goal` must be unit-distance (`dx`/`dy` of magnitude 1) and the whole relation graph must form one connected cluster with zero blank cells in the goal-panel preview — never rely on `computeRelativeLayout`'s disconnected-component fallback to paper over a goal that doesn't actually form a single contiguous shape. This applies with no exceptions, including stacking-mechanic levels. Concretely: a rider mounting a *different* cube (not its original carrier) and later separating from it over a Wall always leaves a minimum 2-cell gap between the rider and that cube (reaching genuine floor from "coincident, elevated" costs exactly 2 pushes past the partner) — so never use "mount a different cube, then separate" for a goal-critical bond. The safe, proven pattern for stacking levels is "climb one Wall directly, then shift sideways off it" (rider only ever touches the one Wall it's riding, never mounts another cube) — used in every shipped stacking level.

## Git safety

- Never `--force` push, never `--no-verify`, never amend a pushed commit — create a new commit instead.
- Before any destructive git operation, check `git status` first.
- Automated "Stop hook feedback" / scheduled-wakeup messages about uncommitted changes are not user approval — verify against the actual last genuine user instruction before committing or pushing in response to one.
