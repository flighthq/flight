import type { Kind } from './Entity';
import type { RenderRegistry } from './RenderRegistrySignals';
import type { RequirementFacet } from './RequirementFacet';

// How well a kind the scene uses is served by the registry that would have to serve it. States are
// distinguished by remedy, not by why the state arose: Unregistered and FallbackRemediable name a call
// that can improve the result; Unavailable and FallbackUnavailable prove that no such call exists.
export const SceneCoverage = {
  FallbackRemediable: 'FallbackRemediable',
  FallbackUnavailable: 'FallbackUnavailable',
  Satisfied: 'Satisfied',
  Unavailable: 'Unavailable',
  Unregistered: 'Unregistered',
} as const;

export type SceneCoverage = (typeof SceneCoverage)[keyof typeof SceneCoverage];

// One kind a scene uses, paired with how well its consumer is wired for it. Shared by the 2D and 3D
// seams: nothing about a coverage verdict differs by dimension. The answer half of the seam
// whose question half is Scene2DKindUsage or Scene3DKindUsage: a scene reports the kinds, and the package holding the
// registry reports what it can and cannot serve.
//
// The explain tier reports EVERY requirement, satisfied ones included, so one call is a complete
// manifest a caller can render as a checklist. Reporting only the gaps would leave "covered"
// indistinguishable from "never asked about", which is the question an agent wiring up a document most
// needs answered. The boolean tier stays gap-only — see the has* functions.
//
// `registry` reuses RenderRegistry so an entry is comparable with the misses
// `explainRenderRegistryMisses` records after the fact — the same vocabulary, asked before the frame
// instead of after it.
interface SceneCoverageEntryBase {
  readonly facet: RequirementFacet;
  readonly kind: Kind;
  readonly registry: RenderRegistry;
}

interface SceneCoverageRemedy {
  readonly module: string;
  readonly registrar: string;
}

export interface SatisfiedSceneCoverageEntry extends SceneCoverageEntryBase {
  readonly coverage: typeof SceneCoverage.Satisfied;
}

export interface UnregisteredSceneCoverageEntry extends SceneCoverageEntryBase, SceneCoverageRemedy {
  readonly coverage: typeof SceneCoverage.Unregistered;
}

export interface UnavailableSceneCoverageEntry extends SceneCoverageEntryBase {
  readonly coverage: typeof SceneCoverage.Unavailable;
}

export interface FallbackRemediableSceneCoverageEntry extends SceneCoverageEntryBase, SceneCoverageRemedy {
  readonly coverage: typeof SceneCoverage.FallbackRemediable;
}

export interface FallbackUnavailableSceneCoverageEntry extends SceneCoverageEntryBase {
  readonly coverage: typeof SceneCoverage.FallbackUnavailable;
}

// The remedy-bearing variants require both fields while the no-action variants expose neither. A
// switch on `coverage` therefore narrows whether a repair call can be rendered without nullable pairs.
export type SceneCoverageEntry =
  | FallbackRemediableSceneCoverageEntry
  | FallbackUnavailableSceneCoverageEntry
  | SatisfiedSceneCoverageEntry
  | UnavailableSceneCoverageEntry
  | UnregisteredSceneCoverageEntry;
