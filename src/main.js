import './style.css'
import { generateGrid, CELL } from './grid.js'
import { ALGORITHMS, createSearch } from './algorithms.js'
import { Renderer } from './renderer.js'
import { randomSeed } from './rng.js'

// ---- Controls / default parameters -----------------------------------------
const params = {
  size: 48,
  density: 24, // percent
  food: 6,
  maze: false,
  seed: 'antcolony',
  speed: 18,
  fade: 8, // percent per frame (trail fade)
  showTrail: true,
  showExplored: true,
  algo: 'astar',
}

// ---- DOM -------------------------------------------------------------------
const $ = (id) => document.getElementById(id)
const canvas = $('grid')
const renderer = new Renderer(canvas)

const el = {
  start: $('btn-start'),
  pause: $('btn-pause'),
  reset: $('btn-reset'),
  step: $('btn-step'),
  algo: $('sel-algo'),
  algoDesc: $('algo-desc'),
  size: $('rng-size'),
  density: $('rng-density'),
  food: $('rng-food'),
  maze: $('chk-maze'),
  seed: $('txt-seed'),
  reseed: $('btn-reseed'),
  speed: $('rng-speed'),
  fade: $('rng-fade'),
  trail: $('chk-trail'),
  explored: $('chk-explored'),
  valSize: $('val-size'),
  valDensity: $('val-density'),
  valFood: $('val-food'),
  valSpeed: $('val-speed'),
  valFade: $('val-fade'),
  stats: $('stats'),
  status: $('status'),
  legend: $('legend'),
  app: $('app'),
  explain: $('btn-explain'),
  modal: $('modal'),
  modalClose: $('modal-close'),
  algoCards: $('algo-cards'),
  compareTable: $('compare-table'),
}

// ---- Simulation state ------------------------------------------------------
let sim = null

function newSimState(grid) {
  return {
    grid,
    trail: new Float32Array(grid.size * grid.size),
    searcher: null,
    ant: { x: grid.nest.x, y: grid.nest.y },
    path: null,
    pathProgress: 0,
    walkAccum: 0,
    phase: 'idle', // idle | planning | walking | done
    target: null,
    remaining: grid.foodCells(),
    foodTotal: grid.foodCells().length,
    legExpansions: 0,
    totalExpansions: 0,
    lastPathLen: 0,
    collected: 0,
    running: false,
  }
}

function rebuild() {
  const grid = generateGrid({
    size: params.size,
    density: params.density / 100,
    foodCount: params.food,
    seed: params.seed,
    maze: params.maze,
  })
  sim = newSimState(grid)
  renderer.resize(canvasPixelSize())
  setStatus('idle')
  draw()
  syncButtons()
}

function canvasPixelSize() {
  // Fit a square canvas to the available stage area.
  const wrap = canvas.parentElement
  const avail = Math.min(wrap.clientWidth, window.innerHeight - 190)
  return Math.max(280, Math.floor(avail))
}

// ---- Simulation stepping ---------------------------------------------------
function beginNextLeg() {
  if (sim.remaining.length === 0) {
    sim.phase = 'done'
    sim.running = false
    setStatus(`complete · ${sim.collected}/${sim.foodTotal} food · ${sim.totalExpansions} expansions`)
    syncButtons()
    return
  }
  // Target the nearest remaining food (Manhattan) from the ant's position.
  const from = sim.ant
  let best = 0
  let bestD = Infinity
  sim.remaining.forEach((f, i) => {
    const d = Math.abs(f.x - from.x) + Math.abs(f.y - from.y)
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  sim.target = sim.remaining[best]
  sim.searcher = createSearch(params.algo, sim.grid, { x: from.x, y: from.y }, sim.target)
  sim.legExpansions = 0
  sim.phase = 'planning'
}

function advancePlanning(budget) {
  const s = sim.searcher
  for (let k = 0; k < budget && !s.done; k++) {
    s.step()
  }
  sim.legExpansions = s.expansions
  if (s.done) {
    sim.totalExpansions += s.expansions
    if (s.found && s.path) {
      sim.path = s.path
      sim.pathProgress = 0
      sim.walkAccum = 0
      sim.lastPathLen = s.path.length - 1
      sim.phase = 'walking'
    } else {
      // Unreachable — drop this food and try the next.
      sim.remaining = sim.remaining.filter((f) => f !== sim.target)
      sim.foodTotal = Math.max(sim.collected + sim.remaining.length, sim.foodTotal)
      beginNextLeg()
    }
  }
}

function advanceWalking(budget) {
  sim.walkAccum += budget * 0.9
  while (sim.walkAccum >= 1 && sim.pathProgress < sim.path.length - 1) {
    sim.walkAccum -= 1
    sim.pathProgress++
    const c = sim.path[sim.pathProgress]
    sim.ant = { x: c.x, y: c.y }
    deposit(c.x, c.y, 0.75)
  }
  if (sim.pathProgress >= sim.path.length - 1) {
    // Arrived at the food: consume it.
    const t = sim.target
    if (sim.grid.get(t.x, t.y) === CELL.FOOD) sim.grid.set(t.x, t.y, CELL.EMPTY)
    sim.remaining = sim.remaining.filter((f) => f !== t)
    sim.collected++
    sim.searcher = null
    sim.path = null
    beginNextLeg()
  }
}

function deposit(x, y, amount) {
  const i = y * sim.grid.size + x
  sim.trail[i] = Math.min(1, sim.trail[i] + amount)
}

function fadeTrail() {
  const f = params.fade / 100
  if (f <= 0) return
  const factor = 1 - f * 0.6
  const t = sim.trail
  for (let i = 0; i < t.length; i++) {
    if (t[i] > 0) t[i] *= factor
  }
}

function tick() {
  if (!sim.running) return
  if (sim.phase === 'idle') beginNextLeg()
  fadeTrail()
  const budget = params.speed
  if (sim.phase === 'planning') advancePlanning(budget)
  else if (sim.phase === 'walking') advanceWalking(budget)

  if (sim.phase === 'planning') setStatus(`planning → (${sim.target.x},${sim.target.y}) · ${sim.legExpansions} expansions`)
  else if (sim.phase === 'walking') setStatus(`walking · ${sim.pathProgress}/${sim.lastPathLen}`)
}

// Single manual step (one search expansion or one ant move).
function manualStep() {
  if (sim.phase === 'idle' || sim.phase === 'done') {
    if (sim.phase === 'done') return
    beginNextLeg()
  }
  if (sim.phase === 'planning') advancePlanning(1)
  else if (sim.phase === 'walking') {
    sim.walkAccum = 0
    if (sim.pathProgress < sim.path.length - 1) {
      sim.pathProgress++
      const c = sim.path[sim.pathProgress]
      sim.ant = { x: c.x, y: c.y }
      deposit(c.x, c.y, 0.75)
    }
    if (sim.pathProgress >= sim.path.length - 1) advanceWalking(0)
  }
  updateStats()
  draw()
}

// ---- Render loop -----------------------------------------------------------
function loop() {
  tick()
  updateStats()
  draw()
  requestAnimationFrame(loop)
}

function draw() {
  renderer.showTrail = params.showTrail
  renderer.showExplored = params.showExplored
  renderer.render({
    grid: sim.grid,
    searcher: sim.searcher,
    trail: sim.trail,
    ants: [sim.ant],
    path: sim.path,
    pathProgress: sim.phase === 'walking' ? sim.pathProgress : null,
  })
}

// ---- UI wiring -------------------------------------------------------------
function setStatus(text) {
  el.status.textContent = text
}

function statRow(label, value) {
  return `<div><dt>${label}</dt><dd>${value}</dd></div>`
}

function updateStats() {
  const frontier = sim.searcher ? sim.searcher.frontierCells().length : 0
  const visited = sim.searcher ? sim.searcher.visitedCount : 0
  el.stats.innerHTML =
    statRow('algorithm', ALGORITHMS[params.algo].label) +
    statRow('seed', params.seed) +
    statRow('grid', `${sim.grid.size}×${sim.grid.size}`) +
    statRow('phase', sim.phase) +
    statRow('food', `${sim.collected}/${sim.foodTotal}`) +
    statRow('visited', visited) +
    statRow('frontier', frontier) +
    statRow('leg exp.', sim.legExpansions) +
    statRow('total exp.', sim.totalExpansions) +
    statRow('path len', sim.lastPathLen)
}

function syncButtons() {
  const active = sim.running
  el.start.disabled = active || sim.phase === 'done'
  el.pause.disabled = !active
  el.start.textContent = sim.phase === 'done' ? 'Done' : 'Start'
}

function buildLegend() {
  const items = [
    ['nest', 'var(--nest)'],
    ['food', 'var(--food)'],
    ['wall', 'var(--wall)'],
    ['explored', 'var(--explored)'],
    ['frontier', 'var(--frontier)'],
    ['path', 'var(--path)'],
    ['trail', 'var(--trail)'],
  ]
  el.legend.innerHTML = items
    .map(([name, c]) => `<span class="lg"><i style="background:${c}"></i>${name}</span>`)
    .join('')
}

// ---- Explainer modal -------------------------------------------------------
function buildExplainer() {
  const yes = '<span class="yn y">yes</span>'
  const no = '<span class="yn n">no</span>'

  el.algoCards.innerHTML = Object.values(ALGORITHMS)
    .map((a) => {
      const badges = [
        a.optimal ? '<span class="badge good">shortest path</span>' : '<span class="badge warn">not shortest</span>',
        a.uses.includes('h') ? '<span class="badge">heuristic</span>' : '',
        `<span class="badge muted">${a.frontier}</span>`,
      ]
        .filter(Boolean)
        .join('')
      return `
        <article class="algo-card">
          <header><h4>${a.label}</h4><span class="tag">${a.short}</span></header>
          <div class="badges">${badges}</div>
          <p>${a.detail}</p>
          <p class="tradeoff"><span>Trade-off</span> ${a.tradeoff}</p>
        </article>`
    })
    .join('')

  el.compareTable.innerHTML =
    `<thead><tr><th>Algorithm</th><th>Expands by</th><th>Shortest path</th><th>Heuristic</th></tr></thead><tbody>` +
    Object.values(ALGORITHMS)
      .map(
        (a) =>
          `<tr><td>${a.label}</td><td><code>${a.uses}</code></td>` +
          `<td>${a.optimal ? yes : no}</td>` +
          `<td>${a.uses.includes('h') ? yes : no}</td></tr>`
      )
      .join('') +
    `</tbody>`
}

let lastFocused = null
function openModal() {
  lastFocused = document.activeElement
  el.modal.hidden = false
  document.body.classList.add('modal-open')
  // Make the background inert so keyboard / AT focus can't reach the
  // obscured controls while the dialog is open, then move focus inside.
  el.app.inert = true
  el.modalClose.focus()
}
function closeModal() {
  el.modal.hidden = true
  document.body.classList.remove('modal-open')
  el.app.inert = false
  // Return focus to whatever opened the dialog.
  if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus()
}

function initExplainer() {
  buildExplainer()
  el.explain.addEventListener('click', openModal)
  el.modalClose.addEventListener('click', closeModal)
  el.modal.addEventListener('click', (e) => {
    if (e.target.hasAttribute('data-close')) closeModal()
  })
  // Keep Tab focus cycling within the dialog while it's open.
  el.modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal()
      return
    }
    if (e.key !== 'Tab') return
    const focusable = el.modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  })
}

function initControls() {
  // Algorithm dropdown.
  el.algo.innerHTML = Object.entries(ALGORITHMS)
    .map(([k, v]) => `<option value="${k}">${v.label}</option>`)
    .join('')
  el.algo.value = params.algo
  el.algoDesc.textContent = ALGORITHMS[params.algo].desc

  el.size.value = params.size
  el.density.value = params.density
  el.food.value = params.food
  el.maze.checked = params.maze
  el.seed.value = params.seed
  el.speed.value = params.speed
  el.fade.value = params.fade
  el.trail.checked = params.showTrail
  el.explored.checked = params.showExplored
  refreshValueLabels()

  el.start.addEventListener('click', () => {
    if (sim.phase === 'done') return
    sim.running = true
    setStatus('running')
    syncButtons()
  })
  el.pause.addEventListener('click', () => {
    sim.running = false
    setStatus('paused')
    syncButtons()
  })
  el.reset.addEventListener('click', rebuild)
  el.step.addEventListener('click', () => {
    sim.running = false
    manualStep()
    syncButtons()
  })

  el.algo.addEventListener('change', () => {
    params.algo = el.algo.value
    el.algoDesc.textContent = ALGORITHMS[params.algo].desc
    // Re-plan the current leg with the new algorithm without regenerating the map.
    softReset()
  })

  el.size.addEventListener('input', () => {
    params.size = +el.size.value
    refreshValueLabels()
  })
  el.size.addEventListener('change', rebuild)

  el.density.addEventListener('input', () => {
    params.density = +el.density.value
    refreshValueLabels()
  })
  el.density.addEventListener('change', rebuild)

  el.food.addEventListener('input', () => {
    params.food = +el.food.value
    refreshValueLabels()
  })
  el.food.addEventListener('change', rebuild)

  el.maze.addEventListener('change', () => {
    params.maze = el.maze.checked
    rebuild()
  })

  el.seed.addEventListener('change', () => {
    params.seed = el.seed.value.trim() || 'seed'
    rebuild()
  })
  el.reseed.addEventListener('click', () => {
    params.seed = randomSeed()
    el.seed.value = params.seed
    rebuild()
  })

  el.speed.addEventListener('input', () => {
    params.speed = +el.speed.value
    refreshValueLabels()
  })
  el.fade.addEventListener('input', () => {
    params.fade = +el.fade.value
    refreshValueLabels()
  })
  el.trail.addEventListener('change', () => (params.showTrail = el.trail.checked))
  el.explored.addEventListener('change', () => (params.showExplored = el.explored.checked))

  // Canvas editing.
  let painting = false
  let paintMode = null // 'wall' | 'food' | 'erase'
  const applyPaint = (evt) => {
    const { x, y } = renderer.cellFromEvent(evt, sim.grid.size)
    if (x === sim.grid.nest.x && y === sim.grid.nest.y) return
    const cur = sim.grid.get(x, y)
    if (paintMode === 'food') {
      if (cur !== CELL.WALL) sim.grid.set(x, y, CELL.FOOD)
    } else if (paintMode === 'erase') {
      if (cur === CELL.WALL) sim.grid.set(x, y, CELL.EMPTY)
    } else {
      if (cur === CELL.EMPTY) sim.grid.set(x, y, CELL.WALL)
      else if (cur === CELL.WALL) sim.grid.set(x, y, CELL.EMPTY)
    }
    draw()
  }
  canvas.addEventListener('mousedown', (evt) => {
    painting = true
    const { x, y } = renderer.cellFromEvent(evt, sim.grid.size)
    paintMode = evt.shiftKey ? 'food' : sim.grid.get(x, y) === CELL.WALL ? 'erase' : 'wall'
    applyPaint(evt)
    softReset(true)
  })
  window.addEventListener('mouseup', () => (painting = false))
  canvas.addEventListener('mousemove', (evt) => {
    if (painting) {
      applyPaint(evt)
    }
  })

  buildLegend()
}

// Reset the search/ant without regenerating the grid layout (keeps edits).
function softReset(keepStatus) {
  const grid = sim.grid
  const state = newSimState(grid)
  sim = state
  if (!keepStatus) setStatus('idle')
  syncButtons()
  draw()
}

function refreshValueLabels() {
  el.valSize.textContent = `${params.size}×${params.size}`
  el.valDensity.textContent = `${params.density}%`
  el.valFood.textContent = params.food
  el.valSpeed.textContent = `${params.speed}×`
  el.valFade.textContent = `${params.fade}%`
}

// ---- Boot ------------------------------------------------------------------
initControls()
initExplainer()
rebuild()
updateStats()
requestAnimationFrame(loop)

window.addEventListener('resize', () => {
  renderer.resize(canvasPixelSize())
  draw()
})
