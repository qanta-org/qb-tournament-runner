import { describe, expect, it } from 'vitest';
import { aiPlayerDisplayName } from './modelLabels';

describe('aiPlayerDisplayName', () => {
  it('joins tossup and bonus roster names with a dash', () => {
    expect(
      aiPlayerDisplayName({
        tossup_model: 't_key',
        bonus_model: 'b_key',
        tossup_model_name: 'Tossup Model',
        bonus_model_name: 'Bonus Model',
      })
    ).toBe('Tossup Model - Bonus Model');
  });

  it('falls back to model keys when roster names are missing', () => {
    expect(
      aiPlayerDisplayName({
        tossup_model: 'Author__gpt',
        bonus_model: 'Author__claude',
      })
    ).toBe('Author__gpt - Author__claude');
  });

  it('returns a single phase name when only one model is set', () => {
    expect(
      aiPlayerDisplayName({
        tossup_model: 't_key',
        tossup_model_name: 'Tossup Only',
      })
    ).toBe('Tossup Only');
  });

  it('returns AI when no models are configured', () => {
    expect(aiPlayerDisplayName({})).toBe('AI');
  });
});
