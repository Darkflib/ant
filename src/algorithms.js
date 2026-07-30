// Grid search algorithms implemented as incremental "steppers": each call to
// step() expands exactly one node, so the render loop can advance the search
// at any speed and draw the frontier / visited set as it grows.

export const ALGORITHMS = {
  bfs: {
    label: 'Breadth-First Search',
    desc: 'Explores in rings from the nest. Unweighted-shortest path, fans out evenly in every direction.',
  },
  dfs: {
    label: 'Depth-First Search',
    desc: 'Dives down one branch until it dead-ends, then backtracks. Fast but rarely finds the shortest route.',
  },
  dijkstra: {
    label: "Dijkstra",
    desc: 'Expands by cheapest cumulative cost. Guarantees the shortest path; explores broadly like BFS on a uniform grid.',
  },
  astar: {
    label: 'A*',
    desc: 'Dijkstra guided by a Manhattan heuristic. Shortest path while aiming straight at the food.',
  },
  greedy: {
    label: 'Greedy Best-First',
    desc: 'Always steps toward the goal by heuristic alone. Very fast, can be fooled by walls into detours.',
  },
}

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

// Minimal binary min-heap keyed by a numeric priority.
class MinHeap {
  constructor() {
    this.items = []
  }
  get size() {
    return this.items.length
  }
  push(node, priority) {
    const items = this.items
    items.push({ node, priority })
    let i = items.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (items[p].priority <= items[i].priority) break
      ;[items[p], items[i]] = [items[i], items[p]]
      i = p
    }
  }
  pop() {
    const items = this.items
    const top = items[0]
    const last = items.pop()
    if (items.length > 0) {
      items[0] = last
      let i = 0
      const n = items.length
      for (;;) {
        const l = 2 * i + 1
        const r = 2 * i + 2
        let s = i
        if (l < n && items[l].priority < items[s].priority) s = l
        if (r < n && items[r].priority < items[s].priority) s = r
        if (s === i) break
        ;[items[s], items[i]] = [items[i], items[s]]
        i = s
      }
    }
    return top.node
  }
}

export class Searcher {
  constructor(algo, grid, start, goal) {
    this.algo = algo
    this.grid = grid
    this.start = start
    this.goal = goal
    this.size = grid.size

    const n = grid.size * grid.size
    this.cameFrom = new Int32Array(n).fill(-1)
    this.gScore = new Float64Array(n).fill(Infinity)
    this.visited = new Uint8Array(n)
    this.inOpen = new Uint8Array(n)

    this.done = false
    this.found = false
    this.path = null
    this.visitedCount = 0
    this.expansions = 0

    const si = this.i(start.x, start.y)
    this.gScore[si] = 0

    if (algo === 'bfs' || algo === 'dfs') {
      this.list = [si] // used as queue (bfs) or stack (dfs)
    } else {
      this.heap = new MinHeap()
      this.heap.push(si, this.priority(si))
    }
    this.inOpen[si] = 1
  }

  i(x, y) {
    return y * this.size + x
  }

  priority(index) {
    const x = index % this.size
    const y = (index / this.size) | 0
    const g = this.gScore[index]
    const h = manhattan({ x, y }, this.goal)
    if (this.algo === 'dijkstra') return g
    if (this.algo === 'greedy') return h
    return g + h // astar
  }

  // Expand a single node. Returns the cell just closed plus any neighbours
  // newly added to the frontier, so the renderer can highlight them.
  step() {
    if (this.done) return null

    let current
    if (this.algo === 'bfs') {
      current = this.list.shift()
    } else if (this.algo === 'dfs') {
      current = this.list.pop()
    } else {
      if (this.heap.size === 0) {
        this.finish(false)
        return null
      }
      current = this.heap.pop()
    }

    if (current === undefined) {
      this.finish(false)
      return null
    }

    // Nodes can appear in the heap more than once; skip stale closes.
    if (this.visited[current]) return { current, added: [], skipped: true }

    this.visited[current] = 1
    this.inOpen[current] = 0
    this.visitedCount++
    this.expansions++

    const cx = current % this.size
    const cy = (current / this.size) | 0

    if (cx === this.goal.x && cy === this.goal.y) {
      this.reconstruct(current)
      this.finish(true)
      return { current, added: [], reachedGoal: true }
    }

    const added = []
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx
      const ny = cy + dy
      if (!this.grid.inBounds(nx, ny)) continue
      if (this.grid.isBlocked(nx, ny)) continue
      const ni = this.i(nx, ny)
      if (this.visited[ni]) continue

      const tentativeG = this.gScore[current] + 1

      if (this.algo === 'bfs' || this.algo === 'dfs') {
        if (this.inOpen[ni] || this.gScore[ni] !== Infinity) continue
        this.gScore[ni] = tentativeG
        this.cameFrom[ni] = current
        this.inOpen[ni] = 1
        this.list.push(ni)
        added.push(ni)
      } else {
        if (tentativeG < this.gScore[ni]) {
          this.gScore[ni] = tentativeG
          this.cameFrom[ni] = current
          this.inOpen[ni] = 1
          this.heap.push(ni, this.priority(ni))
          added.push(ni)
        }
      }
    }

    return { current, added }
  }

  reconstruct(goalIndex) {
    const path = []
    let cur = goalIndex
    while (cur !== -1) {
      path.push({ x: cur % this.size, y: (cur / this.size) | 0 })
      cur = this.cameFrom[cur]
    }
    path.reverse()
    this.path = path
  }

  finish(found) {
    this.done = true
    this.found = found
  }

  // Frontier cells still waiting to be expanded — for rendering.
  frontierCells() {
    const out = []
    if (this.algo === 'bfs' || this.algo === 'dfs') {
      for (const idx of this.list) {
        if (!this.visited[idx]) out.push({ x: idx % this.size, y: (idx / this.size) | 0 })
      }
    } else {
      for (const { node } of this.heap.items) {
        if (!this.visited[node]) out.push({ x: node % this.size, y: (node / this.size) | 0 })
      }
    }
    return out
  }
}

export function createSearch(algo, grid, start, goal) {
  return new Searcher(algo, grid, start, goal)
}
