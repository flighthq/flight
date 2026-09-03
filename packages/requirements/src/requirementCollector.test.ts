import type { Requirement } from '@flighthq/types/contract';
import { RequirementFacet } from '@flighthq/types/contract';

import { collectScene2DRequirements, reportRequirement } from './requirementCollector';

describe('collectScene2DRequirements', () => {
  it('returns deterministic distinct requirements and the facets inspected by the collector', () => {
    const result = collectScene2DRequirements((sink) => {
      reportRequirement(sink, RequirementFacet.SceneNodeKind, 'Shape');
      reportRequirement(sink, RequirementFacet.SceneBlendMode, 'Multiply');
      reportRequirement(sink, RequirementFacet.SceneNodeKind, 'Shape');
    });

    expect(result).toMatchObject({
      covers: [
        RequirementFacet.SceneBlendMode,
        RequirementFacet.SceneMaterialKind,
        RequirementFacet.SceneNodeKind,
        RequirementFacet.SceneShapeCommand,
      ],
      requirements: [
        { facet: RequirementFacet.SceneBlendMode, key: 'Multiply' },
        { facet: RequirementFacet.SceneNodeKind, key: 'Shape' },
      ],
    });
  });
});

describe('reportRequirement', () => {
  it('records only when a collector is engaged', () => {
    const sink: Requirement[] = [];
    reportRequirement(undefined, RequirementFacet.SceneNodeKind, 'Shape');
    reportRequirement(sink, RequirementFacet.SceneNodeKind, 'Shape');
    expect(sink).toEqual([{ facet: RequirementFacet.SceneNodeKind, key: 'Shape' }]);
  });
});
