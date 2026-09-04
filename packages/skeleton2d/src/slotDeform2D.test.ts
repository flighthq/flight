import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Attachment2D, MeshAttachment2D, Skin2D, Slot2D } from '@flighthq/types/contract';
import { MeshAttachment2DKind } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createSkin2D } from './skin2D';
import { getSkeleton2DSlotDeformOffsets, setSkeleton2DSlotDeform } from './slotDeform2D';

function slot(attachment: Attachment2D | null): Slot2D {
  return { attachment, boneIndex: 0, color: 0xffffffff, name: 's' };
}

function mesh(pointCount: number): MeshAttachment2D {
  const skin: Skin2D = createSkin2D(new Uint16Array(pointCount).fill(1), new Float32Array(pointCount * 4));
  const out = allocateEntity<MeshAttachment2D>();
  out.kind = MeshAttachment2DKind;
  out.skin = skin;
  out.triangles = new Uint16Array();
  out.uvs = new Float32Array(pointCount * 2);
  out.vertexCount = pointCount;
  out.vertices = null;
  return finishEntity(out) as MeshAttachment2D;
}

describe('getSkeleton2DSlotDeformOffsets', () => {
  it('returns the offsets when they were authored for the attachment now shown', () => {
    const art = mesh(2);
    const s = slot(art);
    setSkeleton2DSlotDeform(s, art, new Float32Array([1, 2, 3, 4]));

    expect(getSkeleton2DSlotDeformOffsets(s)).toEqual(new Float32Array([1, 2, 3, 4]));
  });

  it('returns null after a swap to an attachment of EQUAL size — the case a length check cannot see', () => {
    const before = mesh(2);
    const after = mesh(2);
    const s = slot(before);
    setSkeleton2DSlotDeform(s, before, new Float32Array([9, 9, 9, 9]));

    // What the attachment-swap binder does: it writes slot.attachment and nothing else.
    s.attachment = after;

    expect(getSkeleton2DSlotDeformOffsets(s)).toBeNull();
  });

  it('returns null after a swap to a SMALLER attachment — the other silent case', () => {
    // The stale buffer is LONGER than the new attachment needs, so the deformers' `>=` length check is
    // satisfied and would have applied it. Identity catches what length cannot.
    const before = mesh(4);
    const after = mesh(2);
    const s = slot(before);
    setSkeleton2DSlotDeform(s, before, new Float32Array(8).fill(7));

    s.attachment = after;

    expect(getSkeleton2DSlotDeformOffsets(s)).toBeNull();
  });

  it('returns null after a swap to a LARGER attachment, which the length check also caught', () => {
    const before = mesh(2);
    const after = mesh(4);
    const s = slot(before);
    setSkeleton2DSlotDeform(s, before, new Float32Array(4));

    s.attachment = after;

    expect(getSkeleton2DSlotDeformOffsets(s)).toBeNull();
  });

  it('returns null when the slot shows nothing, and for a slot with no deform at all', () => {
    const art = mesh(1);
    const emptied = slot(art);
    setSkeleton2DSlotDeform(emptied, art, new Float32Array([1, 1]));
    emptied.attachment = null;

    expect(getSkeleton2DSlotDeformOffsets(emptied)).toBeNull();
    expect(getSkeleton2DSlotDeformOffsets(slot(art))).toBeNull();
  });

  it('matches a deform authored for the empty slot, so clearing art is not a special case', () => {
    const s = slot(null);
    setSkeleton2DSlotDeform(s, null, new Float32Array([5, 5]));

    expect(getSkeleton2DSlotDeformOffsets(s)).toEqual(new Float32Array([5, 5]));
  });
});

describe('setSkeleton2DSlotDeform', () => {
  it('reuses the buffer when the length is unchanged, so a per-frame write allocates nothing', () => {
    const art = mesh(2);
    const s = slot(art);
    const first = setSkeleton2DSlotDeform(s, art, new Float32Array([1, 1, 1, 1]))!;

    const second = setSkeleton2DSlotDeform(s, art, new Float32Array([2, 2, 2, 2]))!;

    expect(second).toBe(first);
    expect(second.offsets).toBe(first.offsets);
    expect(second.offsets).toEqual(new Float32Array([2, 2, 2, 2]));
  });

  it('reallocates when the length changes rather than writing past the old buffer', () => {
    const art = mesh(2);
    const s = slot(art);
    const first = setSkeleton2DSlotDeform(s, art, new Float32Array(4))!;

    const second = setSkeleton2DSlotDeform(s, art, new Float32Array(8).fill(3))!;

    expect(second.offsets).not.toBe(first.offsets);
    expect(second.offsets).toHaveLength(8);
  });

  it('copies rather than aliasing the caller buffer, so a reused scratch cannot leak in', () => {
    const art = mesh(1);
    const s = slot(art);
    const scratch = new Float32Array([1, 2]);
    setSkeleton2DSlotDeform(s, art, scratch);

    scratch[0] = 99;

    expect(getSkeleton2DSlotDeformOffsets(s)![0]).toBe(1);
  });

  it('clears the slot deform when given null', () => {
    const art = mesh(1);
    const s = slot(art);
    setSkeleton2DSlotDeform(s, art, new Float32Array([1, 1]));

    expect(setSkeleton2DSlotDeform(s, art, null)).toBeNull();
    expect(getSkeleton2DSlotDeformOffsets(s)).toBeNull();
  });
});
