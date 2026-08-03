import type { Kind } from './Entity';
import type { RenderRegistry } from './RenderRegistrySignals';

// How well a kind the scene uses is served by the registry that would have to serve it.
//   Satisfied — this kind's own implementation is registered; nothing to do.
//   Fallback  — something resolves, but not this kind's own implementation, so the content draws
//               differently than authored (a material with no renderer degrades to the standard one).
//   Missing   — nothing resolves; the content does not draw or resolve at all.
export const Scene3DCoverage = {
  Fallback: 'Fallback',
  Missing: 'Missing',
  Satisfied: 'Satisfied',
} as const;

export type Scene3DCoverage = (typeof Scene3DCoverage)[keyof typeof Scene3DCoverage];

// One kind a scene uses, paired with how well its consumer is wired for it. The answer half of the seam
// whose question half is Scene3DKindUsage: a scene reports the kinds, and the package holding the
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
export interface Scene3DCoverageEntry {
  readonly coverage: Scene3DCoverage;
  readonly kind: Kind;
  readonly registry: RenderRegistry;
}
