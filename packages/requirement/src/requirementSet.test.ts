import { RequirementFacet } from '@flighthq/types/contract';

import {
  createRequirementSet,
  diffRequirementSets,
  initializeRequirementSet,
  mergeRequirementSets,
} from './requirementSet';

describe('createRequirementSet', () => {
  it('copies, sorts, and deduplicates both dimensions', () => {
    const covers = [RequirementFacet.SceneNodeKind, RequirementFacet.SceneBlendMode];
    const requirements = [
      { facet: RequirementFacet.SceneNodeKind, key: 'Shape' },
      { facet: RequirementFacet.SceneBlendMode, key: 'Multiply' },
      { facet: RequirementFacet.SceneNodeKind, key: 'Shape' },
    ];
    const result = createRequirementSet(covers, requirements);
    covers.length = 0;
    requirements.length = 0;

    expect(result).toMatchObject({
      covers: [RequirementFacet.SceneBlendMode, RequirementFacet.SceneNodeKind],
      requirements: [
        { facet: RequirementFacet.SceneBlendMode, key: 'Multiply' },
        { facet: RequirementFacet.SceneNodeKind, key: 'Shape' },
      ],
    });
  });
});

describe('diffRequirementSets', () => {
  it('subtracts facts only for facets both operands cover', () => {
    const result = diffRequirementSets(
      createRequirementSet(
        [RequirementFacet.SceneBlendMode, RequirementFacet.SceneNodeKind],
        [
          { facet: RequirementFacet.SceneBlendMode, key: 'Multiply' },
          { facet: RequirementFacet.SceneNodeKind, key: 'Shape' },
        ],
      ),
      createRequirementSet(
        [RequirementFacet.SceneNodeKind],
        [{ facet: RequirementFacet.SceneNodeKind, key: 'Sprite' }],
      ),
    );

    expect(result).toMatchObject({
      covers: [RequirementFacet.SceneNodeKind],
      requirements: [{ facet: RequirementFacet.SceneNodeKind, key: 'Shape' }],
    });
  });
});

describe('initializeRequirementSet', () => {
  it('is the construction initializer of createRequirementSet', () => {
    expect(typeof initializeRequirementSet).toBe('function');
  });
});
describe('mergeRequirementSets', () => {
  it('unions facts while intersecting completeness', () => {
    const result = mergeRequirementSets([
      createRequirementSet(
        [RequirementFacet.SceneBlendMode, RequirementFacet.SceneNodeKind],
        [{ facet: RequirementFacet.SceneNodeKind, key: 'Shape' }],
      ),
      createRequirementSet(
        [RequirementFacet.SceneNodeKind],
        [{ facet: RequirementFacet.SceneNodeKind, key: 'Sprite' }],
      ),
    ]);

    expect(result).toMatchObject({
      covers: [RequirementFacet.SceneNodeKind],
      requirements: [
        { facet: RequirementFacet.SceneNodeKind, key: 'Shape' },
        { facet: RequirementFacet.SceneNodeKind, key: 'Sprite' },
      ],
    });
  });
});
