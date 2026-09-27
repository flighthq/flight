import {
  COLLADA_FEATURE_ELEMENTS,
  GLTF_FEATURE_NAMES,
  getThreeDsFeatureNames,
  MD2_FEATURE_NAMES,
  MD5_ANIM_FEATURE_NAMES,
  MD5_MESH_FEATURE_NAMES,
  OBJ_FEATURE_DIRECTIVES,
  OBJ_MATERIAL_FEATURE,
} from '@flighthq/scene3d-formats/contract';
import {
  OBJ_MATERIAL_BLINN_PHONG_FEATURE,
  OBJ_MATERIAL_STANDARD_PBR_FEATURE,
  SpineBinarySectionKind,
  SpineBinaryTimelineKind,
} from '@flighthq/types/contract';

import { ALWAYS_READ_FORMAT_FEATURES, buildRequirementDispositions } from './catalog-dispositions.ts';
import { buildRequirementCatalogRows, CATALOG_PARSER_BACKEND, GLTF_EXTENSION_HANDLERS } from './catalog-rows.ts';

// Every `document.format` feature each analyzer can emit, per namespace. This is the POPULATION the gate below
// partitions, and it comes from each format package's own vocabulary rather than from a fixture: a fixture
// missing a feature would shrink the population silently and the gate would pass by looking at less.
const ANALYZER_FEATURES: ReadonlyMap<string, readonly string[]> = new Map([
  ['3ds', getThreeDsFeatureNames()],
  ['dae', [...COLLADA_FEATURE_ELEMENTS.keys()]],
  ['gltf', [...GLTF_FEATURE_NAMES, ...[...GLTF_EXTENSION_HANDLERS.values()].map((handler) => handler.kind)]],
  ['md2', MD2_FEATURE_NAMES],
  // Both MD5 files share one requirement namespace, so their vocabularies combine.
  ['md5', [...MD5_MESH_FEATURE_NAMES, ...MD5_ANIM_FEATURE_NAMES]],
  [
    'obj',
    [
      ...[...OBJ_FEATURE_DIRECTIVES.keys()].filter((feature) => feature !== OBJ_MATERIAL_FEATURE),
      OBJ_MATERIAL_BLINN_PHONG_FEATURE,
      OBJ_MATERIAL_STANDARD_PBR_FEATURE,
    ],
  ],
  ['spine-binary', [...Object.values(SpineBinarySectionKind), ...Object.values(SpineBinaryTimelineKind)]],
]);

describe('ALWAYS_READ_FORMAT_FEATURES', () => {
  // ★ THE GATE THIS WHOLE MECHANISM RESTS ON. The written list and the derivable "unclaimed" set must agree
  // EXACTLY, in both directions, and each direction catches a different mistake:
  //
  //   a feature unclaimed but unlisted  -> someone added an analyzer feature and no handler, and said nothing.
  //                                        It must keep reporting as a gap until a person decides, which is
  //                                        why the list is never derived.
  //   a feature listed but now claimed  -> someone wrote the handler and left the decline behind, which would
  //                                        shadow a real row with a stale excuse.
  it('is exactly the set of analyzed features no parser row claims, in both directions', () => {
    const claimed = new Set(
      buildRequirementCatalogRows()
        .filter((row) => row.backend === CATALOG_PARSER_BACKEND && row.facet === 'document.format')
        .map((row) => row.kind),
    );
    const unclaimed: string[] = [];
    for (const [namespace, features] of ANALYZER_FEATURES) {
      for (const feature of features) {
        const kind = `${namespace}.${feature}`;
        if (!claimed.has(kind)) unclaimed.push(kind);
      }
    }
    const declined = ALWAYS_READ_FORMAT_FEATURES.map(({ feature, namespace }) => `${namespace}.${feature}`);
    expect([...declined].sort()).toEqual([...unclaimed].sort());
  });

  // A population of zero would make the assertion above pass vacuously, and a claimed set of zero would make
  // it pass by declaring everything. Both are stated so the gate cannot be satisfied by emptiness.
  it('partitions a non-empty population against a non-empty claimed set', () => {
    const total = [...ANALYZER_FEATURES.values()].reduce((sum, features) => sum + features.length, 0);
    expect(total).toBeGreaterThan(ALWAYS_READ_FORMAT_FEATURES.length);
    expect(ALWAYS_READ_FORMAT_FEATURES.length).toBeGreaterThan(0);
  });

  it('gives every declined feature a reason, since a decline with no reason is just a silent gap', () => {
    for (const { feature, namespace, reason } of ALWAYS_READ_FORMAT_FEATURES) {
      expect(reason.length, `${namespace}.${feature}`).toBeGreaterThan(20);
    }
  });

  it('names each feature once', () => {
    const kinds = ALWAYS_READ_FORMAT_FEATURES.map(({ feature, namespace }) => `${namespace}.${feature}`);
    expect(kinds.length).toBe(new Set(kinds).size);
  });
});

describe('buildRequirementDispositions', () => {
  // Suppression is per backend by design, so a decision has to be recorded for every backend the manifest
  // plugin plans — otherwise the feature stays in some other backend's `unresolved` and still reports.
  it('records every declined feature for every planned backend', () => {
    const dispositions = buildRequirementDispositions();
    const backends = new Set(dispositions.map((disposition) => disposition.backend));
    expect([...backends].sort()).toEqual(['canvas', 'dom', 'gl', CATALOG_PARSER_BACKEND, 'wgpu'].sort());
    expect(dispositions.length).toBe(ALWAYS_READ_FORMAT_FEATURES.length * backends.size);
  });

  it('files every disposition under document.format, carrying the reason from the list', () => {
    const reasons = new Map(
      ALWAYS_READ_FORMAT_FEATURES.map(({ feature, namespace, reason }) => [`${namespace}.${feature}`, reason]),
    );
    for (const disposition of buildRequirementDispositions()) {
      expect(disposition.facet).toBe('document.format');
      expect(disposition.reason, disposition.kind).toBe(reasons.get(disposition.kind));
    }
  });

  it('is deterministic, so regenerating never produces a spurious diff', () => {
    expect(buildRequirementDispositions()).toEqual(buildRequirementDispositions());
  });
});
