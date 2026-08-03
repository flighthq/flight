import type { Kind } from './Entity';
import type { RenderRegistry } from './RenderRegistrySignals';

// How well a kind the scene uses is served by the registry that would have to serve it.
//   Satisfied — this kind's own implementation is registered; nothing to do.
//   Fallback  — something resolves, but not this kind's own implementation, so the content draws
//               differently than authored (a material with no renderer degrades to the standard one).
//   Missing   — nothing resolves; the content does not draw or resolve at all.
export const SceneCoverage = {
  Fallback: 'Fallback',
  Missing: 'Missing',
  Satisfied: 'Satisfied',
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
export interface SceneCoverageEntry {
  readonly coverage: SceneCoverage;
  readonly kind: Kind;
  readonly registry: RenderRegistry;
}
