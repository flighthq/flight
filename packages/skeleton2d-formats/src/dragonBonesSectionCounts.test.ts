import { DragonBonesSectionKind, DragonBonesTimelineKind } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { collectDragonBonesSectionCounts } from './dragonBonesSectionCounts.ts';

describe('collectDragonBonesSectionCounts', () => {
  it('returns null for invalid JSON', () => {
    expect(collectDragonBonesSectionCounts('not-json')).toBeNull();
  });

  it('returns null for a JSON primitive', () => {
    expect(collectDragonBonesSectionCounts('"hello"')).toBeNull();
  });

  it('returns null for a JSON null', () => {
    expect(collectDragonBonesSectionCounts('null')).toBeNull();
  });

  it('returns null for a JSON array', () => {
    expect(collectDragonBonesSectionCounts('[]')).toBeNull();
  });

  it('returns null for an empty object without armature', () => {
    expect(collectDragonBonesSectionCounts('{}')).toBeNull();
  });

  it('returns null for a Spine JSON document', () => {
    expect(collectDragonBonesSectionCounts(JSON.stringify({ bones: [{ name: 'root' }] }))).toBeNull();
  });

  it('returns an empty map for a document with an empty armature array', () => {
    const result = collectDragonBonesSectionCounts(JSON.stringify({ armature: [] }));
    expect(result).not.toBeNull();
    expect(result!.size).toBe(0);
  });

  it('counts bones when present', () => {
    const result = collectDragonBonesSectionCounts(
      JSON.stringify({ armature: [{ bone: [{ name: 'root' }, { name: 'arm', parent: 'root' }] }] }),
    );
    expect(result).not.toBeNull();
    expect(result!.get(DragonBonesSectionKind.Bones)).toBe(2);
  });

  it('counts slots when present', () => {
    const result = collectDragonBonesSectionCounts(
      JSON.stringify({ armature: [{ bone: [{ name: 'root' }], slot: [{ name: 's1', parent: 'root' }] }] }),
    );
    expect(result!.get(DragonBonesSectionKind.Slots)).toBe(1);
  });

  it('counts skins when present', () => {
    const result = collectDragonBonesSectionCounts(
      JSON.stringify({ armature: [{ bone: [{ name: 'root' }], skin: [{ name: 'default', slot: [] }] }] }),
    );
    expect(result!.get(DragonBonesSectionKind.Skins)).toBe(1);
  });

  it('counts ik constraints when present', () => {
    const result = collectDragonBonesSectionCounts(
      JSON.stringify({ armature: [{ bone: [{ name: 'root' }], ik: [{ bone: 'root', name: 'aim', target: 'root' }] }] }),
    );
    expect(result!.get(DragonBonesSectionKind.IkConstraints)).toBe(1);
  });

  it('counts animations and timeline families', () => {
    const result = collectDragonBonesSectionCounts(
      JSON.stringify({
        armature: [
          {
            animation: [
              { bone: [{ name: 'root', rotateFrame: [] }], name: 'walk' },
              { name: 'run', slot: [{ name: 'body', colorFrame: [] }] },
            ],
            bone: [{ name: 'root' }],
          },
        ],
      }),
    );
    expect(result!.get(DragonBonesSectionKind.Animations)).toBe(2);
    expect(result!.get(DragonBonesTimelineKind.Bone)).toBe(1);
    expect(result!.get(DragonBonesTimelineKind.Slot)).toBe(1);
  });

  it('omits absent section kinds from the map', () => {
    const result = collectDragonBonesSectionCounts(JSON.stringify({ armature: [{ bone: [{ name: 'root' }] }] }));
    expect(result).not.toBeNull();
    expect(result!.has(DragonBonesSectionKind.Slots)).toBe(false);
    expect(result!.has(DragonBonesSectionKind.Animations)).toBe(false);
  });

  it('distinguishes null (unreadable) from an empty map (readable, no content)', () => {
    const unreadable = collectDragonBonesSectionCounts('not json');
    const readable = collectDragonBonesSectionCounts(JSON.stringify({ armature: [] }));
    expect(unreadable).toBeNull();
    expect(readable).not.toBeNull();
    expect(readable!.size).toBe(0);
  });
});
