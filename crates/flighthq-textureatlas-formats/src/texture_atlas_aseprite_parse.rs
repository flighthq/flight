//! Aseprite JSON atlas parser.
//!
//! Port of `textureAtlasAsepriteParse.ts`. Supports both the JSON-hash variant
//! (frames is a plain object keyed by frame name) and the JSON-array variant
//! (frames is an array where each entry carries a `filename` field).
//!
//! Aseprite does not export pivot data; `pivot_x` and `pivot_y` are always
//! `None`. Width and height are taken directly from the `frame` rect — unlike
//! TexturePacker, Aseprite does not rotate packed frames.

use flighthq_textureatlas::create_texture_atlas_region;
use flighthq_types::{TextureAtlas, TextureAtlasRegionLike};

use crate::json::{JsonValue, parse_json};

/// Parses an Aseprite JSON string and returns a populated [`TextureAtlas`].
///
/// Supports both the JSON-hash and JSON-array frame shapes.
pub fn parse_texture_atlas_aseprite(json: &str) -> Result<TextureAtlas, String> {
    let doc = parse_json(json)?;
    let mut atlas = flighthq_textureatlas::create_texture_atlas(None, vec![]);

    let frames = doc.get("frames").ok_or("missing frames key")?;

    if let Some(arr) = frames.as_array() {
        // Array format: each entry carries a filename field.
        for entry in arr {
            let filename = entry
                .get("filename")
                .and_then(JsonValue::as_text)
                .ok_or("array frame missing filename")?;
            apply_aseprite_frame(&mut atlas, filename, entry)?;
        }
    } else if let Some(obj) = frames.as_object() {
        // Hash format: object key is the frame name.
        for (name, entry) in obj {
            apply_aseprite_frame(&mut atlas, name, entry)?;
        }
    } else {
        return Err("frames must be an object or array".to_string());
    }

    Ok(atlas)
}

fn apply_aseprite_frame(
    atlas: &mut TextureAtlas,
    name: &str,
    entry: &JsonValue,
) -> Result<(), String> {
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

    let id = atlas.regions.len() as u32;
    atlas
        .regions
        .push(create_texture_atlas_region(Some(&TextureAtlasRegionLike {
            height: fh,
            id,
            name: Some(name.to_owned()),
            original_height,
            original_width,
            pivot_x: None,
            pivot_y: None,
            rotated,
            source_x,
            source_y,
            trimmed,
            width: fw,
            x: fx,
            y: fy,
        })));

    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    const HASH_JSON: &str = r#"{
  "frames": {
    "hero_idle.png": {
      "duration": 100,
      "frame": {"x": 0, "y": 0, "w": 64, "h": 64},
      "rotated": false,
      "sourceSize": {"w": 64, "h": 64},
      "spriteSourceSize": {"x": 0, "y": 0, "w": 64, "h": 64},
      "trimmed": false
    },
    "hero_walk.png": {
      "duration": 80,
      "frame": {"x": 64, "y": 0, "w": 48, "h": 56},
      "rotated": false,
      "sourceSize": {"w": 64, "h": 64},
      "spriteSourceSize": {"x": 8, "y": 4, "w": 48, "h": 56},
      "trimmed": true
    }
  },
  "meta": {
    "app": "https://www.aseprite.org/",
    "format": "RGBA8888",
    "image": "atlas.png",
    "scale": 1,
    "size": {"w": 256, "h": 256},
    "version": "1.3"
  }
}"#;

    const ARRAY_JSON: &str = r#"{
  "frames": [
    {
      "duration": 100,
      "filename": "tile_0.png",
      "frame": {"x": 0, "y": 0, "w": 32, "h": 32},
      "rotated": false,
      "sourceSize": {"w": 32, "h": 32},
      "spriteSourceSize": {"x": 0, "y": 0, "w": 32, "h": 32},
      "trimmed": false
    }
  ],
  "meta": {
    "app": "https://www.aseprite.org/",
    "format": "RGBA8888",
    "image": "tiles.png",
    "scale": "1",
    "size": {"w": 32, "h": 32},
    "version": "1.3"
  }
}"#;

    mod parse_texture_atlas_aseprite {
        use super::*;

        #[test]
        fn populates_regions_from_hash_format() {
            let atlas = parse_texture_atlas_aseprite(HASH_JSON).unwrap();
            assert_eq!(atlas.regions.len(), 2);
        }

        #[test]
        fn populates_regions_from_array_format() {
            let atlas = parse_texture_atlas_aseprite(ARRAY_JSON).unwrap();
            assert_eq!(atlas.regions.len(), 1);
            assert_eq!(atlas.regions[0].name.as_deref(), Some("tile_0.png"));
        }

        #[test]
        fn assigns_sequential_ids_starting_at_zero() {
            let atlas = parse_texture_atlas_aseprite(ARRAY_JSON).unwrap();
            assert_eq!(atlas.regions[0].id, 0);
        }

        #[test]
        fn sets_x_y_width_height_from_frame() {
            let atlas = parse_texture_atlas_aseprite(ARRAY_JSON).unwrap();
            let r = &atlas.regions[0];
            assert_eq!(r.x, 0.0);
            assert_eq!(r.y, 0.0);
            assert_eq!(r.width, 32.0);
            assert_eq!(r.height, 32.0);
        }

        #[test]
        fn sets_trimmed_fields_when_frame_is_trimmed() {
            let atlas = parse_texture_atlas_aseprite(HASH_JSON).unwrap();
            let walk = atlas
                .regions
                .iter()
                .find(|r| r.name.as_deref() == Some("hero_walk.png"))
                .unwrap();
            assert!(walk.trimmed);
            assert_eq!(walk.original_width, Some(64.0));
            assert_eq!(walk.original_height, Some(64.0));
            assert_eq!(walk.source_x, 8.0);
            assert_eq!(walk.source_y, 4.0);
        }

        #[test]
        fn sets_null_original_dimensions_when_not_trimmed() {
            let atlas = parse_texture_atlas_aseprite(HASH_JSON).unwrap();
            let idle = atlas
                .regions
                .iter()
                .find(|r| r.name.as_deref() == Some("hero_idle.png"))
                .unwrap();
            assert!(!idle.trimmed);
            assert!(idle.original_width.is_none());
            assert!(idle.original_height.is_none());
        }

        #[test]
        fn sets_null_pivot_aseprite_does_not_export_pivot() {
            let atlas = parse_texture_atlas_aseprite(ARRAY_JSON).unwrap();
            assert!(atlas.regions[0].pivot_x.is_none());
            assert!(atlas.regions[0].pivot_y.is_none());
        }

        #[test]
        fn returns_error_on_invalid_json() {
            assert!(parse_texture_atlas_aseprite("{not valid").is_err());
        }

        #[test]
        fn returns_error_when_frames_key_is_missing() {
            assert!(parse_texture_atlas_aseprite("{\"meta\": {}}").is_err());
        }
    }
}
