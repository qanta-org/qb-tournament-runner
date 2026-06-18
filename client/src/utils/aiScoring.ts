import type { GameConfig, Player } from '../../../shared/types';
import { aiTossupPoints } from '../../../shared/scoring';

/**
 * Maximum tossup points an AI model can score on a correct buzz, accounting for
 * the configured tossup deflation mode and (when enabled) the power value.
 * Mirrors the server's scoring in `handleAnswerRuling` via the shared
 * `aiTossupPoints` helper.
 */
export function maxAiTossupPoints(config: GameConfig, player: Player): number {
  const base = config.enable_power_points
    ? config.power_points_value
    : config.default_points_value;
  return aiTossupPoints(config, base, player);
}
