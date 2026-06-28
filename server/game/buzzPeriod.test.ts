import { describe, it, expect } from 'vitest';
import { isFiringPoint, selectBuzzWinnerIndex } from './buzzSelection.js';
import { Buzzes } from '../data/buzzes.js';
import { Questions } from '../data/questions.js';
import type { AIWeightClass } from '../../shared/types.js';

// ============================================================================
// isFiringPoint
// ============================================================================

describe('isFiringPoint', () => {
  // Worked example: rows {14,21,28,35,42}, k=15, period 2.
  // R_k = {21,28,35,42}, firing at indices 0,2 => positions 21 and 35.
  const rows = [14, 21, 28, 35, 42];
  const k = 15;

  it('fires every 2nd row after k for period 2 (positions 21 and 35)', () => {
    expect(isFiringPoint(rows, k, 21, 2)).toBe(true);
    expect(isFiringPoint(rows, k, 28, 2)).toBe(false);
    expect(isFiringPoint(rows, k, 35, 2)).toBe(true);
    expect(isFiringPoint(rows, k, 42, 2)).toBe(false);
  });

  it('ignores rows before k (14 is never a firing point)', () => {
    expect(isFiringPoint(rows, k, 14, 2)).toBe(false);
    expect(isFiringPoint(rows, k, 14, 1)).toBe(false);
  });

  it('at period 1 every row >= k is a firing point', () => {
    for (const p of [21, 28, 35, 42]) {
      expect(isFiringPoint(rows, k, p, 1)).toBe(true);
    }
  });

  it('at period 3 fires at indices 0 and 3 => positions 21 and 42', () => {
    expect(isFiringPoint(rows, k, 21, 3)).toBe(true);
    expect(isFiringPoint(rows, k, 28, 3)).toBe(false);
    expect(isFiringPoint(rows, k, 35, 3)).toBe(false);
    expect(isFiringPoint(rows, k, 42, 3)).toBe(true);
  });

  it('never fires for period < 1', () => {
    expect(isFiringPoint(rows, k, 21, 0)).toBe(false);
  });

  it('returns false for a position that is not one of the model rows', () => {
    expect(isFiringPoint(rows, k, 22, 2)).toBe(false);
  });
});

// ============================================================================
// selectBuzzWinnerIndex
// ============================================================================

describe('selectBuzzWinnerIndex', () => {
  it('prefers lightweight over midweight over heavyweight', () => {
    const wcs: AIWeightClass[] = ['heavyweight', 'lightweight', 'midweight'];
    expect(selectBuzzWinnerIndex(wcs, () => 0)).toBe(1); // the lightweight
  });

  it('prefers midweight over heavyweight when no lightweight present', () => {
    const wcs: AIWeightClass[] = ['heavyweight', 'midweight'];
    expect(selectBuzzWinnerIndex(wcs, () => 0)).toBe(1);
  });

  it('randomly picks among same-tier ties and can reach every tied candidate', () => {
    const wcs: AIWeightClass[] = ['lightweight', 'heavyweight', 'lightweight'];
    // rng -> 0 picks first lightweight (index 0); rng -> 0.99 picks second (index 2).
    expect(selectBuzzWinnerIndex(wcs, () => 0)).toBe(0);
    expect(selectBuzzWinnerIndex(wcs, () => 0.99)).toBe(2);
    // Over many unseeded runs both lightweights appear; heavyweight never wins.
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) seen.add(selectBuzzWinnerIndex(wcs));
    expect(seen.has(0)).toBe(true);
    expect(seen.has(2)).toBe(true);
    expect(seen.has(1)).toBe(false);
  });
});

// ============================================================================
// Buzzes accumulation helpers
// ============================================================================

describe('Buzzes.getBuzzRowPositions / getLatestBuzz', () => {
  const QID = 'q1';
  const SYS = 'sys1';

  function makeBuzzes(): Buzzes {
    const b = new Buzzes(new Questions());
    // rows: 14 (no buzz), 21 (buzz "alpha"), 28 (buzz "beta"), 35 (no buzz "gamma")
    b.addTossupResponse(SYS, QID, 14, 'early', 0.2, 0);
    b.addTossupResponse(SYS, QID, 21, 'alpha', 0.8, 1);
    b.addTossupResponse(SYS, QID, 28, 'beta', 0.9, 1);
    b.addTossupResponse(SYS, QID, 35, 'gamma', 0.4, 0);
    return b;
  }

  it('returns sorted distinct row positions', () => {
    expect(makeBuzzes().getBuzzRowPositions(QID, SYS)).toEqual([14, 21, 28, 35]);
    expect(makeBuzzes().getBuzzRowPositions(QID, 'missing')).toEqual([]);
  });

  it('getLatestBuzz returns the most recent buzz=1 row, not the latest row', () => {
    const b = makeBuzzes();
    // At position 35 the latest row (35) has buzz=0, so we speak the 28 guess.
    expect(b.getLatestBuzz(QID, SYS, 35)?.guess).toBe('beta');
    expect(b.getLatestBuzz(QID, SYS, 35)?.token_position).toBe(28);
    // At position 21 only the first buzz is available.
    expect(b.getLatestBuzz(QID, SYS, 21)?.guess).toBe('alpha');
    // Before any buzz row there is nothing.
    expect(b.getLatestBuzz(QID, SYS, 14)).toBeUndefined();
  });
});
