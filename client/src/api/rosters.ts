import type { AIWeightClass, ModelRosterEntry } from '../../../shared/types';

export interface ApiRosterPlayer {
  player_id: string;
  name: string;
  type: 'ai' | 'human';
  tossup_model?: string;
  tossup_model_cost?: number;
  bonus_model?: string;
  description?: string;
  default_buzzer_key?: string;
  weight_class?: AIWeightClass;
  team?: string;
}

export interface RosterResponse {
  players: ApiRosterPlayer[];
  source: string;
}

export interface ModelRosterResponse {
  entries: ModelRosterEntry[];
  source: string;
}

export async function fetchTossupModelRoster(datasetId?: string): Promise<ModelRosterResponse> {
  const query = datasetId ? `?dataset=${encodeURIComponent(datasetId)}` : '';
  const res = await fetch(`/api/rosters/ai/tossup${query}`);
  if (!res.ok) return { entries: [], source: 'none' };
  return res.json();
}

export async function fetchBonusModelRoster(datasetId?: string): Promise<ModelRosterResponse> {
  const query = datasetId ? `?dataset=${encodeURIComponent(datasetId)}` : '';
  const res = await fetch(`/api/rosters/ai/bonus${query}`);
  if (!res.ok) return { entries: [], source: 'none' };
  return res.json();
}

export async function fetchHumanRoster(datasetId?: string): Promise<RosterResponse> {
  const query = datasetId ? `?dataset=${encodeURIComponent(datasetId)}` : '';
  const res = await fetch(`/api/rosters/human${query}`);
  if (!res.ok) return { players: [], source: 'none' };
  return res.json();
}
