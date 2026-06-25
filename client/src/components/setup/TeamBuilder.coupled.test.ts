import { describe, expect, it } from 'vitest';
import type { AIPlayerKwargs, ModelRosterEntry } from '../../../../shared/types';
import {
  canUseCoupledMode,
  coupledRosterEntries,
  isPlayerCoupled,
} from './TeamBuilder';

const tossupOnly: ModelRosterEntry[] = [
  { id: 't1', name: 'Tossup A', model: 'model_a', weight_class: 'heavyweight' },
];
const bonusOnly: ModelRosterEntry[] = [
  { id: 'b1', name: 'Bonus B', model: 'model_b', weight_class: 'midweight' },
];
const shared: ModelRosterEntry[] = [
  { id: 't2', name: 'Shared', model: 'shared_model', weight_class: 'lightweight' },
];

describe('canUseCoupledMode', () => {
  it('is false when tossup and bonus rosters share no model keys', () => {
    expect(canUseCoupledMode(tossupOnly, bonusOnly, [])).toBe(false);
  });

  it('is true when a model key appears in both phase rosters', () => {
    expect(canUseCoupledMode(shared, shared, [])).toBe(true);
  });

  it('is true when scan finds models with both response types', () => {
    expect(canUseCoupledMode(tossupOnly, bonusOnly, ['dual_model'])).toBe(true);
  });
});

describe('isPlayerCoupled', () => {
  it('forces decoupled UI when dataset cannot couple', () => {
    const kwargs: Partial<AIPlayerKwargs> = { coupled: true, tossup_model: 'x', bonus_model: 'x' };
    expect(isPlayerCoupled(kwargs, false)).toBe(false);
  });

  it('forces decoupled UI when tossup and bonus keys differ', () => {
    const kwargs: Partial<AIPlayerKwargs> = {
      coupled: true,
      tossup_model: 'model_a',
      bonus_model: 'model_b',
    };
    expect(isPlayerCoupled(kwargs, true)).toBe(false);
  });

  it('respects coupled flag when keys match and coupling is supported', () => {
    const kwargs: Partial<AIPlayerKwargs> = {
      coupled: true,
      tossup_model: 'shared_model',
      bonus_model: 'shared_model',
    };
    expect(isPlayerCoupled(kwargs, true)).toBe(true);
  });
});

describe('coupledRosterEntries', () => {
  it('returns intersection by model key', () => {
    expect(coupledRosterEntries(tossupOnly, bonusOnly)).toEqual([]);
    expect(coupledRosterEntries([...tossupOnly, ...shared], [...bonusOnly, ...shared])).toEqual(
      shared
    );
  });
});
