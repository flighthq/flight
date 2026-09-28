import { describe, expect, it } from 'vitest';

import { parseSpineSkeleton } from './spineJsonFull.ts';
import { createSpineJsonRegistry } from './spineJsonRegistry.ts';
import { parseSpineSkeletonWithRegistry } from './spineParse.ts';

// ★ WHAT THIS MODULE OWNS IS THE PRESET, SO THAT IS WHAT THESE ASSERT. The parse itself — bones, slots, skins,
// timelines, diagnostics — is exercised against the core in `spineParse.test.ts`, and that file's
// `parseSpineSkeletonWithRegistry` describe already pins the two entry points to byte-for-value identical
// output on a rich fixture, which is the preservation oracle for the move. All this module adds is resolving
// every built-in handler for a caller who named none, so each claim below is a DIFFERENCE against the same
// document read with an empty registry.

const SKELETON = JSON.stringify({
  animations: {
    walk: {
      bones: {
        root: {
          rotate: [
            { time: 0, value: 0 },
            { time: 1, value: 90 },
          ],
        },
      },
    },
  },
  bones: [{ name: 'root' }],
  slots: [{ bone: 'root', name: 's' }],
});

describe('parseSpineSkeleton', () => {
  it('resolves every built-in handler where the selective sibling resolves none', () => {
    const bare = parseSpineSkeletonWithRegistry(SKELETON, createSpineJsonRegistry())!;
    expect([bare.skeleton.bones.length, (bare.skeleton.slots ?? []).length, bare.animations.length]).toEqual([0, 0, 0]);

    const full = parseSpineSkeleton(SKELETON)!;
    expect([full.skeleton.bones.length, (full.skeleton.slots ?? []).length, full.animations.length]).toEqual([1, 1, 1]);
  });

  // The timeline half of the preset is separately registered from the section half, so a clip with no channels
  // would mean the sections were read and the timelines were not.
  it('resolves the timeline handlers too, not only the section handlers', () => {
    expect(parseSpineSkeleton(SKELETON)!.animations[0].clip.channels).toHaveLength(1);
  });

  it('keeps unreadable input on the established null-return path', () => {
    expect(parseSpineSkeleton('{ nope')).toBeNull();
    expect(parseSpineSkeleton('null')).toBeNull();
  });
});
