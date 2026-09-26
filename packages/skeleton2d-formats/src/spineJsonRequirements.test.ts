import { RequirementFacet } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  isReadableSpineJson,
  parseSpineJsonRequirements,
  SPINE_JSON_REQUIREMENT_KEY_NAMESPACE,
} from './spineJsonRequirements.ts';

describe('isReadableSpineJson', () => {
  it('returns false for invalid JSON', () => {
    expect(isReadableSpineJson('not-json')).toBe(false);
  });

  it('returns true for a valid minimal Spine JSON', () => {
    expect(isReadableSpineJson(JSON.stringify({ bones: [{ name: 'root' }] }))).toBe(true);
  });

  it('returns true for a document with only a skeleton key', () => {
    expect(isReadableSpineJson(JSON.stringify({ skeleton: { spine: '4.1' } }))).toBe(true);
  });

  it('returns false for a DragonBones document', () => {
    expect(isReadableSpineJson(JSON.stringify({ armature: [], bones: [] }))).toBe(false);
  });
});

describe('parseSpineJsonRequirements', () => {
  it('returns an empty requirement set for unreadable JSON', () => {
    const result = parseSpineJsonRequirements('not-json');
    expect(result.requirements).toHaveLength(0);
  });

  it('returns an empty requirement set for a readable file with no content', () => {
    const result = parseSpineJsonRequirements(JSON.stringify({ skeleton: {} }));
    expect(result.requirements).toHaveLength(0);
  });

  it('emits namespaced keys for present sections', () => {
    const result = parseSpineJsonRequirements(
      JSON.stringify({ bones: [{ name: 'root' }], slots: [{ bone: 'root', name: 'body' }] }),
    );
    const keys = result.requirements.map((r) => r.key);
    expect(keys).toContain(`${SPINE_JSON_REQUIREMENT_KEY_NAMESPACE}.bones`);
    expect(keys).toContain(`${SPINE_JSON_REQUIREMENT_KEY_NAMESPACE}.slots`);
  });

  it('uses the DocumentFormat facet for every requirement', () => {
    const result = parseSpineJsonRequirements(JSON.stringify({ bones: [{ name: 'root' }] }));
    for (const requirement of result.requirements) {
      expect(requirement.facet).toBe(RequirementFacet.DocumentFormat);
    }
  });

  it('omits keys for section kinds not present in the file', () => {
    const result = parseSpineJsonRequirements(JSON.stringify({ bones: [{ name: 'root' }] }));
    const keys = result.requirements.map((r) => r.key);
    expect(keys).not.toContain(`${SPINE_JSON_REQUIREMENT_KEY_NAMESPACE}.slots`);
    expect(keys).not.toContain(`${SPINE_JSON_REQUIREMENT_KEY_NAMESPACE}.animations`);
  });
});

describe('SPINE_JSON_REQUIREMENT_KEY_NAMESPACE', () => {
  it('is spine-json', () => {
    expect(SPINE_JSON_REQUIREMENT_KEY_NAMESPACE).toBe('spine-json');
  });
});
