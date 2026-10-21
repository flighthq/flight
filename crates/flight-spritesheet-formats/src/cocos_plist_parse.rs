use std::collections::HashMap;

use flight_entity::{Record, entries, get_record_value, set_record_value};
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
    report_import_diagnostic,
};
use flight_spritesheet::{
    SpritesheetData, SpritesheetDataOptions, SpritesheetFrameData, SpritesheetFrameDataOptions,
    create_spritesheet_data, create_spritesheet_frame_data,
};
use flight_xml::{XmlElement, parse_xml_document};
use regex::Regex;

use crate::types::*;

pub fn parse_cocos_plist_spritesheet(
    xml: &str,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> SpritesheetData {
    return z_b_cocos_document_to_data(&z_a_parse_cocos_plist_xml(xml, diagnostics));
}

pub fn parse_cocos_plist_spritesheet_document(
    xml: &str,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> CocosPlistParsed {
    let document = z_a_parse_cocos_plist_xml(xml, diagnostics);
    return CocosPlistParsed {
        data: z_b_cocos_document_to_data(&document),
        document,
    };
}

fn z_a_parse_cocos_plist_xml(
    xml: &str,
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> CocosPlistDocument {
    let root = parse_xml_document(xml);
    let root_dict = root.and_then(|root| {
        if root.name == "dict" {
            return Some(root);
        }
        if root.name == "plist" {
            for child in &root.children {
                let child = child.read().unwrap();
                if child.name == "dict" {
                    return Some(child.clone());
                }
            }
        }
        return None;
    });
    let Some(root_dict) = root_dict else {
        return z_j_empty_cocos_document();
    };
    let root_map = z_d_dict_to_map(&root_dict);
    let metadata =
        get_record_value(&root_map, "metadata").map_or_else(z_i_default_cocos_metadata, |meta| {
            if meta.name != "dict" {
                return z_i_default_cocos_metadata();
            }
            let values = z_d_dict_to_map(meta);
            let texture_file_name = z_h_text_value(get_record_value(&values, "textureFileName"));
            CocosPlistMetadata {
                format: z_g_integer_value(get_record_value(&values, "format")),
                size: z_h_text_value(get_record_value(&values, "size")),
                texture_file_name: if texture_file_name.is_empty() {
                    z_h_text_value(get_record_value(&values, "realTextureFileName"))
                } else {
                    texture_file_name
                },
            }
        });
    let mut frames = Record::default();
    if let Some(frames_element) = get_record_value(&root_map, "frames") {
        if frames_element.name == "dict" {
            let values = z_d_dict_to_map(frames_element);
            for (frame_name, frame_element) in entries(&values) {
                if frame_element.name != "dict" {
                    continue;
                }
                let frame_map = z_d_dict_to_map(frame_element);
                let has_sprite_fields = get_record_value(&frame_map, "spriteOffset").is_some();
                let has_frame = get_record_value(&frame_map, "frame").is_some()
                    || get_record_value(&frame_map, "textureRect").is_some();
                if !has_frame && !has_sprite_fields {
                    let mut detail = HashMap::new();
                    detail.insert(
                        "frame".to_string(),
                        ImportDiagnosticDetailValue::String(frame_name.to_string()),
                    );
                    report_import_diagnostic(
                        diagnostics.as_deref_mut(),
                        ImportDiagnosticSeverity::Drop,
                        "spritesheet.cocos-plist.unrecognized-frame",
                        "parseCocosPlistXml",
                        Some(detail),
                    );
                    continue;
                }
                let aliases = get_record_value(&frame_map, "aliases").and_then(|aliases| {
                    if aliases.name != "array" {
                        return None;
                    }
                    let values = aliases
                        .children
                        .iter()
                        .filter_map(|child| {
                            let child = child.read().unwrap();
                            (child.name == "string").then(|| child.text.clone())
                        })
                        .collect::<Vec<_>>();
                    (!values.is_empty()).then_some(values)
                });
                set_record_value(
                    &mut frames,
                    frame_name.to_string(),
                    CocosPlistFrame {
                        aliases,
                        frame: z_f_first_text_value(&frame_map, "frame", "textureRect"),
                        sprite_offset: z_f_first_text_value(&frame_map, "spriteOffset", "offset"),
                        sprite_size: z_f_first_text_value(&frame_map, "spriteSize", "size"),
                        sprite_source_size: z_f_first_text_value(
                            &frame_map,
                            "spriteSourceSize",
                            "sourceSize",
                        ),
                        sprite_trimmed: z_e_first_bool_value(
                            &frame_map,
                            "spriteTrimmed",
                            "trimmed",
                        ),
                        texture_rotated: z_e_first_bool_value(
                            &frame_map,
                            "textureRotated",
                            "rotated",
                        ),
                    },
                );
            }
        }
    }
    return CocosPlistDocument { frames, metadata };
}

fn z_b_cocos_document_to_data(document: &CocosPlistDocument) -> SpritesheetData {
    let frames = entries(&document.frames)
        .into_iter()
        .map(|(name, frame)| z_c_cocos_frame_to_data(name, frame))
        .collect();
    let (image_width, image_height) = z_m_parse_plist_pair(&document.metadata.size);
    return create_spritesheet_data(Some(SpritesheetDataOptions {
        animations: Some(Vec::new()),
        frames: Some(frames),
        image_file: Some(document.metadata.texture_file_name.clone()),
        image_height: Some(image_height),
        image_width: Some(image_width),
        scale: Some(1.0),
    }));
}

fn z_c_cocos_frame_to_data(name: &str, frame: &CocosPlistFrame) -> SpritesheetFrameData {
    let (x, y, packed_width, packed_height) = z_n_parse_plist_rect(&frame.frame);
    let (offset_x, offset_y) = z_m_parse_plist_pair(&frame.sprite_offset);
    let (source_width, source_height) = z_m_parse_plist_pair(&frame.sprite_source_size);
    let width = if frame.texture_rotated {
        packed_height
    } else {
        packed_width
    };
    let height = if frame.texture_rotated {
        packed_width
    } else {
        packed_height
    };
    return create_spritesheet_frame_data(Some(SpritesheetFrameDataOptions {
        height: Some(height),
        name: Some(name.to_string()),
        offset_x: Some(offset_x),
        offset_y: Some(offset_y),
        pivot_x: None,
        pivot_y: None,
        rotated: Some(frame.texture_rotated),
        source_height: Some(if source_height > 0.0 {
            source_height
        } else {
            height
        }),
        source_width: Some(if source_width > 0.0 {
            source_width
        } else {
            width
        }),
        width: Some(width),
        x: Some(x),
        y: Some(y),
    }));
}

fn z_d_dict_to_map(element: &XmlElement) -> Record<XmlElement> {
    let mut out = Record::default();
    let mut index = 0;
    while index + 1 < element.children.len() {
        let key = element.children[index].read().unwrap();
        let value = element.children[index + 1].read().unwrap();
        if key.name == "key" {
            set_record_value(&mut out, key.text.clone(), value.clone());
        }
        index += 2;
    }
    return out;
}

fn z_e_first_bool_value(values: &Record<XmlElement>, first: &str, second: &str) -> bool {
    return get_record_value(values, first)
        .or_else(|| get_record_value(values, second))
        .is_some_and(|value| value.name == "true");
}

fn z_f_first_text_value(values: &Record<XmlElement>, first: &str, second: &str) -> String {
    return z_h_text_value(
        get_record_value(values, first).or_else(|| get_record_value(values, second)),
    );
}

fn z_g_integer_value(element: Option<&XmlElement>) -> i32 {
    return z_l_parse_integer_prefix(&z_h_text_value(element)).unwrap_or(0);
}

fn z_h_text_value(element: Option<&XmlElement>) -> String {
    return element.map_or_else(String::new, |element| element.text.clone());
}

fn z_i_default_cocos_metadata() -> CocosPlistMetadata {
    return CocosPlistMetadata {
        format: 0,
        size: "{0,0}".to_string(),
        texture_file_name: String::new(),
    };
}

fn z_j_empty_cocos_document() -> CocosPlistDocument {
    return CocosPlistDocument {
        frames: Record::default(),
        metadata: z_i_default_cocos_metadata(),
    };
}

fn z_k_parse_float(value: Option<&str>) -> f32 {
    return value.and_then(|value| value.parse().ok()).unwrap_or(0.0);
}

fn z_l_parse_integer_prefix(value: &str) -> Option<i32> {
    let expression = Regex::new(r"^[\s]*([+-]?\d+)").unwrap();
    return expression
        .captures(value)
        .and_then(|captures| captures.get(1))
        .and_then(|value| value.as_str().parse().ok());
}

fn z_m_parse_plist_pair(value: &str) -> (f32, f32) {
    let expression = Regex::new(r"\{?\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\}?").unwrap();
    let Some(captures) = expression.captures(value) else {
        return (0.0, 0.0);
    };
    return (
        z_k_parse_float(captures.get(1).map(|value| value.as_str())),
        z_k_parse_float(captures.get(2).map(|value| value.as_str())),
    );
}

fn z_n_parse_plist_rect(value: &str) -> (f32, f32, f32, f32) {
    let expression = Regex::new(
        r"\{\s*\{\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\}\s*,\s*\{\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\}\s*\}",
    )
    .unwrap();
    let Some(captures) = expression.captures(value) else {
        return (0.0, 0.0, 0.0, 0.0);
    };
    return (
        z_k_parse_float(captures.get(1).map(|value| value.as_str())),
        z_k_parse_float(captures.get(2).map(|value| value.as_str())),
        z_k_parse_float(captures.get(3).map(|value| value.as_str())),
        z_k_parse_float(captures.get(4).map(|value| value.as_str())),
    );
}
