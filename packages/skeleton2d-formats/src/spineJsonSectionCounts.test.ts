import { SpineJsonSectionKind, SpineJsonTimelineKind } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { collectSpineJsonSectionCounts } from './spineJsonSectionCounts.ts';

describe('collectSpineJsonSectionCounts', () => {
  it('returns null for invalid JSON', () => {
    expect(collectSpineJsonSectionCounts('not-json')).toBeNull();
  });

  it('returns null for a JSON primitive', () => {
    expect(collectSpineJsonSectionCounts('"hello"')).toBeNull();
  });

  it('returns null for a JSON null', () => {
    expect(collectSpineJsonSectionCounts('null')).toBeNull();
  });

  it('returns null for a JSON array', () => {
    expect(collectSpineJsonSectionCounts('[]')).toBeNull();
  });

  it('returns null for an empty object without bones or skeleton keys', () => {
    expect(collectSpineJsonSectionCounts('{}')).toBeNull();
  });

  it('returns null for a DragonBones document with an armature array', () => {
    expect(collectSpineJsonSectionCounts(JSON.stringify({ armature: [], bones: [] }))).toBeNull();
  });

  it('returns an empty map for a minimal document with only skeleton', () => {
    const result = collectSpineJsonSectionCounts(JSON.stringify({ skeleton: { spine: '4.1' } }));
    expect(result).not.toBeNull();
    expect(result!.size).toBe(0);
  });

  it('returns an empty map for a document with an empty bones array', () => {
    const result = collectSpineJsonSectionCounts(JSON.stringify({ bones: [] }));
    expect(result).not.toBeNull();
    expect(result!.size).toBe(0);
  });

  it('counts bones when present', () => {
    const result = collectSpineJsonSectionCounts(
      JSON.stringify({ bones: [{ name: 'root' }, { name: 'arm', parent: 'root' }] }),
    );
    expect(result).not.toBeNull();
    expect(result!.get(SpineJsonSectionKind.Bones)).toBe(2);
  });

  it('counts slots when present', () => {
    const result = collectSpineJsonSectionCounts(
      JSON.stringify({ bones: [{ name: 'root' }], slots: [{ bone: 'root', name: 's1' }] }),
    );
    expect(result!.get(SpineJsonSectionKind.Slots)).toBe(1);
  });

  it('counts skins when present', () => {
    const result = collectSpineJsonSectionCounts(
      JSON.stringify({ bones: [{ name: 'root' }], skins: [{ attachments: {}, name: 'default' }] }),
    );
    expect(result!.get(SpineJsonSectionKind.Skins)).toBe(1);
  });

  it('counts events when present', () => {
    const result = collectSpineJsonSectionCounts(
      JSON.stringify({ bones: [{ name: 'root' }], events: { step: { int: 0 } } }),
    );
    expect(result!.get(SpineJsonSectionKind.Events)).toBe(1);
  });

  it('counts ik constraints when present', () => {
    const result = collectSpineJsonSectionCounts(
      JSON.stringify({ bones: [{ name: 'root' }], ik: [{ bones: ['root'], name: 'aim', target: 'root' }] }),
    );
    expect(result!.get(SpineJsonSectionKind.IkConstraints)).toBe(1);
  });

  it('counts path constraints when present', () => {
    const result = collectSpineJsonSectionCounts(
      JSON.stringify({ bones: [{ name: 'root' }], path: [{ bones: ['root'], name: 'p', target: 'root' }] }),
    );
    expect(result!.get(SpineJsonSectionKind.PathConstraints)).toBe(1);
  });

  it('counts transform constraints when present', () => {
    const result = collectSpineJsonSectionCounts(
      JSON.stringify({ bones: [{ name: 'root' }], transform: [{ bones: ['root'], name: 't', target: 'root' }] }),
    );
    expect(result!.get(SpineJsonSectionKind.TransformConstraints)).toBe(1);
  });

  it('counts animations and timeline families', () => {
    const result = collectSpineJsonSectionCounts(
      JSON.stringify({
        bones: [{ name: 'root' }],
        animations: {
          walk: { bones: { root: { rotate: [{ time: 0, value: 0 }] } } },
          run: { slots: { body: { color: [{ color: 'ffffffff', time: 0 }] } } },
        },
      }),
    );
    expect(result!.get(SpineJsonSectionKind.Animations)).toBe(2);
    expect(result!.get(SpineJsonTimelineKind.Bone)).toBe(1);
    expect(result!.get(SpineJsonTimelineKind.Slot)).toBe(1);
  });

  it('omits absent section kinds from the map', () => {
    const result = collectSpineJsonSectionCounts(JSON.stringify({ bones: [{ name: 'root' }] }));
    expect(result).not.toBeNull();
    expect(result!.has(SpineJsonSectionKind.Slots)).toBe(false);
    expect(result!.has(SpineJsonSectionKind.Animations)).toBe(false);
  });

  it('distinguishes null (unreadable) from an empty map (readable, no content)', () => {
    const unreadable = collectSpineJsonSectionCounts('not json');
    const readable = collectSpineJsonSectionCounts(JSON.stringify({ skeleton: {} }));
    expect(unreadable).toBeNull();
    expect(readable).not.toBeNull();
    expect(readable!.size).toBe(0);
  });

  it('accepts draworder (lowercased) as an alias for drawOrder', () => {
    const result = collectSpineJsonSectionCounts(
      JSON.stringify({
        bones: [{ name: 'root' }],
        animations: { walk: { draworder: [{ offsets: [], time: 0 }] } },
      }),
    );
    expect(result!.get(SpineJsonTimelineKind.DrawOrder)).toBe(1);
  });
});
