import { SpineBinarySectionKind } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { collectSpineBinarySectionCounts } from './spineBinarySectionCounts.ts';

describe('collectSpineBinarySectionCounts', () => {
  it('returns null for an empty buffer', () => {
    expect(collectSpineBinarySectionCounts(new Uint8Array(0))).toBeNull();
  });

  it('returns null for bytes too short to carry a header', () => {
    expect(collectSpineBinarySectionCounts(new Uint8Array(4))).toBeNull();
  });

  it('returns null for random noise that does not match either header layout', () => {
    const noise = new Uint8Array([0xff, 0xfe, 0xfd, 0xfc, 0xfb, 0xfa, 0xf9, 0xf8, 0xf7, 0xf6, 0xf5, 0xf4]);
    expect(collectSpineBinarySectionCounts(noise)).toBeNull();
  });

  it('returns null for an unsupported version', () => {
    expect(collectSpineBinarySectionCounts(minimalSkel('3.8.55'))).toBeNull();
  });

  it('returns an empty map for a readable file with all section counts zero', () => {
    const result = collectSpineBinarySectionCounts(minimalSkel('4.1.0'));
    expect(result).not.toBeNull();
    expect(result!.size).toBe(0);
  });

  it('returns null for a truncated file that cuts off mid-header', () => {
    const full = minimalSkel('4.1.0');
    const truncated = full.slice(0, 12);
    expect(collectSpineBinarySectionCounts(truncated)).toBeNull();
  });

  it('counts bones when present', () => {
    const result = collectSpineBinarySectionCounts(skelWithBones('4.1.0', 3));
    expect(result).not.toBeNull();
    expect(result!.get(SpineBinarySectionKind.Bones)).toBe(3);
  });

  it('counts slots when present', () => {
    const result = collectSpineBinarySectionCounts(skelWithSlots('4.1.0', 2));
    expect(result).not.toBeNull();
    expect(result!.get(SpineBinarySectionKind.Slots)).toBe(2);
  });

  it('counts events when present', () => {
    const result = collectSpineBinarySectionCounts(skelWithEvents('4.1.0', 1));
    expect(result).not.toBeNull();
    expect(result!.get(SpineBinarySectionKind.Events)).toBe(1);
  });

  it('omits absent section kinds from the map', () => {
    const result = collectSpineBinarySectionCounts(skelWithBones('4.1.0', 2));
    expect(result).not.toBeNull();
    expect(result!.has(SpineBinarySectionKind.Slots)).toBe(false);
    expect(result!.has(SpineBinarySectionKind.Animations)).toBe(false);
  });

  it('distinguishes null (unreadable) from an empty map (readable, no content)', () => {
    const unreadable = collectSpineBinarySectionCounts(new Uint8Array(4));
    const readable = collectSpineBinarySectionCounts(minimalSkel('4.1.0'));
    expect(unreadable).toBeNull();
    expect(readable).not.toBeNull();
    expect(readable!.size).toBe(0);
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

function spineNullString(): number[] {
  return [0];
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

function skelWithSlots(version: string, slotCount: number): Uint8Array {
  const slots: number[] = [];
  for (let i = 0; i < slotCount; i++) {
    slots.push(...spineString(`slot${i}`), ...varint(0), ...new Array<number>(8).fill(0), ...varint(0), ...varint(0));
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
    ...varint(0),
    ...varint(slotCount),
    ...slots,
    ...varint(0),
    ...varint(0),
    ...varint(0),
    ...varint(0),
    ...varint(0),
    ...varint(0),
    ...varint(0),
  ]);
}

function skelWithEvents(version: string, eventCount: number): Uint8Array {
  const events: number[] = [];
  for (let i = 0; i < eventCount; i++) {
    events.push(
      ...varint(0),
      ...varint(0),
      ...new Array<number>(4).fill(0),
      ...spineNullString(),
      ...spineNullString(),
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
    ...varint(0),
    ...varint(0),
    ...varint(0),
    ...varint(0),
    ...varint(0),
    ...varint(0),
    ...varint(0),
    ...varint(eventCount),
    ...events,
    ...varint(0),
  ]);
}
