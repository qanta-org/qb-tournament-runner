import type { AIPlayerKwargs, AIWeightClass } from './types';

/** Tossup weight class from kwargs, with legacy `weight_class` fallback. */
export function tossupWeightClass(kwargs: AIPlayerKwargs): AIWeightClass | undefined {
  return kwargs.tossup_weight_class ?? kwargs.weight_class;
}

/** Bonus weight class from kwargs, with legacy `weight_class` fallback. */
export function bonusWeightClass(kwargs: AIPlayerKwargs): AIWeightClass | undefined {
  return kwargs.bonus_weight_class ?? kwargs.weight_class;
}
