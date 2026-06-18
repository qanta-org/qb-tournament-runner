export const DEFAULT_STREAMING_SPEED_WPM = 200;
export const STREAMING_SPEED_MIN_WPM = 50;
export const STREAMING_SPEED_MAX_WPM = 500;

export const DEFAULT_ENABLE_POWER_POINTS = false;
export const DEFAULT_POWER_POINTS_VALUE = 15;
export const DEFAULT_TOSSUP_POINTS_VALUE = 10;
export const DEFAULT_TOSSUP_PENALTY_VALUE = 5;
export const DEFAULT_BONUS_PART_POINTS = 10;

export const DEFAULT_MULTIMODAL_REVEAL_LOCKOUT_SECONDS = 5;

export const DEFAULT_SUPPRESS_EARLY_AI_SECOND_BUZZES = true;
export const DEFAULT_TOSSUP_PENALTY_VALUE_SECOND_TEAM = 0;

// QANTA 2026 rule defaults
import type { DeflationMode } from '../../../shared/types';

export const DEFAULT_AI_TOSSUP_SCORE_FACTORS = {
  lightweight: 1.0,
  midweight: 0.8,
  heavyweight: 0.4,
} as const;
export const DEFAULT_TOSSUP_DEFLATION_MODE: DeflationMode = 'weighted';
export const DEFAULT_TOSSUP_STATIC_DEFLATION = 5;
export const DEFAULT_AUTONOMOUS_K = 1;
export const DEFAULT_BONUS_AI_CONSULT_FACTOR = 0.5;
export const DEFAULT_BONUS_DEFLATION_MODE: DeflationMode = 'static';
export const DEFAULT_BONUS_STATIC_DEFLATION = 5;
export const DEFAULT_BONUS_WEIGHT_DEFLATION = {
  lightweight: 1,
  midweight: 2,
  heavyweight: 3,
} as const;
export const DEFAULT_BONUS_ABSTAIN_POINTS = 1;

