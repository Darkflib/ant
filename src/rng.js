// Deterministic, seedable PRNG so a given seed always reproduces the same
// grid, obstacles and food layout. mulberry32 is small, fast and good enough
// for visual randomness.

function xmur3(str) {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h ^= h >>> 16
    return h >>> 0
  }
}

function mulberry32(a) {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function makeRng(seed) {
  const seedFn = xmur3(String(seed))
  const rand = mulberry32(seedFn())
  return {
    // float in [0, 1)
    next: rand,
    // integer in [min, max]
    int: (min, max) => min + Math.floor(rand() * (max - min + 1)),
    // pick a random element
    pick: (arr) => arr[Math.floor(rand() * arr.length)],
    // true with probability p
    chance: (p) => rand() < p,
  }
}

// A short pronounceable random seed for the reseed button.
export function randomSeed() {
  const parts = 'lorbixquenzatuvomikadelphysar'
  let out = ''
  for (let i = 0; i < 6; i++) {
    out += parts[Math.floor(Math.random() * parts.length)]
  }
  return out
}
