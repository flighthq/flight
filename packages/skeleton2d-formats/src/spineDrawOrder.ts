/**
 * One draw-order keyframe's whole ordering, resolved from the moves the file states.
 *
 * A Spine draw-order keyframe names only the slots that MOVE, each with a signed offset from its setup
 * position; every slot not named keeps its relative order and closes the gaps. A track has to answer
 * "what is in effect at time t" from one keyframe alone, so a list of moves is resolved into a whole
 * ordering here rather than replayed in sequence at sample time.
 *
 * Both Spine encodings resolve through this one function — the JSON form after it has turned slot names
 * into indices, the binary form which states indices already — so the two cannot drift apart. That is
 * the point of sharing it rather than writing the transformation twice: the second implementation would
 * agree with the first only by inspection, and only until someone edited one of them.
 *
 * Returns the sort key per slot, or `null` when the stated moves do not describe a permutation — a
 * destination outside the slot range, or two slots claiming one position. Those would silently reorder
 * every slot the keyframe did not name, so the caller drops the keyframe rather than approximating it.
 */
export function resolveSpineDrawOrdering(
  moves: readonly Readonly<{ offset: number; slotIndex: number }>[],
  slotCount: number,
): number[] | null {
  if (slotCount <= 0) return null;
  const occupants = new Array<number>(slotCount).fill(UNCLAIMED_POSITION);
  const moved = new Array<boolean>(slotCount).fill(false);

  for (const move of moves) {
    const slotIndex = move.slotIndex;
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= slotCount) return null;
    const destination = slotIndex + move.offset;
    if (!Number.isInteger(destination) || destination < 0 || destination >= slotCount) return null;
    if (occupants[destination] !== UNCLAIMED_POSITION || moved[slotIndex]) return null;
    occupants[destination] = slotIndex;
    moved[slotIndex] = true;
  }

  // The slots nobody moved close the gaps in setup order, which is what "keeps its relative order" means.
  let next = 0;
  for (let position = 0; position < slotCount; position++) {
    if (occupants[position] !== UNCLAIMED_POSITION) continue;
    while (next < slotCount && moved[next]) next++;
    if (next >= slotCount) return null;
    occupants[position] = next;
    next++;
  }

  // A track carries one value per slot rather than per position, so the occupancy is inverted.
  const sortKeys = new Array<number>(slotCount).fill(0);
  for (let position = 0; position < slotCount; position++) sortKeys[occupants[position]] = position;
  return sortKeys;
}

const UNCLAIMED_POSITION = -1;
