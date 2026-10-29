use std::collections::HashMap;
use std::sync::Arc;

use flight_font::GlyphOutlineSource;
use flight_path::create_path;
use flight_shape::{Shape, ShapeCommandToken};
use flight_swf::{
    create_swf_text_shape, read_swf_font_glyph_outline_source, read_swf_font_glyphs,
    resolve_swf_font_units_per_em,
};

use crate::support::{join_bytes, reader, uint16};

mod create_swf_text_shape {
    use super::*;

    #[test]
    fn places_glyph_outlines_at_record_height_color_and_advance() {
        let font = box_font(512);
        let mut writer = TextWriter::new();
        writer.write_record(0x00ff00, None, 1, 1024);
        writer.write_glyph(0, 600);
        writer.write_glyph(0, 0);
        writer.end();
        let mut source = reader(writer.to_bytes());
        let shape = create_swf_text_shape(&mut source, 1, &HashMap::from([(1, font)])).unwrap();
        let commands = &shape.read().unwrap().data.commands;
        assert_eq!(command_count(commands, "beginFill"), 2);
        assert_command(commands, 0, "beginFill");
        assert_number(commands, 1, 2.0);
        assert_number(commands, 2, 0x00ff00ff_u32 as f64);
        assert_number(commands, 3, 1.0);
        assert_command(commands, 4, "moveTo");
        assert_number(commands, 5, 2.0);
        assert_number(commands, 6, 0.0);
        assert_number(commands, 7, 0.0);
        let second_move = command_index_from(commands, "moveTo", 8);
        assert_number(commands, second_move + 1, 2.0);
        assert_number(commands, second_move + 2, 30.0);
        assert_number(commands, second_move + 3, 0.0);
    }

    #[test]
    fn scales_glyphs_by_record_height_over_the_font_em_grid() {
        let mut writer = TextWriter::new();
        writer.write_record(0, None, 1, 512);
        writer.write_glyph(0, 0);
        writer.end();
        let mut source = reader(writer.to_bytes());
        let shape =
            create_swf_text_shape(&mut source, 1, &HashMap::from([(1, box_font(512))])).unwrap();
        let commands = &shape.read().unwrap().data.commands;
        assert_command(commands, 4, "moveTo");
        assert_number(commands, 5, 2.0);
        assert_number(commands, 6, 0.0);
        assert_number(commands, 7, 0.0);
        assert_command(commands, 8, "lineTo");
        assert_number(commands, 9, 2.0);
        assert_number(commands, 10, 12.8);
        assert_number(commands, 11, 0.0);
    }

    #[test]
    fn draws_version_three_glyphs_at_their_legacy_twins_size() {
        let fonts = HashMap::from([(1, box_font(512)), (3, box_font_version_three(10_240))]);
        let legacy = text_shape(&fonts, 1);
        let modern = text_shape(&fonts, 3);
        let legacy_commands = &legacy.read().unwrap().data.commands;
        let modern_commands = &modern.read().unwrap().data.commands;
        assert_eq!(
            format!("{legacy_commands:?}"),
            format!("{modern_commands:?}")
        );
        assert_number(modern_commands, 10, 12.8);
    }

    #[test]
    fn skips_missing_glyph_indices_without_failing_the_text() {
        let mut writer = TextWriter::new();
        writer.write_record(0, None, 1, 1024);
        writer.write_glyph(9, 0);
        writer.end();
        let mut source = reader(writer.to_bytes());
        let shape =
            create_swf_text_shape(&mut source, 1, &HashMap::from([(1, box_font(512))])).unwrap();
        assert!(shape.read().unwrap().data.commands.is_empty());
    }

    #[test]
    fn preserves_define_text_two_alpha_in_packed_color() {
        let mut writer = TextWriter::new();
        writer.write_record(0x00ff00, Some(0x80), 1, 1024);
        writer.write_glyph(0, 0);
        writer.end();
        let mut source = reader(writer.to_bytes());
        let shape =
            create_swf_text_shape(&mut source, 2, &HashMap::from([(1, box_font(512))])).unwrap();
        assert_number(
            &shape.read().unwrap().data.commands,
            2,
            0x00ff0080_u32 as f64,
        );
    }

    #[test]
    fn returns_none_for_a_record_stream_that_runs_out() {
        let mut writer = TextWriter::new();
        writer.write_record(0, None, 1, 1024);
        let mut bytes = writer.to_bytes();
        bytes.pop();
        let mut source = reader(bytes);
        assert!(create_swf_text_shape(&mut source, 1, &HashMap::new()).is_none());
    }

    #[test]
    fn returns_a_shape_for_an_advance_field_wider_than_thirty_two_bits() {
        let mut source = reader(vec![
            4, 40, 0x8c, 1, 0, 0, 0, 0, 0, 4, 1, 0, 0, 0, 0, 0, 0, 0,
        ]);
        let shape = create_swf_text_shape(&mut source, 1, &HashMap::new()).unwrap();
        assert!(shape.read().unwrap().data.commands.is_empty());
    }

    #[test]
    fn retains_a_pen_position_past_the_signed_thirty_two_bit_range() {
        let mut glyphs = ShapeWriter::new();
        for _ in 0..2 {
            glyphs.write_unsigned(0, 1);
            glyphs.write_unsigned(0x7fff_ffff, 32);
        }
        let bytes = join_bytes(&[
            &[1, 32, 0x8c],
            &uint16(1),
            &[0, 0, 0],
            &uint16(1024),
            &[2],
            &glyphs.to_bytes(),
            &[0],
        ]);
        let mut source = reader(bytes);
        let shape = create_swf_text_shape(&mut source, 1, &HashMap::new()).unwrap();
        assert!(shape.read().unwrap().data.commands.is_empty());
    }
}

mod read_swf_font_glyph_outline_source {
    use super::*;

    #[test]
    fn recovers_codepoints_layout_metrics_advances_and_design_unit_paths() {
        let glyph = box_glyph_bytes(256);
        let offsets = join_bytes(&[&uint16(4), &uint16((4 + glyph.len()) as u16)]);
        let bytes = join_bytes(&[
            &uint16(7),
            &[FONT_HAS_LAYOUT, 0, 0],
            &uint16(1),
            &offsets,
            &glyph,
            &[0x41],
            &uint16(800),
            &uint16(200),
            &uint16(50),
            &uint16(600),
            &ZERO_RECTANGLE,
            &uint16(0),
        ]);
        let mut source = reader(bytes);
        let font = read_swf_font_glyph_outline_source(&mut source, 2, None, None).unwrap();
        let mut outline = create_path(Some(flight_path::PathWinding::NonZero));
        assert_eq!((font.get_glyph_outline_index_for_code_point)(0x41), 0);
        assert_eq!((font.get_glyph_outline_index_for_code_point)(0x42), -1);
        assert_eq!((font.get_glyph_outline_advance)(0), 600.0);
        let metrics = (font.get_glyph_outline_metrics)();
        assert_eq!(metrics.ascent, 800.0);
        assert_eq!(metrics.descent, 200.0);
        assert_eq!(metrics.line_gap, 50.0);
        assert_eq!(metrics.units_per_em, 1024.0);
        assert!((font.get_glyph_outline)(&mut outline, 0));
        assert!(outline.data.contains(&256.0));
    }

    #[test]
    fn keeps_legacy_fonts_index_addressable_without_inventing_codepoints() {
        let font = box_font(512);
        assert_eq!((font.get_glyph_outline_index_for_code_point)(0x41), -1);
        assert_eq!((font.get_glyph_outline_advance)(0), 512.0);
    }
}

mod read_swf_font_glyphs {
    use super::*;

    #[test]
    fn reads_version_one_count_from_the_offset_table() {
        let glyph = box_glyph_bytes(512);
        let bytes = join_bytes(&[&uint16(4), &uint16(2), &glyph]);
        let mut source = reader(bytes);
        let glyphs = read_swf_font_glyphs(&mut source, 1).unwrap();
        assert_eq!(glyphs.len(), 1);
        let commands = &glyphs[0].as_ref().unwrap().read().unwrap().data.commands;
        assert_command(commands, 0, "beginFill");
        assert_number(commands, 1, 2.0);
        assert_number(commands, 2, 0x000000ff_u32 as f64);
        assert_number(commands, 3, 1.0);
    }

    #[test]
    fn reads_version_two_declared_count_and_code_table_offset() {
        let glyph = box_glyph_bytes(256);
        let offsets = join_bytes(&[&uint16(4), &uint16((4 + glyph.len()) as u16)]);
        let bytes = join_bytes(&[&uint16(7), &[0, 0, 0], &uint16(1), &offsets, &glyph]);
        let mut source = reader(bytes);
        let glyphs = read_swf_font_glyphs(&mut source, 2).unwrap();
        assert_eq!(glyphs.len(), 1);
        let commands = &glyphs[0].as_ref().unwrap().read().unwrap().data.commands;
        assert_command(commands, 0, "beginFill");
        assert_number(commands, 1, 2.0);
        assert_number(commands, 2, 0x000000ff_u32 as f64);
        assert_number(commands, 3, 1.0);
    }

    #[test]
    fn returns_none_when_an_offset_runs_past_the_tag() {
        let mut source = reader(join_bytes(&[&uint16(4), &uint16(0x7fff)]));
        assert!(read_swf_font_glyphs(&mut source, 1).is_none());
    }
}

mod resolve_swf_font_units_per_em {
    use super::*;

    #[test]
    fn reports_the_finer_version_three_grid() {
        assert_eq!(resolve_swf_font_units_per_em(1), 1024.0);
        assert_eq!(resolve_swf_font_units_per_em(2), 1024.0);
        assert_eq!(resolve_swf_font_units_per_em(3), 20_480.0);
    }
}

fn assert_command(commands: &[ShapeCommandToken], index: usize, expected: &str) {
    assert!(matches!(&commands[index], ShapeCommandToken::String(value) if value == expected));
}

fn assert_number(commands: &[ShapeCommandToken], index: usize, expected: f64) {
    let ShapeCommandToken::Number(actual) = commands[index] else {
        panic!("number token");
    };
    assert!((actual - expected).abs() < 1e-6, "{actual} != {expected}");
}

fn box_font(size: i32) -> Arc<GlyphOutlineSource> {
    let glyph = box_glyph_bytes(size);
    let bytes = join_bytes(&[&uint16(1), &uint16(2), &glyph]);
    let mut source = reader(bytes);
    return read_swf_font_glyph_outline_source(&mut source, 1, None, None).unwrap();
}

fn box_font_version_three(size: i32) -> Arc<GlyphOutlineSource> {
    let glyph = box_glyph_bytes(size);
    let bytes = join_bytes(&[
        &uint16(3),
        &[0, 0, 0],
        &uint16(1),
        &uint16(4),
        &uint16((4 + glyph.len()) as u16),
        &glyph,
        &[0x41],
    ]);
    let mut source = reader(bytes);
    return read_swf_font_glyph_outline_source(&mut source, 3, None, None).unwrap();
}

fn box_glyph_bytes(size: i32) -> Vec<u8> {
    let mut writer = ShapeWriter::new();
    writer.write_style_bits(1, 0);
    writer.write_style_change(1, 0, 0);
    writer.write_straight_edge(size, 0);
    writer.write_straight_edge(0, size);
    writer.write_straight_edge(-size, 0);
    writer.write_straight_edge(0, -size);
    writer.write_end_shape();
    return writer.to_bytes();
}

fn command_count(commands: &[ShapeCommandToken], key: &str) -> usize {
    return commands
        .iter()
        .filter(|token| matches!(token, ShapeCommandToken::String(value) if value == key))
        .count();
}

fn command_index_from(commands: &[ShapeCommandToken], key: &str, start: usize) -> usize {
    return start
        + commands[start..]
            .iter()
            .position(|token| matches!(token, ShapeCommandToken::String(value) if value == key))
            .unwrap();
}

fn signed_bit_count(values: &[i32]) -> u8 {
    for bits in 2..32 {
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

fn text_shape(
    fonts: &HashMap<u32, Arc<GlyphOutlineSource>>,
    font_id: u16,
) -> Arc<std::sync::RwLock<Shape>> {
    let mut writer = TextWriter::new();
    writer.write_record(0, None, font_id, 512);
    writer.write_glyph(0, 0);
    writer.end();
    let mut source = reader(writer.to_bytes());
    return create_swf_text_shape(&mut source, 1, fonts).unwrap();
}

struct ShapeWriter {
    bits: Vec<u8>,
}

impl ShapeWriter {
    fn new() -> Self {
        return Self { bits: Vec::new() };
    }

    fn align(&mut self) {
        while !self.bits.len().is_multiple_of(8) {
            self.bits.push(0);
        }
    }

    fn to_bytes(&self) -> Vec<u8> {
        let mut bytes = vec![0; self.bits.len().div_ceil(8)];
        for (index, bit) in self.bits.iter().enumerate() {
            bytes[index / 8] |= bit << (7 - index % 8);
        }
        return bytes;
    }

    fn write_end_shape(&mut self) {
        self.write_unsigned(0, 1);
        self.write_unsigned(0, 5);
        self.align();
    }

    fn write_signed(&mut self, value: i32, count: u8) {
        let mask = if count == 32 {
            u32::MAX
        } else {
            (1_u32 << count) - 1
        };
        self.write_unsigned(value as u32 & mask, count);
    }

    fn write_straight_edge(&mut self, delta_x: i32, delta_y: i32) {
        let bits = signed_bit_count(&[delta_x, delta_y]);
        self.write_unsigned(1, 1);
        self.write_unsigned(1, 1);
        self.write_unsigned(u32::from(bits - 2), 4);
        self.write_unsigned(1, 1);
        self.write_signed(delta_x, bits);
        self.write_signed(delta_y, bits);
    }

    fn write_style_bits(&mut self, fill_bits: u8, line_bits: u8) {
        self.align();
        self.write_unsigned(u32::from(fill_bits), 4);
        self.write_unsigned(u32::from(line_bits), 4);
    }

    fn write_style_change(&mut self, fill_1: u32, x: i32, y: i32) {
        self.write_unsigned(0, 1);
        self.write_unsigned(0, 1);
        self.write_unsigned(0, 1);
        self.write_unsigned(1, 1);
        self.write_unsigned(0, 1);
        self.write_unsigned(1, 1);
        let bits = signed_bit_count(&[x, y]);
        self.write_unsigned(u32::from(bits), 5);
        self.write_signed(x, bits);
        self.write_signed(y, bits);
        self.write_unsigned(fill_1, 1);
    }

    fn write_unsigned(&mut self, value: u32, count: u8) {
        for index in (0..count).rev() {
            self.bits.push(((value >> index) & 1) as u8);
        }
    }
}

struct TextWriter {
    bits: Vec<u8>,
    bytes: Vec<u8>,
    glyph_count_index: Option<usize>,
}

impl TextWriter {
    fn new() -> Self {
        return Self {
            bits: Vec::new(),
            bytes: Vec::new(),
            glyph_count_index: None,
        };
    }

    fn end(&mut self) {
        self.flush();
        self.bytes.push(0);
    }

    fn flush(&mut self) {
        if self.bits.is_empty() {
            return;
        }
        while !self.bits.len().is_multiple_of(8) {
            self.bits.push(0);
        }
        let glyphs = self.bits.len() / 20;
        if let Some(index) = self.glyph_count_index {
            self.bytes[index] = glyphs as u8;
        }
        for bits in self.bits.chunks(8) {
            let mut byte = 0;
            for bit in bits {
                byte = byte << 1 | bit;
            }
            self.bytes.push(byte);
        }
        self.bits.clear();
    }

    fn to_bytes(&mut self) -> Vec<u8> {
        self.flush();
        let mut bytes = vec![4, 16];
        bytes.extend_from_slice(&self.bytes);
        return bytes;
    }

    fn write_glyph(&mut self, index: u32, advance: i32) {
        for bit in (0..4).rev() {
            self.bits.push(((index >> bit) & 1) as u8);
        }
        let value = advance as u32 & 0xffff;
        for bit in (0..16).rev() {
            self.bits.push(((value >> bit) & 1) as u8);
        }
    }

    fn write_record(&mut self, color: u32, alpha: Option<u8>, font_id: u16, height: u16) {
        self.flush();
        self.bytes
            .push(TEXT_RECORD_TYPE | TEXT_HAS_FONT | TEXT_HAS_COLOR);
        self.bytes.extend_from_slice(&uint16(font_id));
        self.bytes.push((color >> 16) as u8);
        self.bytes.push((color >> 8) as u8);
        self.bytes.push(color as u8);
        if let Some(alpha) = alpha {
            self.bytes.push(alpha);
        }
        self.bytes.extend_from_slice(&uint16(height));
        self.bytes.push(0);
        self.glyph_count_index = Some(self.bytes.len() - 1);
    }
}

const FONT_HAS_LAYOUT: u8 = 0x80;
const TEXT_HAS_COLOR: u8 = 0x04;
const TEXT_HAS_FONT: u8 = 0x08;
const TEXT_RECORD_TYPE: u8 = 0x80;
const ZERO_RECTANGLE: [u8; 2] = [0x08, 0];
