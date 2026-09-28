import { describe, expect, it } from 'vitest';

import { parseDragonBonesSkeleton } from './dragonBonesFull.ts';
import { parseDragonBonesSkeletonWithRegistry } from './dragonBonesParse.ts';
import { createDragonBonesRegistry } from './dragonBonesRegistry.ts';

// ★ WHAT THIS MODULE OWNS IS THE PRESET, SO THAT IS WHAT THESE ASSERT. The parse itself lives in
// `dragonBonesParse.test.ts`, whose `parseDragonBonesSkeletonWithRegistry` describe already pins the two entry
// points to byte-for-value identical output on a rich fixture — the preservation oracle for the move. All this
// module adds is resolving every built-in handler for a caller who named none.

const SKELETON = JSON.stringify({
  armature: [
    {
      animation: [{ bone: [{ frame: [{ duration: 6, rotate: 0 }], name: 'root' }], duration: 12, name: 'walk' }],
      bone: [{ name: 'root' }],
      name: 'a',
      slot: [{ bone: 'root', name: 's' }],
    },
  ],
  compatibleVersion: '5.5',
  version: '5.5',
});

describe('parseDragonBonesSkeleton', () => {
  it('resolves every built-in handler where the selective sibling resolves none', () => {
    const bare = parseDragonBonesSkeletonWithRegistry(SKELETON, createDragonBonesRegistry())!;
    expect([bare.skeleton.bones.length, (bare.skeleton.slots ?? []).length, bare.animations.length]).toEqual([0, 0, 0]);

    const full = parseDragonBonesSkeleton(SKELETON)!;
    expect([full.skeleton.bones.length, (full.skeleton.slots ?? []).length, full.animations.length]).toEqual([1, 1, 1]);
  });

  it('keeps unreadable input on the established null-return path', () => {
    expect(parseDragonBonesSkeleton('{ nope')).toBeNull();
    expect(parseDragonBonesSkeleton('null')).toBeNull();
  });
});
