use flight_spritesheet::{SpritesheetData, SpritesheetFrameData};

pub fn format_libgdx_atlas(data: &SpritesheetData) -> String {
    let mut lines = vec![
        data.image_file.clone(),
        format!(
            "  size: {}, {}",
            z_a_js_number(data.image_width),
            z_a_js_number(data.image_height)
        ),
        "  format: RGBA8888".to_string(),
        "  filter: Linear, Linear".to_string(),
        "  repeat: none".to_string(),
    ];
    for frame in &data.frames {
        z_b_append_libgdx_atlas_frame(&mut lines, frame);
    }
    return lines.join("\n") + "\n";
}

fn z_a_js_number(value: f32) -> String {
    if value == 0.0 {
        return "0".to_string();
    }
    if value.fract() == 0.0 {
        return format!("{value:.0}");
    }
    return value.to_string();
}

fn z_b_append_libgdx_atlas_frame(lines: &mut Vec<String>, frame: &SpritesheetFrameData) {
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
    lines.extend([
        frame.name.clone(),
        format!("  rotate: {}", frame.rotated),
        format!(
            "  xy: {}, {}",
            z_a_js_number(frame.x),
            z_a_js_number(frame.y)
        ),
        format!(
            "  size: {}, {}",
            z_a_js_number(packed_width),
            z_a_js_number(packed_height)
        ),
        format!(
            "  orig: {}, {}",
            z_a_js_number(frame.source_width),
            z_a_js_number(frame.source_height)
        ),
        format!(
            "  offset: {}, {}",
            z_a_js_number(frame.offset_x),
            z_a_js_number(frame.offset_y)
        ),
        "  index: -1".to_string(),
    ]);
}
