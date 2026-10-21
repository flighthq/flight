use flight_entity::{Record, entries, set_record_value};
use flight_spritesheet::{SpritesheetData, SpritesheetFrameData};

use crate::types::*;

pub fn serialize_cocos_plist_spritesheet(
    data: &SpritesheetData,
    existing: Option<&CocosPlistDocument>,
) -> String {
    let mut frames = Record::default();
    for frame in &data.frames {
        set_record_value(
            &mut frames,
            frame.name.clone(),
            z_b_cocos_frame_entry(frame),
        );
    }
    let document = CocosPlistDocument {
        frames,
        metadata: CocosPlistMetadata {
            format: existing.map_or(3, |document| document.metadata.format),
            size: format!(
                "{{{},{}}}",
                z_e_js_number(data.image_width),
                z_e_js_number(data.image_height)
            ),
            texture_file_name: if data.image_file.is_empty() {
                existing.map_or_else(String::new, |document| {
                    document.metadata.texture_file_name.clone()
                })
            } else {
                data.image_file.clone()
            },
        },
    };
    return z_a_cocos_document_to_xml(&document);
}

fn z_a_cocos_document_to_xml(document: &CocosPlistDocument) -> String {
    let mut lines = vec![
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>".to_string(),
        "<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">".to_string(),
        "<plist version=\"1.0\">".to_string(),
        "<dict>".to_string(),
        "\t<key>frames</key>".to_string(),
        "\t<dict>".to_string(),
    ];
    for (name, frame) in entries(&document.frames) {
        lines.extend([
            format!("\t\t<key>{}</key>", z_c_escape_xml(name)),
            "\t\t<dict>".to_string(),
            "\t\t\t<key>frame</key>".to_string(),
            format!("\t\t\t<string>{}</string>", z_c_escape_xml(&frame.frame)),
            "\t\t\t<key>spriteOffset</key>".to_string(),
            format!(
                "\t\t\t<string>{}</string>",
                z_c_escape_xml(&frame.sprite_offset)
            ),
            "\t\t\t<key>spriteSize</key>".to_string(),
            format!(
                "\t\t\t<string>{}</string>",
                z_c_escape_xml(&frame.sprite_size)
            ),
            "\t\t\t<key>spriteSourceSize</key>".to_string(),
            format!(
                "\t\t\t<string>{}</string>",
                z_c_escape_xml(&frame.sprite_source_size)
            ),
            "\t\t\t<key>spriteTrimmed</key>".to_string(),
            format!("\t\t\t{}", z_d_plist_bool(frame.sprite_trimmed)),
            "\t\t\t<key>textureRotated</key>".to_string(),
            format!("\t\t\t{}", z_d_plist_bool(frame.texture_rotated)),
            "\t\t</dict>".to_string(),
        ]);
    }
    lines.extend([
        "\t</dict>".to_string(),
        "\t<key>metadata</key>".to_string(),
        "\t<dict>".to_string(),
        "\t\t<key>format</key>".to_string(),
        format!("\t\t<integer>{}</integer>", document.metadata.format),
        "\t\t<key>size</key>".to_string(),
        format!(
            "\t\t<string>{}</string>",
            z_c_escape_xml(&document.metadata.size)
        ),
        "\t\t<key>textureFileName</key>".to_string(),
        format!(
            "\t\t<string>{}</string>",
            z_c_escape_xml(&document.metadata.texture_file_name)
        ),
        "\t</dict>".to_string(),
        "</dict>".to_string(),
        "</plist>".to_string(),
    ]);
    return lines.join("\n");
}

fn z_b_cocos_frame_entry(frame: &SpritesheetFrameData) -> CocosPlistFrame {
    let packed_width = if frame.rotated {
        frame.height
    } else {
        frame.width
    };
    let packed_height = if frame.rotated {
        frame.width
    } else {
        frame.height
    };
    return CocosPlistFrame {
        aliases: None,
        frame: format!(
            "{{{{{},{}}},{{{},{}}}}}",
            z_e_js_number(frame.x),
            z_e_js_number(frame.y),
            z_e_js_number(packed_width),
            z_e_js_number(packed_height)
        ),
        sprite_offset: format!(
            "{{{},{}}}",
            z_e_js_number(frame.offset_x),
            z_e_js_number(frame.offset_y)
        ),
        sprite_size: format!(
            "{{{},{}}}",
            z_e_js_number(frame.width),
            z_e_js_number(frame.height)
        ),
        sprite_source_size: format!(
            "{{{},{}}}",
            z_e_js_number(frame.source_width),
            z_e_js_number(frame.source_height)
        ),
        sprite_trimmed: frame.offset_x != 0.0
            || frame.offset_y != 0.0
            || frame.source_width != frame.width
            || frame.source_height != frame.height,
        texture_rotated: frame.rotated,
    };
}

fn z_c_escape_xml(value: &str) -> String {
    return value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;");
}

fn z_d_plist_bool(value: bool) -> &'static str {
    return if value { "<true/>" } else { "<false/>" };
}

fn z_e_js_number(value: f32) -> String {
    if value == 0.0 {
        return "0".to_string();
    }
    if value.fract() == 0.0 {
        return format!("{value:.0}");
    }
    return value.to_string();
}
