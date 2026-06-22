//! Texture atlas region construction and mutation.
//!
//! A `TextureAtlasRegion` describes a rectangular sub-rectangle within a
//! `TextureAtlas` image, with an optional pivot point used by sprite and
//! particle systems.

use flighthq_types::{TextureAtlas, TextureAtlasRegion, TextureAtlasRegionLike, Vector2Like};

// Note: `Vector2Like` is a plain struct (x: f32, y: f32). Functions that accept
// a "vector-like pivot" take `&Vector2Like` directly.

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/// Allocates a new `TextureAtlasRegion` from optional field values.
///
/// All fields default to `0` / `None` when not provided.
pub fn create_texture_atlas_region(src: Option<&TextureAtlasRegionLike>) -> TextureAtlasRegion {
    match src {
        Some(s) => TextureAtlasRegion {
            height: s.height,
            id: s.id,
            pivot_x: s.pivot_x,
            pivot_y: s.pivot_y,
            x: s.x,
            y: s.y,
            width: s.width,
        },
        None => TextureAtlasRegion::default(),
    }
}

// ---------------------------------------------------------------------------
// Mutation
// ---------------------------------------------------------------------------

/// Sets all geometric fields on an existing `TextureAtlasRegion` in one call.
///
/// Safe when `out` aliases an input (reads all inputs before writing).
pub fn set_texture_atlas_region(
    out: &mut TextureAtlasRegion,
    x: f32,
    y: f32,
    width: f32,
    height: f32,
    pivot_x: Option<f32>,
    pivot_y: Option<f32>,
) {
    // All inputs are passed by value, so aliasing with `out` is inherently safe.
    out.x = x;
    out.y = y;
    out.width = width;
    out.height = height;
    out.pivot_x = pivot_x;
    out.pivot_y = pivot_y;
}

// ---------------------------------------------------------------------------
// Atlas helpers
// ---------------------------------------------------------------------------

/// Appends a new region defined by `(x, y, width, height)` to `target.regions`.
///
/// The region `id` is assigned as `target.regions.len()` before the push.
pub fn add_texture_atlas_region(
    target: &mut TextureAtlas,
    x: f32,
    y: f32,
    width: f32,
    height: f32,
    pivot_x: Option<f32>,
    pivot_y: Option<f32>,
) {
    let id = target.regions.len() as u32;
    target
        .regions
        .push(create_texture_atlas_region(Some(&TextureAtlasRegionLike {
            x,
            y,
            width,
            height,
            id,
            pivot_x,
            pivot_y,
        })));
}

/// Appends a new region from `(x, y, width, height)` and an optional pivot.
pub fn add_texture_atlas_region_rectangle(
    target: &mut TextureAtlas,
    x: f32,
    y: f32,
    width: f32,
    height: f32,
    pivot: Option<&Vector2Like>,
) {
    add_texture_atlas_region(
        target,
        x,
        y,
        width,
        height,
        pivot.map(|p| p.x),
        pivot.map(|p| p.y),
    );
}

/// Appends a new region defined by two corner points `(ax, ay)` and `(bx, by)`.
///
/// Width and height are computed as `bx - ax` and `by - ay`.
pub fn add_texture_atlas_region_rectangle_xy(
    target: &mut TextureAtlas,
    ax: f32,
    ay: f32,
    bx: f32,
    by: f32,
    pivot_x: Option<f32>,
    pivot_y: Option<f32>,
) {
    add_texture_atlas_region(target, ax, ay, bx - ax, by - ay, pivot_x, pivot_y);
}

/// Appends a new region defined by two `Vector2Like` corner points.
pub fn add_texture_atlas_region_vector2(
    target: &mut TextureAtlas,
    a: &Vector2Like,
    b: &Vector2Like,
    pivot: Option<&Vector2Like>,
) {
    add_texture_atlas_region(
        target,
        a.x,
        a.y,
        b.x - a.x,
        b.y - a.y,
        pivot.map(|p| p.x),
        pivot.map(|p| p.y),
    );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn add_texture_atlas_region_increments_count() {
        let mut atlas = crate::texture_atlas::create_texture_atlas(None, vec![]);
        add_texture_atlas_region(&mut atlas, 0.0, 0.0, 16.0, 16.0, None, None);
        assert_eq!(atlas.regions.len(), 1);
        add_texture_atlas_region(&mut atlas, 16.0, 0.0, 16.0, 16.0, None, None);
        assert_eq!(atlas.regions.len(), 2);
    }

    #[test]
    fn add_texture_atlas_region_assigns_index_id() {
        let mut atlas = crate::texture_atlas::create_texture_atlas(None, vec![]);
        add_texture_atlas_region(&mut atlas, 0.0, 0.0, 10.0, 10.0, None, None);
        add_texture_atlas_region(&mut atlas, 0.0, 0.0, 10.0, 10.0, None, None);
        assert_eq!(atlas.regions[0].id, 0);
        assert_eq!(atlas.regions[1].id, 1);
    }

    #[test]
    fn add_texture_atlas_region_sets_coordinates_and_pivot() {
        let mut atlas = crate::texture_atlas::create_texture_atlas(None, vec![]);
        add_texture_atlas_region(&mut atlas, 10.0, 20.0, 30.0, 40.0, Some(5.0), Some(5.0));
        let r = &atlas.regions[0];
        assert_eq!(r.x, 10.0);
        assert_eq!(r.y, 20.0);
        assert_eq!(r.width, 30.0);
        assert_eq!(r.height, 40.0);
        assert_eq!(r.pivot_x, Some(5.0));
        assert_eq!(r.pivot_y, Some(5.0));
    }

    #[test]
    fn add_texture_atlas_region_rectangle_sets_pivot_from_vector() {
        let mut atlas = crate::texture_atlas::create_texture_atlas(None, vec![]);
        add_texture_atlas_region_rectangle(
            &mut atlas,
            10.0,
            20.0,
            30.0,
            40.0,
            Some(&Vector2Like { x: 3.0, y: 4.0 }),
        );
        let r = &atlas.regions[0];
        assert_eq!(r.x, 10.0);
        assert_eq!(r.width, 30.0);
        assert_eq!(r.pivot_x, Some(3.0));
        assert_eq!(r.pivot_y, Some(4.0));
    }

    #[test]
    fn add_texture_atlas_region_rectangle_xy_computes_size() {
        let mut atlas = crate::texture_atlas::create_texture_atlas(None, vec![]);
        add_texture_atlas_region_rectangle_xy(&mut atlas, 5.0, 10.0, 25.0, 30.0, None, None);
        let r = &atlas.regions[0];
        assert_eq!(r.x, 5.0);
        assert_eq!(r.y, 10.0);
        assert_eq!(r.width, 20.0);
        assert_eq!(r.height, 20.0);
    }

    #[test]
    fn add_texture_atlas_region_vector2_computes_size_and_pivot() {
        let mut atlas = crate::texture_atlas::create_texture_atlas(None, vec![]);
        add_texture_atlas_region_vector2(
            &mut atlas,
            &Vector2Like { x: 5.0, y: 10.0 },
            &Vector2Like { x: 25.0, y: 30.0 },
            Some(&Vector2Like { x: 3.0, y: 4.0 }),
        );
        let r = &atlas.regions[0];
        assert_eq!(r.x, 5.0);
        assert_eq!(r.y, 10.0);
        assert_eq!(r.width, 20.0);
        assert_eq!(r.height, 20.0);
        assert_eq!(r.pivot_x, Some(3.0));
        assert_eq!(r.pivot_y, Some(4.0));
    }

    #[test]
    fn create_texture_atlas_region_defaults() {
        let r = create_texture_atlas_region(None);
        assert_eq!(r.x, 0.0);
        assert_eq!(r.y, 0.0);
        assert_eq!(r.width, 0.0);
        assert_eq!(r.height, 0.0);
        assert!(r.pivot_x.is_none());
        assert!(r.pivot_y.is_none());
    }

    #[test]
    fn set_texture_atlas_region_updates_fields() {
        let mut r = create_texture_atlas_region(None);
        set_texture_atlas_region(&mut r, 1.0, 2.0, 10.0, 20.0, Some(0.5), Some(0.5));
        assert_eq!(r.x, 1.0);
        assert_eq!(r.y, 2.0);
        assert_eq!(r.width, 10.0);
        assert_eq!(r.height, 20.0);
        assert_eq!(r.pivot_x, Some(0.5));
        assert_eq!(r.pivot_y, Some(0.5));
    }

    #[test]
    fn set_texture_atlas_region_aliased_safe() {
        // out aliasing is safe: all inputs are read before any write.
        let mut r = create_texture_atlas_region(None);
        set_texture_atlas_region(&mut r, 5.0, 5.0, 8.0, 8.0, None, None);
        // Just checks it doesn't panic / produce garbage.
        assert_eq!(r.x, 5.0);
    }
}
