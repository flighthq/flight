use std::sync::{Arc, RwLock};

use flight_shape::{
    MorphShape, MorphShapePaintBinding, ShapeCommandToken, set_morph_shape_progress,
};
use flight_swf::{SwfMorphBitmapFillResolver, create_swf_morph_shape};
use flight_texture::create_texture;

use crate::support::{join_bytes, reader, uint16, uint32};

mod create_swf_morph_shape {
    use super::*;

    #[test]
    fn morphs_a_solid_fills_geometry_and_color_under_one_progress() {
        let shape = read_morph(build_morph(None, Some(400), Some(200)), None).unwrap();

        set_morph_shape_progress(&shape, 0.0);
        assert_eq!(fill_of(&shape), (0xff0000ff, 1.0));
        assert_approx(width_of(&shape), 10.0);

        set_morph_shape_progress(&shape, 1.0);
        assert_eq!(fill_of(&shape), (0x0000ffff, 0.0));
        assert_approx(width_of(&shape), 20.0);

        set_morph_shape_progress(&shape, 0.5);
        assert_eq!(fill_of(&shape), (0x800080ff, 0.5));
        assert_approx(width_of(&shape), 15.0);
    }

    #[test]
    fn carries_every_compound_fill_in_one_node_on_its_own_path() {
        let shape = read_morph(build_compound_morph(), None).unwrap();
        {
            let guard = shape.read().unwrap();
            assert_eq!(guard.data.path_bindings.len(), 2);
            assert!(matches!(
                guard.data.paint_bindings.as_slice(),
                [
                    MorphShapePaintBinding::Color(_),
                    MorphShapePaintBinding::Color(_)
                ]
            ));
        }

        set_morph_shape_progress(&shape, 0.5);
        assert_eq!(
            fill_values(&shape),
            vec![(0x800080ff, 1.0), (0x008000ff, 1.0)]
        );
    }

    #[test]
    fn morphs_a_strokes_thickness_and_color() {
        let shape = read_morph(build_stroke_morph(), None).unwrap();
        set_morph_shape_progress(&shape, 0.5);
        let guard = shape.read().unwrap();
        let index = command_index(&guard.data.commands, "lineStyle");
        assert_number(&guard.data.commands[index + 2], 15.0);
        assert_number(&guard.data.commands[index + 3], 0x808000ff_u32 as f64);
    }

    #[test]
    fn shares_one_texture_and_morphs_only_its_matrix() {
        let texture = Arc::new(RwLock::new(create_texture(None)));
        let result = texture.clone();
        let resolver: SwfMorphBitmapFillResolver =
            Arc::new(move |_character, _repeat, _smoothed| Some(result.clone()));
        let shape = read_morph(build_bitmap_morph(), Some(&resolver)).unwrap();
        let guard = shape.read().unwrap();
        assert!(matches!(
            guard.data.paint_bindings.as_slice(),
            [MorphShapePaintBinding::Texture(_)]
        ));
        let index = command_index(&guard.data.commands, "beginTextureFill");
        let ShapeCommandToken::Texture(actual) = &guard.data.commands[index + 2] else {
            panic!("beginTextureFill texture token");
        };
        assert!(Arc::ptr_eq(actual, &texture));
    }

    #[test]
    fn stays_silent_when_every_path_pair_morphs() {
        let bytes = build_morph(None, Some(400), Some(200));
        let mut source = reader(bytes);
        let mut diagnostics = Vec::new();
        let shape = create_swf_morph_shape(&mut source, 1, None, Some(&mut diagnostics));
        assert!(shape.is_some());
        assert!(diagnostics.is_empty());
    }

    #[test]
    fn returns_none_for_a_body_that_does_not_decode() {
        assert!(read_morph(Vec::new(), None).is_none());
        assert!(read_morph(vec![1, 2, 3, 4, 5], None).is_none());
        assert!(read_morph(build_morph(Some(0xffff), None, None), None).is_none());
    }

    #[test]
    fn never_panics_on_arbitrary_bytes() {
        let mut seed = 0x51f3a20b_u32;
        for _ in 0..400 {
            let mut bytes = build_morph(None, None, None);
            for _ in 0..3 {
                seed = seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
                let index = seed as usize % bytes.len();
                seed = seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
                bytes[index] = seed as u8;
            }
            let result = std::panic::catch_unwind(|| read_morph(bytes, None));
            assert!(result.is_ok());
        }
    }
}

fn assert_approx(actual: f64, expected: f64) {
    assert!((actual - expected).abs() < 1e-6, "{actual} != {expected}");
}

fn assert_number(token: &ShapeCommandToken, expected: f64) {
    let ShapeCommandToken::Number(actual) = token else {
        panic!("number token");
    };
    assert_approx(*actual, expected);
}

fn box_edges(width: i32, fill: u32, line: u32) -> Vec<u8> {
    let mut writer = ShapeWriter::new();
    writer.write_style_bits(2, 2);
    writer.write_style_change(Some(fill), Some(line), Some((0, 0)), 2);
    write_box(&mut writer, width);
    writer.write_end_shape();
    return writer.to_bytes();
}

fn build_bitmap_morph() -> Vec<u8> {
    let start_edges = box_edges(200, 1, 0);
    let end_edges = box_edges(400, 1, 0);
    let mut identity = ShapeWriter::new();
    identity.write_identity_matrix(0, 0);
    let matrix = identity.to_bytes();
    let styles = join_bytes(&[&[1, 0x41], &uint16(9), &matrix, &matrix, &[0]]);
    return join_bytes(&[
        &uint32((styles.len() + start_edges.len()) as u32),
        &styles,
        &start_edges,
        &end_edges,
    ]);
}

fn build_compound_morph() -> Vec<u8> {
    let start_edges = two_box_edges(200);
    let end_edges = two_box_edges(400);
    let styles = join_bytes(&[
        &[2, 0],
        &rgba(0xff, 0, 0, 0xff),
        &rgba(0, 0, 0xff, 0xff),
        &[0],
        &rgba(0, 0xff, 0, 0xff),
        &rgba(0, 0, 0, 0xff),
        &[0],
    ]);
    return join_bytes(&[
        &uint32((styles.len() + start_edges.len()) as u32),
        &styles,
        &start_edges,
        &end_edges,
    ]);
}

fn build_morph(
    end_edges_offset: Option<u32>,
    end_width: Option<i32>,
    start_width: Option<i32>,
) -> Vec<u8> {
    let start_edges = box_edges(start_width.unwrap_or(200), 1, 0);
    let end_edges = box_edges(end_width.unwrap_or(400), 1, 0);
    let styles = join_bytes(&[&[1, 0], &rgba(0xff, 0, 0, 0xff), &rgba(0, 0, 0xff, 0), &[0]]);
    let offset = end_edges_offset.unwrap_or((styles.len() + start_edges.len()) as u32);
    return join_bytes(&[&uint32(offset), &styles, &start_edges, &end_edges]);
}

fn build_stroke_morph() -> Vec<u8> {
    let start_edges = box_edges(200, 0, 1);
    let end_edges = box_edges(400, 0, 1);
    let styles = join_bytes(&[
        &[0, 1],
        &uint16(200),
        &uint16(400),
        &rgba(0xff, 0, 0, 0xff),
        &rgba(0, 0xff, 0, 0xff),
    ]);
    return join_bytes(&[
        &uint32((styles.len() + start_edges.len()) as u32),
        &styles,
        &start_edges,
        &end_edges,
    ]);
}

fn command_index(commands: &[ShapeCommandToken], key: &str) -> usize {
    return commands
        .iter()
        .position(|token| matches!(token, ShapeCommandToken::String(value) if value == key))
        .unwrap();
}

fn fill_of(shape: &Arc<RwLock<MorphShape>>) -> (u32, f64) {
    return fill_values(shape)[0];
}

fn fill_values(shape: &Arc<RwLock<MorphShape>>) -> Vec<(u32, f64)> {
    let guard = shape.read().unwrap();
    let mut values = Vec::new();
    for index in 0..guard.data.commands.len() {
        if !matches!(&guard.data.commands[index], ShapeCommandToken::String(value) if value == "beginFill")
        {
            continue;
        }
        let ShapeCommandToken::Number(color) = guard.data.commands[index + 2] else {
            panic!("beginFill color token");
        };
        let ShapeCommandToken::Number(alpha) = guard.data.commands[index + 3] else {
            panic!("beginFill alpha token");
        };
        values.push((color as u32, alpha));
    }
    return values;
}

fn read_morph(
    bytes: Vec<u8>,
    resolver: Option<&SwfMorphBitmapFillResolver>,
) -> Option<Arc<RwLock<MorphShape>>> {
    let mut source = reader(bytes);
    return create_swf_morph_shape(&mut source, 1, resolver, None);
}

fn rgba(red: u8, green: u8, blue: u8, alpha: u8) -> [u8; 4] {
    return [red, green, blue, alpha];
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

fn two_box_edges(width: i32) -> Vec<u8> {
    let mut writer = ShapeWriter::new();
    writer.write_style_bits(2, 2);
    writer.write_style_change(Some(1), None, Some((0, 0)), 2);
    write_box(&mut writer, width);
    writer.write_style_change(Some(2), None, Some((1000, 0)), 2);
    write_box(&mut writer, width);
    writer.write_end_shape();
    return writer.to_bytes();
}

fn width_of(shape: &Arc<RwLock<MorphShape>>) -> f64 {
    let path = shape.read().unwrap().data.path_bindings[0].path.clone();
    let guard = path.read().unwrap();
    let mut minimum = f64::INFINITY;
    let mut maximum = f64::NEG_INFINITY;
    for index in (0..guard.data.len()).step_by(2) {
        minimum = minimum.min(guard.data[index]);
        maximum = maximum.max(guard.data[index]);
    }
    return maximum - minimum;
}

fn write_box(writer: &mut ShapeWriter, width: i32) {
    writer.write_straight_edge(width, 0);
    writer.write_straight_edge(0, width);
    writer.write_straight_edge(-width, 0);
    writer.write_straight_edge(0, -width);
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

    fn write_identity_matrix(&mut self, translate_x: i32, translate_y: i32) {
        self.align();
        self.write_unsigned(0, 1);
        self.write_unsigned(0, 1);
        let bits = signed_bit_count(&[translate_x, translate_y]);
        self.write_unsigned(u32::from(bits), 5);
        self.write_signed(translate_x, bits);
        self.write_signed(translate_y, bits);
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

    fn write_style_change(
        &mut self,
        fill_1: Option<u32>,
        line: Option<u32>,
        move_to: Option<(i32, i32)>,
        style_bits: u8,
    ) {
        self.write_unsigned(0, 1);
        self.write_unsigned(0, 1);
        self.write_unsigned(u32::from(line.is_some()), 1);
        self.write_unsigned(u32::from(fill_1.is_some()), 1);
        self.write_unsigned(0, 1);
        self.write_unsigned(u32::from(move_to.is_some()), 1);
        if let Some((x, y)) = move_to {
            let bits = signed_bit_count(&[x, y]);
            self.write_unsigned(u32::from(bits), 5);
            self.write_signed(x, bits);
            self.write_signed(y, bits);
        }
        if let Some(value) = fill_1 {
            self.write_unsigned(value, style_bits);
        }
        if let Some(value) = line {
            self.write_unsigned(value, style_bits);
        }
    }

    fn write_unsigned(&mut self, value: u32, count: u8) {
        for index in (0..count).rev() {
            self.bits.push(((value >> index) & 1) as u8);
        }
    }
}
