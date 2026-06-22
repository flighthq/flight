//! Invalidation ID counter and dirty-tracking helpers.
//!
//! Revision counters are `u32` values that wrap on overflow (using
//! wrapping addition). A counter value of `u32::MAX` (`0xFFFF_FFFF`) is
//! used as the sentinel "never computed" / "definitely dirty" value —
//! callers initialise cached-revision fields to `DIRTY_SENTINEL` so the
//! first comparison always triggers a recompute.

/// Sentinel value meaning "stale / never computed".
pub const DIRTY_SENTINEL: u32 = u32::MAX;

/// Advance `counter` by one using wrapping arithmetic, skipping the
/// sentinel value so that a valid counter is never mistaken for "dirty".
#[inline]
pub fn next_revision(counter: u32) -> u32 {
    let next = counter.wrapping_add(1);
    // Skip the sentinel so a valid counter can never equal DIRTY_SENTINEL.
    if next == DIRTY_SENTINEL { 0 } else { next }
}

/// Returns `true` when `cached` does not match `current`, indicating the
/// cached data is stale and needs recomputing.
#[inline]
pub fn is_dirty(cached: u32, current: u32) -> bool {
    cached != current
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_dirty_detects_mismatch() {
        assert!(is_dirty(DIRTY_SENTINEL, 0));
        assert!(!is_dirty(0, 0));
        assert!(is_dirty(0, 1));
    }

    #[test]
    fn next_revision_wraps_and_skips_sentinel() {
        assert_eq!(next_revision(0), 1);
        // Wrapping: DIRTY_SENTINEL - 1 → 0, skipping the sentinel itself.
        assert_eq!(next_revision(DIRTY_SENTINEL - 1), 0);
        assert_eq!(next_revision(DIRTY_SENTINEL), 0);
    }
}
