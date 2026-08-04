import { resolveSpineDrawOrdering } from './spineDrawOrder';

// A keyframe names only the slots that MOVE; the rest keep their relative order and close the gaps.
// Both Spine encodings resolve through this one function so they cannot drift apart.
describe('resolveSpineDrawOrdering', () => {
  it('keeps the setup order when nothing moves', () => {
    expect(resolveSpineDrawOrdering([], 3)).toEqual([0, 1, 2]);
  });

  it('moves a slot by its offset and closes the gap with the rest in setup order', () => {
    // Slot 2 moves back two places; 0 and 1 keep their relative order and shuffle up.
    expect(resolveSpineDrawOrdering([{ offset: -2, slotIndex: 2 }], 3)).toEqual([1, 2, 0]);
  });

  it('handles several moves in one keyframe', () => {
    // Slot 0 goes to position 2 and slot 2 to position 1, leaving position 0 for the unmoved slot 1.
    // Occupancy by position is [1, 2, 0], so the sort key per slot is [2, 0, 1].
    expect(
      resolveSpineDrawOrdering(
        [
          { offset: 2, slotIndex: 0 },
          { offset: -1, slotIndex: 2 },
        ],
        3,
      ),
    ).toEqual([2, 0, 1]);
  });

  it('refuses a destination outside the slot range', () => {
    // It would otherwise silently reorder every slot the keyframe did not name.
    expect(resolveSpineDrawOrdering([{ offset: 9, slotIndex: 0 }], 3)).toBeNull();
    expect(resolveSpineDrawOrdering([{ offset: -1, slotIndex: 0 }], 3)).toBeNull();
  });

  it('refuses two slots claiming one position', () => {
    expect(
      resolveSpineDrawOrdering(
        [
          { offset: 1, slotIndex: 0 },
          { offset: 0, slotIndex: 1 },
        ],
        3,
      ),
    ).toBeNull();
  });

  it('refuses a slot index the rig does not have', () => {
    expect(resolveSpineDrawOrdering([{ offset: 0, slotIndex: 7 }], 3)).toBeNull();
  });

  it('returns a permutation for every accepted keyframe', () => {
    // The invariant a draw order must satisfy: every position used exactly once.
    const ordering = resolveSpineDrawOrdering([{ offset: 3, slotIndex: 1 }], 5)!;

    expect([...ordering].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
  });

  it('returns null for a rig with no slots', () => {
    expect(resolveSpineDrawOrdering([], 0)).toBeNull();
  });
});
