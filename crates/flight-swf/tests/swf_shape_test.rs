use std::sync::{Arc, Mutex, RwLock};

use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
};
use flight_shape::ShapeCommandToken;
use flight_swf::contract::*;
use flight_texture::{Texture, create_texture, get_texture_source};

use crate::support::reader;

mod create_swf_glyph_shape {
    use super::*;

    #[test]
    fn decodes_a_bare_shape_with_an_implicit_fill() {
        let mut writer = ShapeWriter::new();
        writer.write_style_bits(1, 0);
        writer.write_style_change(None, Some(1), None, Some((0, 0)), 1);
        writer.write_straight_edge(1024, 0);
        writer.write_straight_edge(0, 1024);
        writer.write_end_shape();
        let mut source = reader(writer.to_bytes());
        let shape = create_swf_glyph_shape(&mut source).unwrap();
        let commands = &shape.read().unwrap().data.commands;
        assert_commands(
            &commands[..12],
            &[
                ExpectedCommand::String("beginFill"),
                ExpectedCommand::Number(2.0),
                ExpectedCommand::Number(0x000000ff as f64),
                ExpectedCommand::Number(1.0),
                ExpectedCommand::String("moveTo"),
                ExpectedCommand::Number(2.0),
                ExpectedCommand::Number(0.0),
                ExpectedCommand::Number(0.0),
                ExpectedCommand::String("lineTo"),
                ExpectedCommand::Number(2.0),
                ExpectedCommand::Number(51.2),
                ExpectedCommand::Number(0.0),
            ],
        );
    }

    #[test]
    fn returns_null_when_records_run_out() {
        let mut writer = ShapeWriter::new();
        writer.write_style_bits(1, 0);
        writer.write_style_change(None, Some(1), None, Some((0, 0)), 1);
        let mut bytes = writer.to_bytes();
        bytes.pop();
        let mut source = reader(bytes);
        assert!(create_swf_glyph_shape(&mut source).is_none());
    }
}

mod create_swf_shape {
    use super::*;

    #[test]
    fn converts_twips_and_preserves_quadratic_edges() {
        let mut writer = basic_shape(&[0x0000ff]);
        writer.write_style_bits(1, 0);
        writer.write_style_change(None, Some(1), None, Some((20, 40)), 1);
        writer.write_curved_edge(200, 0, 200, 100);
        writer.write_end_shape();
        let shape = decode(writer, 1, None, None).unwrap();
        let commands = &shape.read().unwrap().data.commands;
        assert_commands(
            commands,
            &[
                ExpectedCommand::String("beginFill"),
                ExpectedCommand::Number(2.0),
                ExpectedCommand::Number(0x0000ffff as f64),
                ExpectedCommand::Number(1.0),
                ExpectedCommand::String("moveTo"),
                ExpectedCommand::Number(2.0),
                ExpectedCommand::Number(1.0),
                ExpectedCommand::Number(2.0),
                ExpectedCommand::String("quadraticCurveTo"),
                ExpectedCommand::Number(4.0),
                ExpectedCommand::Number(11.0),
                ExpectedCommand::Number(2.0),
                ExpectedCommand::Number(21.0),
                ExpectedCommand::Number(7.0),
                ExpectedCommand::String("endFill"),
                ExpectedCommand::Number(0.0),
            ],
        );
    }

    #[test]
    fn decodes_a_solid_filled_rectangle() {
        let mut writer = basic_shape(&[0xff0000]);
        writer.write_style_bits(1, 0);
        writer.write_style_change(None, Some(1), None, Some((0, 0)), 1);
        writer.write_straight_edge(2000, 0);
        writer.write_straight_edge(0, 1000);
        writer.write_straight_edge(-2000, 0);
        writer.write_straight_edge(0, -1000);
        writer.write_end_shape();
        let shape = decode(writer, 1, None, None).unwrap();
        let commands = &shape.read().unwrap().data.commands;
        assert_commands(
            commands,
            &[
                ExpectedCommand::String("beginFill"),
                ExpectedCommand::Number(2.0),
                ExpectedCommand::Number(0xff0000ff_u32 as f64),
                ExpectedCommand::Number(1.0),
                ExpectedCommand::String("moveTo"),
                ExpectedCommand::Number(2.0),
                ExpectedCommand::Number(0.0),
                ExpectedCommand::Number(0.0),
                ExpectedCommand::String("lineTo"),
                ExpectedCommand::Number(2.0),
                ExpectedCommand::Number(100.0),
                ExpectedCommand::Number(0.0),
                ExpectedCommand::String("lineTo"),
                ExpectedCommand::Number(2.0),
                ExpectedCommand::Number(100.0),
                ExpectedCommand::Number(50.0),
                ExpectedCommand::String("lineTo"),
                ExpectedCommand::Number(2.0),
                ExpectedCommand::Number(0.0),
                ExpectedCommand::Number(50.0),
                ExpectedCommand::String("lineTo"),
                ExpectedCommand::Number(2.0),
                ExpectedCommand::Number(0.0),
                ExpectedCommand::Number(0.0),
                ExpectedCommand::String("endFill"),
                ExpectedCommand::Number(0.0),
            ],
        );
    }

    #[test]
    fn decodes_gradient_ratios_and_converted_translation() {
        let mut writer = ShapeWriter::new();
        writer.write_byte(1);
        writer.write_byte(0x10);
        writer.write_identity_matrix(400, 800);
        writer.write_gradient(&[(0xff0000, 0), (0x0000ff, 255)]);
        writer.write_byte(0);
        writer.write_style_bits(1, 0);
        writer.write_style_change(None, Some(1), None, Some((0, 0)), 1);
        writer.write_straight_edge(2000, 0);
        writer.write_end_shape();
        let shape = decode(writer, 1, None, None).unwrap();
        let commands = &shape.read().unwrap().data.commands;
        assert_string(&commands[0], "beginGradientFill");
        assert_string(&commands[2], "linear");
        let ShapeCommandToken::Numbers(colors) = &commands[3] else {
            panic!("expected colors");
        };
        assert_eq!(
            colors.values,
            vec![0xff0000ff_u32 as f64, 0x0000ffff_u32 as f64]
        );
        let ShapeCommandToken::Numbers(alphas) = &commands[4] else {
            panic!("expected alphas");
        };
        assert_eq!(alphas.values, vec![1.0, 1.0]);
        let ShapeCommandToken::Numbers(ratios) = &commands[5] else {
            panic!("expected ratios");
        };
        assert_eq!(ratios.values, vec![0.0, 255.0]);
        let ShapeCommandToken::Matrix(matrix) = &commands[6] else {
            panic!("expected matrix");
        };
        assert_eq!(
            (matrix.a, matrix.b, matrix.c, matrix.d, matrix.tx, matrix.ty),
            (1.0, 0.0, 0.0, 1.0, 20.0, 40.0),
        );
        assert_string(&commands[7], "pad");
    }

    #[test]
    fn emits_strokes_in_pixels_without_a_fill() {
        let mut writer = ShapeWriter::new();
        writer.write_byte(0);
        writer.write_byte(1);
        writer.write_uint16(40);
        writer.write_byte(0x10);
        writer.write_byte(0x20);
        writer.write_byte(0x30);
        writer.write_style_bits(0, 1);
        writer.write_style_change(None, None, Some(1), Some((0, 0)), 1);
        writer.write_straight_edge(2000, 0);
        writer.write_end_shape();
        let shape = decode(writer, 1, None, None).unwrap();
        let commands = &shape.read().unwrap().data.commands;
        assert_commands(
            commands,
            &[
                ExpectedCommand::String("lineStyle"),
                ExpectedCommand::Number(8.0),
                ExpectedCommand::Number(2.0),
                ExpectedCommand::Number(0x102030ff as f64),
                ExpectedCommand::Number(1.0),
                ExpectedCommand::Boolean(false),
                ExpectedCommand::String("normal"),
                ExpectedCommand::String("round"),
                ExpectedCommand::String("round"),
                ExpectedCommand::Number(3.0),
                ExpectedCommand::String("moveTo"),
                ExpectedCommand::Number(2.0),
                ExpectedCommand::Number(0.0),
                ExpectedCommand::Number(0.0),
                ExpectedCommand::String("lineTo"),
                ExpectedCommand::Number(2.0),
                ExpectedCommand::Number(100.0),
                ExpectedCommand::Number(0.0),
            ],
        );
    }

    #[test]
    fn hands_bitmap_sampling_flags_to_the_resolver() {
        let seen = Arc::new(Mutex::new(Vec::new()));
        for fill_type in [0x40, 0x41, 0x42, 0x43] {
            let mut writer = ShapeWriter::new();
            writer.write_byte(1);
            writer.write_bitmap_fill_style(fill_type, 3, 20.0);
            writer.write_byte(0);
            writer.write_style_bits(1, 0);
            writer.write_style_change(None, Some(1), None, Some((0, 0)), 1);
            writer.write_straight_edge(100, 0);
            writer.write_end_shape();
            let callback_seen = seen.clone();
            let resolver: SwfBitmapFillResolver = Arc::new(move |id, repeat, smoothed| {
                callback_seen.lock().unwrap().push((id, repeat, smoothed));
                Some(texture())
            });
            assert!(decode(writer, 3, Some(&resolver), None).is_some());
        }
        assert_eq!(
            *seen.lock().unwrap(),
            vec![
                (3, true, true),
                (3, false, true),
                (3, true, false),
                (3, false, false)
            ]
        );
    }

    #[test]
    fn keeps_geometry_when_a_bitmap_resolver_declines() {
        let writer = bitmap_shape(0x41, 99, 20.0, false);
        let resolver: SwfBitmapFillResolver = Arc::new(|_, _, _| None);
        let shape = decode(writer, 3, Some(&resolver), None).unwrap();
        let commands = &shape.read().unwrap().data.commands;
        assert_string(&commands[0], "beginFill");
        assert_eq!(string_count(commands, "lineTo"), 2);
    }

    #[test]
    fn keeps_an_invertible_bitmap_fill_matrix_and_reports_nothing() {
        let writer = bitmap_shape(0x41, 7, 20.0, false);
        let resolver: SwfBitmapFillResolver = Arc::new(|_, _, _| Some(texture()));
        let mut diagnostics = Vec::new();
        let shape = decode(writer, 3, Some(&resolver), Some(&mut diagnostics)).unwrap();
        assert!(diagnostics.is_empty());
        assert!(matches!(
            shape.read().unwrap().data.commands[3],
            ShapeCommandToken::Matrix(_),
        ));
    }

    #[test]
    fn converts_a_bitmap_fill_matrix_from_image_pixels_to_shape_pixels() {
        let writer = bitmap_shape(0x41, 7, 20.0, false);
        let resolver: SwfBitmapFillResolver = Arc::new(|_, _, _| Some(texture()));
        let shape = decode(writer, 3, Some(&resolver), None).unwrap();
        let commands = &shape.read().unwrap().data.commands;
        let ShapeCommandToken::Matrix(matrix) = &commands[3] else {
            panic!("expected matrix");
        };
        assert_eq!(
            (matrix.a, matrix.b, matrix.c, matrix.d, matrix.tx, matrix.ty),
            (1.0, 0.0, 0.0, 1.0, 0.0, 0.0),
        );
    }

    #[test]
    fn emits_bitmap_geometry_with_the_resolvers_sourceless_texture_identity() {
        let mut writer = ShapeWriter::new();
        writer.write_byte(1);
        writer.write_bitmap_fill_style(0x41, 7, 20.0);
        writer.write_byte(0);
        writer.write_style_bits(1, 0);
        writer.write_style_change(None, Some(1), None, Some((0, 0)), 1);
        writer.write_straight_edge(2000, 0);
        writer.write_end_shape();
        let seen = Arc::new(Mutex::new(Vec::new()));
        let expected = texture();
        let resolver_seen = seen.clone();
        let resolver_texture = expected.clone();
        let resolver: SwfBitmapFillResolver = Arc::new(move |character, _, _| {
            resolver_seen.lock().unwrap().push(character);
            return Some(resolver_texture.clone());
        });
        let shape = decode(writer, 1, Some(&resolver), None).unwrap();
        let commands = &shape.read().unwrap().data.commands;
        assert_string(&commands[0], "beginTextureFill");
        assert_eq!(string_count(commands, "lineTo"), 1);
        assert_eq!(*seen.lock().unwrap(), vec![7]);
        let ShapeCommandToken::Texture(actual) = &commands[2] else {
            panic!("expected texture");
        };
        assert!(Arc::ptr_eq(actual, &expected));
        assert!(get_texture_source(&*expected.read().unwrap()).is_none());
    }

    #[test]
    fn reads_shape_three_alpha() {
        let mut writer = ShapeWriter::new();
        writer.write_byte(1);
        writer.write_byte(0);
        for byte in [0x11, 0x22, 0x33, 0xff] {
            writer.write_byte(byte);
        }
        writer.write_byte(0);
        writer.write_style_bits(1, 0);
        writer.write_style_change(None, Some(1), None, Some((0, 0)), 1);
        writer.write_straight_edge(100, 0);
        writer.write_end_shape();
        let shape = decode(writer, 3, None, None).unwrap();
        let commands = &shape.read().unwrap().data.commands;
        assert_number(&commands[2], 0x112233ff as f64);
        assert_number(&commands[3], 1.0);
    }

    #[test]
    fn returns_null_for_a_body_that_runs_out_mid_record() {
        let mut writer = basic_shape(&[0xff0000]);
        writer.write_style_bits(1, 0);
        writer.write_style_change(None, Some(1), None, Some((0, 0)), 1);
        let mut bytes = writer.to_bytes();
        bytes.pop();
        let mut source = reader(bytes);
        assert!(create_swf_shape(&mut source, 1, None, None).is_none());
    }

    #[test]
    fn returns_null_for_an_unknown_fill_style_type() {
        let mut writer = ShapeWriter::new();
        writer.write_byte(1);
        writer.write_byte(0x99);
        writer.write_end_shape();
        assert!(decode(writer, 1, None, None).is_none());
    }

    #[test]
    fn reports_and_drops_a_singular_bitmap_matrix_only() {
        let writer = bitmap_shape(0x41, 7, 20.0, true);
        let resolver: SwfBitmapFillResolver = Arc::new(|_, _, _| Some(texture()));
        let mut diagnostics = Vec::new();
        let shape = decode(writer, 1, Some(&resolver), Some(&mut diagnostics)).unwrap();
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].kind, "swf.fill-matrix-singular");
        assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Recover);
        assert_eq!(
            diagnostics[0]
                .detail
                .as_ref()
                .and_then(|detail| detail.get("character")),
            Some(&ImportDiagnosticDetailValue::Number(7.0)),
        );
        let commands = &shape.read().unwrap().data.commands;
        assert_string(&commands[0], "beginTextureFill");
        assert!(matches!(commands[3], ShapeCommandToken::Null));
    }

    #[test]
    fn reverses_right_hand_fill_edges() {
        let mut writer = basic_shape(&[0x00ff00]);
        writer.write_style_bits(1, 0);
        writer.write_style_change(Some(1), None, None, Some((0, 0)), 1);
        writer.write_straight_edge(2000, 0);
        writer.write_straight_edge(0, 1000);
        writer.write_end_shape();
        let shape = decode(writer, 1, None, None).unwrap();
        let commands = &shape.read().unwrap().data.commands;
        assert_commands(
            commands,
            &[
                ExpectedCommand::String("beginFill"),
                ExpectedCommand::Number(2.0),
                ExpectedCommand::Number(0x00ff00ff as f64),
                ExpectedCommand::Number(1.0),
                ExpectedCommand::String("moveTo"),
                ExpectedCommand::Number(2.0),
                ExpectedCommand::Number(100.0),
                ExpectedCommand::Number(50.0),
                ExpectedCommand::String("lineTo"),
                ExpectedCommand::Number(2.0),
                ExpectedCommand::Number(100.0),
                ExpectedCommand::Number(0.0),
                ExpectedCommand::String("lineTo"),
                ExpectedCommand::Number(2.0),
                ExpectedCommand::Number(0.0),
                ExpectedCommand::Number(0.0),
                ExpectedCommand::String("endFill"),
                ExpectedCommand::Number(0.0),
            ],
        );
    }

    #[test]
    fn stitches_separately_declared_runs() {
        let mut writer = basic_shape(&[0xffffff]);
        writer.write_style_bits(1, 0);
        writer.write_style_change(None, Some(1), None, Some((2000, 0)), 1);
        writer.write_straight_edge(-2000, 1000);
        writer.write_style_change(None, Some(1), None, Some((0, 1000)), 1);
        writer.write_straight_edge(0, -1000);
        writer.write_straight_edge(2000, 0);
        writer.write_end_shape();
        let shape = decode(writer, 1, None, None).unwrap();
        let shape = shape.read().unwrap();
        assert_commands(
            &shape.data.commands,
            &[
                ExpectedCommand::String("beginFill"),
                ExpectedCommand::Number(2.0),
                ExpectedCommand::Number(0xffffffff_u32 as f64),
                ExpectedCommand::Number(1.0),
                ExpectedCommand::String("moveTo"),
                ExpectedCommand::Number(2.0),
                ExpectedCommand::Number(100.0),
                ExpectedCommand::Number(0.0),
                ExpectedCommand::String("lineTo"),
                ExpectedCommand::Number(2.0),
                ExpectedCommand::Number(0.0),
                ExpectedCommand::Number(50.0),
                ExpectedCommand::String("lineTo"),
                ExpectedCommand::Number(2.0),
                ExpectedCommand::Number(0.0),
                ExpectedCommand::Number(0.0),
                ExpectedCommand::String("lineTo"),
                ExpectedCommand::Number(2.0),
                ExpectedCommand::Number(100.0),
                ExpectedCommand::Number(0.0),
                ExpectedCommand::String("endFill"),
                ExpectedCommand::Number(0.0),
            ],
        );
    }
}

mod read_swf_morph_shape_paths {
    use super::*;

    #[test]
    fn keys_both_endpoints_by_the_start_style_index_in_pixels() {
        let mut start = morph_reader(200);
        let mut end = morph_reader(400);
        let paths = read_swf_morph_shape_paths(&mut start, &mut end).unwrap();
        assert_eq!(paths.fills.keys().copied().collect::<Vec<_>>(), vec![1]);
        let pair = paths.fills.get(&1).unwrap();
        assert_eq!(&pair.start.data[..4], &[0.0, 0.0, 10.0, 0.0]);
        assert_eq!(&pair.end.data[..4], &[0.0, 0.0, 20.0, 0.0]);
    }

    #[test]
    fn gives_the_two_endpoints_identical_structure() {
        let mut start = morph_reader(200);
        let mut end = morph_reader(400);
        let paths = read_swf_morph_shape_paths(&mut start, &mut end).unwrap();
        let pair = paths.fills.get(&1).unwrap();
        assert_eq!(pair.start.commands, pair.end.commands);
        assert_eq!(pair.start.data.len(), pair.end.data.len());
    }

    #[test]
    fn pairs_edges_when_only_the_end_changes_style() {
        let mut start = ShapeWriter::new();
        start.write_style_bits(2, 2);
        start.write_style_change(None, Some(1), None, Some((0, 0)), 2);
        start.write_straight_edge(200, 0);
        start.write_straight_edge(0, 200);
        start.write_end_shape();
        let mut end = ShapeWriter::new();
        end.write_style_bits(2, 2);
        end.write_style_change(None, Some(1), None, Some((0, 0)), 2);
        end.write_straight_edge(400, 0);
        end.write_style_change(None, None, None, Some((400, 0)), 2);
        end.write_straight_edge(0, 400);
        end.write_end_shape();
        let mut start = reader(start.to_bytes());
        let mut end = reader(end.to_bytes());
        let paths = read_swf_morph_shape_paths(&mut start, &mut end).unwrap();
        assert_eq!(paths.fills.keys().copied().collect::<Vec<_>>(), vec![1]);
        let pair = paths.fills.get(&1).unwrap();
        assert_eq!(pair.start.commands, pair.end.commands);
    }

    #[test]
    fn rejects_endpoints_that_introduce_styles() {
        let mut writer = ShapeWriter::new();
        writer.write_style_bits(1, 1);
        writer.write_new_styles_record();
        let mut start = reader(writer.to_bytes());
        let mut end = morph_reader(200);
        assert!(read_swf_morph_shape_paths(&mut start, &mut end).is_none());
    }
}

enum ExpectedCommand<'a> {
    Boolean(bool),
    Number(f64),
    String(&'a str),
}

fn assert_commands(actual: &[ShapeCommandToken], expected: &[ExpectedCommand<'_>]) {
    assert_eq!(actual.len(), expected.len());
    for (actual, expected) in actual.iter().zip(expected.iter()) {
        match expected {
            ExpectedCommand::Boolean(expected) => {
                let ShapeCommandToken::Boolean(actual) = actual else {
                    panic!("expected boolean: {actual:?}");
                };
                assert_eq!(actual, expected);
            }
            ExpectedCommand::Number(expected) => assert_number(actual, *expected),
            ExpectedCommand::String(expected) => assert_string(actual, expected),
        }
    }
}

fn assert_number(token: &ShapeCommandToken, expected: f64) {
    let ShapeCommandToken::Number(actual) = token else {
        panic!("expected number");
    };
    assert!((actual - expected).abs() <= 4.0 * f64::EPSILON * expected.abs().max(1.0));
}

fn assert_string(token: &ShapeCommandToken, expected: &str) {
    let ShapeCommandToken::String(actual) = token else {
        panic!("expected string");
    };
    assert_eq!(actual, expected);
}

fn basic_shape(colors: &[u32]) -> ShapeWriter {
    let mut writer = ShapeWriter::new();
    writer.write_byte(colors.len() as u8);
    for color in colors {
        writer.write_byte(0);
        writer.write_byte((color >> 16) as u8);
        writer.write_byte((color >> 8) as u8);
        writer.write_byte(*color as u8);
    }
    writer.write_byte(0);
    return writer;
}

fn bitmap_shape(fill_type: u8, character_id: u16, scale: f32, singular: bool) -> ShapeWriter {
    let mut writer = ShapeWriter::new();
    writer.write_byte(1);
    writer.write_byte(fill_type);
    writer.write_uint16(character_id);
    if singular {
        writer.write_zero_scale_matrix();
    } else {
        writer.write_scale_matrix(scale);
    }
    writer.write_byte(0);
    writer.write_style_bits(1, 0);
    writer.write_style_change(None, Some(1), None, Some((0, 0)), 1);
    writer.write_straight_edge(2000, 0);
    writer.write_straight_edge(0, 1000);
    writer.write_end_shape();
    return writer;
}

fn decode(
    writer: ShapeWriter,
    version: u32,
    resolver: Option<&SwfBitmapFillResolver>,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<flight_entity::Ref<flight_shape::Shape>> {
    let mut source = reader(writer.to_bytes());
    return create_swf_shape(&mut source, version, resolver, diagnostics);
}

fn morph_reader(width: i32) -> SwfReader {
    let mut writer = ShapeWriter::new();
    writer.write_style_bits(2, 2);
    writer.write_style_change(None, Some(1), None, Some((0, 0)), 2);
    writer.write_straight_edge(width, 0);
    writer.write_straight_edge(0, width);
    writer.write_straight_edge(-width, 0);
    writer.write_straight_edge(0, -width);
    writer.write_end_shape();
    return reader(writer.to_bytes());
}

fn string_count(commands: &[ShapeCommandToken], value: &str) -> usize {
    return commands
        .iter()
        .filter(|token| matches!(token, ShapeCommandToken::String(text) if text == value))
        .count();
}

fn texture() -> flight_entity::Ref<Texture> {
    return Arc::new(RwLock::new(create_texture(None)));
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

    fn write_bitmap_fill_style(&mut self, fill_type: u8, character_id: u16, scale: f32) {
        self.write_byte(fill_type);
        self.write_uint16(character_id);
        self.write_scale_matrix(scale);
    }

    fn write_byte(&mut self, value: u8) {
        self.align();
        self.write_unsigned(u32::from(value), 8);
    }

    fn write_curved_edge(&mut self, control_x: i32, control_y: i32, anchor_x: i32, anchor_y: i32) {
        let bits = signed_bit_count(&[control_x, control_y, anchor_x, anchor_y]);
        self.write_unsigned(1, 1);
        self.write_unsigned(0, 1);
        self.write_unsigned(u32::from(bits - 2), 4);
        self.write_signed(control_x, bits);
        self.write_signed(control_y, bits);
        self.write_signed(anchor_x, bits);
        self.write_signed(anchor_y, bits);
    }

    fn write_end_shape(&mut self) {
        self.write_unsigned(0, 1);
        self.write_unsigned(0, 5);
        self.align();
    }

    fn write_gradient(&mut self, records: &[(u32, u8)]) {
        self.align();
        self.write_unsigned(0, 2);
        self.write_unsigned(0, 2);
        self.write_unsigned(records.len() as u32, 4);
        for (color, ratio) in records {
            self.write_byte(*ratio);
            self.write_byte((color >> 16) as u8);
            self.write_byte((color >> 8) as u8);
            self.write_byte(*color as u8);
        }
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

    fn write_new_styles_record(&mut self) {
        self.write_unsigned(0, 1);
        self.write_unsigned(1, 1);
        self.write_unsigned(0, 4);
    }

    fn write_scale_matrix(&mut self, scale: f32) {
        self.align();
        let value = (scale * 65536.0).round() as i32;
        let bits = signed_bit_count(&[value]);
        self.write_unsigned(1, 1);
        self.write_unsigned(u32::from(bits), 5);
        self.write_signed(value, bits);
        self.write_signed(value, bits);
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

    fn write_style_change(
        &mut self,
        fill_0: Option<u32>,
        fill_1: Option<u32>,
        line: Option<u32>,
        move_to: Option<(i32, i32)>,
        style_bits: u8,
    ) {
        self.write_unsigned(0, 1);
        self.write_unsigned(0, 1);
        self.write_unsigned(u32::from(line.is_some()), 1);
        self.write_unsigned(u32::from(fill_1.is_some()), 1);
        self.write_unsigned(u32::from(fill_0.is_some()), 1);
        self.write_unsigned(u32::from(move_to.is_some()), 1);
        if let Some((x, y)) = move_to {
            let bits = signed_bit_count(&[x, y]);
            self.write_unsigned(u32::from(bits), 5);
            self.write_signed(x, bits);
            self.write_signed(y, bits);
        }
        if let Some(value) = fill_0 {
            self.write_unsigned(value, style_bits);
        }
        if let Some(value) = fill_1 {
            self.write_unsigned(value, style_bits);
        }
        if let Some(value) = line {
            self.write_unsigned(value, style_bits);
        }
    }

    fn write_uint16(&mut self, value: u16) {
        self.write_byte(value as u8);
        self.write_byte((value >> 8) as u8);
    }

    fn write_unsigned(&mut self, value: u32, count: u8) {
        for index in (0..count).rev() {
            self.bits.push(((value >> index) & 1) as u8);
        }
    }

    fn write_zero_scale_matrix(&mut self) {
        self.align();
        self.write_unsigned(1, 1);
        self.write_unsigned(1, 5);
        self.write_signed(0, 1);
        self.write_signed(0, 1);
        self.write_unsigned(0, 1);
        self.write_unsigned(1, 5);
        self.write_signed(0, 1);
        self.write_signed(0, 1);
        self.align();
    }
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
