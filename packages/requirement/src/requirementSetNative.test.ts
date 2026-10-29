import { Entity } from '@flighthq/entity/contract';

import { RequirementSet } from './requirementSet.ts';
import { createRequirementSet, diffRequirementSets } from './requirementSetRaw.ts';
import type { RequirementSetRaw } from './requirementSetRaw.ts';

describe('RequirementSet', () => {
  it('provides class-correct constructor and create defaults compatible with Entity', () => {
    const constructed = new RequirementSet();
    const created = RequirementSet.create();
    const entityClass: typeof Entity = RequirementSet;
    const baseCreated = entityClass.create();

    expect(constructed).toBeInstanceOf(RequirementSet);
    expect(constructed.raw).toMatchObject({ covers: [], requirements: [] });
    expect(created).toBeInstanceOf(RequirementSet);
    expect(created.raw).toMatchObject({ covers: [], requirements: [] });
    expect(baseCreated).toBeInstanceOf(RequirementSet);
    expectTypeOf(constructed).toEqualTypeOf<RequirementSet>();
    expectTypeOf(created).toEqualTypeOf<RequirementSet>();
    expectTypeOf(baseCreated).toEqualTypeOf<Entity>();
  });

  it('creates the same canonical raw fields as the free factory', () => {
    const covers = ['scene.node-kind', 'scene.blend-mode'] as const;
    const facts = [
      { facet: 'scene.node-kind', key: 'Shape' },
      { facet: 'scene.blend-mode', key: 'Multiply' },
    ] as const;
    const wrapper = RequirementSet.create(covers, facts);

    expect(wrapper.raw).toMatchObject(createRequirementSet(covers, facts));
    expect(wrapper.covers).toEqual(['scene.blend-mode', 'scene.node-kind']);
    expect(wrapper.requirements).toEqual([
      { facet: 'scene.blend-mode', key: 'Multiply' },
      { facet: 'scene.node-kind', key: 'Shape' },
    ]);
  });

  it('copies caller-owned requirement records', () => {
    const fact = { facet: 'scene.node-kind' as const, key: 'Shape' };
    const raw = createRequirementSet(['scene.node-kind'], [fact]);
    fact.key = 'Sprite';

    expect(raw.requirements[0]).not.toBe(fact);
    expect(raw.requirements[0]).toEqual({ facet: 'scene.node-kind', key: 'Shape' });
  });

  it('returns one stable wrapper for repeated conversions of the same raw set', () => {
    const raw = createRequirementSet([], []);
    const wrapper = RequirementSet.from(raw);

    expect(RequirementSet.from(raw)).toBe(wrapper);
    expect(new RequirementSet(createRequirementSet([], [])).raw).not.toBe(raw);
  });

  it('rejects a raw set already attached to a different wrapper', () => {
    class OtherEntity extends Entity {}
    const raw = createRequirementSet([], []);
    new OtherEntity(raw);

    expect(() => RequirementSet.from(raw)).toThrow(TypeError);
  });

  it('diffs like the free function and returns a wrapped set', () => {
    const requirements = RequirementSet.create(
      ['scene.blend-mode', 'scene.node-kind'],
      [
        { facet: 'scene.blend-mode', key: 'Multiply' },
        { facet: 'scene.node-kind', key: 'Shape' },
      ],
    );
    const baseline = RequirementSet.create(['scene.node-kind'], [{ facet: 'scene.node-kind', key: 'Sprite' }]);
    const result = requirements.diff(baseline);

    expect(result).toBeInstanceOf(RequirementSet);
    expect(result.raw).toMatchObject(diffRequirementSets(requirements.raw, baseline.raw));
    expectTypeOf(result.raw).toEqualTypeOf<RequirementSetRaw>();
  });
});
