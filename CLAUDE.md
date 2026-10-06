# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Tetris in vanilla JavaScript + HTML5 Canvas. There is no `package.json`, build step, linter, or test suite. The README and UI text are in Spanish; keep user-facing strings in Spanish.

## Running

Open `index.html` directly (`open index.html`) or serve the directory statically (`python3 -m http.server 8000`, then visit `http://localhost:8000`). Verification is manual, in the browser.

## Architecture

Three files, loaded by `index.html` (`game.js` is a classic `<script>`, not a module, at the end of `<body>`):

- `index.html` defines the DOM that `game.js` looks up by id at load time (`board`, `next-canvas`, `score`, `lines`, `level`, `overlay`, `overlay-title`, `overlay-score`, `restart-btn`). Renaming an id means updating the `getElementById` calls at the top of `game.js`.
- `style.css` holds the dark/retro styling. The overlay is toggled with the `hidden` class.
- `game.js` holds all game logic as top-level functions sharing module-level `let` state (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, `animId`, …), which `init()` resets.

Key points in `game.js`:

- **Board** is a `ROWS × COLS` matrix of `0` or a piece-type index `1–7`. That index is also the key into `COLORS` and `PIECES`, and the value stored in the shape matrices, so adding or reordering pieces means changing all three consistently. `randomPiece()` hardcodes `7` as the piece count.
- **Piece lifecycle**: `lockPiece()` → `merge()` → `clearLines()` → `spawn()`. `spawn()` promotes `next` to `current`, generates a new `next`, and calls `endGame()` if the new piece collides immediately.
- **Two drop paths** exist: gravity in `loop()` (accumulates `dt` against `dropInterval`) and player input in the `keydown` handler (`softDrop`, `hardDrop`). Only the player paths award drop points.
- **Rotation** (`tryRotate`) uses `rotateCW` plus horizontal-only kicks `[0, -1, 1, -2, 2]`. There is no SRS table or vertical kick.
- **Speed curve** `max(100, 1000 - (level - 1) * 90)` is set in `clearLines()`. The initial `1000` is duplicated in `init()`, so change both if tuning.
- **Canvas size is not derived from constants.** `COLS`/`ROWS`/`BLOCK` must match the `width`/`height` attributes of `<canvas id="board">` in `index.html` (currently 300×600). The next-piece canvas is 120×120 and `drawNext()` hardcodes a 4×4 cell grid with `NB = 30`.

## Known quirk

`endGame()` calls `cancelAnimationFrame(animId)`. When game over is triggered from inside `loop()` (gravity lock), `loop()` still reaches its trailing `requestAnimationFrame(loop)` and overwrites `animId`, so the loop keeps running behind the overlay. Keyboard input is gated by `gameOver`, but gravity is not. Fix this by guarding the reschedule in `loop()` with `if (!gameOver)`.
