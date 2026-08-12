import type { Skeleton2DSlotDeform, Slot2D } from '@flighthq/types/contract';

// The PULL SEAM for a slot's deform offsets: returns them only when they were authored for the attachment
// the slot is currently showing, and null otherwise.
//
// This one comparison is the whole reason `Skeleton2DSlotDeform` pairs offsets with an attachment. A slot
// that swaps attachments keeps whatever deform was last written to it — the attachment-swap binder writes
// `slot.attachment` and nothing else, by design — so without this check the old art's offsets would deform
// the new art. A length check cannot stand in for it. The deformers match their stream length EXACTLY, so
// a swap to a differently sized attachment does also trip that check — but a swap to an EQUALLY sized one
// satisfies it perfectly and applies the wrong art's offsets in silence, and equal is the COMMON case,
// because matching point counts are what make a swap look continuous in the first place. The other two
// sizes are no argument for a length check either: it rejects them while naming the wrong cause, reporting
// a malformed offset stream when what actually happened is that the slot is wearing something else.
//
// Identity comparison, not equality: the record names the attachment object it was authored against, and
// re-reading it here is the invalidation doctrine's compare-identities rule at a pull seam.
export function getSkeleton2DSlotDeformOffsets(slot: Readonly<Slot2D>): Readonly<Float32Array> | null {
  const deform = slot.deform;
  if (deform === undefined || deform === null) return null;
  return deform.attachment === (slot.attachment ?? null) ? deform.offsets : null;
}

// Writes offsets onto a slot for a named attachment, reusing the existing buffer when it is already the
// right length so a per-frame deform allocates nothing after the first write. Returns the record so a
// caller can hold it; `setSkeleton2DSlotDeform(slot, null, …)` clears.
export function setSkeleton2DSlotDeform(
  slot: Slot2D,
  attachment: Skeleton2DSlotDeform['attachment'],
  offsets: Readonly<Float32Array> | null,
): Skeleton2DSlotDeform | null {
  if (offsets === null) {
    slot.deform = null;
    return null;
  }
  const existing = slot.deform;
  if (existing !== undefined && existing !== null && existing.offsets.length === offsets.length) {
    existing.offsets.set(offsets);
    existing.attachment = attachment;
    return existing;
  }
  const record: Skeleton2DSlotDeform = { attachment, offsets: Float32Array.from(offsets) };
  slot.deform = record;
  return record;
}
