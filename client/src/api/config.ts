import type { GameConfig } from '../../../shared/types';

export interface RulePresetSummary {
  id: string;
  name: string;
  description: string;
}

export interface RulePreset extends RulePresetSummary {
  config: Partial<GameConfig>;
}

/** Fetch the list of available rule presets. */
export async function fetchRulePresets(): Promise<RulePresetSummary[]> {
  const res = await fetch('/api/config/presets');
  if (!res.ok) throw new Error('Failed to load rule presets');
  const data = (await res.json()) as { presets: RulePresetSummary[] };
  return data.presets;
}

/** Fetch a single rule preset's config overrides. */
export async function fetchRulePreset(id: string): Promise<RulePreset> {
  const res = await fetch(`/api/config/presets/${id}`);
  if (!res.ok) throw new Error(`Failed to load rule preset "${id}"`);
  return (await res.json()) as RulePreset;
}
