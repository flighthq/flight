/** @deprecated Import render contracts from `@flighthq/render/contract`. */
export const SceneCoverage = {
  FallbackRemediable: 'FallbackRemediable',
  FallbackUnavailable: 'FallbackUnavailable',
  Satisfied: 'Satisfied',
  Unavailable: 'Unavailable',
  Unregistered: 'Unregistered',
} as const;

export type SceneCoverage = (typeof SceneCoverage)[keyof typeof SceneCoverage];

export type {
  SatisfiedSceneCoverageEntry,
  UnregisteredSceneCoverageEntry,
  UnavailableSceneCoverageEntry,
  FallbackRemediableSceneCoverageEntry,
  FallbackUnavailableSceneCoverageEntry,
  SceneCoverageEntry,
} from '@flighthq/render/contract';
