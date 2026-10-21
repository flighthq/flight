use flight_textureatlas::{
    TextureAtlas, TextureAtlasRegionOptions, TextureAtlasRotation, create_texture_atlas_region,
};
use flight_xml::{XmlElement, parse_xml_document};

use crate::texture_atlas_page_meta::{parse_js_float, reset_texture_atlas_page_meta};

/// Parses Starling/Sparrow XML. The format carries a page name but no page dimensions or scale.
// flight-lint: allow(conform-params) D9: mutable output is first and the source chaining return is unit
pub fn parse_texture_atlas_starling_xml(atlas: &mut TextureAtlas, xml: &str) {
    atlas.regions.clear();
    reset_texture_atlas_page_meta(atlas);
    let Some(root) = parse_xml_document(xml) else {
        return;
    };
    let atlas_element = resolve_atlas_element(root);
    atlas.image_name = atlas_element.attributes.get("imagePath").cloned();
    let mut region_id = 0;
    for child in &atlas_element.children {
        let element = child.read().unwrap();
        if element.name != "SubTexture" {
            continue;
        }
        let attributes = &element.attributes;
        let Some(name) = attributes.get("name") else {
            continue;
        };
        let x = parse_attribute(attributes.get("x"), 0.0);
        let y = parse_attribute(attributes.get("y"), 0.0);
        let width = parse_attribute(attributes.get("width"), 0.0);
        let height = parse_attribute(attributes.get("height"), 0.0);
        let frame_width = attributes
            .get("frameWidth")
            .map(|value| parse_js_float(value));
        let frame_height = attributes
            .get("frameHeight")
            .map(|value| parse_js_float(value));
        let trimmed = frame_width.is_some() || attributes.contains_key("frameX");
        let rotated = attributes
            .get("rotated")
            .is_some_and(|value| value == "true");
        let pivot_x = attributes.get("pivotX").map(|value| parse_js_float(value));
        let pivot_y = attributes.get("pivotY").map(|value| parse_js_float(value));
        let source_x = attributes
            .get("frameX")
            .map_or(0.0, |value| -parse_js_float(value));
        let source_y = attributes
            .get("frameY")
            .map_or(0.0, |value| -parse_js_float(value));
        let region = create_texture_atlas_region(Some(&TextureAtlasRegionOptions {
            height: Some(height),
            id: Some(region_id),
            name: Some(name.clone()),
            original_height: if trimmed {
                Some(frame_height.unwrap_or(if rotated { width } else { height }))
            } else {
                None
            },
            original_width: if trimmed {
                Some(frame_width.unwrap_or(if rotated { height } else { width }))
            } else {
                None
            },
            page_name: None,
            pivot_x,
            pivot_y,
            rotation: Some(if rotated {
                TextureAtlasRotation::Clockwise90
            } else {
                TextureAtlasRotation::None
            }),
            source_x: Some(source_x),
            source_y: Some(source_y),
            trimmed: Some(trimmed),
            width: Some(width),
            x: Some(x),
            y: Some(y),
        }));
        atlas.regions.push(region);
        region_id += 1;
    }
}

fn parse_attribute(value: Option<&String>, default: f32) -> f32 {
    return value.map_or(default, |value| parse_js_float(value));
}

fn resolve_atlas_element(root: XmlElement) -> XmlElement {
    if root.name == "TextureAtlas" {
        return root;
    }
    for child in &root.children {
        let element = child.read().unwrap();
        if element.name == "TextureAtlas" {
            return element.clone();
        }
    }
    return root;
}
