# AI Prompts Log

## Prompt 1 (Phase 1)
Asked Claude to build "Kingdom of Glyphs", an ASCII medieval sandbox (plain HTML/CSS/JS, GitHub Pages), in 6 phases, starting with Phase 1.
**Changed:** Created index.html, style.css, game.js (canvas grid, responsive sizing, palette, place/erase), PROMPTS.md, .gitignore.

## Prompt 2
Fixed the misaligned title banner: new hand-built "KINGDOM OF GLYPHS" block-letter `<pre>` (monospace, white-space: pre, line-height 1.1); phones show a plain text title.

## Prompt 3 ("next", Phase 2)
Moved on to Phase 2.
**Changed:** Tile costs now charged; resources + population; 1s fixed tick (farms/mines/markets/trees produce, villagers eat, famine makes villagers leave); Kingdom Ledger with per-day in/out and ASCII trend lines; autosave/load via localStorage; Reset Kingdom button.

## Prompt 4 ("Next", Phase 3)
Moved on to Phase 3.
**Changed:** Villagers (@) spawn beside houses, BFS pathfinding along grass/roads, jobs (lumberjack/farmer/miner) carry goods to castle/market (houses until one exists); ledger income now comes from real deliveries.

## Prompt 5 ("next", Phase 4)
Moved on to Phase 4.
**Changed:** Day/night cycle (blue tint, sun/moon, villagers go home, taverns earn gold at night); 5 random events (harvest, wolves, drought, merchant, bandits) with walls/castle/wells reducing damage; two-option modal that pauses the game; log entries show the day; ledger rates are now a rolling one-day total.

## Prompt 6 ("next", Phase 5)
Moved on to Phase 5.
**Changed:** Kingdom Score, 7 achievements with a next-achievement ASCII progress bar, Scribe's Tips panel (contextual hints), Export Save (JSON download) and Import Save (validated), achievements saved with the game.

## Prompt 7 ("next", Phase 6)
Moved on to Phase 6.
**Changed:** Code review pass and fixes (homeless villagers leave when houses are erased, no long-press menu on phones, stale comments), keyboard cursor for placing tiles, README.md with how-to-play and Copilot To-Do.
