import type { GameConfig, Team } from '../../../shared/types';
import { DEFAULT_GAME_CONFIG } from '../../../shared/types';

interface BuildGameConfigParams {
  teamA: Team;
  teamB: Team;
  tossupFile: string;
  bonusFile: string;
  modelDirectory: string;
  overrides?: Partial<GameConfig>;
}

export function buildGameConfig({
  teamA,
  teamB,
  tossupFile,
  bonusFile,
  modelDirectory,
  overrides = {},
}: BuildGameConfigParams): GameConfig {
  const base = DEFAULT_GAME_CONFIG;

  return {
    auto_stream: overrides.auto_stream ?? base.auto_stream ?? false,
    streaming_speed: overrides.streaming_speed ?? base.streaming_speed ?? 200,
    auto_evaluate: overrides.auto_evaluate ?? base.auto_evaluate ?? false,
    suppress_early_ai_second_buzzes:
      overrides.suppress_early_ai_second_buzzes ??
      base.suppress_early_ai_second_buzzes ??
      true,
    enable_power_points: overrides.enable_power_points ?? base.enable_power_points ?? false,
    power_points_value: overrides.power_points_value ?? base.power_points_value ?? 15,
    default_points_value: overrides.default_points_value ?? base.default_points_value ?? 10,
    tossup_penalty_value:
      overrides.tossup_penalty_value ?? base.tossup_penalty_value ?? 5,
    tossup_penalty_value_second_team:
      overrides.tossup_penalty_value_second_team ??
      base.tossup_penalty_value_second_team ??
      0,
    bonus_part_points:
      overrides.bonus_part_points ?? base.bonus_part_points ?? 10,
    multimodal_reveal_lockout_seconds:
      overrides.multimodal_reveal_lockout_seconds ??
      base.multimodal_reveal_lockout_seconds ??
      1,
    ai_tossup_score_factors:
      overrides.ai_tossup_score_factors ??
      base.ai_tossup_score_factors ?? {
        lightweight: 1.0,
        midweight: 0.8,
        heavyweight: 0.4,
      },
    tossup_deflation_mode:
      overrides.tossup_deflation_mode ?? base.tossup_deflation_mode ?? 'weighted',
    tossup_static_deflation:
      overrides.tossup_static_deflation ?? base.tossup_static_deflation ?? 5,
    autonomous_default_k:
      overrides.autonomous_default_k ?? base.autonomous_default_k ?? 1,
    bonus_ai_consult_factor:
      overrides.bonus_ai_consult_factor ?? base.bonus_ai_consult_factor ?? 0.5,
    bonus_deflation_mode:
      overrides.bonus_deflation_mode ?? base.bonus_deflation_mode ?? 'static',
    bonus_static_deflation:
      overrides.bonus_static_deflation ?? base.bonus_static_deflation ?? 5,
    bonus_weight_deflation:
      overrides.bonus_weight_deflation ??
      base.bonus_weight_deflation ?? {
        lightweight: 1,
        midweight: 2,
        heavyweight: 3,
      },
    bonus_abstain_points:
      overrides.bonus_abstain_points ?? base.bonus_abstain_points ?? 1,
    team_a: teamA,
    team_b: teamB,
    tossup_file: tossupFile,
    bonus_file: bonusFile,
    model_directory: modelDirectory,
  };
}

