// Grid search algorithms implemented as incremental "steppers": each call to
// step() expands exactly one node, so the render loop can advance the search
// at any speed and draw the frontier / visited set as it grows.

// Single source of truth for algorithm metadata. `desc` is the short sidebar
// blurb; the richer fields feed the "How it works" explainer.
//   optimal  — always returns a shortest path
//   complete — always finds a path if one exists
//   frontier — the data structure that decides expansion order
//   uses     — what the priority is based on: g (cost so far), h (heuristic)
export const ALGORITHMS = {
  bfs: {
    label: 'Breadth-First Search',
    short: 'BFS',
    desc: 'Explores in rings from the nest. Unweighted-shortest path, fans out evenly in every direction.',
    frontier: 'FIFO queue',
    uses: 'insertion order',
    optimal: true,
    complete: true,
    detail:
      'BFS expands cells in the exact order it discovers them, so the search grows outward as a widening ring of equal distance from the nest. Because every step costs the same, the first time it reaches the food it has necessarily taken a shortest route.',
    tradeoff:
      'Guaranteed shortest path on an unweighted grid, but it explores almost everything closer than the food — a lot of wasted work when the goal is far away.',
  },
  dfs: {
    label: 'Depth-First Search',
    short: 'DFS',
    desc: 'Dives down one branch until it dead-ends, then backtracks. Fast but rarely finds the shortest route.',
    frontier: 'LIFO stack',
    uses: 'insertion order',
    optimal: false,
    complete: true,
    detail:
      'DFS always expands the most recently discovered cell, so it plunges down a single corridor until it hits a wall or dead end, then unwinds and tries the next branch. The frontier stays small and it can reach a distant goal quickly.',
    tradeoff:
      'Very memory-light and often fast, but the path it returns wanders and is almost never the shortest. Great for showing how exploration order alone changes behaviour.',
  },
  dijkstra: {
    label: 'Dijkstra',
    short: 'Dijkstra',
    desc: 'Expands by cheapest cumulative cost. Guarantees the shortest path; explores broadly like BFS on a uniform grid.',
    frontier: 'min-priority queue',
    uses: 'g — cost so far',
    optimal: true,
    complete: true,
    detail:
      'Dijkstra always expands the cell with the lowest cost-so-far (g). On this uniform grid every move costs 1, so it behaves almost identically to BFS — but the priority-queue formulation is what generalises to weighted terrain.',
    tradeoff:
      'Shortest path with weighted edges too, but with no sense of direction it still fans out in all directions, exploring far more than it needs to.',
  },
  astar: {
    label: 'A*',
    short: 'A*',
    desc: 'Dijkstra guided by a Manhattan heuristic. Shortest path while aiming straight at the food.',
    frontier: 'min-priority queue',
    uses: 'g + h — cost + estimate',
    optimal: true,
    complete: true,
    detail:
      'A* orders the frontier by g + h: the cost already paid plus a Manhattan-distance estimate of the cost remaining. The heuristic biases the search toward the goal, so it explores a slim corridor rather than a full ring while still guaranteeing the shortest path (the heuristic never over-estimates).',
    tradeoff:
      'The best of both worlds here — optimal like Dijkstra, but explores a fraction of the cells. The usual default for grid pathfinding.',
  },
  greedy: {
    label: 'Greedy Best-First',
    short: 'Greedy',
    desc: 'Always steps toward the goal by heuristic alone. Very fast, can be fooled by walls into detours.',
    frontier: 'min-priority queue',
    uses: 'h — estimate only',
    optimal: false,
    complete: true,
    detail:
      'Greedy Best-First ignores the cost paid so far and expands whichever frontier cell looks closest to the goal (lowest h). This drives it straight at the food and it often reaches it after touching very few cells.',
    tradeoff:
      'Blisteringly fast in open space, but a wall between it and the goal can lure it into a long detour — the returned path is frequently far from optimal.',
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
