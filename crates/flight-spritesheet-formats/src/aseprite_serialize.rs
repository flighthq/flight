use flight_entity::{Record, entries, set_record_value};
use flight_spritesheet::{
    SpritesheetAnimationData, SpritesheetAnimationDirection, SpritesheetData, SpritesheetFrameData,
};
use flight_textureatlas_formats::{
    TextureAtlasFrameTagDirection, TextureAtlasScale, get_texture_atlas_frame_tag_direction_string,
};

use crate::ordered_json::*;
use crate::types::*;

pub fn serialize_aseprite_spritesheet(
    data: &SpritesheetData,
    existing: Option<&AsepriteDocument>,
    options: Option<&AsepriteSerializeOptions>,
) -> String {
    let existing_is_array = matches!(existing, Some(AsepriteDocument::Array(_)));
    let variant = options
        .and_then(|options| options.variant)
        .unwrap_or(if existing_is_array {
            SpritesheetDocumentVariant::Array
        } else {
            SpritesheetDocumentVariant::Hash
        });
    let existing_meta = existing.map(|document| match document {
        AsepriteDocument::Array(document) => &document.value.meta,
        AsepriteDocument::Hash(document) => &document.value.meta,
    });
    let frames = match variant {
        SpritesheetDocumentVariant::Array => array(
            data.frames
                .iter()
                .map(|frame| z_a_aseprite_frame_json(data, frame, true))
                .collect(),
        ),
        SpritesheetDocumentVariant::Hash => {
            let mut values = Record::default();
            for frame in &data.frames {
                set_record_value(
                    &mut values,
                    frame.name.clone(),
                    z_a_aseprite_frame_json(data, frame, false),
                );
            }
            let mut pairs = Vec::new();
            entries(&mut pairs, &values);
            OrderedJson::Object(
                pairs
                    .into_iter()
                    .map(|(name, value)| (name.to_string(), value.clone()))
                    .collect(),
            )
        }
    };
    return to_pretty_json(&object(vec![
        ("frames", frames),
        ("meta", z_b_aseprite_meta_json(data, existing_meta)),
    ]));
}

fn z_a_aseprite_frame_json(
    data: &SpritesheetData,
    frame: &SpritesheetFrameData,
    include_filename: bool,
) -> OrderedJson {
    let duration = z_d_resolve_frame_duration(data, &frame.name);
    let mut values = Vec::new();
    if include_filename {
        values.push(("filename", string(frame.name.clone())));
    }
    values.extend([
        ("duration", number(duration)),
        (
            "frame",
            z_h_rect_json(
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
        ),
        ("rotated", boolean(frame.rotated)),
        (
            "sourceSize",
            z_i_size_json(frame.source_width, frame.source_height),
        ),
        (
            "spriteSourceSize",
            z_h_rect_json(frame.offset_x, frame.offset_y, frame.width, frame.height),
        ),
        ("trimmed", boolean(z_g_is_trimmed(frame))),
    ]);
    return object(values);
}

// flight-lint: allow(f64) source scale is formatted with JavaScript-number semantics
fn z_b_aseprite_meta_json(data: &SpritesheetData, existing: Option<&AsepriteMeta>) -> OrderedJson {
    let mut values = vec![
        (
            "app",
            string(
                existing
                    .map(|meta| meta.app.clone())
                    .unwrap_or_else(|| "https://www.aseprite.org/".to_string()),
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
        (
            "frameTags",
            array(
                data.animations
                    .iter()
                    .enumerate()
                    .map(|(index, animation)| {
                        z_c_aseprite_tag_json(data, animation, existing, index)
                    })
                    .collect(),
            ),
        ),
        (
            "image",
            string(if data.image_file.is_empty() {
                existing.map_or_else(String::new, |meta| meta.image.clone())
            } else {
                data.image_file.clone()
            }),
        ),
    ];
    if let Some(layers) = existing.and_then(|meta| meta.layers.as_ref()) {
        values.push((
            "layers",
            array(
                layers
                    .iter()
                    .map(|layer| {
                        object(vec![
                            ("blendMode", string(layer.blend_mode.clone())),
                            ("name", string(layer.name.clone())),
                            ("opacity", number(layer.opacity)),
                        ])
                    })
                    .collect(),
            ),
        ));
    }
    values.extend([
        (
            "scale",
            if data.scale != 1.0 {
                string(z_k_js_number(f64::from(data.scale)))
            } else {
                existing.map_or_else(|| string("1"), |meta| z_j_scale_json(&meta.scale))
            },
        ),
        ("size", z_i_size_json(data.image_width, data.image_height)),
        (
            "version",
            string(
                existing
                    .map(|meta| meta.version.clone())
                    .unwrap_or_else(|| "1.3".to_string()),
            ),
        ),
    ]);
    return object(values);
}

fn z_c_aseprite_tag_json(
    data: &SpritesheetData,
    animation: &SpritesheetAnimationData,
    existing: Option<&AsepriteMeta>,
    index: usize,
) -> OrderedJson {
    let mut values = vec![
        (
            "direction",
            string(z_e_direction_string(animation.direction)),
        ),
        (
            "from",
            number(z_f_frame_index(data, animation.frame_names.first())),
        ),
        ("name", string(animation.name.clone())),
        (
            "to",
            number(z_f_frame_index(data, animation.frame_names.last())),
        ),
    ];
    if let Some(color) = existing
        .and_then(|meta| meta.frame_tags.get(index))
        .and_then(|tag| tag.color.as_ref())
    {
        values.push(("color", string(color.clone())));
    }
    return object(values);
}

// flight-lint: allow(f64) source per-frame millisecond timings are JavaScript numbers
fn z_d_resolve_frame_duration(data: &SpritesheetData, frame_name: &str) -> f64 {
    for animation in &data.animations {
        let Some(index) = animation
            .frame_names
            .iter()
            .position(|name| name == frame_name)
        else {
            continue;
        };
        if let Some(durations) = &animation.frame_durations {
            return durations
                .get(index)
                .copied()
                .unwrap_or(animation.frame_duration);
        }
        return animation.frame_duration;
    }
    return 100.0;
}

fn z_e_direction_string(direction: SpritesheetAnimationDirection) -> &'static str {
    return get_texture_atlas_frame_tag_direction_string(match direction {
        SpritesheetAnimationDirection::Forward => TextureAtlasFrameTagDirection::Forward,
        SpritesheetAnimationDirection::Pingpong => TextureAtlasFrameTagDirection::PingPong,
        SpritesheetAnimationDirection::PingpongReverse => {
            TextureAtlasFrameTagDirection::PingPongReverse
        }
        SpritesheetAnimationDirection::Reverse => TextureAtlasFrameTagDirection::Reverse,
    });
}

fn z_f_frame_index(data: &SpritesheetData, name: Option<&String>) -> i32 {
    return name
        .and_then(|name| data.frames.iter().position(|frame| &frame.name == name))
        .map_or(0, |index| index as i32);
}

fn z_g_is_trimmed(frame: &SpritesheetFrameData) -> bool {
    return frame.offset_x != 0.0
        || frame.offset_y != 0.0
        || frame.source_width != frame.width
        || frame.source_height != frame.height;
}

fn z_h_rect_json(x: f32, y: f32, w: f32, h: f32) -> OrderedJson {
    return object(vec![
        ("h", number(h)),
        ("w", number(w)),
        ("x", number(x)),
        ("y", number(y)),
    ]);
}

fn z_i_size_json(w: f32, h: f32) -> OrderedJson {
    return object(vec![("h", number(h)), ("w", number(w))]);
}

fn z_j_scale_json(scale: &TextureAtlasScale) -> OrderedJson {
    return match scale {
        TextureAtlasScale::Number(scale) => number(scale.value),
        TextureAtlasScale::String(scale) => string(scale.value.clone()),
    };
}

// flight-lint: allow(f64) source scale is formatted with JavaScript-number semantics
fn z_k_js_number(value: f64) -> String {
    if value == 0.0 {
        return "0".to_string();
    }
    if value.fract() == 0.0 {
        return format!("{value:.0}");
    }
    return value.to_string();
}
