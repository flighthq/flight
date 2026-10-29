import { Entity, getEntityWrapperAs } from '@flighthq/entity/contract';

import type { RequirementSetRaw } from './requirementSetRaw.ts';
import { createRequirementSet, diffRequirementSets } from './requirementSetRaw.ts';
import type { Requirement, RequirementFacet } from './types.ts';

export class RequirementSet extends Entity {
  declare readonly raw: RequirementSetRaw;

  constructor(raw: RequirementSetRaw = createRequirementSet([], [])) {
    super(raw);
  }

  static override create(): RequirementSet;
  static override create(
    covers: readonly RequirementFacet[],
    requirements: readonly Readonly<Requirement>[],
  ): RequirementSet;
  static override create(
    covers: readonly RequirementFacet[] = [],
    requirements: readonly Readonly<Requirement>[] = [],
  ): RequirementSet {
    return new RequirementSet(createRequirementSet(covers, requirements));
  }

  static override from(raw: RequirementSetRaw): RequirementSet {
    const wrapper = getEntityWrapperAs<Entity>(raw);
    if (wrapper === null) return new RequirementSet(raw);
    if (wrapper instanceof RequirementSet) return wrapper;
    throw new TypeError('Cannot create RequirementSet: the EntityRaw object already has a different wrapper');
  }

  get covers(): readonly RequirementFacet[] {
    return this.raw.covers;
  }

  get requirements(): readonly Readonly<Requirement>[] {
    return this.raw.requirements;
  }

  diff(baseline: RequirementSet): RequirementSet {
    return RequirementSet.from(diffRequirementSets(this.raw, baseline.raw));
  }
}
