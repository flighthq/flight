//! TexturePacker JSON atlas parser.
//!
//! Port of `textureAtlasPackerParse.ts`. Supports both the JSON-hash variant
//! (frames is a plain object keyed by frame name) and the JSON-array variant
//! (frames is an array where each entry carries a `filename` field).

use flighthq_textureatlas::create_texture_atlas_region;
use flighthq_types::{TextureAtlas, TextureAtlasRegionLike};

use crate::json::{JsonValue, parse_json};

/// Parses an already-parsed TexturePacker JSON document into a populated [`TextureAtlas`].
pub fn parse_texture_atlas_packer_document(
    doc: &JsonValue,
    strip_path_prefix: bool,
) -> Result<TextureAtlas, String> {
    let mut atlas = flighthq_textureatlas::create_texture_atlas(None, vec![]);
    parse_packer_frames(doc, &mut atlas, strip_path_prefix)?;
    Ok(atlas)
}

/// Parses a TexturePacker JSON string and returns a populated [`TextureAtlas`].
///
/// Supports both the JSON-hash and JSON-array frame shapes. When
/// `strip_path_prefix` is true, leading path components are stripped from frame
/// names before storing them as region names (e.g. `"sprites/hero.png"` becomes
/// `"hero.png"`).
pub fn parse_texture_atlas_packer(
    json: &str,
    strip_path_prefix: bool,
) -> Result<TextureAtlas, String> {
    let doc = parse_json(json)?;
    parse_texture_atlas_packer_document(&doc, strip_path_prefix)
}

fn parse_packer_frames(
    doc: &JsonValue,
    atlas: &mut TextureAtlas,
    strip_path_prefix: bool,
) -> Result<(), String> {
    let frames = doc.get("frames").ok_or("missing frames key")?;

    if let Some(arr) = frames.as_array() {
        for entry in arr {
            let filename = entry
                .get("filename")
                .and_then(JsonValue::as_text)
                .ok_or("array frame missing filename")?;
            apply_packer_frame(atlas, filename, entry, strip_path_prefix)?;
        }
    } else if let Some(obj) = frames.as_object() {
        for (name, entry) in obj {
            apply_packer_frame(atlas, name, entry, strip_path_prefix)?;
        }
    } else {
        return Err("frames must be an object or array".to_string());
    }

    Ok(())
}

fn apply_packer_frame(
    atlas: &mut TextureAtlas,
    name: &str,
    entry: &JsonValue,
    strip_path_prefix: bool,
) -> Result<(), String> {
    let normalized = normalize_packer_frame_name(name, strip_path_prefix);

    let frame = entry.get("frame").ok_or("frame entry missing frame rect")?;
    let fx = frame.get("x").and_then(JsonValue::as_number).unwrap_or(0.0) as f32;
    let fy = frame.get("y").and_then(JsonValue::as_number).unwrap_or(0.0) as f32;
    let fw = frame.get("w").and_then(JsonValue::as_number).unwrap_or(0.0) as f32;
    let fh = frame.get("h").and_then(JsonValue::as_number).unwrap_or(0.0) as f32;

    let rotated = entry
        .get("rotated")
        .and_then(JsonValue::as_bool)
        .unwrap_or(false);
    let trimmed = entry
        .get("trimmed")
        .and_then(JsonValue::as_bool)
        .unwrap_or(false);

    let source_size = entry.get("sourceSize");
    let sprite_source_size = entry.get("spriteSourceSize");
    let pivot = entry.get("pivot");

    let original_width = if trimmed {
        Some(
            source_size
                .and_then(|s| s.get("w"))
                .and_then(JsonValue::as_number)
                .unwrap_or(0.0) as f32,
        )
    } else {
        None
    };
    let original_height = if trimmed {
        Some(
            source_size
                .and_then(|s| s.get("h"))
                .and_then(JsonValue::as_number)
                .unwrap_or(0.0) as f32,
        )
    } else {
        None
    };

    let source_x = sprite_source_size
        .and_then(|s| s.get("x"))
        .and_then(JsonValue::as_number)
        .unwrap_or(0.0) as f32;
    let source_y = sprite_source_size
        .and_then(|s| s.get("y"))
        .and_then(JsonValue::as_number)
        .unwrap_or(0.0) as f32;

    let pivot_x = pivot
        .and_then(|p| p.get("x"))
        .and_then(JsonValue::as_number)
        .map(|v| v as f32);
    let pivot_y = pivot
        .and_then(|p| p.get("y"))
        .and_then(JsonValue::as_number)
        .map(|v| v as f32);

    // When rotated, the packed rectangle is transposed: logical width = packed
    // h, logical height = packed w (matching the TS `rotated ? frame.h : frame.w`
    // convention).
    let width = if rotated { fh } else { fw };
    let height = if rotated { fw } else { fh };

    let id = atlas.regions.len() as u32;
    atlas
        .regions
        .push(create_texture_atlas_region(Some(&TextureAtlasRegionLike {
            height,
            id,
            name: Some(normalized),
            original_height,
            original_width,
            pivot_x,
            pivot_y,
            rotated,
            source_x,
            source_y,
            trimmed,
            width,
            x: fx,
            y: fy,
        })));

    Ok(())
}

/// Strips leading path components from a frame name when `strip` is true.
///
/// Matches the TS `normalizeFrameName` behaviour: find the last `/` or `\` and
/// return everything after it. When neither is present the name is returned
/// unchanged.
fn normalize_packer_frame_name(name: &str, strip: bool) -> String {
    if !strip {
        return name.to_owned();
    }
    let last_slash = name.rfind('/').or_else(|| name.rfind('\\'));
    match last_slash {
        Some(pos) => name[pos + 1..].to_owned(),
        None => name.to_owned(),
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    const HASH_JSON: &str = r#"{
  "frames": {
    "hero_idle_0.png": {
      "frame": {"x": 0, "y": 0, "w": 64, "h": 64},
      "pivot": {"x": 0.5, "y": 0.5},
      "rotated": false,
      "sourceSize": {"w": 64, "h": 64},
      "spriteSourceSize": {"x": 0, "y": 0, "w": 64, "h": 64},
      "trimmed": false
    },
    "hero_walk_0.png": {
      "frame": {"x": 64, "y": 0, "w": 48, "h": 56},
      "pivot": {"x": 0.5, "y": 1.0},
      "rotated": false,
      "sourceSize": {"w": 64, "h": 64},
      "spriteSourceSize": {"x": 8, "y": 4, "w": 48, "h": 56},
      "trimmed": true
    }
  },
  "meta": {
    "app": "https://www.codeandweb.com/texturepacker",
    "format": "RGBA8888",
    "image": "atlas.png",
    "scale": 1,
    "size": {"w": 256, "h": 256},
    "version": "1.0"
  }
}"#;

    const ARRAY_JSON: &str = r#"{
  "frames": [
    {
      "filename": "tile_0.png",
      "frame": {"x": 0, "y": 0, "w": 32, "h": 32},
      "rotated": false,
      "sourceSize": {"w": 32, "h": 32},
      "spriteSourceSize": {"x": 0, "y": 0, "w": 32, "h": 32},
      "trimmed": false
    },
    {
      "filename": "tile_1.png",
      "frame": {"x": 32, "y": 0, "w": 32, "h": 32},
      "rotated": true,
      "sourceSize": {"w": 32, "h": 32},
      "spriteSourceSize": {"x": 0, "y": 0, "w": 32, "h": 32},
      "trimmed": false
    }
  ],
  "meta": {
    "app": "https://www.codeandweb.com/texturepacker",
    "format": "RGBA8888",
    "image": "tiles.png",
    "scale": "1",
    "size": {"w": 64, "h": 32},
    "version": "1.0"
  }
}"#;

    mod parse_texture_atlas_packer {
        use super::*;

        #[test]
        fn populates_regions_from_hash_format() {
            let atlas = parse_texture_atlas_packer(HASH_JSON, false).unwrap();
            assert_eq!(atlas.regions.len(), 2);
        }

        #[test]
        fn populates_regions_from_array_format() {
            let atlas = parse_texture_atlas_packer(ARRAY_JSON, false).unwrap();
            assert_eq!(atlas.regions.len(), 2);
        }

        #[test]
        fn sets_region_name_from_frame_key_in_hash_format() {
            let atlas = parse_texture_atlas_packer(HASH_JSON, false).unwrap();
            let names: Vec<Option<&str>> =
                atlas.regions.iter().map(|r| r.name.as_deref()).collect();
            assert!(names.contains(&Some("hero_idle_0.png")));
            assert!(names.contains(&Some("hero_walk_0.png")));
        }

        #[test]
        fn sets_region_name_from_filename_in_array_format() {
            let atlas = parse_texture_atlas_packer(ARRAY_JSON, false).unwrap();
            assert_eq!(atlas.regions[0].name.as_deref(), Some("tile_0.png"));
            assert_eq!(atlas.regions[1].name.as_deref(), Some("tile_1.png"));
        }

        #[test]
        fn assigns_sequential_ids_starting_at_zero() {
            let atlas = parse_texture_atlas_packer(ARRAY_JSON, false).unwrap();
            assert_eq!(atlas.regions[0].id, 0);
            assert_eq!(atlas.regions[1].id, 1);
        }

        #[test]
        fn populates_x_y_width_height_from_frame_rect() {
            let atlas = parse_texture_atlas_packer(ARRAY_JSON, false).unwrap();
            let r = &atlas.regions[0];
            assert_eq!(r.x, 0.0);
            assert_eq!(r.y, 0.0);
            assert_eq!(r.width, 32.0);
            assert_eq!(r.height, 32.0);
        }

        #[test]
        fn sets_trimmed_fields_when_frame_is_trimmed() {
            let atlas = parse_texture_atlas_packer(HASH_JSON, false).unwrap();
            let walk = atlas
                .regions
                .iter()
                .find(|r| r.name.as_deref() == Some("hero_walk_0.png"))
                .unwrap();
            assert!(walk.trimmed);
            assert_eq!(walk.source_x, 8.0);
            assert_eq!(walk.source_y, 4.0);
            assert_eq!(walk.original_width, Some(64.0));
            assert_eq!(walk.original_height, Some(64.0));
        }

        #[test]
        fn sets_null_original_dimensions_when_not_trimmed() {
            let atlas = parse_texture_atlas_packer(HASH_JSON, false).unwrap();
            let idle = atlas
                .regions
                .iter()
                .find(|r| r.name.as_deref() == Some("hero_idle_0.png"))
                .unwrap();
            assert!(!idle.trimmed);
            assert!(idle.original_width.is_none());
            assert!(idle.original_height.is_none());
        }

        #[test]
        fn sets_pivot_when_present() {
            let atlas = parse_texture_atlas_packer(HASH_JSON, false).unwrap();
            let idle = atlas
                .regions
                .iter()
                .find(|r| r.name.as_deref() == Some("hero_idle_0.png"))
                .unwrap();
            assert_eq!(idle.pivot_x, Some(0.5));
            assert_eq!(idle.pivot_y, Some(0.5));
        }

        #[test]
        fn sets_null_pivot_when_absent() {
            let atlas = parse_texture_atlas_packer(ARRAY_JSON, false).unwrap();
            assert!(atlas.regions[0].pivot_x.is_none());
            assert!(atlas.regions[0].pivot_y.is_none());
        }

        #[test]
        fn sets_rotated_on_rotated_regions() {
            let atlas = parse_texture_atlas_packer(ARRAY_JSON, false).unwrap();
            assert!(!atlas.regions[0].rotated);
            assert!(atlas.regions[1].rotated);
        }

        #[test]
        fn swaps_width_height_for_rotated_regions() {
            let rotated_json = r#"{
  "frames": [
    {
      "filename": "rotated.png",
      "frame": {"x": 0, "y": 0, "w": 20, "h": 40},
      "rotated": true,
      "sourceSize": {"w": 40, "h": 20},
      "spriteSourceSize": {"x": 0, "y": 0, "w": 40, "h": 20},
      "trimmed": false
    }
  ],
  "meta": {"app": "tp", "format": "RGBA8888", "image": "a.png", "scale": 1, "size": {"w": 64, "h": 64}, "version": "1.0"}
}"#;
            let atlas = parse_texture_atlas_packer(rotated_json, false).unwrap();
            // Rotated: logical width = packed h (40), logical height = packed w (20).
            assert_eq!(atlas.regions[0].width, 40.0);
            assert_eq!(atlas.regions[0].height, 20.0);
        }

        #[test]
        fn strip_path_prefix_removes_leading_directories() {
            let json = r#"{
  "frames": {
    "sprites/hero.png": {
      "frame": {"x": 0, "y": 0, "w": 32, "h": 32},
      "rotated": false,
      "sourceSize": {"w": 32, "h": 32},
      "spriteSourceSize": {"x": 0, "y": 0, "w": 32, "h": 32},
      "trimmed": false
    }
  },
  "meta": {"app": "tp", "format": "RGBA8888", "image": "a.png", "scale": 1, "size": {"w": 64, "h": 64}, "version": "1.0"}
}"#;
            let atlas = parse_texture_atlas_packer(json, true).unwrap();
            assert_eq!(atlas.regions[0].name.as_deref(), Some("hero.png"));
        }

        #[test]
        fn returns_error_on_invalid_json() {
            assert!(parse_texture_atlas_packer("{not valid", false).is_err());
        }

        #[test]
        fn returns_error_when_frames_key_is_missing() {
            assert!(parse_texture_atlas_packer("{\"meta\": {}}", false).is_err());
        }
    }
}
