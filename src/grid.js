import { makeRng } from './rng.js'

export const CELL = {
  EMPTY: 0,
  WALL: 1,
  FOOD: 2,
  NEST: 3,
}

// The grid model. Holds the cell array plus nest (start) position and the
// set of remaining food cells. Generation is fully driven by the seed so
// layouts are reproducible.
export class Grid {
  constructor(size) {
    this.size = size
    this.cells = new Uint8Array(size * size)
    this.nest = { x: 0, y: 0 }
  }

  idx(x, y) {
    return y * this.size + x
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.size && y < this.size
  }

  get(x, y) {
    return this.cells[this.idx(x, y)]
  }

  set(x, y, v) {
    this.cells[this.idx(x, y)] = v
  }

  isBlocked(x, y) {
    return !this.inBounds(x, y) || this.cells[this.idx(x, y)] === CELL.WALL
  }

  foodCells() {
    const out = []
    for (let i = 0; i < this.cells.length; i++) {
      if (this.cells[i] === CELL.FOOD) {
        out.push({ x: i % this.size, y: Math.floor(i / this.size) })
      }
    }
    return out
  }
}

// Build a grid from parameters. `density` is a 0..1 obstacle probability used
// for scatter walls; `maze` switches to recursive-division walls instead.
export function generateGrid({ size, density, foodCount, seed, maze }) {
  const grid = new Grid(size)
  const rng = makeRng(seed)

  // Nest sits near the top-left, food scatters across the map.
  grid.nest = { x: 1, y: 1 }

  if (maze) {
    carveRecursiveDivision(grid, rng)
  } else {
    scatterWalls(grid, rng, density)
  }

  // Keep the nest and its immediate neighbourhood clear.
  clearArea(grid, grid.nest.x, grid.nest.y, 1)
  grid.set(grid.nest.x, grid.nest.y, CELL.NEST)

  placeFood(grid, rng, foodCount)
  return grid
}

function scatterWalls(grid, rng, density) {
  for (let i = 0; i < grid.cells.length; i++) {
    grid.cells[i] = rng.chance(density) ? CELL.WALL : CELL.EMPTY
  }
}

function clearArea(grid, cx, cy, r) {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (grid.inBounds(x, y)) grid.set(x, y, CELL.EMPTY)
    }
  }
}

// Recursive division maze generation. Produces corridor-style walls with
// single-cell gaps that make search algorithms behave interestingly.
function carveRecursiveDivision(grid, rng) {
  const s = grid.size
  // Border walls.
  for (let x = 0; x < s; x++) {
    grid.set(x, 0, CELL.WALL)
    grid.set(x, s - 1, CELL.WALL)
  }
  for (let y = 0; y < s; y++) {
    grid.set(0, y, CELL.WALL)
    grid.set(s - 1, y, CELL.WALL)
  }

  const divide = (x, y, w, h) => {
    if (w < 3 || h < 3) return
    const horizontal = w < h ? true : h < w ? false : rng.chance(0.5)
    if (horizontal) {
      // wall row at an even offset, gap at an odd offset
      const wy = y + 1 + 2 * rng.int(0, Math.floor((h - 2) / 2))
      const gx = x + 2 * rng.int(0, Math.floor((w - 1) / 2))
      for (let i = x; i < x + w; i++) {
        if (i !== gx) grid.set(i, wy, CELL.WALL)
      }
      divide(x, y, w, wy - y)
      divide(x, wy + 1, w, y + h - wy - 1)
    } else {
      const wx = x + 1 + 2 * rng.int(0, Math.floor((w - 2) / 2))
      const gy = y + 2 * rng.int(0, Math.floor((h - 1) / 2))
      for (let i = y; i < y + h; i++) {
        if (i !== gy) grid.set(wx, i, CELL.WALL)
      }
      divide(x, y, wx - x, h)
      divide(wx + 1, y, x + w - wx - 1, h)
    }
  }

  divide(1, 1, s - 2, s - 2)
}

function placeFood(grid, rng, count) {
  let placed = 0
  let attempts = 0
  const limit = count * 200
  while (placed < count && attempts < limit) {
    attempts++
    const x = rng.int(0, grid.size - 1)
    const y = rng.int(0, grid.size - 1)
    // Don't drop food on top of walls, the nest, or too close to it.
    if (grid.get(x, y) !== CELL.EMPTY) continue
    if (Math.abs(x - grid.nest.x) + Math.abs(y - grid.nest.y) < 3) continue
    grid.set(x, y, CELL.FOOD)
    placed++
  }
}
