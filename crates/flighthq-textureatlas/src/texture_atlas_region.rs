//! Texture atlas region construction and mutation.
//!
//! A `TextureAtlasRegion` describes a rectangular sub-rectangle within a
//! `TextureAtlas` image, with an optional pivot point used by sprite and
//! particle systems.

use flighthq_types::{
    RectangleLike, TextureAtlas, TextureAtlasRegion, TextureAtlasRegionLike, Vector2Like,
};

// Note: `Vector2Like` is a plain struct (x: f32, y: f32). Functions that accept
// a "vector-like pivot" take `&Vector2Like` directly.

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/// Allocates a new `TextureAtlasRegion` from optional field values.
///
/// All fields default to `0` / `None` / `false` when not provided. The default
/// `id` is `0` here (the `*Like` default); callers that append a region assign
/// the index id explicitly via `add_texture_atlas_region`.
pub fn create_texture_atlas_region(src: Option<&TextureAtlasRegionLike>) -> TextureAtlasRegion {
    match src {
        Some(s) => TextureAtlasRegion {
            height: s.height,
            id: s.id,
            name: s.name.clone(),
            original_height: s.original_height,
            original_width: s.original_width,
            pivot_x: s.pivot_x,
            pivot_y: s.pivot_y,
            rotated: s.rotated,
            source_x: s.source_x,
            source_y: s.source_y,
            trimmed: s.trimmed,
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
    name: Option<&str>,
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
            name: name.map(|n| n.to_owned()),
            pivot_x,
            pivot_y,
            ..TextureAtlasRegionLike::default()
        })));
}

/// Appends a new region from `(x, y, width, height)`, an optional pivot, and an
/// optional name.
pub fn add_texture_atlas_region_rectangle(
    target: &mut TextureAtlas,
    x: f32,
    y: f32,
    width: f32,
    height: f32,
    pivot: Option<&Vector2Like>,
    name: Option<&str>,
) {
    add_texture_atlas_region(
        target,
        x,
        y,
        width,
        height,
        pivot.map(|p| p.x),
        pivot.map(|p| p.y),
        name,
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
    name: Option<&str>,
) {
    add_texture_atlas_region(target, ax, ay, bx - ax, by - ay, pivot_x, pivot_y, name);
}

/// Appends a new region defined by two `Vector2Like` corner points.
pub fn add_texture_atlas_region_vector2(
    target: &mut TextureAtlas,
    a: &Vector2Like,
    b: &Vector2Like,
    pivot: Option<&Vector2Like>,
    name: Option<&str>,
) {
    add_texture_atlas_region(
        target,
        a.x,
        a.y,
        b.x - a.x,
        b.y - a.y,
        pivot.map(|p| p.x),
        pivot.map(|p| p.y),
        name,
    );
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/// Returns the first region with the given id, or `None` if not found.
pub fn get_texture_atlas_region_by_id(
    atlas: &TextureAtlas,
    id: u32,
) -> Option<&TextureAtlasRegion> {
    atlas.regions.iter().find(|region| region.id == id)
}

/// Returns the first region whose name matches exactly, or `None` if not found.
///
/// Case-sensitive. Linear scan — acceptable for typical atlas sizes
/// (< 2000 regions).
pub fn get_texture_atlas_region_by_name<'a>(
    atlas: &'a TextureAtlas,
    name: &str,
) -> Option<&'a TextureAtlasRegion> {
    atlas
        .regions
        .iter()
        .find(|region| region.name.as_deref() == Some(name))
}

/// Returns all regions whose name starts with the given prefix, in insertion
/// order.
///
/// Useful for collecting animation frame sequences following a `baseName_NNN`
/// naming convention. Returns an empty `Vec` when no region names match.
pub fn get_texture_atlas_region_sequence<'a>(
    atlas: &'a TextureAtlas,
    prefix: &str,
) -> Vec<&'a TextureAtlasRegion> {
    atlas
        .regions
        .iter()
        .filter(|region| {
            region
                .name
                .as_deref()
                .is_some_and(|name| name.starts_with(prefix))
        })
        .collect()
}

/// Writes normalized UV coordinates (0–1) for the region into `out`.
///
/// Accounts for the atlas image dimensions: `out.x = region.x / image_width`,
/// etc. When `region.rotated` is true the packed rectangle is transposed — the
/// UV rect still covers the packed (rotated) texels; callers drawing a rotated
/// region must swap width/height. Returns `out` with all zeros when
/// `image_width` or `image_height` is zero to avoid division by zero. Reads all
/// inputs before writing, so it is safe when `out` aliases nothing here (region
/// and out are distinct types).
pub fn get_texture_atlas_region_uv(
    region: &TextureAtlasRegion,
    image_width: f32,
    image_height: f32,
    out: &mut RectangleLike,
) {
    if image_width <= 0.0 || image_height <= 0.0 {
        out.x = 0.0;
        out.y = 0.0;
        out.width = 0.0;
        out.height = 0.0;
        return;
    }
    // Read all inputs before writing — alias-safe.
    let rx = region.x;
    let ry = region.y;
    let rw = region.width;
    let rh = region.height;
    out.x = rx / image_width;
    out.y = ry / image_height;
    out.width = rw / image_width;
    out.height = rh / image_height;
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
        add_texture_atlas_region(&mut atlas, 0.0, 0.0, 16.0, 16.0, None, None, None);
        assert_eq!(atlas.regions.len(), 1);
        add_texture_atlas_region(&mut atlas, 16.0, 0.0, 16.0, 16.0, None, None, None);
        assert_eq!(atlas.regions.len(), 2);
    }

    #[test]
    fn add_texture_atlas_region_assigns_index_id() {
        let mut atlas = crate::texture_atlas::create_texture_atlas(None, vec![]);
        add_texture_atlas_region(&mut atlas, 0.0, 0.0, 10.0, 10.0, None, None, None);
        add_texture_atlas_region(&mut atlas, 0.0, 0.0, 10.0, 10.0, None, None, None);
        assert_eq!(atlas.regions[0].id, 0);
        assert_eq!(atlas.regions[1].id, 1);
    }

    #[test]
    fn add_texture_atlas_region_sets_coordinates_and_pivot() {
        let mut atlas = crate::texture_atlas::create_texture_atlas(None, vec![]);
        add_texture_atlas_region(
            &mut atlas,
            10.0,
            20.0,
            30.0,
            40.0,
            Some(5.0),
            Some(5.0),
            None,
        );
        let r = &atlas.regions[0];
        assert_eq!(r.x, 10.0);
        assert_eq!(r.y, 20.0);
        assert_eq!(r.width, 30.0);
        assert_eq!(r.height, 40.0);
        assert_eq!(r.pivot_x, Some(5.0));
        assert_eq!(r.pivot_y, Some(5.0));
    }

    #[test]
    fn add_texture_atlas_region_sets_optional_name() {
        let mut atlas = crate::texture_atlas::create_texture_atlas(None, vec![]);
        add_texture_atlas_region(&mut atlas, 0.0, 0.0, 10.0, 10.0, None, None, Some("hero"));
        assert_eq!(atlas.regions[0].name.as_deref(), Some("hero"));
    }

    #[test]
    fn add_texture_atlas_region_defaults_name_to_none() {
        let mut atlas = crate::texture_atlas::create_texture_atlas(None, vec![]);
        add_texture_atlas_region(&mut atlas, 0.0, 0.0, 10.0, 10.0, None, None, None);
        assert!(atlas.regions[0].name.is_none());
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
            None,
        );
        let r = &atlas.regions[0];
        assert_eq!(r.x, 10.0);
        assert_eq!(r.width, 30.0);
        assert_eq!(r.pivot_x, Some(3.0));
        assert_eq!(r.pivot_y, Some(4.0));
    }

    #[test]
    fn add_texture_atlas_region_rectangle_sets_optional_name() {
        let mut atlas = crate::texture_atlas::create_texture_atlas(None, vec![]);
        add_texture_atlas_region_rectangle(
            &mut atlas,
            0.0,
            0.0,
            10.0,
            10.0,
            None,
            Some("frame_00"),
        );
        assert_eq!(atlas.regions[0].name.as_deref(), Some("frame_00"));
    }

    #[test]
    fn add_texture_atlas_region_rectangle_xy_computes_size() {
        let mut atlas = crate::texture_atlas::create_texture_atlas(None, vec![]);
        add_texture_atlas_region_rectangle_xy(&mut atlas, 5.0, 10.0, 25.0, 30.0, None, None, None);
        let r = &atlas.regions[0];
        assert_eq!(r.x, 5.0);
        assert_eq!(r.y, 10.0);
        assert_eq!(r.width, 20.0);
        assert_eq!(r.height, 20.0);
    }

    #[test]
    fn add_texture_atlas_region_rectangle_xy_sets_optional_name() {
        let mut atlas = crate::texture_atlas::create_texture_atlas(None, vec![]);
        add_texture_atlas_region_rectangle_xy(
            &mut atlas,
            0.0,
            0.0,
            10.0,
            10.0,
            None,
            None,
            Some("tile_0"),
        );
        assert_eq!(atlas.regions[0].name.as_deref(), Some("tile_0"));
    }

    #[test]
    fn add_texture_atlas_region_vector2_computes_size_and_pivot() {
        let mut atlas = crate::texture_atlas::create_texture_atlas(None, vec![]);
        add_texture_atlas_region_vector2(
            &mut atlas,
            &Vector2Like { x: 5.0, y: 10.0 },
            &Vector2Like { x: 25.0, y: 30.0 },
            Some(&Vector2Like { x: 3.0, y: 4.0 }),
            None,
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
    fn add_texture_atlas_region_vector2_sets_optional_name() {
        let mut atlas = crate::texture_atlas::create_texture_atlas(None, vec![]);
        add_texture_atlas_region_vector2(
            &mut atlas,
            &Vector2Like { x: 0.0, y: 0.0 },
            &Vector2Like { x: 10.0, y: 10.0 },
            None,
            Some("walk_01"),
        );
        assert_eq!(atlas.regions[0].name.as_deref(), Some("walk_01"));
    }

    #[test]
    fn create_texture_atlas_region_defaults() {
        let r = create_texture_atlas_region(None);
        assert_eq!(r.x, 0.0);
        assert_eq!(r.y, 0.0);
        assert_eq!(r.width, 0.0);
        assert_eq!(r.height, 0.0);
        assert!(r.name.is_none());
        assert!(r.original_height.is_none());
        assert!(r.original_width.is_none());
        assert!(r.pivot_x.is_none());
        assert!(r.pivot_y.is_none());
        assert!(!r.rotated);
        assert_eq!(r.source_x, 0.0);
        assert_eq!(r.source_y, 0.0);
        assert!(!r.trimmed);
    }

    #[test]
    fn create_texture_atlas_region_initializes_trim_and_rotation() {
        let r = create_texture_atlas_region(Some(&TextureAtlasRegionLike {
            trimmed: true,
            rotated: true,
            source_x: 4.0,
            source_y: 8.0,
            original_width: Some(64.0),
            original_height: Some(32.0),
            ..TextureAtlasRegionLike::default()
        }));
        assert!(r.trimmed);
        assert!(r.rotated);
        assert_eq!(r.source_x, 4.0);
        assert_eq!(r.source_y, 8.0);
        assert_eq!(r.original_width, Some(64.0));
        assert_eq!(r.original_height, Some(32.0));
    }

    #[test]
    fn get_texture_atlas_region_by_id_returns_none_for_empty_atlas() {
        let atlas = crate::texture_atlas::create_texture_atlas(None, vec![]);
        assert!(get_texture_atlas_region_by_id(&atlas, 0).is_none());
    }

    #[test]
    fn get_texture_atlas_region_by_id_returns_none_when_no_match() {
        let mut atlas = crate::texture_atlas::create_texture_atlas(None, vec![]);
        add_texture_atlas_region(&mut atlas, 0.0, 0.0, 10.0, 10.0, None, None, None);
        assert!(get_texture_atlas_region_by_id(&atlas, 99).is_none());
    }

    #[test]
    fn get_texture_atlas_region_by_id_returns_matching_region() {
        let mut atlas = crate::texture_atlas::create_texture_atlas(None, vec![]);
        add_texture_atlas_region(&mut atlas, 0.0, 0.0, 10.0, 10.0, None, None, None);
        add_texture_atlas_region(&mut atlas, 10.0, 0.0, 10.0, 10.0, None, None, None);
        let region = get_texture_atlas_region_by_id(&atlas, 1).unwrap();
        assert_eq!(region.x, 10.0);
        assert_eq!(region.id, 1);
    }

    #[test]
    fn get_texture_atlas_region_by_name_returns_none_for_empty_atlas() {
        let atlas = crate::texture_atlas::create_texture_atlas(None, vec![]);
        assert!(get_texture_atlas_region_by_name(&atlas, "hero").is_none());
    }

    #[test]
    fn get_texture_atlas_region_by_name_returns_none_when_no_match() {
        let mut atlas = crate::texture_atlas::create_texture_atlas(None, vec![]);
        add_texture_atlas_region(&mut atlas, 0.0, 0.0, 10.0, 10.0, None, None, Some("hero"));
        assert!(get_texture_atlas_region_by_name(&atlas, "villain").is_none());
    }

    #[test]
    fn get_texture_atlas_region_by_name_returns_none_for_null_name() {
        let mut atlas = crate::texture_atlas::create_texture_atlas(None, vec![]);
        add_texture_atlas_region(&mut atlas, 0.0, 0.0, 10.0, 10.0, None, None, None);
        assert!(get_texture_atlas_region_by_name(&atlas, "").is_none());
    }

    #[test]
    fn get_texture_atlas_region_by_name_returns_matching_region() {
        let mut atlas = crate::texture_atlas::create_texture_atlas(None, vec![]);
        add_texture_atlas_region(
            &mut atlas,
            0.0,
            0.0,
            10.0,
            10.0,
            None,
            None,
            Some("hero_idle_0"),
        );
        add_texture_atlas_region(
            &mut atlas,
            10.0,
            0.0,
            10.0,
            10.0,
            None,
            None,
            Some("hero_walk_0"),
        );
        let region = get_texture_atlas_region_by_name(&atlas, "hero_walk_0").unwrap();
        assert_eq!(region.x, 10.0);
        assert_eq!(region.name.as_deref(), Some("hero_walk_0"));
    }

    #[test]
    fn get_texture_atlas_region_by_name_is_case_sensitive() {
        let mut atlas = crate::texture_atlas::create_texture_atlas(None, vec![]);
        add_texture_atlas_region(&mut atlas, 0.0, 0.0, 10.0, 10.0, None, None, Some("Hero"));
        assert!(get_texture_atlas_region_by_name(&atlas, "hero").is_none());
        assert!(get_texture_atlas_region_by_name(&atlas, "Hero").is_some());
    }

    #[test]
    fn get_texture_atlas_region_sequence_empty_when_no_regions() {
        let atlas = crate::texture_atlas::create_texture_atlas(None, vec![]);
        assert!(get_texture_atlas_region_sequence(&atlas, "walk").is_empty());
    }

    #[test]
    fn get_texture_atlas_region_sequence_matches_prefix() {
        let mut atlas = crate::texture_atlas::create_texture_atlas(None, vec![]);
        add_texture_atlas_region(
            &mut atlas,
            0.0,
            0.0,
            10.0,
            10.0,
            None,
            None,
            Some("walk_01"),
        );
        add_texture_atlas_region(
            &mut atlas,
            10.0,
            0.0,
            10.0,
            10.0,
            None,
            None,
            Some("walk_02"),
        );
        add_texture_atlas_region(
            &mut atlas,
            20.0,
            0.0,
            10.0,
            10.0,
            None,
            None,
            Some("idle_01"),
        );
        let seq = get_texture_atlas_region_sequence(&atlas, "walk");
        assert_eq!(seq.len(), 2);
        assert_eq!(seq[0].name.as_deref(), Some("walk_01"));
        assert_eq!(seq[1].name.as_deref(), Some("walk_02"));
    }

    #[test]
    fn get_texture_atlas_region_sequence_skips_null_names() {
        let mut atlas = crate::texture_atlas::create_texture_atlas(None, vec![]);
        add_texture_atlas_region(&mut atlas, 0.0, 0.0, 10.0, 10.0, None, None, None);
        add_texture_atlas_region(
            &mut atlas,
            10.0,
            0.0,
            10.0,
            10.0,
            None,
            None,
            Some("walk_01"),
        );
        let seq = get_texture_atlas_region_sequence(&atlas, "walk");
        assert_eq!(seq.len(), 1);
        assert_eq!(seq[0].name.as_deref(), Some("walk_01"));
    }

    #[test]
    fn get_texture_atlas_region_sequence_preserves_insertion_order() {
        let mut atlas = crate::texture_atlas::create_texture_atlas(None, vec![]);
        add_texture_atlas_region(&mut atlas, 0.0, 0.0, 10.0, 10.0, None, None, Some("run_03"));
        add_texture_atlas_region(
            &mut atlas,
            10.0,
            0.0,
            10.0,
            10.0,
            None,
            None,
            Some("run_01"),
        );
        add_texture_atlas_region(
            &mut atlas,
            20.0,
            0.0,
            10.0,
            10.0,
            None,
            None,
            Some("run_02"),
        );
        let seq = get_texture_atlas_region_sequence(&atlas, "run");
        let names: Vec<&str> = seq.iter().map(|r| r.name.as_deref().unwrap()).collect();
        assert_eq!(names, ["run_03", "run_01", "run_02"]);
    }

    #[test]
    fn get_texture_atlas_region_sequence_empty_when_no_prefix_match() {
        let mut atlas = crate::texture_atlas::create_texture_atlas(None, vec![]);
        add_texture_atlas_region(
            &mut atlas,
            0.0,
            0.0,
            10.0,
            10.0,
            None,
            None,
            Some("idle_01"),
        );
        assert!(get_texture_atlas_region_sequence(&atlas, "walk").is_empty());
    }

    #[test]
    fn get_texture_atlas_region_uv_zero_when_image_width_zero() {
        let region = create_texture_atlas_region(Some(&TextureAtlasRegionLike {
            x: 10.0,
            y: 20.0,
            width: 30.0,
            height: 40.0,
            ..TextureAtlasRegionLike::default()
        }));
        let mut out = RectangleLike {
            x: 1.0,
            y: 1.0,
            width: 1.0,
            height: 1.0,
        };
        get_texture_atlas_region_uv(&region, 0.0, 100.0, &mut out);
        assert_eq!(out, RectangleLike::default());
    }

    #[test]
    fn get_texture_atlas_region_uv_zero_when_image_height_zero() {
        let region = create_texture_atlas_region(Some(&TextureAtlasRegionLike {
            x: 10.0,
            y: 20.0,
            width: 30.0,
            height: 40.0,
            ..TextureAtlasRegionLike::default()
        }));
        let mut out = RectangleLike {
            x: 1.0,
            y: 1.0,
            width: 1.0,
            height: 1.0,
        };
        get_texture_atlas_region_uv(&region, 100.0, 0.0, &mut out);
        assert_eq!(out, RectangleLike::default());
    }

    #[test]
    fn get_texture_atlas_region_uv_computes_normalized_coordinates() {
        let region = create_texture_atlas_region(Some(&TextureAtlasRegionLike {
            x: 0.0,
            y: 0.0,
            width: 128.0,
            height: 64.0,
            ..TextureAtlasRegionLike::default()
        }));
        let mut out = RectangleLike::default();
        get_texture_atlas_region_uv(&region, 256.0, 256.0, &mut out);
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 0.0);
        assert!((out.width - 0.5).abs() < 1e-6);
        assert!((out.height - 0.25).abs() < 1e-6);
    }

    #[test]
    fn get_texture_atlas_region_uv_offset_region() {
        let region = create_texture_atlas_region(Some(&TextureAtlasRegionLike {
            x: 128.0,
            y: 64.0,
            width: 64.0,
            height: 64.0,
            ..TextureAtlasRegionLike::default()
        }));
        let mut out = RectangleLike::default();
        get_texture_atlas_region_uv(&region, 256.0, 256.0, &mut out);
        assert!((out.x - 0.5).abs() < 1e-6);
        assert!((out.y - 0.25).abs() < 1e-6);
        assert!((out.width - 0.25).abs() < 1e-6);
        assert!((out.height - 0.25).abs() < 1e-6);
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
