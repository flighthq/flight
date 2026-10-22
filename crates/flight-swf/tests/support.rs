use std::future::Future;
use std::sync::{Arc, RwLock};
use std::task::{Context, Poll, Waker};

use flight_entity::{Ref, Uint8Array};
use flight_swf::contract::{
    SwfTagHandler, SwfTagHandlerRef, SwfTagParseState, SwfTagTimelineState,
    create_swf_test_parse_state, expand_swf_tag_handler_dispatch,
};

pub const TAG_DEFINE_SHAPE: u32 = 2;
pub const TAG_END: u32 = 0;
pub const TAG_PROTECT: u32 = 24;
pub const TAG_SET_BACKGROUND_COLOR: u32 = 9;
pub const TAG_SHOW_FRAME: u32 = 1;
pub const TAG_UNKNOWN: u32 = 100;

pub fn bytes_ref(bytes: Vec<u8>) -> Ref<Box<Uint8Array>> {
    return Arc::new(RwLock::new(bytes.into_boxed_slice()));
}

pub fn encoded_uint32(mut value: u32) -> Vec<u8> {
    let mut bytes = Vec::new();
    loop {
        let byte = value as u8 & 0x7f;
        value >>= 7;
        bytes.push(if value > 0 { byte | 0x80 } else { byte });
        if value == 0 {
            return bytes;
        }
    }
}

pub fn block_on<F: Future>(future: F) -> F::Output {
    let mut future = Box::pin(future);
    let mut context = Context::from_waker(Waker::noop());
    loop {
        match future.as_mut().poll(&mut context) {
            Poll::Ready(value) => return value,
            Poll::Pending => std::thread::yield_now(),
        }
    }
}

pub fn create_minimal_shape_body() -> Vec<u8> {
    return join_bytes(&[
        &uint16(1),
        &create_rectangle_record(0, 100, 0, 100),
        &[0, 0],
    ]);
}

pub fn create_box_glyph_bytes(size: i32) -> Vec<u8> {
    let mut writer = SwfBitWriter::new();
    writer.write_unsigned(1, 4);
    writer.write_unsigned(0, 4);
    writer.write_unsigned(0, 1);
    writer.write_unsigned(0, 1);
    writer.write_unsigned(0, 1);
    writer.write_unsigned(1, 1);
    writer.write_unsigned(0, 1);
    writer.write_unsigned(1, 1);
    let move_bits = signed_bit_count(&[0, 0]);
    writer.write_unsigned(u32::from(move_bits), 5);
    writer.write_signed(0, move_bits);
    writer.write_signed(0, move_bits);
    writer.write_unsigned(1, 1);
    for (delta_x, delta_y) in [(size, 0), (0, size), (-size, 0), (0, -size)] {
        let edge_bits = signed_bit_count(&[delta_x, delta_y]);
        writer.write_unsigned(1, 1);
        writer.write_unsigned(1, 1);
        writer.write_unsigned(u32::from(edge_bits - 2), 4);
        writer.write_unsigned(1, 1);
        writer.write_signed(delta_x, edge_bits);
        writer.write_signed(delta_y, edge_bits);
    }
    writer.write_unsigned(0, 1);
    writer.write_unsigned(0, 5);
    return writer.to_bytes();
}

pub fn create_bitmap_shape_bytes(
    styles: &[(u8, u16, Option<f32>)],
    edges: &[(i32, i32)],
) -> Vec<u8> {
    let mut writer = SwfBitWriter::new();
    writer.write_byte(styles.len() as u8);
    for (fill_type, character_id, scale) in styles {
        writer.write_byte(*fill_type);
        writer.write_uint16(*character_id);
        writer.write_bitmap_matrix(*scale);
    }
    writer.write_byte(0);
    let fill_bits = (usize::BITS - styles.len().leading_zeros()) as u8;
    writer.write_unsigned(u32::from(fill_bits), 4);
    writer.write_unsigned(0, 4);
    writer.write_unsigned(0, 1);
    writer.write_unsigned(0, 1);
    writer.write_unsigned(0, 1);
    writer.write_unsigned(1, 1);
    writer.write_unsigned(0, 1);
    writer.write_unsigned(1, 1);
    let move_bits = signed_bit_count(&[0, 0]);
    writer.write_unsigned(u32::from(move_bits), 5);
    writer.write_signed(0, move_bits);
    writer.write_signed(0, move_bits);
    writer.write_unsigned(1, fill_bits);
    for &(delta_x, delta_y) in edges {
        let edge_bits = signed_bit_count(&[delta_x, delta_y]);
        writer.write_unsigned(1, 1);
        writer.write_unsigned(1, 1);
        writer.write_unsigned(u32::from(edge_bits - 2), 4);
        writer.write_unsigned(1, 1);
        writer.write_signed(delta_x, edge_bits);
        writer.write_signed(delta_y, edge_bits);
    }
    writer.write_unsigned(0, 1);
    writer.write_unsigned(0, 5);
    writer.align();
    return writer.to_bytes();
}

pub fn create_color_transform_with_alpha() -> Vec<u8> {
    let mut writer = SwfBitWriter::new();
    writer.write_unsigned(0, 1);
    writer.write_unsigned(0, 1);
    writer.write_unsigned(0, 4);
    return writer.to_bytes();
}

pub fn create_color_transform(multiply: &[i32], add: &[i32]) -> Vec<u8> {
    let values = multiply
        .iter()
        .chain(add.iter())
        .copied()
        .collect::<Vec<_>>();
    let bits = signed_bit_count(&values);
    let mut writer = SwfBitWriter::new();
    writer.write_unsigned(1, 1);
    writer.write_unsigned(1, 1);
    writer.write_unsigned(u32::from(bits), 4);
    for value in multiply.iter().chain(add.iter()) {
        writer.write_signed(*value, bits);
    }
    return writer.to_bytes();
}

pub fn create_solid_shape_bytes(color: u32, edges: &[(i32, i32)]) -> Vec<u8> {
    let mut writer = SwfBitWriter::new();
    writer.write_unsigned(1, 8);
    writer.write_unsigned(0, 8);
    writer.write_unsigned(color >> 16 & 0xff, 8);
    writer.write_unsigned(color >> 8 & 0xff, 8);
    writer.write_unsigned(color & 0xff, 8);
    writer.write_unsigned(0, 8);
    writer.write_unsigned(1, 4);
    writer.write_unsigned(0, 4);
    writer.write_unsigned(0, 1);
    writer.write_unsigned(0, 1);
    writer.write_unsigned(0, 1);
    writer.write_unsigned(1, 1);
    writer.write_unsigned(0, 1);
    writer.write_unsigned(1, 1);
    let move_bits = signed_bit_count(&[0, 0]);
    writer.write_unsigned(u32::from(move_bits), 5);
    writer.write_signed(0, move_bits);
    writer.write_signed(0, move_bits);
    writer.write_unsigned(1, 1);
    for &(delta_x, delta_y) in edges {
        let edge_bits = signed_bit_count(&[delta_x, delta_y]);
        writer.write_unsigned(1, 1);
        writer.write_unsigned(1, 1);
        writer.write_unsigned(u32::from(edge_bits - 2), 4);
        writer.write_unsigned(1, 1);
        writer.write_signed(delta_x, edge_bits);
        writer.write_signed(delta_y, edge_bits);
    }
    writer.write_unsigned(0, 1);
    writer.write_unsigned(0, 5);
    return writer.to_bytes();
}

pub fn create_matrix_record(a: f32, b: f32, c: f32, d: f32, tx: i32, ty: i32) -> Vec<u8> {
    let scales = [(a * 65536.0).round() as i32, (d * 65536.0).round() as i32];
    let rotates = [(b * 65536.0).round() as i32, (c * 65536.0).round() as i32];
    let scale_bits = signed_bit_count(&scales);
    let rotate_bits = signed_bit_count(&rotates);
    let translate_bits = signed_bit_count(&[tx, ty]);
    let mut writer = SwfBitWriter::new();
    writer.write_unsigned(1, 1);
    writer.write_unsigned(u32::from(scale_bits), 5);
    for value in scales {
        writer.write_signed(value, scale_bits);
    }
    writer.write_unsigned(1, 1);
    writer.write_unsigned(u32::from(rotate_bits), 5);
    for value in rotates {
        writer.write_signed(value, rotate_bits);
    }
    writer.write_unsigned(u32::from(translate_bits), 5);
    writer.write_signed(tx, translate_bits);
    writer.write_signed(ty, translate_bits);
    return writer.to_bytes();
}

pub fn create_gif_header(width: u16, height: u16) -> Vec<u8> {
    return join_bytes(&[b"GIF89a", &uint16(width), &uint16(height)]);
}

pub fn create_jpeg_header(width: u16, height: u16) -> Vec<u8> {
    return vec![
        0xff,
        0xd8,
        0xff,
        0xc0,
        0,
        17,
        8,
        (height >> 8) as u8,
        height as u8,
        (width >> 8) as u8,
        width as u8,
        3,
        1,
        0x11,
        0,
        2,
        0x11,
        0,
        3,
        0x11,
        0,
        0xff,
        0xd9,
    ];
}

pub fn create_png_header(width: u32, height: u32) -> Vec<u8> {
    return vec![
        0x89,
        0x50,
        0x4e,
        0x47,
        0x0d,
        0x0a,
        0x1a,
        0x0a,
        0,
        0,
        0,
        13,
        0x49,
        0x48,
        0x44,
        0x52,
        (width >> 24) as u8,
        (width >> 16) as u8,
        (width >> 8) as u8,
        width as u8,
        (height >> 24) as u8,
        (height >> 16) as u8,
        (height >> 8) as u8,
        height as u8,
    ];
}

pub fn create_rectangle_record(x_min: i32, x_max: i32, y_min: i32, y_max: i32) -> Vec<u8> {
    let values = [x_min, x_max, y_min, y_max];
    let bits = signed_bit_count(&values);
    let mut writer = SwfBitWriter::new();
    writer.write_unsigned(bits as u32, 5);
    for value in values {
        writer.write_signed(value, bits);
    }
    return writer.to_bytes();
}

pub fn create_swf(tags: &[Vec<u8>], frame_rate: f32, bounds: [i32; 4]) -> Ref<Box<Uint8Array>> {
    let rectangle = create_rectangle_record(bounds[0], bounds[1], bounds[2], bounds[3]);
    let frame_rate = uint16((frame_rate * 256.0) as u16);
    let frame_count = uint16(1);
    let mut parts: Vec<&[u8]> = vec![&rectangle, &frame_rate, &frame_count];
    for tag in tags {
        parts.push(tag);
    }
    let body = join_bytes(&parts);
    let file_length = 8 + body.len();
    let prefix = [0x46, 0x57, 0x53, 9];
    return bytes_ref(join_bytes(&[&prefix, &uint32(file_length as u32), &body]));
}

pub fn create_tag(code: u32, body: &[u8]) -> Vec<u8> {
    let short_length = if body.len() < 0x3f { body.len() } else { 0x3f };
    let header = uint16(((code << 6) | short_length as u32) as u16);
    if short_length == 0x3f {
        return join_bytes(&[&header, &uint32(body.len() as u32), body]);
    }
    return join_bytes(&[&header, body]);
}

pub fn create_test_handler(tags: &[u32]) -> SwfTagHandlerRef {
    return Arc::new(SwfTagHandler {
        finish_timeline: None,
        instantiate: None,
        parse: Arc::new(
            |_body, _tag, _state, _timeline: &mut SwfTagTimelineState, _diagnostics| true,
        ),
        resolve: None,
        tags: tags.to_vec(),
    });
}

pub fn create_test_parse_state() -> SwfTagParseState {
    return create_swf_test_parse_state(Some(expand_swf_tag_handler_dispatch(&[])));
}

pub fn join_bytes(parts: &[&[u8]]) -> Vec<u8> {
    let length = parts.iter().map(|part| part.len()).sum();
    let mut result = Vec::with_capacity(length);
    for part in parts {
        result.extend_from_slice(part);
    }
    return result;
}

pub fn lossless_payload(format: u8, width: u16, height: u16, pixels: &[u8]) -> Vec<u8> {
    let mut result = vec![
        format,
        width as u8,
        (width >> 8) as u8,
        height as u8,
        (height >> 8) as u8,
    ];
    result.extend_from_slice(pixels);
    return result;
}

pub fn pack_glyph_entry(index: u32, advance: i32) -> Vec<u8> {
    let mut writer = SwfBitWriter::new();
    writer.write_unsigned(index, 4);
    writer.write_signed(advance, 8);
    return writer.to_bytes();
}

pub fn reader(bytes: Vec<u8>) -> flight_swf::contract::SwfReader {
    let end = bytes.len();
    return flight_swf::contract::SwfReader::new(bytes_ref(bytes), 0, end);
}

pub fn stored_deflate(bytes: &[u8]) -> Vec<u8> {
    let length = bytes.len();
    let mut first = 1_u32;
    let mut second = 0_u32;
    for byte in bytes {
        first = (first + u32::from(*byte)) % 65_521;
        second = (second + first) % 65_521;
    }
    let adler = second << 16 | first;
    let mut result = vec![
        0x78,
        0x01,
        0x01,
        length as u8,
        (length >> 8) as u8,
        !(length as u8),
        !((length >> 8) as u8),
    ];
    result.extend_from_slice(bytes);
    result.extend_from_slice(&adler.to_be_bytes());
    return result;
}

pub fn uint16(value: u16) -> [u8; 2] {
    return [value as u8, (value >> 8) as u8];
}

pub fn uint32(value: u32) -> [u8; 4] {
    return [
        value as u8,
        (value >> 8) as u8,
        (value >> 16) as u8,
        (value >> 24) as u8,
    ];
}

fn signed_bit_count(values: &[i32]) -> u8 {
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

pub struct SwfBitWriter {
    writer: flight_swf::contract::SwfBitWriter,
    bit_position: usize,
}

impl SwfBitWriter {
    pub fn align(&mut self) {
        while !self.bit_position.is_multiple_of(8) {
            self.write_unsigned(0, 1);
        }
    }

    pub fn new() -> Self {
        return Self {
            writer: flight_swf::contract::create_swf_bit_writer(),
            bit_position: 0,
        };
    }

    pub fn to_bytes(&self) -> Vec<u8> {
        return flight_swf::contract::swf_bit_writer_to_bytes(&self.writer).into_vec();
    }

    pub fn write_bitmap_matrix(&mut self, scale: Option<f32>) {
        self.align();
        match scale {
            Some(scale) => {
                let values = [(scale * 65536.0).round() as i32; 2];
                let bits = signed_bit_count(&values);
                self.write_unsigned(1, 1);
                self.write_unsigned(u32::from(bits), 5);
                for value in values {
                    self.write_signed(value, bits);
                }
            }
            None => self.write_unsigned(0, 1),
        }
        self.write_unsigned(0, 1);
        let bits = signed_bit_count(&[0, 0]);
        self.write_unsigned(u32::from(bits), 5);
        self.write_signed(0, bits);
        self.write_signed(0, bits);
        self.align();
    }

    pub fn write_byte(&mut self, value: u8) {
        self.align();
        self.write_unsigned(u32::from(value), 8);
    }

    pub fn write_signed(&mut self, value: i32, count: u8) {
        flight_swf::contract::swf_bit_writer_write_signed(
            &mut self.writer,
            value,
            u32::from(count),
        );
        self.bit_position += usize::from(count);
    }

    pub fn write_unsigned(&mut self, value: u32, count: u8) {
        flight_swf::contract::swf_bit_writer_write_unsigned(
            &mut self.writer,
            value,
            u32::from(count),
        );
        self.bit_position += usize::from(count);
    }

    pub fn write_uint16(&mut self, value: u16) {
        self.write_byte(value as u8);
        self.write_byte((value >> 8) as u8);
    }
}
