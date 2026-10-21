use flight_entity::{Record, entries, set_record_value};
use flight_spritesheet::{SpritesheetAnimationDirection, SpritesheetData, SpritesheetFrameData};
use flight_textureatlas_formats::{
    TextureAtlasFrameTagDirection, TextureAtlasScale, get_texture_atlas_frame_tag_direction_string,
};

use crate::ordered_json::*;
use crate::types::*;

pub fn serialize_texture_packer_spritesheet(
    data: &SpritesheetData,
    existing: Option<&TexturePackerDocument>,
    options: Option<&TexturePackerSerializeOptions>,
) -> String {
    let existing_is_array = matches!(existing, Some(TexturePackerDocument::Array(_)));
    let variant = options
        .and_then(|options| options.variant)
        .unwrap_or(if existing_is_array {
            SpritesheetDocumentVariant::Array
        } else {
            SpritesheetDocumentVariant::Hash
        });
    let existing_meta = existing.map(|document| match document {
        TexturePackerDocument::Array(document) => &document.value.meta,
        TexturePackerDocument::Hash(document) => &document.value.meta,
    });
    let frames = match variant {
        SpritesheetDocumentVariant::Array => array(
            data.frames
                .iter()
                .map(|frame| z_a_texture_packer_frame_json(frame, true))
                .collect(),
        ),
        SpritesheetDocumentVariant::Hash => {
            let mut values = Record::default();
            for frame in &data.frames {
                set_record_value(
                    &mut values,
                    frame.name.clone(),
                    z_a_texture_packer_frame_json(frame, false),
                );
            }
            OrderedJson::Object(
                entries(&values)
                    .into_iter()
                    .map(|(name, value)| (name.to_string(), value.clone()))
                    .collect(),
            )
        }
    };
    return to_pretty_json(&object(vec![
        ("frames", frames),
        ("meta", z_b_texture_packer_meta_json(data, existing_meta)),
    ]));
}

fn z_a_texture_packer_frame_json(
    frame: &SpritesheetFrameData,
    include_filename: bool,
) -> OrderedJson {
    let mut values = Vec::new();
    if include_filename {
        values.push(("filename", string(frame.name.clone())));
    }
    values.push((
        "frame",
        z_f_rect_json(
            frame.x,
            frame.y,
            if frame.rotated {
                frame.height
            } else {
                frame.width
            },
            if frame.rotated {
                frame.width
            } else {
                frame.height
            },
        ),
    ));
    if let (Some(pivot_x), Some(pivot_y)) = (frame.pivot_x, frame.pivot_y) {
        values.push((
            "pivot",
            object(vec![("x", number(pivot_x)), ("y", number(pivot_y))]),
        ));
    }
    values.extend([
        ("rotated", boolean(frame.rotated)),
        (
            "sourceSize",
            z_g_size_json(frame.source_width, frame.source_height),
        ),
        (
            "spriteSourceSize",
            z_f_rect_json(frame.offset_x, frame.offset_y, frame.width, frame.height),
        ),
        ("trimmed", boolean(z_e_is_trimmed(frame))),
    ]);
    return object(values);
}

fn z_b_texture_packer_meta_json(
    data: &SpritesheetData,
    existing: Option<&TexturePackerMeta>,
) -> OrderedJson {
    let mut values = vec![
        (
            "app",
            string(
                existing
                    .map(|meta| meta.app.clone())
                    .unwrap_or_else(|| "https://www.codeandweb.com/texturepacker".to_string()),
            ),
        ),
        (
            "format",
            string(
                existing
                    .map(|meta| meta.format.clone())
                    .unwrap_or_else(|| "RGBA8888".to_string()),
            ),
        ),
    ];
    if !data.animations.is_empty() {
        values.push((
            "frameTags",
            array(
                data.animations
                    .iter()
                    .map(|animation| {
                        object(vec![
                            (
                                "direction",
                                string(z_c_direction_string(animation.direction)),
                            ),
                            (
                                "from",
                                number(z_d_frame_index(data, animation.frame_names.first())),
                            ),
                            ("name", string(animation.name.clone())),
                            (
                                "to",
                                number(z_d_frame_index(data, animation.frame_names.last())),
                            ),
                        ])
                    })
                    .collect(),
            ),
        ));
    }
    values.extend([
        (
            "image",
            string(if data.image_file.is_empty() {
                existing.map_or_else(String::new, |meta| meta.image.clone())
            } else {
                data.image_file.clone()
            }),
        ),
        (
            "scale",
            if data.scale != 1.0 {
                number(data.scale)
            } else {
                existing.map_or_else(|| number(1.0_f32), |meta| z_h_scale_json(&meta.scale))
            },
        ),
        ("size", z_g_size_json(data.image_width, data.image_height)),
        (
            "version",
            string(
                existing
                    .map(|meta| meta.version.clone())
                    .unwrap_or_else(|| "1.0".to_string()),
            ),
        ),
    ]);
    return object(values);
}

fn z_c_direction_string(direction: SpritesheetAnimationDirection) -> &'static str {
    return get_texture_atlas_frame_tag_direction_string(match direction {
        SpritesheetAnimationDirection::Forward => TextureAtlasFrameTagDirection::Forward,
        SpritesheetAnimationDirection::Pingpong => TextureAtlasFrameTagDirection::PingPong,
        SpritesheetAnimationDirection::PingpongReverse => {
            TextureAtlasFrameTagDirection::PingPongReverse
        }
        SpritesheetAnimationDirection::Reverse => TextureAtlasFrameTagDirection::Reverse,
    });
}

fn z_d_frame_index(data: &SpritesheetData, name: Option<&String>) -> i32 {
    return name
        .and_then(|name| data.frames.iter().position(|frame| &frame.name == name))
        .map_or(0, |index| index as i32);
}

fn z_e_is_trimmed(frame: &SpritesheetFrameData) -> bool {
    return frame.offset_x != 0.0
        || frame.offset_y != 0.0
        || frame.source_width != frame.width
        || frame.source_height != frame.height;
}

fn z_f_rect_json(x: f32, y: f32, w: f32, h: f32) -> OrderedJson {
    return object(vec![
        ("h", number(h)),
        ("w", number(w)),
        ("x", number(x)),
        ("y", number(y)),
    ]);
}

fn z_g_size_json(w: f32, h: f32) -> OrderedJson {
    return object(vec![("h", number(h)), ("w", number(w))]);
}

fn z_h_scale_json(scale: &TextureAtlasScale) -> OrderedJson {
    return match scale {
        TextureAtlasScale::Number(scale) => number(scale.value),
        TextureAtlasScale::String(scale) => string(scale.value.clone()),
    };
}
