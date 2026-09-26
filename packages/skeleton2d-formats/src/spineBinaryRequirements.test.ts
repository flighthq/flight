import { RequirementFacet } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  isReadableSpineBinary,
  parseSpineBinaryRequirements,
  SPINE_BINARY_REQUIREMENT_KEY_NAMESPACE,
} from './spineBinaryRequirements.ts';

describe('isReadableSpineBinary', () => {
  it('returns false for an empty buffer', () => {
    expect(isReadableSpineBinary(new Uint8Array(0))).toBe(false);
  });

  it('returns true for a valid minimal .skel', () => {
    expect(isReadableSpineBinary(minimalSkel('4.1.0'))).toBe(true);
  });

  it('returns false for an unsupported version', () => {
    expect(isReadableSpineBinary(minimalSkel('3.8.55'))).toBe(false);
  });
});

describe('parseSpineBinaryRequirements', () => {
  it('returns an empty requirement set for an unreadable file', () => {
    const result = parseSpineBinaryRequirements(new Uint8Array(0));
    expect(result.requirements).toHaveLength(0);
  });

  it('returns an empty requirement set for a readable file with no content', () => {
    const result = parseSpineBinaryRequirements(minimalSkel('4.1.0'));
    expect(result.requirements).toHaveLength(0);
  });

  it('emits namespaced keys for present sections', () => {
    const result = parseSpineBinaryRequirements(skelWithBones('4.1.0', 2));
    const keys = result.requirements.map((r) => r.key);
    expect(keys).toContain(`${SPINE_BINARY_REQUIREMENT_KEY_NAMESPACE}.bones`);
  });

  it('uses the DocumentFormat facet for every requirement', () => {
    const result = parseSpineBinaryRequirements(skelWithBones('4.1.0', 1));
    for (const requirement of result.requirements) {
      expect(requirement.facet).toBe(RequirementFacet.DocumentFormat);
    }
  });

  it('omits keys for section kinds not present in the file', () => {
    const result = parseSpineBinaryRequirements(skelWithBones('4.1.0', 1));
    const keys = result.requirements.map((r) => r.key);
    expect(keys).not.toContain(`${SPINE_BINARY_REQUIREMENT_KEY_NAMESPACE}.slots`);
    expect(keys).not.toContain(`${SPINE_BINARY_REQUIREMENT_KEY_NAMESPACE}.animations`);
  });
});

describe('SPINE_BINARY_REQUIREMENT_KEY_NAMESPACE', () => {
  it('is spine-binary', () => {
    expect(SPINE_BINARY_REQUIREMENT_KEY_NAMESPACE).toBe('spine-binary');
  });
});

function varint(value: number): number[] {
  const out: number[] = [];
  let remaining = value;
  while (remaining > 0x7f) {
    out.push((remaining & 0x7f) | 0x80);
    remaining >>>= 7;
  }
  out.push(remaining);
  return out;
}

function spineString(value: string): number[] {
  const bytes = Array.from(value, (character) => character.charCodeAt(0));
  return [...varint(bytes.length + 1), ...bytes];
}

function minimalSkel(version: string): Uint8Array {
  return new Uint8Array([
    0x8a,
    0xd7,
    0xc5,
    0x11,
    0x20,
    0xe3,
    0x33,
    0x57,
    ...spineString(version),
    ...new Array<number>(16).fill(0),
    0,
    ...varint(0),
    ...varint(0),
    ...varint(0),
    ...varint(0),
    ...varint(0),
    ...varint(0),
    ...varint(0),
    ...varint(0),
    ...varint(0),
    ...varint(0),
  ]);
}

function skelWithBones(version: string, boneCount: number): Uint8Array {
  const bones: number[] = [];
  for (let i = 0; i < boneCount; i++) {
    bones.push(
      ...spineString(`bone${i}`),
      ...(i > 0 ? varint(0) : []),
      ...new Array<number>(32).fill(0),
      ...varint(0),
      0,
    );
  }
  return new Uint8Array([
    0x8a,
    0xd7,
    0xc5,
    0x11,
    0x20,
    0xe3,
    0x33,
    0x57,
    ...spineString(version),
    ...new Array<number>(16).fill(0),
    0,
    ...varint(0),
    ...varint(boneCount),
    ...bones,
    ...varint(0),
    ...varint(0),
    ...varint(0),
    ...varint(0),
    ...varint(0),
    ...varint(0),
    ...varint(0),
    ...varint(0),
  ]);
}
