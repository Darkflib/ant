import { CELL } from './grid.js'

// Cyber palette. Kept here so the render layer owns all colour decisions.
const COLORS = {
  bg: '#0a0e14',
  gridLine: 'rgba(120, 200, 220, 0.05)',
  wall: '#151b26',
  wallEdge: 'rgba(90, 130, 160, 0.25)',
  nest: '#00f5d4',
  food: '#ff4d9d',
  explored: 'rgba(0, 180, 200, 0.16)',
  frontier: 'rgba(80, 245, 255, 0.55)',
  path: 'rgba(120, 255, 200, 0.9)',
  ant: '#eafff8',
  antGlow: 'rgba(0, 245, 212, 0.9)',
  trail: [255, 214, 92], // amber pheromone, alpha comes from intensity
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.showTrail = true
    this.showExplored = true
  }

  resize(pixelSize) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.canvas.width = pixelSize * dpr
    this.canvas.height = pixelSize * dpr
    this.canvas.style.width = pixelSize + 'px'
    this.canvas.style.height = pixelSize + 'px'
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.cssSize = pixelSize
  }

  render(state) {
    const { grid, searcher, trail, ants, path, pathProgress } = state
    const ctx = this.ctx
    const size = grid.size
    const cs = this.cssSize / size

    ctx.fillStyle = COLORS.bg
    ctx.fillRect(0, 0, this.cssSize, this.cssSize)

    // Explored cells (visited by the current search).
    if (this.showExplored && searcher) {
      ctx.fillStyle = COLORS.explored
      const v = searcher.visited
      for (let i = 0; i < v.length; i++) {
        if (v[i]) {
          const x = i % size
          const y = (i / size) | 0
          ctx.fillRect(x * cs, y * cs, cs, cs)
        }
      }
      // Frontier — the live edge of the search.
      ctx.fillStyle = COLORS.frontier
      for (const c of searcher.frontierCells()) {
        ctx.fillRect(c.x * cs + cs * 0.15, c.y * cs + cs * 0.15, cs * 0.7, cs * 0.7)
      }
    }

    // Pheromone trail.
    if (this.showTrail && trail) {
      const [r, g, b] = COLORS.trail
      for (let i = 0; i < trail.length; i++) {
        const a = trail[i]
        if (a > 0.01) {
          const x = i % size
          const y = (i / size) | 0
          ctx.fillStyle = `rgba(${r},${g},${b},${Math.min(a, 0.85)})`
          ctx.fillRect(x * cs, y * cs, cs, cs)
        }
      }
    }

    // Walls, food, nest.
    for (let i = 0; i < grid.cells.length; i++) {
      const c = grid.cells[i]
      if (c === CELL.EMPTY) continue
      const x = (i % size) * cs
      const y = ((i / size) | 0) * cs
      if (c === CELL.WALL) {
        ctx.fillStyle = COLORS.wall
        ctx.fillRect(x, y, cs, cs)
        if (cs > 6) {
          ctx.strokeStyle = COLORS.wallEdge
          ctx.lineWidth = 1
          ctx.strokeRect(x + 0.5, y + 0.5, cs - 1, cs - 1)
        }
      } else if (c === CELL.FOOD) {
        this.dot(ctx, x + cs / 2, y + cs / 2, cs * 0.34, COLORS.food, true)
      } else if (c === CELL.NEST) {
        ctx.fillStyle = COLORS.nest
        ctx.globalAlpha = 0.22
        ctx.fillRect(x, y, cs, cs)
        ctx.globalAlpha = 1
        this.dot(ctx, x + cs / 2, y + cs / 2, cs * 0.3, COLORS.nest, true)
      }
    }

    // Grid lines (only when cells are large enough to read).
    if (cs >= 10) {
      ctx.strokeStyle = COLORS.gridLine
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let k = 0; k <= size; k++) {
        const p = Math.round(k * cs) + 0.5
        ctx.moveTo(p, 0)
        ctx.lineTo(p, this.cssSize)
        ctx.moveTo(0, p)
        ctx.lineTo(this.cssSize, p)
      }
      ctx.stroke()
    }

    // Planned path (revealed up to the ant's progress).
    if (path && path.length > 1) {
      const upto = pathProgress != null ? Math.min(pathProgress + 1, path.length) : path.length
      ctx.strokeStyle = COLORS.path
      ctx.lineWidth = Math.max(1.5, cs * 0.18)
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.shadowColor = COLORS.path
      ctx.shadowBlur = cs > 6 ? 6 : 0
      ctx.beginPath()
      for (let k = 0; k < upto; k++) {
        const px = path[k].x * cs + cs / 2
        const py = path[k].y * cs + cs / 2
        if (k === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.stroke()
      ctx.shadowBlur = 0
    }

    // Ants.
    if (ants) {
      for (const ant of ants) {
        const px = ant.x * cs + cs / 2
        const py = ant.y * cs + cs / 2
        this.dot(ctx, px, py, Math.max(2, cs * 0.32), COLORS.ant, true, COLORS.antGlow)
      }
    }
  }

  dot(ctx, x, y, r, color, glow, glowColor) {
    if (glow) {
      ctx.shadowColor = glowColor || color
      ctx.shadowBlur = r * 2.2
    }
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0
  }

  // Convert a canvas mouse event into a grid cell.
  cellFromEvent(evt, size) {
    const rect = this.canvas.getBoundingClientRect()
    const x = Math.floor(((evt.clientX - rect.left) / rect.width) * size)
    const y = Math.floor(((evt.clientY - rect.top) / rect.height) * size)
    return { x: Math.max(0, Math.min(size - 1, x)), y: Math.max(0, Math.min(size - 1, y)) }
  }
}
