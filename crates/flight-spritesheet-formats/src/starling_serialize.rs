use flight_spritesheet::{SpritesheetData, SpritesheetFrameData};

use crate::types::*;

pub fn serialize_starling_spritesheet(
    data: &SpritesheetData,
    existing: Option<&StarlingDocument>,
) -> String {
    let document = StarlingDocument {
        image_path: if data.image_file.is_empty() {
            existing.map_or_else(String::new, |document| document.image_path.clone())
        } else {
            data.image_file.clone()
        },
        sub_textures: data.frames.iter().map(z_a_starling_sub_texture).collect(),
    };
    let mut lines = vec![
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>".to_string(),
        format!("<TextureAtlas imagePath=\"{}\">", document.image_path),
    ];
    for texture in &document.sub_textures {
        lines.push(format!(
            "\t<SubTexture {}/>",
            z_b_starling_attributes(texture)
        ));
    }
    lines.push("</TextureAtlas>".to_string());
    return lines.join("\n");
}

fn z_a_starling_sub_texture(frame: &SpritesheetFrameData) -> StarlingSubTexture {
    return StarlingSubTexture {
        frame_height: (frame.source_height != frame.height).then_some(frame.source_height),
        frame_width: (frame.source_width != frame.width).then_some(frame.source_width),
        frame_x: (frame.offset_x != 0.0).then_some(-frame.offset_x),
        frame_y: (frame.offset_y != 0.0).then_some(-frame.offset_y),
        height: if frame.rotated {
            frame.width
        } else {
            frame.height
        },
        name: frame.name.clone(),
        pivot_x: frame
            .pivot_x
            .filter(|_| frame.source_width > 0.0)
            .map(|value| value * frame.source_width),
        pivot_y: frame
            .pivot_y
            .filter(|_| frame.source_height > 0.0)
            .map(|value| value * frame.source_height),
        rotated: frame.rotated.then_some(true),
        width: if frame.rotated {
            frame.height
        } else {
            frame.width
        },
        x: frame.x,
        y: frame.y,
    };
}

fn z_b_starling_attributes(texture: &StarlingSubTexture) -> String {
    let mut values = vec![
        format!("name=\"{}\"", texture.name),
        format!("x=\"{}\"", z_d_js_number(texture.x)),
        format!("y=\"{}\"", z_d_js_number(texture.y)),
        format!("width=\"{}\"", z_d_js_number(texture.width)),
        format!("height=\"{}\"", z_d_js_number(texture.height)),
    ];
    z_c_push_attribute(&mut values, "frameX", texture.frame_x);
    z_c_push_attribute(&mut values, "frameY", texture.frame_y);
    z_c_push_attribute(&mut values, "frameWidth", texture.frame_width);
    z_c_push_attribute(&mut values, "frameHeight", texture.frame_height);
    z_c_push_attribute(&mut values, "pivotX", texture.pivot_x);
    z_c_push_attribute(&mut values, "pivotY", texture.pivot_y);
    if texture.rotated == Some(true) {
        values.push("rotated=\"true\"".to_string());
    }
    return values.join(" ");
}

fn z_c_push_attribute(values: &mut Vec<String>, name: &str, value: Option<f32>) {
    if let Some(value) = value {
        values.push(format!("{name}=\"{}\"", z_d_js_number(value)));
    }
}

fn z_d_js_number(value: f32) -> String {
    if value == 0.0 {
        return "0".to_string();
    }
    if value.fract() == 0.0 {
        return format!("{value:.0}");
    }
    return value.to_string();
}
