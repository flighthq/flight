use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticSeverity, report_import_diagnostic,
};
use flight_spritesheet::{SpritesheetData, SpritesheetDataOptions, create_spritesheet_data};
use flight_textureatlas::TextureAtlas;
use flight_textureatlas_formats::parse_texture_atlas_starling_xml;
use flight_xml::{XmlElement, parse_xml_document};

use crate::common::{frame_from_region, infer_animations};
use crate::types::*;

pub fn parse_starling_spritesheet(
    xml: &str,
    options: Option<&StarlingParseOptions>,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> SpritesheetData {
    let document = z_a_parse_starling_xml(xml);
    return z_b_starling_document_to_data(xml, &document, options, diagnostics);
}

pub fn parse_starling_spritesheet_document(
    xml: &str,
    options: Option<&StarlingParseOptions>,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> StarlingParsed {
    let document = z_a_parse_starling_xml(xml);
    return StarlingParsed {
        data: z_b_starling_document_to_data(xml, &document, options, diagnostics),
        document,
    };
}

fn z_a_parse_starling_xml(xml: &str) -> StarlingDocument {
    let Some(root) = parse_xml_document(xml) else {
        return StarlingDocument {
            image_path: String::new(),
            sub_textures: Vec::new(),
        };
    };
    let atlas = z_c_resolve_starling_atlas(root);
    let mut sub_textures = Vec::new();
    for child in &atlas.children {
        let child = child.read().unwrap();
        if child.name != "SubTexture" {
            continue;
        }
        let Some(name) = child.attributes.get("name") else {
            continue;
        };
        sub_textures.push(StarlingSubTexture {
            frame_height: z_e_optional_attribute(&child, "frameHeight"),
            frame_width: z_e_optional_attribute(&child, "frameWidth"),
            frame_x: z_e_optional_attribute(&child, "frameX"),
            frame_y: z_e_optional_attribute(&child, "frameY"),
            height: z_d_attribute(&child, "height"),
            name: name.clone(),
            pivot_x: z_e_optional_attribute(&child, "pivotX"),
            pivot_y: z_e_optional_attribute(&child, "pivotY"),
            rotated: child.attributes.get("rotated").map(|value| value == "true"),
            width: z_d_attribute(&child, "width"),
            x: z_d_attribute(&child, "x"),
            y: z_d_attribute(&child, "y"),
        });
    }
    return StarlingDocument {
        image_path: atlas
            .attributes
            .get("imagePath")
            .cloned()
            .unwrap_or_default(),
        sub_textures,
    };
}

fn z_b_starling_document_to_data(
    xml: &str,
    document: &StarlingDocument,
    options: Option<&StarlingParseOptions>,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> SpritesheetData {
    let options = options.copied().unwrap_or_default();
    let frame_duration = options.frame_duration.unwrap_or(100.0);
    let image_width = options.image_width.unwrap_or(0.0);
    let image_height = options.image_height.unwrap_or(0.0);
    let mut atlas = TextureAtlas::default();
    parse_texture_atlas_starling_xml(&mut atlas, xml);
    let frames = atlas
        .regions
        .iter()
        .map(|region| frame_from_region(&region.read().unwrap(), true))
        .collect::<Vec<_>>();
    let frame_names = frames
        .iter()
        .map(|frame| frame.name.clone())
        .collect::<Vec<_>>();
    if image_width <= 0.0 || image_height <= 0.0 {
        report_import_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Recover,
            "spritesheet.starling.missing-dimensions",
            "documentToData",
            None,
        );
    }
    return create_spritesheet_data(Some(SpritesheetDataOptions {
        animations: Some(infer_animations(&frame_names, frame_duration)),
        frames: Some(frames),
        image_file: Some(document.image_path.clone()),
        image_height: Some(image_height),
        image_width: Some(image_width),
        scale: Some(1.0),
    }));
}

fn z_c_resolve_starling_atlas(root: XmlElement) -> XmlElement {
    if root.name == "TextureAtlas" {
        return root;
    }
    for child in &root.children {
        let child = child.read().unwrap();
        if child.name == "TextureAtlas" {
            return child.clone();
        }
    }
    return root;
}

fn z_d_attribute(element: &XmlElement, name: &str) -> f32 {
    return z_e_optional_attribute(element, name).unwrap_or(0.0);
}

fn z_e_optional_attribute(element: &XmlElement, name: &str) -> Option<f32> {
    return element
        .attributes
        .get(name)
        .map(|value| value.parse::<f32>().unwrap_or(f32::NAN));
}
