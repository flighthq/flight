use std::sync::{Arc, RwLock};

use flight_entity::Uint8Array;

use crate::{
    SWF_ALL_TAG_HANDLERS, SwfGuardState, SwfNodeState, SwfTagHandlerDispatch, SwfTagParseState,
    expand_swf_tag_handler_dispatch,
};

pub struct SwfBitWriter {
    bytes: Vec<u8>,
    bit_position: usize,
}

pub const SWF_PLACE_HAS_CHARACTER: u8 = 0x02;
pub const SWF_PLACE_HAS_COLOR_TRANSFORM: u8 = 0x08;
pub const SWF_PLACE_HAS_MATRIX: u8 = 0x04;
pub const SWF_PLACE_HAS_NAME: u8 = 0x20;

// flight-lint: allow(conform-extra) Rust free-function form of the source SwfBitWriter constructor supports integration-test fixtures
pub fn create_swf_bit_writer() -> SwfBitWriter {
    return SwfBitWriter {
        bytes: Vec::new(),
        bit_position: 0,
    };
}

pub fn create_swf_file_bytes(tags: &[Box<Uint8Array>]) -> Box<Uint8Array> {
    let rectangle = create_swf_rectangle_record(0, 2000, 0, 1000);
    let frame_rate = swf_uint16_bytes(24 * 256);
    let frame_count = swf_uint16_bytes(1);
    let mut body_parts = vec![rectangle, frame_rate, frame_count];
    body_parts.extend(tags.iter().cloned());
    let body = join_swf_bytes(&body_parts);
    let file_length = SWF_PREFIX_LENGTH + body.len();
    return join_swf_bytes(&[
        vec![0x46, 0x57, 0x53, 9].into_boxed_slice(),
        swf_uint32_bytes(file_length as u32),
        body,
    ]);
}

pub fn create_swf_matrix_record(
    a: f32,
    b: f32,
    c: f32,
    d: f32,
    tx: i32,
    ty: i32,
) -> Box<Uint8Array> {
    let scales = [
        round_js_number(a * FIXED_16_ONE),
        round_js_number(d * FIXED_16_ONE),
    ];
    let rotates = [
        round_js_number(b * FIXED_16_ONE),
        round_js_number(c * FIXED_16_ONE),
    ];
    let scale_bits = count_swf_signed_bits(&scales);
    let rotate_bits = count_swf_signed_bits(&rotates);
    let translate_bits = count_swf_signed_bits(&[tx, ty]);
    let mut writer = create_swf_bit_writer();
    swf_bit_writer_write_unsigned(&mut writer, 1, 1);
    swf_bit_writer_write_unsigned(&mut writer, scale_bits, 5);
    for value in scales {
        swf_bit_writer_write_signed(&mut writer, value, scale_bits);
    }
    swf_bit_writer_write_unsigned(&mut writer, 1, 1);
    swf_bit_writer_write_unsigned(&mut writer, rotate_bits, 5);
    for value in rotates {
        swf_bit_writer_write_signed(&mut writer, value, rotate_bits);
    }
    swf_bit_writer_write_unsigned(&mut writer, translate_bits, 5);
    swf_bit_writer_write_signed(&mut writer, tx, translate_bits);
    swf_bit_writer_write_signed(&mut writer, ty, translate_bits);
    return swf_bit_writer_to_bytes(&writer);
}

pub fn create_swf_rectangle_record(
    x_min: i32,
    x_max: i32,
    y_min: i32,
    y_max: i32,
) -> Box<Uint8Array> {
    let values = [x_min, x_max, y_min, y_max];
    let bits = count_swf_signed_bits(&values);
    let mut writer = create_swf_bit_writer();
    swf_bit_writer_write_unsigned(&mut writer, bits, 5);
    for value in values {
        swf_bit_writer_write_signed(&mut writer, value, bits);
    }
    return swf_bit_writer_to_bytes(&writer);
}

pub fn create_swf_tag_record(code: u32, body: Option<&Uint8Array>) -> Box<Uint8Array> {
    let body = body.unwrap_or(&[]);
    let short_length = if body.len() < 0x3f { body.len() } else { 0x3f };
    let header = swf_uint16_bytes((code << 6) | short_length as u32);
    return if short_length == 0x3f {
        join_swf_bytes(&[
            header,
            swf_uint32_bytes(body.len() as u32),
            body.to_vec().into_boxed_slice(),
        ])
    } else {
        join_swf_bytes(&[header, body.to_vec().into_boxed_slice()])
    };
}

pub fn create_swf_test_parse_state(dispatch: Option<SwfTagHandlerDispatch>) -> SwfTagParseState {
    let uses_default_handlers = dispatch.is_none();
    let handlers = if uses_default_handlers {
        SWF_ALL_TAG_HANDLERS.clone()
    } else {
        Vec::new()
    };
    let dispatch =
        dispatch.unwrap_or_else(|| expand_swf_tag_handler_dispatch(&SWF_ALL_TAG_HANDLERS));
    return SwfTagParseState {
        abc_blobs: Vec::new(),
        background_color: None,
        character_bounds: std::collections::HashMap::new(),
        defined_characters: std::collections::HashSet::new(),
        diagnostics: None,
        dispatch,
        edit_texts: std::collections::HashMap::new(),
        font_code_points: std::collections::HashMap::new(),
        font_names: std::collections::HashMap::new(),
        font_outline_sources: std::collections::HashMap::new(),
        guard_state: Arc::new(RwLock::new(SwfGuardState::default())),
        handlers,
        image_texture_order: Arc::new(RwLock::new(Vec::new())),
        image_textures: Arc::new(RwLock::new(std::collections::HashMap::new())),
        images: std::collections::HashMap::new(),
        jpeg_alpha_payloads: indexmap::IndexMap::new(),
        jpeg_tables: None,
        linkage_order: Vec::new(),
        linkages: std::collections::HashMap::new(),
        morph_bounds: std::collections::HashMap::new(),
        morph_shapes: std::collections::HashMap::new(),
        morph_instances: Arc::new(RwLock::new(std::collections::HashMap::new())),
        node_state: Arc::new(RwLock::new(SwfNodeState::default())),
        pending_init_actions: Vec::new(),
        pending_texts: Vec::new(),
        remaining_frame_entries: 1_000_000,
        scaling_grids: std::collections::HashMap::new(),
        shapes: std::collections::HashMap::new(),
        sound_cues_awaiting_class: Vec::new(),
        sound_cues_awaiting_rate: Vec::new(),
        sound_order: Vec::new(),
        sound_resources: std::collections::HashMap::new(),
        sounds: std::collections::HashMap::new(),
        sprites: std::collections::HashMap::new(),
        stream_sounds: Vec::new(),
        video_textures: Arc::new(RwLock::new(std::collections::HashMap::new())),
        videos: std::collections::HashMap::new(),
    };
}

// flight-lint: allow(conform-array) approved readonly slice vocabulary broadens the TS fixture's ReadonlyArray<number> to ArrayLike<number>
pub fn count_swf_signed_bits(values: &[i32]) -> u32 {
    for bits in 1..32 {
        let minimum = -(1_i64 << (bits - 1));
        let maximum = (1_i64 << (bits - 1)) - 1;
        if values
            .iter()
            .all(|value| i64::from(*value) >= minimum && i64::from(*value) <= maximum)
        {
            return bits;
        }
    }
    return 32;
}

// flight-lint: allow(conform-params) Rust models the source variadic typed-array list as one borrowed slice
pub fn join_swf_bytes(parts: &[Box<Uint8Array>]) -> Box<Uint8Array> {
    let length = parts.iter().map(|part| part.len()).sum();
    let mut result = Vec::with_capacity(length);
    for part in parts {
        result.extend_from_slice(part);
    }
    return result.into_boxed_slice();
}

fn round_js_number(value: f32) -> i32 {
    return (value + 0.5).floor() as i32;
}

// flight-lint: allow(conform-extra) Rust free-function form preserves the source SwfBitWriter.toBytes method for cross-target fixtures
pub fn swf_bit_writer_to_bytes(writer: &SwfBitWriter) -> Box<Uint8Array> {
    return writer.bytes.clone().into_boxed_slice();
}

// flight-lint: allow(conform-extra) Rust free-function form preserves the source SwfBitWriter.writeSigned method for cross-target fixtures
pub fn swf_bit_writer_write_signed(writer: &mut SwfBitWriter, value: i32, count: u32) {
    let mask = if count == 32 {
        u32::MAX
    } else {
        (1_u32 << count) - 1
    };
    swf_bit_writer_write_unsigned(writer, value as u32 & mask, count);
}

// flight-lint: allow(conform-extra) Rust free-function form preserves the source SwfBitWriter.writeUnsigned method for cross-target fixtures
pub fn swf_bit_writer_write_unsigned(writer: &mut SwfBitWriter, value: u32, count: u32) {
    for index in (0..count).rev() {
        let byte_index = writer.bit_position >> 3;
        if byte_index == writer.bytes.len() {
            writer.bytes.push(0);
        }
        if value >> index & 1 != 0 {
            writer.bytes[byte_index] |= 1 << (7 - (writer.bit_position & 7));
        }
        writer.bit_position += 1;
    }
}

pub fn swf_uint16_bytes(value: u32) -> Box<Uint8Array> {
    return vec![value as u8, (value >> 8) as u8].into_boxed_slice();
}

pub fn swf_uint32_bytes(value: u32) -> Box<Uint8Array> {
    return vec![
        value as u8,
        (value >> 8) as u8,
        (value >> 16) as u8,
        (value >> 24) as u8,
    ]
    .into_boxed_slice();
}

const FIXED_16_ONE: f32 = 65536.0;
const SWF_PREFIX_LENGTH: usize = 8;
