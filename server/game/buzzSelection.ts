import type { AIWeightClass } from '../../shared/types.js';

/**
 * Whether `currentPosition` is a firing eval point for a model with the given
 * buzz-file `evalPositions` (its row token_positions), k gate, and buzz `period`.
 *
 * Firing points are every n-th (n = period) of the eval points at/after k,
 * counting from the first such row (origin), regardless of buzz availability.
 * A period < 1 means the AI never auto-fires.
 */
export function isFiringPoint(
  evalPositions: number[],
  k: number,
  currentPosition: number,
  period: number
): boolean {
  const n = Math.floor(period);
  if (n < 1) return false;
  const afterK = evalPositions.filter((p) => p >= k);
  const idx = afterK.indexOf(currentPosition);
  return idx >= 0 && idx % n === 0;
}

const WEIGHT_ORDER: Record<AIWeightClass, number> = {
  lightweight: 0,
  midweight: 1,
  heavyweight: 2,
};

/**
 * Index of the winning candidate among same-token buzzes: the lowest weight
 * class wins (lightweight > midweight > heavyweight); ties are broken by a fresh
 * uniform random pick on every call (override `rng` for deterministic tests).
 */
export function selectBuzzWinnerIndex(
  weightClasses: AIWeightClass[],
  rng: () => number = Math.random
): number {
  let bestTier = Infinity;
  for (const wc of weightClasses) {
    bestTier = Math.min(bestTier, WEIGHT_ORDER[wc] ?? 0);
  }
  const topIndices = weightClasses
    .map((wc, i) => [i, WEIGHT_ORDER[wc] ?? 0] as const)
    .filter(([, tier]) => tier === bestTier)
    .map(([i]) => i);
  return topIndices[Math.floor(rng() * topIndices.length)];
}
