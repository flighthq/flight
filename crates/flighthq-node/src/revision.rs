//! Per-node revision counters and invalidation — a faithful port of the
//! TypeScript `revision.ts`.
//!
//! The TS reference keeps these counters as fields on a node's runtime object.
//! In the arena-based Rust port they are grouped into [`NodeRevisions`], a
//! plain data struct that a node kind can embed (or hold in its own arena)
//! when it needs the full TS-style invalidation surface.
//!
//! Counters are `u32` and advance with [`next_revision`] (wrapping at
//! overflow, skipping the dirty sentinel). The "cached using" fields use
//! [`DIRTY_SENTINEL`] as the "stale / never computed" marker, exactly as the
//! TS reference uses `-1`.

use crate::invalidation::{DIRTY_SENTINEL, next_revision};

// ---------------------------------------------------------------------------
// Data type
// ---------------------------------------------------------------------------

/// The full set of revision counters a node tracks, mirroring the TS
/// `NodeRuntime` revision fields.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct NodeRevisions {
    /// Bumped when compositing properties (alpha, blend mode, visibility) change.
    pub appearance_id: u32,
    /// Bumped when the node's own (childless) extent changes.
    pub local_bounds_id: u32,
    /// Bumped when the node's rasterizable payload changes.
    pub local_content_id: u32,
    /// Bumped when the node's own transform changes.
    pub local_transform_id: u32,
    /// Blended world-transform revision exposed to external caches.
    pub world_transform_id: u32,
    /// Snapshot of `local_transform_id` used to build `world_transform_id`.
    pub world_transform_using_local_transform_id: u32,
    /// Snapshot of the parent's `world_transform_id` used to build ours.
    pub world_transform_using_parent_transform_id: u32,
    /// Snapshot of the world-transform revision the world bounds were built with.
    pub world_bounds_using_world_transform_id: u32,
    /// Snapshot of the local-bounds revision the world bounds were built with.
    pub world_bounds_using_local_bounds_id: u32,
}

impl Default for NodeRevisions {
    fn default() -> Self {
        Self {
            appearance_id: 0,
            local_bounds_id: 0,
            local_content_id: 0,
            local_transform_id: 0,
            world_transform_id: 0,
            world_transform_using_local_transform_id: DIRTY_SENTINEL,
            world_transform_using_parent_transform_id: DIRTY_SENTINEL,
            world_bounds_using_world_transform_id: DIRTY_SENTINEL,
            world_bounds_using_local_bounds_id: DIRTY_SENTINEL,
        }
    }
}

// ---------------------------------------------------------------------------
// Free functions (alphabetical)
// ---------------------------------------------------------------------------

/// Recomputes `target`'s blended world-transform revision from its own local
/// transform revision and an optional parent's world-transform revision.
///
/// Mirrors the TS bit-packing: `(local << 16) | (parent & 0xffff)`.
pub fn compute_node_world_transform_revision(
    target: &mut NodeRevisions,
    parent: Option<&NodeRevisions>,
) {
    let local_transform_id = target.local_transform_id;
    let parent_world_transform_id = parent.map_or(0, |p| p.world_transform_id);
    target.world_transform_using_local_transform_id = local_transform_id;
    target.world_transform_using_parent_transform_id = parent_world_transform_id;
    target.world_transform_id = (local_transform_id << 16) | (parent_world_transform_id & 0xffff);
}

/// Returns the appearance revision of `source`.
pub fn get_node_appearance_revision(source: &NodeRevisions) -> u32 {
    source.appearance_id
}

/// Returns the local-bounds revision of `source`.
pub fn get_node_local_bounds_revision(source: &NodeRevisions) -> u32 {
    source.local_bounds_id
}

/// Returns the local-content revision of `source`.
pub fn get_node_local_content_revision(source: &NodeRevisions) -> u32 {
    source.local_content_id
}

/// Returns the local-transform revision of `source`.
pub fn get_node_local_transform_revision(source: &NodeRevisions) -> u32 {
    source.local_transform_id
}

/// Returns the world-transform revision of `source`.
pub fn get_node_world_transform_revision(source: &NodeRevisions) -> u32 {
    source.world_transform_id
}

/// Invalidates every revision aspect of `target` — appearance, local bounds,
/// local content, local transform, parent reference, and world bounds.
pub fn invalidate_node(target: &mut NodeRevisions) {
    invalidate_node_appearance(target);
    invalidate_node_local_bounds(target);
    invalidate_node_local_content(target);
    invalidate_node_local_transform(target);
    invalidate_node_parent_reference(target);
    invalidate_node_world_bounds(target);
}

/// Bumps the appearance revision (compositing changed, excluding transforms).
pub fn invalidate_node_appearance(target: &mut NodeRevisions) {
    target.appearance_id = next_revision(target.appearance_id);
}

/// Bumps the local-bounds revision (own extent changed).
pub fn invalidate_node_local_bounds(target: &mut NodeRevisions) {
    target.local_bounds_id = next_revision(target.local_bounds_id);
}

/// Bumps the local-content revision (rasterizable payload changed).
pub fn invalidate_node_local_content(target: &mut NodeRevisions) {
    target.local_content_id = next_revision(target.local_content_id);
}

/// Bumps the local-transform revision (own transform changed).
pub fn invalidate_node_local_transform(target: &mut NodeRevisions) {
    target.local_transform_id = next_revision(target.local_transform_id);
}

/// Marks the cached parent-world-transform reference as stale.
pub fn invalidate_node_parent_reference(target: &mut NodeRevisions) {
    target.world_transform_using_parent_transform_id = DIRTY_SENTINEL;
}

/// Bumps both appearance and local-transform revisions — the combined
/// "visual output changed" invalidation used when animating alpha/x/y/scale/rotation.
pub fn invalidate_node_render(target: &mut NodeRevisions) {
    invalidate_node_appearance(target);
    invalidate_node_local_transform(target);
}

/// Marks the world-bounds support revisions as stale (child bounds changed).
pub fn invalidate_node_world_bounds(target: &mut NodeRevisions) {
    target.world_bounds_using_world_transform_id = DIRTY_SENTINEL;
    target.world_bounds_using_local_bounds_id = DIRTY_SENTINEL;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // compute_node_world_transform_revision

    #[test]
    fn compute_node_world_transform_revision_uses_local_and_default_parent() {
        let mut r = NodeRevisions {
            local_transform_id: 3,
            ..NodeRevisions::default()
        };
        compute_node_world_transform_revision(&mut r, None);
        assert_eq!(r.world_transform_using_local_transform_id, 3);
        assert_eq!(r.world_transform_using_parent_transform_id, 0);
        assert_eq!(r.world_transform_id, 3 << 16);
    }

    #[test]
    fn compute_node_world_transform_revision_incorporates_parent() {
        let parent = NodeRevisions {
            world_transform_id: 7,
            ..NodeRevisions::default()
        };
        let mut r = NodeRevisions::default();
        compute_node_world_transform_revision(&mut r, Some(&parent));
        assert_eq!(r.world_transform_using_parent_transform_id, 7);
    }

    // get_node_appearance_revision

    #[test]
    fn get_node_appearance_revision_returns_field() {
        let r = NodeRevisions {
            appearance_id: 100,
            ..NodeRevisions::default()
        };
        assert_eq!(get_node_appearance_revision(&r), 100);
    }

    // get_node_local_bounds_revision

    #[test]
    fn get_node_local_bounds_revision_returns_field() {
        let r = NodeRevisions {
            local_bounds_id: 100,
            ..NodeRevisions::default()
        };
        assert_eq!(get_node_local_bounds_revision(&r), 100);
    }

    // get_node_local_content_revision

    #[test]
    fn get_node_local_content_revision_returns_field() {
        let r = NodeRevisions {
            local_content_id: 100,
            ..NodeRevisions::default()
        };
        assert_eq!(get_node_local_content_revision(&r), 100);
    }

    // get_node_local_transform_revision

    #[test]
    fn get_node_local_transform_revision_returns_field() {
        let r = NodeRevisions {
            local_transform_id: 100,
            ..NodeRevisions::default()
        };
        assert_eq!(get_node_local_transform_revision(&r), 100);
    }

    // get_node_world_transform_revision

    #[test]
    fn get_node_world_transform_revision_returns_field() {
        let r = NodeRevisions {
            world_transform_id: 100,
            ..NodeRevisions::default()
        };
        assert_eq!(get_node_world_transform_revision(&r), 100);
    }

    // invalidate_node

    #[test]
    fn invalidate_node_bumps_all_local_counters() {
        let mut r = NodeRevisions::default();
        let (a, b, c, t) = (
            r.appearance_id,
            r.local_bounds_id,
            r.local_content_id,
            r.local_transform_id,
        );
        invalidate_node(&mut r);
        assert_eq!(r.appearance_id, a + 1);
        assert_eq!(r.local_bounds_id, b + 1);
        assert_eq!(r.local_content_id, c + 1);
        assert_eq!(r.local_transform_id, t + 1);
    }

    #[test]
    fn invalidate_node_invalidates_parent_and_world_bounds() {
        let mut r = NodeRevisions::default();
        invalidate_node(&mut r);
        assert_eq!(r.world_transform_using_parent_transform_id, DIRTY_SENTINEL);
        assert_eq!(r.world_bounds_using_world_transform_id, DIRTY_SENTINEL);
        assert_eq!(r.world_bounds_using_local_bounds_id, DIRTY_SENTINEL);
    }

    // invalidate_node_appearance

    #[test]
    fn invalidate_node_appearance_increments_and_wraps() {
        let mut r = NodeRevisions::default();
        invalidate_node_appearance(&mut r);
        assert_eq!(r.appearance_id, 1);
        // Wrap at u32::MAX back to 0 (matches TS `>>> 0`).
        r.appearance_id = 0xffff_ffff;
        invalidate_node_appearance(&mut r);
        assert_eq!(r.appearance_id, 0);
    }

    // invalidate_node_local_bounds

    #[test]
    fn invalidate_node_local_bounds_increments_and_wraps() {
        let mut r = NodeRevisions::default();
        invalidate_node_local_bounds(&mut r);
        assert_eq!(r.local_bounds_id, 1);
        r.local_bounds_id = 0xffff_ffff;
        invalidate_node_local_bounds(&mut r);
        assert_eq!(r.local_bounds_id, 0);
    }

    // invalidate_node_local_content

    #[test]
    fn invalidate_node_local_content_increments_and_wraps() {
        let mut r = NodeRevisions::default();
        invalidate_node_local_content(&mut r);
        assert_eq!(r.local_content_id, 1);
        r.local_content_id = 0xffff_ffff;
        invalidate_node_local_content(&mut r);
        assert_eq!(r.local_content_id, 0);
    }

    // invalidate_node_local_transform

    #[test]
    fn invalidate_node_local_transform_increments_and_wraps() {
        let mut r = NodeRevisions::default();
        invalidate_node_local_transform(&mut r);
        assert_eq!(r.local_transform_id, 1);
        r.local_transform_id = 0xffff_ffff;
        invalidate_node_local_transform(&mut r);
        assert_eq!(r.local_transform_id, 0);
    }

    // invalidate_node_parent_reference

    #[test]
    fn invalidate_node_parent_reference_sets_sentinel() {
        let mut r = NodeRevisions {
            world_transform_using_parent_transform_id: 1,
            ..NodeRevisions::default()
        };
        invalidate_node_parent_reference(&mut r);
        assert_eq!(r.world_transform_using_parent_transform_id, DIRTY_SENTINEL);
    }

    // invalidate_node_render

    #[test]
    fn invalidate_node_render_bumps_appearance_and_local_transform() {
        let mut r = NodeRevisions::default();
        let (a, t) = (r.appearance_id, r.local_transform_id);
        invalidate_node_render(&mut r);
        assert_eq!(r.appearance_id, a + 1);
        assert_eq!(r.local_transform_id, t + 1);
    }

    // invalidate_node_world_bounds

    #[test]
    fn invalidate_node_world_bounds_sets_sentinels() {
        let mut r = NodeRevisions {
            world_bounds_using_world_transform_id: 1,
            world_bounds_using_local_bounds_id: 1,
            ..NodeRevisions::default()
        };
        invalidate_node_world_bounds(&mut r);
        assert_eq!(r.world_bounds_using_world_transform_id, DIRTY_SENTINEL);
        assert_eq!(r.world_bounds_using_local_bounds_id, DIRTY_SENTINEL);
    }
}
