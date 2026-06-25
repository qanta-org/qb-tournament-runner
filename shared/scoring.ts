import type { AIPlayerKwargs, GameConfig, Player } from './types';
import { bonusWeightClass, tossupWeightClass } from './aiWeightClass';

const DEFAULT_BONUS_WEIGHT_DEFLATION = {
  lightweight: 1,
  midweight: 2,
  heavyweight: 3,
} as const;

/**
 * Points awarded for a correct bonus part resolved via the AI-consult path,
 * after applying the configured deflation mode.
 *
 * - none: full part points.
 * - static: full part points minus `bonus_static_deflation`.
 * - weighted: full part points minus the sum of `bonus_weight_deflation[weight_class]`
 *   over every AI player on the owning team.
 *
 * When `bonus_deflation_mode` is unset, falls back to the legacy
 * `bonus_ai_consult_factor` multiplier for backwards compatibility.
 */
export function bonusConsultPoints(config: GameConfig, owningTeamPlayers: Player[]): number {
  const full = config.bonus_part_points;
  const mode = config.bonus_deflation_mode;

  if (!mode) {
    return Math.round(full * (config.bonus_ai_consult_factor ?? 0.5));
  }
  if (mode === 'none') {
    return full;
  }
  if (mode === 'static') {
    return Math.max(0, full - (config.bonus_static_deflation ?? 5));
  }

  const weights = config.bonus_weight_deflation ?? DEFAULT_BONUS_WEIGHT_DEFLATION;
  let deflation = 0;
  for (const player of owningTeamPlayers) {
    if (player.type !== 'ai') continue;
    const weightClass = bonusWeightClass(player.extra_kwargs as AIPlayerKwargs);
    if (weightClass) {
      deflation += weights[weightClass] ?? 0;
    }
  }
  return Math.max(0, full - deflation);
}

/**
 * Points earned by an AI player on a correct tossup buzz, after applying the
 * configured deflation mode to the base value (power or default tossup points).
 *
 * - none: full base points.
 * - static: base points minus `tossup_static_deflation`.
 * - weighted: base points multiplied by `ai_tossup_score_factors[weight_class]`.
 *
 * When `tossup_deflation_mode` is unset, falls back to the multiplicative
 * weight-class factors for backwards compatibility.
 */
export function aiTossupPoints(config: GameConfig, base: number, player: Player): number {
  const weightClass = tossupWeightClass(player.extra_kwargs as AIPlayerKwargs);
  const mode = config.tossup_deflation_mode;

  if (!mode || mode === 'weighted') {
    const factors = config.ai_tossup_score_factors;
    const factor =
      weightClass && factors && weightClass in factors
        ? factors[weightClass]
        : factors?.lightweight ?? 1;
    return Math.round(base * factor);
  }
  if (mode === 'none') {
    return base;
  }
  return Math.max(0, base - (config.tossup_static_deflation ?? 5));
}
