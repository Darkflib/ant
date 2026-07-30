# ant · pathfinding

A single-page demo that visualises grid search algorithms as an ant colony
foraging for food. Each ant plans a route from the nest to the nearest food
using the selected algorithm — showing the explored cells and live search
frontier — then walks the path, leaving a fading pheromone trail behind it.

**Live demo:** https://darkflib.github.io/ant/

## Algorithms

| Algorithm | Behaviour |
| --- | --- |
| **Breadth-First Search** | Explores in even rings; shortest path on an unweighted grid. |
| **Depth-First Search** | Dives down one branch until it dead-ends; fast, rarely optimal. |
| **Dijkstra** | Expands by cheapest cumulative cost; guaranteed shortest path. |
| **A\*** | Dijkstra guided by a Manhattan heuristic; shortest path, aimed at the goal. |
| **Greedy Best-First** | Follows the heuristic only; very fast, can be tricked by walls. |

## Controls

- **Start / Pause / Reset / Step** — run continuously, pause, regenerate, or
  advance the search one expansion at a time.
- **Algorithm** — switch search strategy (re-plans the current map instantly).
- **Grid size / obstacle density / food count** — shape the map.
- **Maze walls** — swap scattered obstacles for a recursive-division maze.
- **Seed** — deterministic layouts; type your own or roll a random one (⟳).
- **Speed** — search expansions and ant movement per frame.
- **Trail controls** — toggle the pheromone trail and explored cells, and set
  the trail fade rate.

You can also **edit the map directly**: click to toggle walls, `shift`+click to
place food, and drag to paint.

## Tech

- [Vite](https://vitejs.dev/) build, **vanilla JS** — no framework or UI library.
- Custom CSS, [Inter](https://rsms.me/inter/) typeface, minimalist cyber theme.
- `<canvas>` rendering; seedable `mulberry32` PRNG for reproducible maps.
- Deployed to GitHub Pages via GitHub Actions (`.github/workflows/deploy.yml`).

## Develop

```bash
npm install
npm run dev      # local dev server
npm run build    # production build to dist/
npm run preview  # preview the production build
```

## Deployment

Pushing to `main` triggers the **Deploy to GitHub Pages** workflow, which builds
with `PAGES_BASE=/ant/` and publishes `dist/`. Enable it once under
**Settings → Pages → Build and deployment → Source: GitHub Actions**.
