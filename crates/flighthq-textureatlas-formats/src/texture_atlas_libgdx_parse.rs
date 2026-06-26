//! libGDX / Spine text-format atlas parser.
//!
//! Port of `textureAtlasLibgdxParse.ts`. Handles single and multi-page atlases;
//! regions from all pages are concatenated in the returned atlas.
//!
//! Format layout:
//! ```text
//! atlas.png           ← page image file name (no colon)
//! size: W,H           ← page-level key:value pairs (skipped)
//! …
//! region_name         ← region name (no colon)
//!   rotate: false     ← region key:value pairs
//!   xy: X, Y
//!   size: W, H
//!   orig: OW, OH
//!   offset: OX, OY
//!   index: -1         ← index ≥ 0 → name becomes "region_name_<index>"
//! ```

use flighthq_textureatlas::create_texture_atlas_region;
use flighthq_types::{TextureAtlas, TextureAtlasRegionLike};

/// Parses a libGDX `.atlas` text string and returns a populated [`TextureAtlas`].
///
/// Regions whose `index` field is ≥ 0 have the index appended to their name
/// as `"<name>_<index>"` (matching the libGDX convention for animation frames).
pub fn parse_texture_atlas_libgdx(text: &str) -> Result<TextureAtlas, String> {
    let mut atlas = flighthq_textureatlas::create_texture_atlas(None, vec![]);
    let lines: Vec<&str> = text.split('\n').map(|l| l.trim_end_matches('\r')).collect();
    let len = lines.len();
    let mut i = 0usize;

    while i < len {
        // Skip blank lines (page separator or leading whitespace).
        while i < len && lines[i].trim().is_empty() {
            i += 1;
        }
        if i >= len {
            break;
        }

        // Page header: first non-blank line is the image file name (no colon).
        let maybe_image = lines[i].trim();
        if !maybe_image.contains(':') {
            i += 1; // consume image filename
            // Skip page-level key:value pairs.
            while i < len && !lines[i].trim().is_empty() {
                if lines[i].trim().contains(':') {
                    i += 1;
                } else {
                    break;
                }
            }
        }

        // Read regions until blank line or EOF.
        while i < len && !lines[i].trim().is_empty() {
            let line = lines[i].trim();
            // A line with no colon is a region name.
            if !line.contains(':') {
                let region_name = line.to_owned();
                i += 1;

                let mut atlas_x = 0.0f32;
                let mut atlas_y = 0.0f32;
                let mut atlas_w = 0.0f32;
                let mut atlas_h = 0.0f32;
                let mut orig_w = 0.0f32;
                let mut orig_h = 0.0f32;
                let mut offset_x = 0.0f32;
                let mut offset_y = 0.0f32;
                let mut rotated = false;
                let mut index: i32 = -1;

                // Read region key:value pairs.
                while i < len {
                    let kv = lines[i].trim();
                    if kv.is_empty() || !kv.contains(':') {
                        break;
                    }
                    let colon = kv.find(':').unwrap();
                    let key = kv[..colon].trim();
                    let value = kv[colon + 1..].trim();
                    i += 1;

                    match key {
                        "rotate" => {
                            rotated = value == "true";
                        }
                        "xy" => {
                            let parts: Vec<&str> = value.split(',').collect();
                            atlas_x = parts
                                .first()
                                .and_then(|s| s.trim().parse().ok())
                                .unwrap_or(0.0);
                            atlas_y = parts
                                .get(1)
                                .and_then(|s| s.trim().parse().ok())
                                .unwrap_or(0.0);
                        }
                        "size" => {
                            let parts: Vec<&str> = value.split(',').collect();
                            atlas_w = parts
                                .first()
                                .and_then(|s| s.trim().parse().ok())
                                .unwrap_or(0.0);
                            atlas_h = parts
                                .get(1)
                                .and_then(|s| s.trim().parse().ok())
                                .unwrap_or(0.0);
                        }
                        "orig" => {
                            let parts: Vec<&str> = value.split(',').collect();
                            orig_w = parts
                                .first()
                                .and_then(|s| s.trim().parse().ok())
                                .unwrap_or(0.0);
                            orig_h = parts
                                .get(1)
                                .and_then(|s| s.trim().parse().ok())
                                .unwrap_or(0.0);
                        }
                        "offset" => {
                            let parts: Vec<&str> = value.split(',').collect();
                            offset_x = parts
                                .first()
                                .and_then(|s| s.trim().parse().ok())
                                .unwrap_or(0.0);
                            offset_y = parts
                                .get(1)
                                .and_then(|s| s.trim().parse().ok())
                                .unwrap_or(0.0);
                        }
                        "index" => {
                            index = value.parse().unwrap_or(-1);
                        }
                        _ => {}
                    }
                }

                let name = if index >= 0 {
                    format!("{region_name}_{index}")
                } else {
                    region_name
                };

                // Trimmed when orig differs from packed size.
                let trimmed =
                    orig_w > 0.0 && orig_h > 0.0 && (orig_w != atlas_w || orig_h != atlas_h);

                let id = atlas.regions.len() as u32;
                atlas
                    .regions
                    .push(create_texture_atlas_region(Some(&TextureAtlasRegionLike {
                        height: atlas_h,
                        id,
                        name: Some(name),
                        original_height: if trimmed { Some(orig_h) } else { None },
                        original_width: if trimmed { Some(orig_w) } else { None },
                        pivot_x: None,
                        pivot_y: None,
                        rotated,
                        source_x: offset_x,
                        source_y: offset_y,
                        trimmed,
                        width: atlas_w,
                        x: atlas_x,
                        y: atlas_y,
                    })));
            } else {
                // Unexpected keyed lines at page level; skip.
                i += 1;
            }
        }
    }

    Ok(atlas)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    const SIMPLE_ATLAS: &str = "\natlas.png\nsize: 256,256\nformat: RGBA8888\nfilter: Nearest,Nearest\nrepeat: none\nhero_idle\n  rotate: false\n  xy: 0, 0\n  size: 64, 64\n  orig: 64, 64\n  offset: 0, 0\n  index: -1\nhero_walk\n  rotate: false\n  xy: 64, 0\n  size: 48, 56\n  orig: 64, 64\n  offset: 8, 4\n  index: -1\nhero_run\n  rotate: true\n  xy: 112, 0\n  size: 32, 48\n  orig: 48, 32\n  offset: 0, 0\n  index: -1\n";

    mod parse_texture_atlas_libgdx {
        use super::*;

        #[test]
        fn populates_regions_from_libgdx_atlas() {
            let atlas = parse_texture_atlas_libgdx(SIMPLE_ATLAS).unwrap();
            assert_eq!(atlas.regions.len(), 3);
        }

        #[test]
        fn assigns_sequential_ids_starting_at_zero() {
            let atlas = parse_texture_atlas_libgdx(SIMPLE_ATLAS).unwrap();
            assert_eq!(atlas.regions[0].id, 0);
            assert_eq!(atlas.regions[2].id, 2);
        }

        #[test]
        fn sets_region_name() {
            let atlas = parse_texture_atlas_libgdx(SIMPLE_ATLAS).unwrap();
            assert_eq!(atlas.regions[0].name.as_deref(), Some("hero_idle"));
            assert_eq!(atlas.regions[1].name.as_deref(), Some("hero_walk"));
        }

        #[test]
        fn sets_x_y_width_height_from_xy_and_size() {
            let atlas = parse_texture_atlas_libgdx(SIMPLE_ATLAS).unwrap();
            let r0 = &atlas.regions[0];
            assert_eq!(r0.x, 0.0);
            assert_eq!(r0.y, 0.0);
            assert_eq!(r0.width, 64.0);
            assert_eq!(r0.height, 64.0);
            let r1 = &atlas.regions[1];
            assert_eq!(r1.x, 64.0);
            assert_eq!(r1.width, 48.0);
        }

        #[test]
        fn sets_trimmed_fields_when_orig_differs_from_size() {
            let atlas = parse_texture_atlas_libgdx(SIMPLE_ATLAS).unwrap();
            let walk = &atlas.regions[1];
            assert!(walk.trimmed);
            assert_eq!(walk.original_width, Some(64.0));
            assert_eq!(walk.original_height, Some(64.0));
            assert_eq!(walk.source_x, 8.0);
            assert_eq!(walk.source_y, 4.0);
        }

        #[test]
        fn marks_non_trimmed_regions_correctly() {
            let atlas = parse_texture_atlas_libgdx(SIMPLE_ATLAS).unwrap();
            let idle = &atlas.regions[0];
            assert!(!idle.trimmed);
            assert!(idle.original_width.is_none());
        }

        #[test]
        fn sets_rotated_on_rotated_regions() {
            let atlas = parse_texture_atlas_libgdx(SIMPLE_ATLAS).unwrap();
            assert!(atlas.regions[2].rotated);
            assert!(!atlas.regions[0].rotated);
        }

        #[test]
        fn appends_index_to_name_when_index_is_non_negative() {
            let indexed = "\natlas.png\nsize: 256,256\nformat: RGBA8888\nfilter: Nearest,Nearest\nrepeat: none\nhero_walk\n  rotate: false\n  xy: 0, 0\n  size: 64, 64\n  orig: 64, 64\n  offset: 0, 0\n  index: 1\n";
            let atlas = parse_texture_atlas_libgdx(indexed).unwrap();
            assert_eq!(atlas.regions[0].name.as_deref(), Some("hero_walk_1"));
        }

        #[test]
        fn returns_empty_atlas_for_empty_input() {
            let atlas = parse_texture_atlas_libgdx("").unwrap();
            assert!(atlas.regions.is_empty());
        }
    }
}
