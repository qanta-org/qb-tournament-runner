export interface ApiRosterPlayer {
  player_id: string;
  name: string;
  type: 'ai' | 'human';
  tossup_model?: string;
  tossup_model_cost?: number;
  bonus_model?: string;
  description?: string;
  default_buzzer_key?: string;
  skill_level?: string;
  team?: string;
}

export interface RosterResponse {
  players: ApiRosterPlayer[];
  source: string;
}

