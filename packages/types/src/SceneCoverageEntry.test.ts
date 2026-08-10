import { RenderRegistry } from './RenderRegistrySignals';
import { RequirementFacet } from './RequirementFacet';
import type { SceneCoverageEntry } from './SceneCoverageEntry';
import { SceneCoverage } from './SceneCoverageEntry';

function assertNever(value: never): never {
  throw new Error(`Unhandled coverage entry: ${JSON.stringify(value)}`);
}

function describeRemedy(entry: SceneCoverageEntry): string | null {
  switch (entry.coverage) {
    case SceneCoverage.FallbackRemediable:
    case SceneCoverage.Unregistered:
      return `${entry.module}:${entry.registrar}`;
    case SceneCoverage.FallbackUnavailable:
    case SceneCoverage.Satisfied:
    case SceneCoverage.Unavailable:
      // @ts-expect-error — no-action variants deliberately expose no nullable remedy pair.
      void entry.registrar;
      return null;
    default:
      return assertNever(entry);
  }
}

describe('SceneCoverageEntry', () => {
  it('requires a complete remedy pair on actionable states', () => {
    const entry: SceneCoverageEntry = {
      coverage: SceneCoverage.Unregistered,
      facet: RequirementFacet.SceneMaterialKind,
      kind: 'acme.Custom',
      module: '@acme/materials',
      registrar: 'registerAcmeCustomMaterial',
      registry: RenderRegistry.MaterialRenderer,
    };
    expect(describeRemedy(entry)).toBe('@acme/materials:registerAcmeCustomMaterial');
  });

  it('keeps unavailable states remedy-free', () => {
    const entry: SceneCoverageEntry = {
      coverage: SceneCoverage.FallbackUnavailable,
      facet: RequirementFacet.SceneBlendMode,
      kind: 'acme.Composite',
      registry: RenderRegistry.BlendRealization,
    };
    expect(describeRemedy(entry)).toBeNull();
  });

  it('rejects an actionable state without its module', () => {
    // @ts-expect-error — actionable states require both registrar and module.
    const entry: SceneCoverageEntry = {
      coverage: SceneCoverage.Unregistered,
      facet: RequirementFacet.SceneNodeKind,
      kind: 'acme.Node',
      registrar: 'registerAcmeNodeRenderer',
      registry: RenderRegistry.NodeRenderer,
    };
    expect(entry.coverage).toBe(SceneCoverage.Unregistered);
  });
});
