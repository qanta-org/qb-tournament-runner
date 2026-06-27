import { bonusWeightClass, tossupWeightClass } from '../../../shared/aiWeightClass';
import { aiTossupPoints, bonusConsultPoints } from '../../../shared/scoring';
import type {
  AIPlayerKwargs,
  AIWeightClass,
  DeflationMode,
  GameConfig,
  ModelRosterEntry,
  Player,
} from '../../../shared/types';
import {
  DEFAULT_AI_TOSSUP_SCORE_FACTORS,
  DEFAULT_BONUS_DEFLATION_MODE,
  DEFAULT_BONUS_PART_POINTS,
  DEFAULT_BONUS_STATIC_DEFLATION,
  DEFAULT_BONUS_WEIGHT_DEFLATION,
  DEFAULT_ENABLE_POWER_POINTS,
  DEFAULT_POWER_POINTS_VALUE,
  DEFAULT_TOSSUP_DEFLATION_MODE,
  DEFAULT_TOSSUP_POINTS_VALUE,
  DEFAULT_TOSSUP_STATIC_DEFLATION,
} from '../constants/gameDefaults';

export type WeightGroup = AIWeightClass | 'unknown';

export const WEIGHT_GROUP_ORDER: WeightGroup[] = [
  'lightweight',
  'midweight',
  'heavyweight',
  'unknown',
];

export const WEIGHT_GROUP_LABEL: Record<WeightGroup, string> = {
  lightweight: 'Lightweight',
  midweight: 'Midweight',
  heavyweight: 'Heavyweight',
  unknown: 'Unclassified',
};

export interface DeflationCalcSettings {
  enablePowerPoints: boolean;
  defaultPointsValue: number;
  powerPointsValue: number;
  bonusPartPoints: number;
  tossupDeflationMode: DeflationMode;
  tossupStaticDeflation: number;
  aiTossupScoreFactors: {
    lightweight: number;
    midweight: number;
    heavyweight: number;
  };
  bonusDeflationMode: DeflationMode;
  bonusStaticDeflation: number;
  bonusWeightDeflation: {
    lightweight: number;
    midweight: number;
    heavyweight: number;
  };
}

export const DEFAULT_DEFLATION_CALC_SETTINGS: DeflationCalcSettings = {
  enablePowerPoints: DEFAULT_ENABLE_POWER_POINTS,
  defaultPointsValue: DEFAULT_TOSSUP_POINTS_VALUE,
  powerPointsValue: DEFAULT_POWER_POINTS_VALUE,
  bonusPartPoints: DEFAULT_BONUS_PART_POINTS,
  tossupDeflationMode: DEFAULT_TOSSUP_DEFLATION_MODE,
  tossupStaticDeflation: DEFAULT_TOSSUP_STATIC_DEFLATION,
  aiTossupScoreFactors: { ...DEFAULT_AI_TOSSUP_SCORE_FACTORS },
  bonusDeflationMode: DEFAULT_BONUS_DEFLATION_MODE,
  bonusStaticDeflation: DEFAULT_BONUS_STATIC_DEFLATION,
  bonusWeightDeflation: { ...DEFAULT_BONUS_WEIGHT_DEFLATION },
};

export function groupModelsByWeight(entries: ModelRosterEntry[]): Map<WeightGroup, ModelRosterEntry[]> {
  const groups = new Map<WeightGroup, ModelRosterEntry[]>(
    WEIGHT_GROUP_ORDER.map((wc) => [wc, []])
  );
  for (const entry of entries) {
    const group = entry.weight_class ?? 'unknown';
    groups.get(group)!.push(entry);
  }
  return groups;
}

export function tossupPlayerFromEntry(entry: ModelRosterEntry): Player {
  return {
    player_id: entry.id,
    name: entry.name,
    type: 'ai',
    extra_kwargs: {
      tossup_model: entry.model,
      bonus_model: entry.model,
      tossup_weight_class: entry.weight_class,
    } satisfies AIPlayerKwargs,
  };
}

export function bonusPlayerFromEntry(entry: ModelRosterEntry): Player {
  return {
    player_id: entry.id,
    name: entry.name,
    type: 'ai',
    extra_kwargs: {
      tossup_model: entry.model,
      bonus_model: entry.model,
      bonus_weight_class: entry.weight_class,
    } satisfies AIPlayerKwargs,
  };
}

/** Minimal GameConfig slice used by shared scoring helpers. */
export function buildCalcGameConfig(settings: DeflationCalcSettings): GameConfig {
  return {
    enable_power_points: settings.enablePowerPoints,
    default_points_value: settings.defaultPointsValue,
    power_points_value: settings.powerPointsValue,
    bonus_part_points: settings.bonusPartPoints,
    tossup_deflation_mode: settings.tossupDeflationMode,
    tossup_static_deflation: settings.tossupStaticDeflation,
    ai_tossup_score_factors: settings.aiTossupScoreFactors,
    bonus_deflation_mode: settings.bonusDeflationMode,
    bonus_static_deflation: settings.bonusStaticDeflation,
    bonus_weight_deflation: settings.bonusWeightDeflation,
    bonus_ai_consult_factor: 0.5,
  } as GameConfig;
}

export function tossupBasePoints(settings: DeflationCalcSettings): number {
  return settings.enablePowerPoints ? settings.powerPointsValue : settings.defaultPointsValue;
}

export interface TossupModelBreakdown {
  entry: ModelRosterEntry;
  points: number;
  detail: string;
}

export function explainTossupPoints(
  settings: DeflationCalcSettings,
  entry: ModelRosterEntry
): TossupModelBreakdown {
  const config = buildCalcGameConfig(settings);
  const base = tossupBasePoints(settings);
  const player = tossupPlayerFromEntry(entry);
  const points = aiTossupPoints(config, base, player);
  const weightClass = tossupWeightClass(player.extra_kwargs as AIPlayerKwargs);
  const mode = settings.tossupDeflationMode;

  let detail: string;
  if (mode === 'none') {
    detail = `${base} pts (no deflation)`;
  } else if (mode === 'static') {
    detail = `${base} − ${settings.tossupStaticDeflation} = ${points} pts`;
  } else {
    const factor =
      weightClass && weightClass in settings.aiTossupScoreFactors
        ? settings.aiTossupScoreFactors[weightClass]
        : settings.aiTossupScoreFactors.lightweight;
    detail = `${base} × ${factor} = ${points} pts`;
  }

  return { entry, points, detail };
}

export interface BonusWeightContribution {
  entry: ModelRosterEntry;
  weightClass: AIWeightClass | undefined;
  subtract: number;
}

export interface BonusConsultBreakdown {
  points: number;
  full: number;
  totalDeflation: number;
  detail: string;
  contributions: BonusWeightContribution[];
}

export function explainBonusConsult(
  settings: DeflationCalcSettings,
  entries: ModelRosterEntry[]
): BonusConsultBreakdown {
  const config = buildCalcGameConfig(settings);
  const full = settings.bonusPartPoints;
  const players = entries.map(bonusPlayerFromEntry);
  const points = bonusConsultPoints(config, players);
  const mode = settings.bonusDeflationMode;

  if (entries.length === 0) {
    return {
      points: 0,
      full,
      totalDeflation: 0,
      detail: 'Select bonus models to calculate consult points',
      contributions: [],
    };
  }

  if (mode === 'none') {
    return {
      points: full,
      full,
      totalDeflation: 0,
      detail: `${full} pts (no deflation)`,
      contributions: [],
    };
  }

  if (mode === 'static') {
    const totalDeflation = settings.bonusStaticDeflation;
    return {
      points,
      full,
      totalDeflation,
      detail: `${full} − ${totalDeflation} = ${points} pts`,
      contributions: [],
    };
  }

  const contributions: BonusWeightContribution[] = [];
  let totalDeflation = 0;
  for (const entry of entries) {
    const player = bonusPlayerFromEntry(entry);
    const weightClass = bonusWeightClass(player.extra_kwargs as AIPlayerKwargs);
    const subtract = weightClass ? settings.bonusWeightDeflation[weightClass] ?? 0 : 0;
    totalDeflation += subtract;
    contributions.push({ entry, weightClass, subtract });
  }

  return {
    points,
    full,
    totalDeflation,
    detail: `${full} − ${totalDeflation} = ${points} pts`,
    contributions,
  };
}
