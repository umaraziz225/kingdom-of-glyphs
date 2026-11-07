/* Kingdom of Glyphs - an ASCII medieval sandbox. Sections: tiles, state, grid, editing, rendering, day/night,
   palette, log, input, tick, villagers, events, ledger, score/tips, save/load, main loop. Plain classic script (no modules) so it works from file://. */
'use strict';

// ---------- Tile definitions ----------
// cost = price to place. key = keyboard shortcut.
// housing = population capacity. Resources come from villagers (see "Villagers" below).
const TILES = {
  grass:  { ch: '.', name: 'Grass',  color: '#5f8f3a', key: '1', cost: {} },
  tree:   { ch: 'T', name: 'Tree',   color: '#2e9e3e', key: '2', cost: { gold: 1 } },
  water:  { ch: '~', name: 'Water',  color: '#3f8fe0', key: '3', cost: { gold: 2 } },
  wall:   { ch: '#', name: 'Wall',   color: '#9a9a9a', key: '4', cost: { stone: 2 } },
  road:   { ch: '=', name: 'Road',   color: '#b8a070', key: '5', cost: { stone: 1 } },
  house:  { ch: 'H', name: 'House',  color: '#d9a066', key: '6', cost: { wood: 5 }, housing: 4 },
  farm:   { ch: 'F', name: 'Farm',   color: '#e6d34a', key: '7', cost: { wood: 3 } },
  mine:   { ch: 'M', name: 'Mine',   color: '#b0b8c8', key: '8', cost: { wood: 5, stone: 2 } },
  well:   { ch: 'W', name: 'Well',   color: '#6fc3ff', key: '9', cost: { stone: 3 } },
  church: { ch: '+', name: 'Church', color: '#f0f0f0', key: '0', cost: { stone: 10, gold: 5 } },
  tavern: { ch: 'A', name: 'Tavern', color: '#e07a3a', key: 'q', cost: { wood: 8, gold: 3 }, torch: true },
  market: { ch: '$', name: 'Market', color: '#f5c542', key: 'w', cost: { wood: 6, gold: 5 } },
  castle: { ch: 'C', name: 'Castle', color: '#c9b6e8', key: 'e', cost: { stone: 30, wood: 10 }, torch: true },
};
const ERASE = { ch: 'x', name: 'Erase', color: '#e05050', key: 'x', cost: {} };

// ---------- Economy constants ----------
const START_RES = { wood: 50, stone: 20, food: 30, gold: 20, pop: 0 };
const RES_NAMES = ['wood', 'stone', 'food', 'gold', 'pop'];
const DAY_TICKS = 30;        // ticks (seconds) per in-game day; ledger shows per-day rates
const EAT_PER_POP = 0.2;     // food eaten per villager per tick
const HIST_LEN = 20;
const SAVE_KEY = 'kingdom-of-glyphs-save';
function newHist() { return Object.fromEntries(RES_NAMES.map(r => [r, []])); }

// ---------- State ----------
const canvas = document.getElementById('map');
const ctx = canvas.getContext('2d');
const state = {
  cols: 0, rows: 0, cell: 0,
  grid: [],            // grid[y][x] = tile id string
  tool: 'tree',        // selected tool id (a TILES key or 'erase')
  painting: false,
  cursor: { x: 0, y: 0 },   // keyboard cursor position
  fx: new Map(),       // "x,y" -> start time (ms) of the placement animation
  res: { ...START_RES },
  tick: 0,
  achieved: {},                 // achievement id -> true
  stableDays: 0,                // consecutive days with a healthy food balance
  nextEvent: 20,               // tick when the next random event may fire
  paused: false,                // true while an event modal is open
  flowHist: [],                 // last DAY_TICKS ticks of {inc, exp}, for per-day ledger rates
  villagers: [],                // {x, y, job, carry: [res, amt] | null, path: [[x, y], ...]}
  delivered: { wood: 0, stone: 0, food: 0, gold: 0 },   // goods dropped off since last tick
  flow: { inc: {}, exp: {} },   // last tick's income/expense per resource
  hist: newHist(),              // recent amounts per resource, for trend lines
};
const FX_MS = 350;
let lastWarn = 0;               // throttles "not enough" log spam while dragging

// ---------- Grid & sizing ----------
// Make an empty grass grid, copying any old tiles that still fit.
function resizeGrid(cols, rows) {
  const old = state.grid;
  state.grid = Array.from({ length: rows }, (_, y) =>
    Array.from({ length: cols }, (_, x) => (old[y] && old[y][x]) || 'grass'));
  state.cols = cols; state.rows = rows;
  state.villagers = [];         // respawned from population on the next tick
}

// Phones get a tall 20x30 grid, desktops a wide 40x24 grid. Cell size fills the width.
function layout() {
  const w = document.getElementById('mapWrap').clientWidth;
  const phone = window.innerWidth <= 800;
  const cols = phone ? 20 : 40, rows = phone ? 30 : 24;
  if (cols !== state.cols || rows !== state.rows) resizeGrid(cols, rows);
  state.cell = Math.max(8, Math.min(28, Math.floor(w / cols)));
  const dpr = window.devicePixelRatio || 1;
  const cssW = cols * state.cell, cssH = rows * state.cell;
  canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
  canvas.width = cssW * dpr; canvas.height = cssH * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// ---------- Starting map ----------
function seedWorld() {
  const { cols, rows } = state;
  state.grid = [];
  resizeGrid(cols, rows);
  for (let i = 0; i < cols * rows * 0.07; i++) state.grid[rand(rows)][rand(cols)] = 'tree';
  const wx = Math.floor(cols * 0.7), wy = Math.floor(rows / 3);
  for (let i = 0; i < 18; i++) state.grid[Math.min(rows - 1, wy + rand(3))][Math.min(cols - 1, wx + rand(5))] = 'water';
}
function rand(n) { return Math.floor(Math.random() * n); }

// ---------- Editing ----------
function canAfford(cost) { return Object.entries(cost).every(([r, v]) => state.res[r] >= v); }
function spend(cost) { for (const [r, v] of Object.entries(cost)) state.res[r] -= v; }

// Place the selected tool on a cell, charging its cost (erase is free, no refund).
function applyTool(x, y) {
  if (x < 0 || y < 0 || x >= state.cols || y >= state.rows) return;
  const id = state.tool === 'erase' ? 'grass' : state.tool;
  if (state.grid[y][x] === id) return;
  const cost = TILES[id].cost;
  if (!canAfford(cost)) {
    if (performance.now() - lastWarn > 1000) { lastWarn = performance.now(); log(`Not enough resources for ${TILES[id].name} (needs ${costText(cost)}).`); }
    return;
  }
  spend(cost);
  state.grid[y][x] = id;
  renderLedger();
  state.fx.set(x + ',' + y, performance.now());
  if (state.tool !== 'erase') log(`Placed ${TILES[id].name} at (${x}, ${y}).`);
}

// Convert a pointer event to grid coordinates and apply the tool.
function paintAt(e) {
  const r = canvas.getBoundingClientRect();
  applyTool(Math.floor((e.clientX - r.left) / state.cell), Math.floor((e.clientY - r.top) / state.cell));
}

// ---------- Rendering ----------
function draw(now) {
  const { cols, rows, cell } = state;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = `${Math.floor(cell * 0.85)}px "Courier New", Consolas, monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) drawCell(x, y, now);
  for (const v of state.villagers) {   // gold @ = carrying goods, white @ = empty-handed
    ctx.fillStyle = v.carry ? '#ffd24a' : '#ffffff';
    ctx.fillText('@', v.x * cell + cell / 2, v.y * cell + cell / 2);
  }
  drawSky(cols * cell, rows * cell);
  if (document.activeElement === canvas) {   // keyboard cursor
    ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 2;
    ctx.strokeRect(state.cursor.x * cell + 1, state.cursor.y * cell + 1, cell - 2, cell - 2);
  }
}

// ---------- Day / night ----------
// A day is DAY_TICKS ticks: first half bright, dusk, night, dawn.
function dayFraction() { return ((state.tick + acc / 1000) % DAY_TICKS) / DAY_TICKS; }
function isNight() { const f = (state.tick % DAY_TICKS) / DAY_TICKS; return f >= 0.55 && f < 0.95; }
function nightAlpha(f) {
  if (f < 0.5) return 0;
  if (f < 0.6) return (f - 0.5) / 0.1 * 0.45;
  if (f < 0.9) return 0.45;
  return (1 - f) / 0.1 * 0.45;
}

// Blue night tint over the map plus a sun (O) or moon ( ( ) in the top-right corner.
function drawSky(w, h) {
  const a = nightAlpha(dayFraction());
  if (a > 0) { ctx.fillStyle = `rgba(10, 20, 80, ${a})`; ctx.fillRect(0, 0, w, h); }
  ctx.font = `${state.cell * 1.4}px "Courier New", Consolas, monospace`;
  ctx.fillStyle = a > 0.2 ? '#dfe6ff' : '#ffd24a';
  ctx.fillText(a > 0.2 ? '(' : 'O', w - state.cell, state.cell);
}

// Draw one tile, with a pop animation after placing and a flicker on torch tiles.
function drawCell(x, y, now) {
  const t = TILES[state.grid[y][x]], cell = state.cell;
  const cx = x * cell + cell / 2, cy = y * cell + cell / 2;
  const start = state.fx.get(x + ',' + y);
  let color = t.color, ch = t.ch, scale = 1;
  if (start !== undefined) {
    const age = now - start;
    if (age > FX_MS) state.fx.delete(x + ',' + y);
    else { scale = 1 + 0.6 * (1 - age / FX_MS); if (age < FX_MS / 2) ch = '*'; }
  }
  if (t.torch) color = Math.sin(now / 90 + x * 7 + y * 3) > 0.2 ? '#ffd24a' : t.color; // flicker
  ctx.save();
  ctx.translate(cx, cy); ctx.scale(scale, scale);
  ctx.fillStyle = color;
  ctx.fillText(ch, 0, 0);
  ctx.restore();
}

// ---------- Palette UI ----------
function costText(c) {
  const s = Object.entries(c).map(([k, v]) => `${v}${k[0]}`).join(' ');
  return s || 'free';
}

function buildPalette() {
  const box = document.getElementById('palette');
  const all = { ...TILES, erase: ERASE };
  for (const [id, t] of Object.entries(all)) {
    const b = document.createElement('button');
    b.dataset.tool = id;
    b.title = `${t.name} (key ${t.key.toUpperCase()}) cost: ${costText(t.cost)}`;
    b.innerHTML = `<b style="color:${t.color}">${t.ch}</b>${t.name}<br><small>${t.key.toUpperCase()} · ${costText(t.cost)}</small>`;
    b.addEventListener('click', () => selectTool(id));
    box.appendChild(b);
  }
  selectTool(state.tool);
}

function selectTool(id) {
  state.tool = id;
  document.querySelectorAll('#palette button')
    .forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === id)));
}

// ---------- Log (aria-live) ----------
function log(msg) {
  const ul = document.getElementById('log');
  const li = document.createElement('li');
  li.textContent = `D${Math.floor(state.tick / DAY_TICKS) + 1}: ${msg}`;
  ul.prepend(li);                       // newest on top
  while (ul.children.length > 50) ul.lastChild.remove();
}

// ---------- Input ----------
function bindInput() {
  canvas.addEventListener('pointerdown', e => { state.painting = true; canvas.setPointerCapture(e.pointerId); paintAt(e); });
  canvas.addEventListener('pointermove', e => { if (state.painting) paintAt(e); });
  canvas.addEventListener('pointerup', () => { state.painting = false; });
  canvas.addEventListener('pointercancel', () => { state.painting = false; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());   // no long-press menu on phones
  // Keyboard play: Tab to the map, arrows move the cursor, Enter/Space places the selected tile.
  canvas.addEventListener('keydown', e => {
    const move = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (move) {
      state.cursor.x = Math.max(0, Math.min(state.cols - 1, state.cursor.x + move[0]));
      state.cursor.y = Math.max(0, Math.min(state.rows - 1, state.cursor.y + move[1]));
      e.preventDefault();
    } else if (e.key === 'Enter' || e.key === ' ') { applyTool(state.cursor.x, state.cursor.y); e.preventDefault(); }
  });
  window.addEventListener('resize', layout);
  window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    const id = Object.keys(TILES).find(i => TILES[i].key === k) || (k === 'x' ? 'erase' : null);
    if (id && !e.ctrlKey && !e.metaKey && !e.altKey) selectTool(id);
  });
}

// ---------- Simulation tick (1 per second) ----------
function tick() {
  const inc = {}, exp = {};
  RES_NAMES.forEach(r => { inc[r] = 0; exp[r] = 0; });
  let cap = 0, taverns = 0;
  for (const row of state.grid) for (const id of row) {
    cap += TILES[id].housing || 0;
    if (id === 'tavern') taverns++;
  }
  for (const r in state.delivered) { inc[r] = state.delivered[r]; state.delivered[r] = 0; }   // goods villagers dropped off this tick
  const res = state.res;
  if (isNight() && res.pop > 0) inc.gold += taverns;   // taverns earn 1 gold per tick at night
  exp.food = res.pop * EAT_PER_POP;
  for (const r of ['wood', 'stone', 'food', 'gold']) res[r] = Math.max(0, res[r] + inc[r] - exp[r]);
  state.tick++;
  updatePopulation(cap);
  syncVillagers();
  state.flow = { inc, exp, cap };
  state.flowHist.push({ inc, exp });
  if (state.flowHist.length > DAY_TICKS) state.flowHist.shift();
  if (state.tick % DAY_TICKS === 0) updateStable();
  checkAchievements();
  maybeEvent();
  for (const r of RES_NAMES) { const h = state.hist[r]; h.push(res[r]); if (h.length > HIST_LEN) h.shift(); }
  renderLedger();
  if (state.tick % 5 === 0) save();
}

// Families move in while there is room and food; they leave when food runs out.
function updatePopulation(cap) {
  const res = state.res;
  if (state.tick % 5) return;
  if (res.food <= 0 && res.pop > 0) {
    res.pop--;
    log('Famine! A villager left because there was no food. Build more farms.');
  } else if (res.pop > cap) {
    res.pop--;
    log('A homeless villager left the kingdom. Build more houses.');
  } else if (res.pop < cap && res.food > 5) {
    res.pop++;
    log('A new villager moved in.');
  }
}

// ---------- Villagers ----------
// Each villager has a job: walk to a work site, pick up goods, walk to a drop-off, repeat.
// Trees never run out (shortcut: add depletion/regrowth later).
const WALKABLE = new Set(['grass', 'road']);
const STEP_MS = 250;                       // villagers move 4 cells per second
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const JOBS = [
  { site: 'tree', yields: () => ['wood', 2] },
  { site: 'farm', yields: () => ['food', 2] },
  { site: 'mine', yields: () => (Math.random() < 0.7 ? ['stone', 1] : ['gold', 1]) },
];
let dropTypes = ['house'];                 // where goods are delivered; refreshed each step round

function tileAt(x, y) { return (state.grid[y] && state.grid[y][x]) || null; }
// True if any of the 4 neighbours of (x, y) is one of the given tile types.
function touches(x, y, types) { return DIRS.some(([dx, dy]) => types.includes(tileAt(x + dx, y + dy))); }

// Breadth-first search over walkable tiles to the nearest cell touching one of `types`.
// Returns the list of cells to walk (start excluded), or null if unreachable.
function findPath(sx, sy, types) {
  const cols = state.cols, prev = new Map([[sy * cols + sx, -1]]), queue = [[sx, sy]];
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i];
    if (touches(x, y, types)) {
      const path = [];
      for (let k = y * cols + x; prev.get(k) !== -1; k = prev.get(k)) path.push([k % cols, Math.floor(k / cols)]);
      return path.reverse();
    }
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy, key = ny * cols + nx;
      if (prev.has(key) || !WALKABLE.has(tileAt(nx, ny))) continue;
      prev.set(key, y * cols + x);
      queue.push([nx, ny]);
    }
  }
  return null;
}

// Keep the number of villagers equal to the population; new ones appear beside a house.
function syncVillagers() {
  const list = state.villagers, houses = [];
  state.grid.forEach((row, y) => row.forEach((id, x) => { if (id === 'house') houses.push([x, y]); }));
  while (list.length > state.res.pop) list.pop();
  while (list.length < state.res.pop && houses.length) {
    const [hx, hy] = houses[rand(houses.length)];
    const spot = DIRS.map(([dx, dy]) => [hx + dx, hy + dy]).find(([x, y]) => WALKABLE.has(tileAt(x, y))) || [hx, hy];
    list.push({ x: spot[0], y: spot[1], job: JOBS[list.length % JOBS.length], carry: null, path: null });
  }
}

function stepVillagers() {
  const has = t => state.grid.some(r => r.includes(t));
  // Deliver to castle/market; before any exist, fall back to houses so the economy can start.
  dropTypes = has('castle') || has('market') ? ['castle', 'market'] : ['house'];
  state.villagers.forEach(stepVillager);
}

function stepVillager(v) {
  const night = isNight();
  if (night !== v.night) { v.night = night; v.path = null; }   // make a new plan at dusk and dawn
  if (v.path && v.path.length) {                       // follow the current path
    const [nx, ny] = v.path[0];
    if (WALKABLE.has(tileAt(nx, ny))) { v.path.shift(); v.x = nx; v.y = ny; } else v.path = null; // player built on it
    return;
  }
  if (night) {                                         // go home and rest
    if (!touches(v.x, v.y, ['house'])) goTo(v, ['house']);
    return;
  }
  if (v.carry) {
    if (!touches(v.x, v.y, dropTypes)) return goTo(v, dropTypes);
    state.delivered[v.carry[0]] += v.carry[1];
    v.carry = null;
  } else if (touches(v.x, v.y, [v.job.site])) v.carry = v.job.yields();
  else goTo(v, [v.job.site]);
}

function goTo(v, types) {
  v.path = findPath(v.x, v.y, types);
  if (!v.path) {                                       // nowhere to go: wander randomly
    const [dx, dy] = DIRS[rand(4)];
    if (WALKABLE.has(tileAt(v.x + dx, v.y + dy))) { v.x += dx; v.y += dy; }
  }
}

// ---------- Random events ----------
const count = type => state.grid.reduce((n, row) => n + row.filter(id => id === type).length, 0);
// Fraction (0-0.9) of raid damage blocked by walls and a castle.
function defence() { return Math.min(0.9, count('wall') * 0.03 + (count('castle') ? 0.3 : 0)); }
const pct = x => Math.round(x * 100) + '%';

function loseFood(base, shield, why) {
  const loss = Math.min(state.res.food, Math.round(base * (1 - shield)));
  state.res.food -= loss;
  log(`${why} You lost ${loss} food (${pct(shield)} blocked).`);
}

// Swap goods with a merchant: `give` is paid, `get` is received.
function trade(give, get) {
  if (!canAfford(give)) { log('You could not afford the deal, so the merchant moved on.'); return; }
  spend(give);
  for (const [r, v] of Object.entries(get)) state.res[r] += v;
  log('The merchant shook your hand and the trade is done.');
}

const EVENTS = [
  () => {
    const gain = 10 + 5 * count('farm');
    state.res.food += gain;
    log(`Harvest festival! The farms overflow: +${gain} food.`);
  },
  () => loseFood(15, defence(), 'Wolves raid the outskirts! Walls and a castle help.'),
  () => loseFood(12, Math.min(0.9, count('well') * 0.3), 'A drought dries the fields! Wells help.'),
  () => showChoice('Traveling Merchant', 'A merchant arrives with wares. What do you do?', [
    { label: 'Buy 15 wood (10 gold)', run: () => trade({ gold: 10 }, { wood: 15 }) },
    { label: 'Sell 15 food (+12 gold)', run: () => trade({ food: 15 }, { gold: 12 }) },
  ]),
  () => showChoice('Bandits!', `Bandits demand tribute. Your defences are ${pct(defence())}.`, [
    { label: 'Pay 15 gold', run: () => { const g = Math.min(15, state.res.gold); state.res.gold -= g; log(`You paid the bandits ${g} gold.`); } },
    { label: 'Fight them off', run: () => {
      if (Math.random() < 0.35 + defence()) { state.res.gold += 5; log('Your guards won and seized 5 gold!'); }
      else { const g = Math.min(25, state.res.gold); state.res.gold -= g; log(`The bandits won and took ${g} gold. Build walls and a castle.`); }
    } },
  ]),
];

// Roughly every 25-55 ticks, once the kingdom has people, pick a random event.
function maybeEvent() {
  if (state.res.pop < 1 || state.tick < state.nextEvent) return;
  state.nextEvent = state.tick + 25 + rand(30);
  EVENTS[rand(EVENTS.length)]();
}

// Show a two-option modal. The game pauses until the player picks one.
function showChoice(title, text, options) {
  const dlg = document.getElementById('eventModal');
  document.getElementById('evTitle').textContent = title;
  document.getElementById('evText').textContent = text;
  document.getElementById('evBtns').replaceChildren(...options.map(o => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = o.label;
    b.addEventListener('click', () => { dlg.close(); o.run(); renderLedger(); });
    return b;
  }));
  log(`${title}: ${text}`);
  state.paused = true;
  dlg.showModal();
  dlg.querySelector('button').focus();
}

// ---------- Kingdom Ledger ----------
function buildLedger() {
  const body = document.getElementById('ledgerBody');
  for (const r of RES_NAMES) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<th scope="row">${r}</th><td id="amt-${r}"></td><td id="inc-${r}"></td><td id="exp-${r}"></td><td id="trd-${r}" class="trend"></td>`;
    body.appendChild(tr);
  }
}

// ASCII sparkline: map recent values onto a ramp of characters.
function sparkline(values) {
  const ramp = ' .:-=+*#', min = Math.min(...values), max = Math.max(...values);
  if (max === min) return '-'.repeat(values.length);
  return values.map(v => ramp[Math.round((v - min) / (max - min) * (ramp.length - 1))]).join('');
}

function renderLedger() {
  const f = state.flow, set = (id, v) => { document.getElementById(id).textContent = v; };
  const fh = state.flowHist;   // rolling sum of the last day, so night-only income (taverns) is averaged in
  const perDay = (key, r) => Math.round(fh.reduce((s, t) => s + (t[key][r] || 0), 0) * DAY_TICKS / (fh.length || 1));
  for (const r of RES_NAMES) {
    set('amt-' + r, Math.floor(state.res[r]));
    set('trd-' + r, sparkline(state.hist[r].length ? state.hist[r] : [0]));
    if (r === 'pop') { set('inc-pop', 'cap ' + (f.cap || 0)); set('exp-pop', ''); continue; }
    set('inc-' + r, '+' + perDay('inc', r));
    set('exp-' + r, '-' + perDay('exp', r));
  }
  set('dayLabel', 'Day ' + (Math.floor(state.tick / DAY_TICKS) + 1) + (isNight() ? ' (night)' : ' (day)'));
  document.querySelectorAll('#palette button')   // dim tools we cannot afford
    .forEach(b => b.classList.toggle('poor', b.dataset.tool !== 'erase' && !canAfford(TILES[b.dataset.tool].cost)));
  renderProgress();
  set('tip', currentTip());
}

// ---------- Score, achievements, tips ----------
const ACHIEVEMENTS = [
  { id: 'first_home', name: 'First Home', desc: 'Build a house', goal: 1, value: () => count('house') },
  { id: 'ten_villagers', name: '10 Villagers', desc: 'Reach a population of 10', goal: 10, value: () => state.res.pop },
  { id: 'castle', name: 'Castle Keeper', desc: 'Build a castle', goal: 1, value: () => count('castle') },
  { id: 'faith', name: 'Faithful Kingdom', desc: 'Build a church', goal: 1, value: () => count('church') },
  { id: 'walled_town', name: 'Walled Town', desc: 'Build 20 wall tiles', goal: 20, value: () => count('wall') },
  { id: 'stable', name: 'Stable Economy', desc: 'Keep food income above food use for 5 days', goal: 5, value: () => state.stableDays },
  { id: 'gold', name: 'Gold Hoarder', desc: 'Hold 200 gold', goal: 200, value: () => state.res.gold },
];

// Called once per day: count consecutive days with positive food balance.
function updateStable() {
  const net = state.flowHist.reduce((s, t) => s + (t.inc.food || 0) - (t.exp.food || 0), 0);
  state.stableDays = state.res.pop > 0 && state.res.food > 0 && net >= 0 ? state.stableDays + 1 : 0;
}

function checkAchievements() {
  for (const a of ACHIEVEMENTS) {
    if (!state.achieved[a.id] && a.value() >= a.goal) {
      state.achieved[a.id] = true;
      log(`Achievement unlocked: ${a.name}! (${a.desc})`);
    }
  }
}

// Kingdom score: people and buildings matter most, then stockpiles, age and achievements.
function kingdomScore() {
  const built = state.grid.flat().filter(id => !['grass', 'tree', 'water'].includes(id)).length;
  const r = state.res, stock = r.wood + r.stone + r.food + r.gold;
  return Math.round(r.pop * 10 + built * 2 + stock / 10 + Math.floor(state.tick / DAY_TICKS) * 5
    + Object.keys(state.achieved).length * 50);
}

function renderProgress() {
  document.getElementById('score').textContent = kingdomScore();
  const todo = ACHIEVEMENTS.filter(a => !state.achieved[a.id])
    .map(a => ({ a, p: Math.min(1, a.value() / a.goal) })).sort((x, y) => y.p - x.p)[0];
  const next = document.getElementById('nextAch');
  if (!todo) next.textContent = 'All achievements unlocked!';
  else {
    const n = Math.floor(todo.p * 10);
    next.textContent = `Next: ${todo.a.name} - ${todo.a.desc}\n[${'#'.repeat(n)}${'-'.repeat(10 - n)}] ${Math.floor(todo.p * 100)}%`;
  }
  document.getElementById('achList').replaceChildren(...ACHIEVEMENTS.map(a => {
    const li = document.createElement('li');
    li.textContent = `${state.achieved[a.id] ? '[x]' : '[ ]'} ${a.name}`;
    return li;
  }));
}

// First matching rule wins, so the most urgent advice shows first.
function currentTip() {
  const r = state.res, cap = state.flow.cap || 0;
  const foodNet = state.flowHist.reduce((s, t) => s + (t.inc.food || 0) - (t.exp.food || 0), 0);
  if (!count('house')) return 'Build a House (key 6) so villagers can move in.';
  if (!count('farm')) return 'Villagers eat food. Build a Farm (key 7) on open ground.';
  if (r.food < 15 || (r.pop > 0 && foodNet < 0)) return 'Food is running low: build more farms or a well.';
  if (!count('castle') && !count('market')) return 'Until you build a Castle (E) or Market (W), villagers drop goods at houses.';
  if (r.wood < 10) return 'Wood is low: plant Trees (key 2) for lumberjacks to chop.';
  if (cap && r.pop >= cap) return 'Every house is full: build another House to grow your population.';
  if (!count('wall') && state.tick > DAY_TICKS * 2) return 'Raiders and wolves will come: walls and a castle reduce damage.';
  if (!count('tavern')) return 'A Tavern (key Q) earns gold every night.';
  if (!count('well')) return 'A Well (key 9) protects your food from droughts.';
  return 'Keep income above spending in the ledger for a stable economy.';
}

// ---------- Save / load (localStorage) ----------
function saveData() {
  const { grid, res, tick, hist, achieved, stableDays } = state;
  return { v: 1, grid, res, tick, hist, achieved, stableDays };
}
function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(saveData())); } catch (e) { /* storage blocked */ }
}

// Validate and apply a save object. Returns true on success (used by load and Import).
function applySave(d) {
  const w = d && Array.isArray(d.grid) && d.grid[0] && d.grid[0].length;
  if (!d || d.v !== 1 || !w || d.grid.length > 100 || w > 100 ||
      !d.grid.every(r => Array.isArray(r) && r.length === w)) return false;
  state.grid = d.grid.map(row => row.map(id => (TILES[id] ? id : 'grass')));   // drop unknown tiles
  state.villagers = []; state.flowHist = [];
  state.achieved = {};
  for (const a of ACHIEVEMENTS) if (d.achieved && d.achieved[a.id]) state.achieved[a.id] = true;
  state.stableDays = Number(d.stableDays) || 0;
  state.rows = state.grid.length; state.cols = state.grid[0].length;
  for (const r of RES_NAMES) state.res[r] = Number(d.res && d.res[r]) || 0;
  state.tick = d.tick | 0;
  state.nextEvent = state.tick + 20;
  state.hist = newHist();
  for (const r of RES_NAMES) if (d.hist && Array.isArray(d.hist[r])) state.hist[r] = d.hist[r].slice(-HIST_LEN).map(Number);
  return true;
}

// Download the current kingdom as a JSON file.
function exportSave() {
  const blob = new Blob([JSON.stringify(saveData(), null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'kingdom-of-glyphs-save.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  log('Save exported.');
}

// Read a chosen JSON file and load it (applySave rejects anything malformed).
function importSave(file) {
  if (!file) return;
  if (file.size > 1e6) { log('Import failed: file is too large.'); return; }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      if (!applySave(JSON.parse(reader.result))) throw new Error('bad save');
      layout(); renderLedger(); save();
      log('Save imported. Welcome back, Your Majesty.');
    } catch (e) { log('Import failed: that is not a valid Kingdom of Glyphs save.'); }
  };
  reader.readAsText(file);
}

function load() {
  try { return applySave(JSON.parse(localStorage.getItem(SAVE_KEY))); } catch (e) { return false; }
}

function resetKingdom() {
  if (!confirm('Reset your kingdom? This cannot be undone.')) return;
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  state.res = { ...START_RES }; state.tick = 0; state.nextEvent = 20; state.hist = newHist(); state.flow = { inc: {}, exp: {} }; state.flowHist = [];
  state.achieved = {}; state.stableDays = 0;
  seedWorld();
  renderLedger();
  log('A fresh kingdom awaits.');
}

// ---------- Main loop: rAF for drawing, fixed 1s tick for simulation ----------
let lastTime = performance.now(), acc = 0, stepAcc = 0;
function frame(now) {
  const dt = state.paused ? 0 : Math.min(now - lastTime, 2000);   // clamp so a background tab doesn't fast-forward
  acc += dt; stepAcc += dt;
  lastTime = now;
  while (stepAcc >= STEP_MS) { stepAcc -= STEP_MS; stepVillagers(); }
  while (acc >= 1000) { acc -= 1000; tick(); }
  draw(now);
  requestAnimationFrame(frame);
}

buildPalette();
buildLedger();
bindInput();
layout();                         // sets view size first so seedWorld knows the grid dimensions
if (!load()) seedWorld();
layout();                         // re-fit a loaded save to this screen
renderLedger();
document.getElementById('resetBtn').addEventListener('click', resetKingdom);
document.getElementById('exportBtn').addEventListener('click', exportSave);
const importInput = document.getElementById('importInput');
document.getElementById('importBtn').addEventListener('click', () => importInput.click());
importInput.addEventListener('change', () => { importSave(importInput.files[0]); importInput.value = ''; });
window.addEventListener('pagehide', save);
const modal = document.getElementById('eventModal');
modal.addEventListener('cancel', e => e.preventDefault());        // Esc must not skip the choice
modal.addEventListener('close', () => { state.paused = false; });
log('Welcome, Your Majesty. Pick a tile and tap the map.');
requestAnimationFrame(frame);
