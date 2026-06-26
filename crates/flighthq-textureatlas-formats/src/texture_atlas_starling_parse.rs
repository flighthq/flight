//! Starling / Sparrow XML atlas parser.
//!
//! Port of `textureAtlasStarlingParse.ts`. Parses the `<TextureAtlas>` +
//! `<SubTexture>` XML shape emitted by the Starling and Sparrow frameworks.

use flighthq_textureatlas::create_texture_atlas_region;
use flighthq_types::{TextureAtlas, TextureAtlasRegionLike};

use crate::xml_parse::parse_xml_document;

/// Parses a Starling / Sparrow XML string and returns a populated
/// [`TextureAtlas`].
///
/// The root element may be `<TextureAtlas>` directly or wrap it as a child.
/// Only `<SubTexture>` children are processed; elements without a `name`
/// attribute are skipped. Returns an empty atlas when the input contains no
/// recognizable XML.
pub fn parse_texture_atlas_starling(xml: &str) -> Result<TextureAtlas, String> {
    let mut atlas = flighthq_textureatlas::create_texture_atlas(None, vec![]);
    let root = match parse_xml_document(xml) {
        Some(r) => r,
        None => return Ok(atlas),
    };

    // The TextureAtlas element may be the root or a direct child.
    let atlas_el = if root.name == "TextureAtlas" {
        &root
    } else {
        match root.children.iter().find(|c| c.name == "TextureAtlas") {
            Some(el) => el,
            None => &root,
        }
    };

    for el in &atlas_el.children {
        if el.name != "SubTexture" {
            continue;
        }
        let name = match el.get_attribute("name") {
            Some(n) => n.to_owned(),
            None => continue,
        };

        let x: f32 = el.get_attribute("x").unwrap_or("0").parse().unwrap_or(0.0);
        let y: f32 = el.get_attribute("y").unwrap_or("0").parse().unwrap_or(0.0);
        let width: f32 = el
            .get_attribute("width")
            .unwrap_or("0")
            .parse()
            .unwrap_or(0.0);
        let height: f32 = el
            .get_attribute("height")
            .unwrap_or("0")
            .parse()
            .unwrap_or(0.0);

        let frame_width: Option<f32> = el.get_attribute("frameWidth").and_then(|v| v.parse().ok());
        let frame_height: Option<f32> =
            el.get_attribute("frameHeight").and_then(|v| v.parse().ok());
        let frame_x: Option<f32> = el.get_attribute("frameX").and_then(|v| v.parse().ok());
        let frame_y: Option<f32> = el.get_attribute("frameY").and_then(|v| v.parse().ok());

        // Trimmed when frameWidth or frameX is present (matching the TS rule).
        let trimmed = frame_width.is_some() || frame_x.is_some();
        let rotated = el.get_attribute("rotated") == Some("true");

        let pivot_x: Option<f32> = el.get_attribute("pivotX").and_then(|v| v.parse().ok());
        let pivot_y: Option<f32> = el.get_attribute("pivotY").and_then(|v| v.parse().ok());

        // source_x/Y are the negated frameX/Y offsets (TS: `-parseFloat(frameX)`).
        let source_x = frame_x.map(|fx| -fx).unwrap_or(0.0);
        let source_y = frame_y.map(|fy| -fy).unwrap_or(0.0);

        let id = atlas.regions.len() as u32;
        atlas
            .regions
            .push(create_texture_atlas_region(Some(&TextureAtlasRegionLike {
                height,
                id,
                name: Some(name),
                original_height: if trimmed {
                    Some(frame_height.unwrap_or(height))
                } else {
                    None
                },
                original_width: if trimmed {
                    Some(frame_width.unwrap_or(width))
                } else {
                    None
                },
                pivot_x,
                pivot_y,
                rotated,
                source_x,
                source_y,
                trimmed,
                width,
                x,
                y,
            })));
    }

    Ok(atlas)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    const SIMPLE_XML: &str = concat!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n",
        "<TextureAtlas imagePath=\"atlas.png\">\n",
        "  <SubTexture name=\"hero_idle\" x=\"0\" y=\"0\" width=\"64\" height=\"64\"/>\n",
        "  <SubTexture name=\"hero_walk\" x=\"64\" y=\"0\" width=\"48\" height=\"56\"\n",
        "    frameX=\"-8\" frameY=\"-4\" frameWidth=\"64\" frameHeight=\"64\"/>\n",
        "  <SubTexture name=\"hero_jump\" x=\"112\" y=\"0\" width=\"40\" height=\"50\" rotated=\"true\"/>\n",
        "  <SubTexture name=\"coin\" x=\"152\" y=\"0\" width=\"32\" height=\"32\" pivotX=\"16\" pivotY=\"16\"/>\n",
        "</TextureAtlas>"
    );

    mod parse_texture_atlas_starling {
        use super::*;

        #[test]
        fn populates_regions_from_starling_xml() {
            let atlas = parse_texture_atlas_starling(SIMPLE_XML).unwrap();
            assert_eq!(atlas.regions.len(), 4);
        }

        #[test]
        fn assigns_sequential_ids_starting_at_zero() {
            let atlas = parse_texture_atlas_starling(SIMPLE_XML).unwrap();
            assert_eq!(atlas.regions[0].id, 0);
            assert_eq!(atlas.regions[3].id, 3);
        }

        #[test]
        fn sets_region_name_from_subtexture_name_attribute() {
            let atlas = parse_texture_atlas_starling(SIMPLE_XML).unwrap();
            assert_eq!(atlas.regions[0].name.as_deref(), Some("hero_idle"));
            assert_eq!(atlas.regions[1].name.as_deref(), Some("hero_walk"));
        }

        #[test]
        fn sets_x_y_width_height_from_subtexture_attributes() {
            let atlas = parse_texture_atlas_starling(SIMPLE_XML).unwrap();
            let r = &atlas.regions[0];
            assert_eq!(r.x, 0.0);
            assert_eq!(r.y, 0.0);
            assert_eq!(r.width, 64.0);
            assert_eq!(r.height, 64.0);
        }

        #[test]
        fn sets_trimmed_fields_when_frame_x_or_frame_width_present() {
            let atlas = parse_texture_atlas_starling(SIMPLE_XML).unwrap();
            let walk = &atlas.regions[1];
            assert!(walk.trimmed);
            assert_eq!(walk.original_width, Some(64.0));
            assert_eq!(walk.original_height, Some(64.0));
            // source = -frameX = -(-8) = 8, -frameY = -(-4) = 4
            assert_eq!(walk.source_x, 8.0);
            assert_eq!(walk.source_y, 4.0);
        }

        #[test]
        fn marks_non_trimmed_regions_correctly() {
            let atlas = parse_texture_atlas_starling(SIMPLE_XML).unwrap();
            let idle = &atlas.regions[0];
            assert!(!idle.trimmed);
            assert!(idle.original_width.is_none());
            assert!(idle.original_height.is_none());
        }

        #[test]
        fn sets_rotated_on_regions_with_rotated_true() {
            let atlas = parse_texture_atlas_starling(SIMPLE_XML).unwrap();
            assert!(atlas.regions[2].rotated);
            assert!(!atlas.regions[0].rotated);
        }

        #[test]
        fn sets_pivot_when_pivot_attributes_present() {
            let atlas = parse_texture_atlas_starling(SIMPLE_XML).unwrap();
            let coin = &atlas.regions[3];
            assert_eq!(coin.pivot_x, Some(16.0));
            assert_eq!(coin.pivot_y, Some(16.0));
        }

        #[test]
        fn sets_null_pivot_when_pivot_attributes_absent() {
            let atlas = parse_texture_atlas_starling(SIMPLE_XML).unwrap();
            assert!(atlas.regions[0].pivot_x.is_none());
            assert!(atlas.regions[0].pivot_y.is_none());
        }

        #[test]
        fn returns_empty_atlas_when_no_subtexture_elements_exist() {
            let atlas =
                parse_texture_atlas_starling("<TextureAtlas imagePath=\"a.png\"></TextureAtlas>")
                    .unwrap();
            assert!(atlas.regions.is_empty());
        }

        #[test]
        fn returns_empty_atlas_for_empty_input() {
            let atlas = parse_texture_atlas_starling("").unwrap();
            assert!(atlas.regions.is_empty());
        }
    }
}
