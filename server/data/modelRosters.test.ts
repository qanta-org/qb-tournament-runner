import { describe, expect, it } from 'vitest';
import {
  normalizeWeightClass,
  parseModelRosterCsv,
  tossupEntriesFromLegacyAiRoster,
} from './modelRosters.js';

describe('normalizeWeightClass', () => {
  it('accepts canonical values', () => {
    expect(normalizeWeightClass('heavyweight')).toBe('heavyweight');
    expect(normalizeWeightClass('Midweight')).toBe('midweight');
  });

  it('rejects invalid values', () => {
    expect(normalizeWeightClass('Mid')).toBeUndefined();
    expect(normalizeWeightClass('')).toBeUndefined();
  });
});

describe('parseModelRosterCsv', () => {
  it('parses id, name, model, weight_class', () => {
    const entries = parseModelRosterCsv(`id,name,model,weight_class
t1,Alpha Tossup,model_a,heavyweight`);
    expect(entries).toEqual([
      {
        id: 't1',
        name: 'Alpha Tossup',
        model: 'model_a',
        weight_class: 'heavyweight',
        description: undefined,
      },
    ]);
  });

  it('drops rows with invalid weight_class to undefined', () => {
    const entries = parseModelRosterCsv(`id,name,model,weight_class
t1,Bad,model_a,Heavy`);
    expect(entries[0]?.weight_class).toBeUndefined();
  });
});

describe('tossupEntriesFromLegacyAiRoster', () => {
  it('dedupes by tossup model key', () => {
    const entries = tossupEntriesFromLegacyAiRoster([
      {
        player_id: 'ai_1',
        name: 'Alpha',
        tossup_model: 'model_a',
        weight_class: 'heavyweight',
      },
      {
        player_id: 'ai_2',
        name: 'Bravo',
        tossup_model: 'model_a',
        weight_class: 'midweight',
      },
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.model).toBe('model_a');
  });
});
