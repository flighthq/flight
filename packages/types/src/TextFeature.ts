export interface TextFeature {
  readonly end?: number;
  readonly start?: number;
  readonly tag: string;
  readonly value: number;
}
export const TextFeatureCapitals = 'c2sc';
export const TextFeatureContextualAlternates = 'calt';
export const TextFeatureDiscretionaryLigatures = 'dlig';
export const TextFeatureFractions = 'frac';
export const TextFeatureKerning = 'kern';
export const TextFeatureLigatures = 'liga';
export const TextFeatureOldStyleFigures = 'onum';
export const TextFeatureSmallCaps = 'smcp';
export const TextFeatureStylisticAlternates = 'salt';
export const TextFeatureSubscript = 'subs';
export const TextFeatureSuperscript = 'sups';
export const TextFeatureTabularFigures = 'tnum';
