import { RequirementFacet } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  DRAGONBONES_REQUIREMENT_KEY_NAMESPACE,
  isReadableDragonBones,
  parseDragonBonesRequirements,
} from './dragonBonesRequirements.ts';

describe('DRAGONBONES_REQUIREMENT_KEY_NAMESPACE', () => {
  it('is dragonbones', () => {
    expect(DRAGONBONES_REQUIREMENT_KEY_NAMESPACE).toBe('dragonbones');
  });
});

describe('isReadableDragonBones', () => {
  it('returns false for invalid JSON', () => {
    expect(isReadableDragonBones('not-json')).toBe(false);
  });

  it('returns true for a valid minimal DragonBones document', () => {
    expect(isReadableDragonBones(JSON.stringify({ armature: [{ bone: [{ name: 'root' }] }] }))).toBe(true);
  });

  it('returns true for a document with an empty armature array', () => {
    expect(isReadableDragonBones(JSON.stringify({ armature: [] }))).toBe(true);
  });

  it('returns false for a Spine JSON document', () => {
    expect(isReadableDragonBones(JSON.stringify({ bones: [{ name: 'root' }] }))).toBe(false);
  });
});

describe('parseDragonBonesRequirements', () => {
  it('returns an empty requirement set for unreadable JSON', () => {
    const result = parseDragonBonesRequirements('not-json');
    expect(result.requirements).toHaveLength(0);
  });

  it('returns an empty requirement set for a readable file with no content', () => {
    const result = parseDragonBonesRequirements(JSON.stringify({ armature: [] }));
    expect(result.requirements).toHaveLength(0);
  });

  it('emits namespaced keys for present sections', () => {
    const result = parseDragonBonesRequirements(
      JSON.stringify({
        armature: [{ bone: [{ name: 'root' }], slot: [{ name: 'body', parent: 'root' }] }],
      }),
    );
    const keys = result.requirements.map((r) => r.key);
    expect(keys).toContain(`${DRAGONBONES_REQUIREMENT_KEY_NAMESPACE}.bones`);
    expect(keys).toContain(`${DRAGONBONES_REQUIREMENT_KEY_NAMESPACE}.slots`);
  });

  it('uses the DocumentFormat facet for every requirement', () => {
    const result = parseDragonBonesRequirements(JSON.stringify({ armature: [{ bone: [{ name: 'root' }] }] }));
    for (const requirement of result.requirements) {
      expect(requirement.facet).toBe(RequirementFacet.DocumentFormat);
    }
  });

  it('omits keys for section kinds not present in the file', () => {
    const result = parseDragonBonesRequirements(JSON.stringify({ armature: [{ bone: [{ name: 'root' }] }] }));
    const keys = result.requirements.map((r) => r.key);
    expect(keys).not.toContain(`${DRAGONBONES_REQUIREMENT_KEY_NAMESPACE}.slots`);
    expect(keys).not.toContain(`${DRAGONBONES_REQUIREMENT_KEY_NAMESPACE}.animations`);
  });
});
