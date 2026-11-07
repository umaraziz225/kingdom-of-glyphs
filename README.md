# Kingdom of Glyphs

A relaxing ASCII medieval sandbox that runs in the browser. Build a tiny kingdom, keep your villagers fed, and learn basic resource management (supply, demand and balancing a budget). Built for MIS 410 at CSUSM by Umar Aziz.

**Live game:** https://umaraziz225.github.io/kingdom-of-glyphs/

## How to play
1. Pick a tile from the Builder's Tools (click it, or press its key), then click or tap the map to place it. Drag to paint. Costs are shown on each button; tools you can't afford are dimmed.
2. Build a **House** (6) so villagers move in, then a **Farm** (7) so they can eat. Villagers (`@`) work as lumberjacks, farmers and miners and carry goods to a **Castle** (E) or **Market** (W). Until you build one, they drop goods at houses.
3. Watch the **Kingdom Ledger**: it shows what you have, income and expense per day, and an ASCII trend line. Aim for income above expenses.
4. Days and nights pass on their own. Villagers go home at night, and **Taverns** (Q) earn gold after dark.
5. Random events happen: harvest festivals, wolves, droughts, merchants and bandits. Walls, a castle and wells reduce damage. Some events ask you to choose.
6. There is no losing. If food hits 0, villagers leave and the log tells you why.
7. Earn achievements and raise your Kingdom Score. The Scribe's Tips panel suggests what to do next.

**Controls:** number keys 1-9, 0 and Q, W, E select tiles, X erases. Keyboard-only: Tab to the map, arrow keys move the cursor, Enter places a tile.

## Features
- ASCII canvas map that resizes for desktop (40x24) and phone (20x30), with tap-to-place
- Real-time simulation (1 tick per second) that keeps running when you do nothing
- Villagers with breadth-first-search pathfinding and jobs
- Day/night cycle, random events with choice modals
- Ledger, event log (aria-live), achievements, score, contextual tips
- Autosave in localStorage, plus Export Save / Import Save (JSON) and Reset Kingdom

## Run locally
No build step and no dependencies. Open `index.html` in a browser, or use the VS Code **Live Server** extension.

## Files
- `index.html` - page structure
- `style.css` - parchment theme and responsive layout
- `game.js` - all game logic, in small commented sections
- `PROMPTS.md` - log of the AI prompts used to build this

## Copilot To-Do
Ask GitHub Copilot to:
1. Split `game.js` into ES modules (state, render, villagers, events, save) and update the script tag (needs a local server such as Live Server).
2. Add unit-style tests for `findPath` (reachable, blocked, start already next to the goal).
3. Improve accessibility: announce achievements and events with clearer aria-live text, and check color contrast.
4. Add a new building (for example a Blacksmith or Library) with a cost, a glyph, and an effect on the economy.
5. Make trees deplete and regrow, and add seasons that change farm output.

Built by Umar Aziz - CSUSM MIS
