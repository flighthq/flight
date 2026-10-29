use std::collections::HashMap;
use std::sync::Arc;

use flight_entity::Ref;
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
};
use flight_scene2d::create_display_object;
use flight_scene2d_formats::contract::*;
use flight_text::RichText;
use flight_textformat::{FontVariation, TextFormat, TextFormatAlign};

const TEXT: u64 = 134;
const RUN: u64 = 135;
const STYLE_PAINT: u64 = 137;
const AXIS: u64 = 144;
const FILL: u64 = 20;
const SOLID_COLOR: u64 = 18;
const COLOR_VALUE: u64 = 37;
const RUN_TEXT: u64 = 268;
const RUN_STYLE_ID: u64 = 272;
const FONT_SIZE: u64 = 274;
const FONT_ASSET_ID: u64 = 279;
const ALIGN: u64 = 281;
const WIDTH: u64 = 285;
const HEIGHT: u64 = 286;
const AXIS_VALUE: u64 = 288;
const AXIS_TAG: u64 = 289;
const LINE_HEIGHT: u64 = 370;
const LETTER_SPACING: u64 = 390;

mod create_rive_rich_text {
    use super::*;

    #[test]
    fn reads_a_single_run_as_the_label_text() {
        let label = build(
            vec![object(TEXT, &[]), run("Hello", -1)],
            vec![-1, 0],
            &[],
            None,
        );
        assert_eq!(label.read().unwrap().data.text, "Hello");
    }

    #[test]
    fn joins_the_runs_in_the_order_the_file_states_them() {
        let label = build(
            vec![
                object(TEXT, &[]),
                run("one ", -1),
                run("two ", -1),
                run("three", -1),
            ],
            vec![-1, 0, 0, 0],
            &[],
            None,
        );
        assert_eq!(label.read().unwrap().data.text, "one two three");
    }

    #[test]
    fn carries_the_box_the_drawable_states() {
        let label = build(
            vec![object(TEXT, &[(WIDTH, 320.0), (HEIGHT, 48.0)])],
            vec![-1],
            &[],
            None,
        );
        let guard = label.read().unwrap();
        assert_eq!(guard.data.width, 320.0);
        assert_eq!(guard.data.height, 48.0);
    }

    #[test]
    fn maps_alignment_the_way_the_format_numbers_it() {
        for (value, expected) in [
            (0.0, TextFormatAlign::Left),
            (1.0, TextFormatAlign::Right),
            (2.0, TextFormatAlign::Center),
        ] {
            let label = build(vec![object(TEXT, &[(ALIGN, value)])], vec![-1], &[], None);
            assert_eq!(text_format(&label).read().unwrap().align, Some(expected));
        }
    }

    #[test]
    fn reports_a_text_alignment_it_does_not_know() {
        let mut diagnostics = Vec::new();
        let label = build(
            vec![object(TEXT, &[(ALIGN, 7.0)])],
            vec![-1],
            &[],
            Some(&mut diagnostics),
        );
        assert_eq!(
            text_format(&label).read().unwrap().align,
            Some(TextFormatAlign::Left),
        );
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].kind, "rive.text-align-substituted");
        assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Recover);
        assert_eq!(
            diagnostics[0].detail,
            Some(HashMap::from([
                (
                    "alignValue".to_string(),
                    ImportDiagnosticDetailValue::Number(7.0),
                ),
                (
                    "substitutedAs".to_string(),
                    ImportDiagnosticDetailValue::String("left".to_string()),
                ),
            ])),
        );
    }

    #[test]
    fn reports_one_unknown_alignment_once_however_many_runs_the_drawable_carries() {
        let mut diagnostics = Vec::new();
        let label = build(
            vec![
                object(TEXT, &[(ALIGN, 7.0)]),
                run("one", -1),
                run("two", -1),
                run("three", -1),
            ],
            vec![-1, 0, 0, 0],
            &[],
            Some(&mut diagnostics),
        );
        assert_eq!(label.read().unwrap().data.text_format_ranges.len(), 3);
        assert_eq!(
            diagnostics
                .iter()
                .filter(|entry| entry.kind == "rive.text-align-substituted")
                .count(),
            1,
        );
    }

    #[test]
    fn stays_silent_across_every_alignment_the_format_numbers() {
        for (value, expected) in [
            (0.0, TextFormatAlign::Left),
            (1.0, TextFormatAlign::Right),
            (2.0, TextFormatAlign::Center),
        ] {
            let mut diagnostics = Vec::new();
            let label = build(
                vec![object(TEXT, &[(ALIGN, value)])],
                vec![-1],
                &[],
                Some(&mut diagnostics),
            );
            assert_eq!(text_format(&label).read().unwrap().align, Some(expected));
            assert!(diagnostics.is_empty());
        }
    }

    #[test]
    fn takes_size_line_height_and_letter_spacing_from_the_run_style() {
        let label = build(
            vec![
                object(TEXT, &[]),
                run("x", 2),
                object(
                    STYLE_PAINT,
                    &[
                        (FONT_SIZE, 24.0),
                        (LINE_HEIGHT, 30.0),
                        (LETTER_SPACING, 1.5),
                    ],
                ),
            ],
            vec![-1, 0, 0],
            &[],
            None,
        );
        let format = text_format(&label);
        let format = format.read().unwrap();
        assert_eq!(format.leading, Some(30.0));
        assert_eq!(format.letter_spacing, Some(1.5));
        assert_eq!(format.size, Some(24.0));
    }

    #[test]
    fn unpacks_the_colour_from_the_style_own_paint() {
        let label = build(
            vec![
                object(TEXT, &[]),
                run("x", 2),
                object(STYLE_PAINT, &[]),
                object(FILL, &[]),
                color_object(SOLID_COLOR, COLOR_VALUE, 0xff3366cc),
            ],
            vec![-1, 0, 0, 2, 3],
            &[],
            None,
        );
        assert_eq!(text_format(&label).read().unwrap().color, Some(0x3366ccff));
        assert_eq!(label.read().unwrap().data.text_color, 0x3366ccff);
    }

    #[test]
    fn ignores_a_colour_belonging_to_a_different_style() {
        let label = build(
            vec![
                object(TEXT, &[]),
                run("x", 2),
                object(STYLE_PAINT, &[]),
                object(STYLE_PAINT, &[]),
                object(FILL, &[]),
                color_object(SOLID_COLOR, COLOR_VALUE, 0xffff0000),
            ],
            vec![-1, 0, 0, 0, 3, 4],
            &[],
            None,
        );
        assert_eq!(text_format(&label).read().unwrap().color, Some(0x000000ff));
    }

    #[test]
    fn gives_every_run_a_format_range_over_the_span_it_occupies_in_the_joined_string() {
        let label = build(
            vec![
                object(TEXT, &[]),
                run("one ", -1),
                run("two ", -1),
                run("three", -1),
            ],
            vec![-1, 0, 0, 0],
            &[],
            None,
        );
        let guard = label.read().unwrap();
        assert_eq!(
            guard
                .data
                .text_format_ranges
                .iter()
                .map(|range| (range.start, range.end))
                .collect::<Vec<_>>(),
            [(0, 4), (4, 8), (8, 13)],
        );
        assert_eq!(&guard.data.text[4..8], "two ");
    }

    #[test]
    fn carries_a_different_format_on_each_run_rather_than_flattening_to_the_first() {
        let label = build(
            vec![
                object(TEXT, &[]),
                run("big", 3),
                run("small", 4),
                object(STYLE_PAINT, &[(FONT_SIZE, 48.0)]),
                object(STYLE_PAINT, &[(FONT_SIZE, 8.0)]),
            ],
            vec![-1, 0, 0, 0, 0],
            &[],
            None,
        );
        let guard = label.read().unwrap();
        let sizes = guard
            .data
            .text_format_ranges
            .iter()
            .map(|range| range.format.read().unwrap().size.unwrap())
            .collect::<Vec<_>>();
        assert_eq!(sizes, [48.0, 8.0]);
        assert_eq!(guard.data.text_format.read().unwrap().size, Some(48.0));
    }

    #[test]
    fn names_the_typeface_by_resolving_the_style_font_asset_against_the_asset_list() {
        let label = build(
            vec![
                object(TEXT, &[]),
                run("x", 2),
                object(STYLE_PAINT, &[(FONT_ASSET_ID, 1.0)]),
            ],
            vec![-1, 0, 0],
            &["Inter", "Roboto"],
            None,
        );
        assert_eq!(
            text_format(&label).read().unwrap().font.as_deref(),
            Some("Roboto"),
        );
    }

    #[test]
    fn leaves_the_font_unnamed_when_the_style_states_no_asset() {
        let label = build(
            vec![object(TEXT, &[]), run("x", 2), object(STYLE_PAINT, &[])],
            vec![-1, 0, 0],
            &["Inter"],
            None,
        );
        assert!(text_format(&label).read().unwrap().font.is_none());
    }

    #[test]
    fn leaves_the_font_unnamed_when_the_style_names_an_asset_the_file_does_not_have() {
        let label = build(
            vec![
                object(TEXT, &[]),
                run("x", 2),
                object(STYLE_PAINT, &[(FONT_ASSET_ID, 7.0)]),
            ],
            vec![-1, 0, 0],
            &["Inter"],
            None,
        );
        assert!(text_format(&label).read().unwrap().font.is_none());
    }

    #[test]
    fn reports_a_run_style_that_cannot_be_resolved() {
        let mut diagnostics = Vec::new();
        let label = build(
            vec![object(TEXT, &[]), run("x", 7)],
            vec![-1, 0],
            &[],
            Some(&mut diagnostics),
        );
        assert_eq!(text_format(&label).read().unwrap().color, Some(0x000000ff));
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].kind, "rive.text-unresolved-style");
        assert_eq!(diagnostics[0].origin, "createRiveTextFormat");
        assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Drop);
        assert_eq!(
            diagnostics[0].detail,
            Some(HashMap::from([(
                "styleIndex".to_string(),
                ImportDiagnosticDetailValue::Number(7.0),
            )])),
        );
    }

    #[test]
    fn stays_silent_for_resolved_and_absent_run_styles() {
        let mut diagnostics = Vec::new();
        build(
            vec![
                object(TEXT, &[]),
                run("resolved", 2),
                object(STYLE_PAINT, &[]),
            ],
            vec![-1, 0, 0],
            &[],
            Some(&mut diagnostics),
        );
        build(
            vec![object(TEXT, &[]), run("absent", -1)],
            vec![-1, 0],
            &[],
            Some(&mut diagnostics),
        );
        assert!(diagnostics.is_empty());
    }

    #[test]
    fn unpacks_a_variable_font_axis_tag_back_into_its_four_characters() {
        let label = build(
            vec![
                object(TEXT, &[]),
                run("x", 2),
                object(STYLE_PAINT, &[]),
                axis_object(0x77676874, 700.0),
            ],
            vec![-1, 0, 0, 2],
            &[],
            None,
        );
        assert_eq!(
            text_format(&label).read().unwrap().variations,
            Some(Arc::new(vec![FontVariation {
                axis: "wght".to_string(),
                value: 700.0,
            }])),
        );
    }

    #[test]
    fn carries_every_axis_a_style_states() {
        let label = build(
            vec![
                object(TEXT, &[]),
                run("x", 2),
                object(STYLE_PAINT, &[]),
                axis_object(0x77676874, 300.0),
                axis_object(0x77647468, 87.5),
            ],
            vec![-1, 0, 0, 2, 2],
            &[],
            None,
        );
        assert_eq!(
            text_format(&label).read().unwrap().variations,
            Some(Arc::new(vec![
                FontVariation {
                    axis: "wght".to_string(),
                    value: 300.0,
                },
                FontVariation {
                    axis: "wdth".to_string(),
                    value: 87.5,
                },
            ])),
        );
    }

    #[test]
    fn leaves_variations_absent_when_the_style_states_no_axis() {
        let label = build(
            vec![object(TEXT, &[]), run("x", 2), object(STYLE_PAINT, &[])],
            vec![-1, 0, 0],
            &[],
            None,
        );
        assert!(text_format(&label).read().unwrap().variations.is_none());
    }

    #[test]
    fn ignores_an_axis_belonging_to_a_different_style() {
        let label = build(
            vec![
                object(TEXT, &[]),
                run("x", 2),
                object(STYLE_PAINT, &[]),
                object(STYLE_PAINT, &[]),
                axis_object(0x77676874, 700.0),
            ],
            vec![-1, 0, 0, 0, 3],
            &[],
            None,
        );
        assert!(text_format(&label).read().unwrap().variations.is_none());
    }

    #[test]
    fn produces_an_empty_label_for_a_text_drawable_with_no_runs() {
        let label = build(vec![object(TEXT, &[(WIDTH, 10.0)])], vec![-1], &[], None);
        assert!(label.read().unwrap().data.text.is_empty());
    }

    #[test]
    fn falls_back_to_a_readable_default_when_a_run_names_no_style() {
        let label = build(
            vec![object(TEXT, &[]), run("x", -1)],
            vec![-1, 0],
            &[],
            None,
        );
        assert_eq!(text_format(&label).read().unwrap().color, Some(0x000000ff));
    }
}

mod import_rive_text_component {
    use super::*;

    #[test]
    fn is_what_the_text_drawable_registers_so_a_text_becomes_a_rich_text_node() {
        let mut registry = create_rive_import_registry();
        register_rive_text_handlers(&mut registry);
        let graph = Box::leak(Box::new(graph(vec![object(TEXT, &[])], vec![-1])));
        let registry = Box::leak(Box::new(registry));
        let root = create_display_object();
        let mut context =
            create_rive_artboard_import_context(registry, graph, &graph.objects, root, &[], None);
        let handler = get_rive_core_object_handler(registry, TEXT as i32).unwrap();
        assert!(handler.import_component.is_some());
        let node = import_rive_text_component(&mut context, 0).unwrap();
        assert!(node.read().unwrap().as_any().is::<RichText>());
    }
}

mod register_rive_text_handlers {
    use super::*;

    #[test]
    fn claims_the_drawable_its_runs_and_the_styles_those_runs_name() {
        let mut registry = create_rive_import_registry();
        register_rive_text_handlers(&mut registry);
        assert!(get_rive_core_object_handler(&registry, TEXT as i32).is_some());
        assert!(get_rive_core_object_handler(&registry, RUN as i32).is_some());
        assert!(get_rive_core_object_handler(&registry, AXIS as i32).is_some());
    }

    #[test]
    fn gives_a_run_no_node_of_its_own_because_the_words_belong_to_the_drawable_above_it() {
        let mut registry = create_rive_import_registry();
        register_rive_text_handlers(&mut registry);
        let handler = get_rive_core_object_handler(&registry, RUN as i32).unwrap();
        assert!(handler.apply_artboard.is_none());
    }
}

fn axis_object(tag: u32, value: f32) -> RiveCoreObject {
    return RiveCoreObject {
        properties: vec![
            RiveProperty {
                key: AXIS_TAG,
                r#type: RiveFieldType::Uint,
                value: RiveValue::Uint(u64::from(tag)),
            },
            RiveProperty {
                key: AXIS_VALUE,
                r#type: RiveFieldType::Double,
                value: RiveValue::Double(value),
            },
        ],
        type_key: AXIS,
    };
}

fn build(
    objects: Vec<RiveCoreObject>,
    parents: Vec<i32>,
    font_names: &[&str],
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Ref<RichText> {
    let artboard = graph(objects, parents);
    let font_names = font_names
        .iter()
        .map(|name| (*name).to_string())
        .collect::<Vec<_>>();
    return create_rive_rich_text(&artboard, 0, &font_names, diagnostics);
}

fn color_object(type_key: u64, key: u64, value: u32) -> RiveCoreObject {
    return RiveCoreObject {
        properties: vec![RiveProperty {
            key,
            r#type: RiveFieldType::Color,
            value: RiveValue::Color(value),
        }],
        type_key,
    };
}

fn graph(objects: Vec<RiveCoreObject>, parent_indices: Vec<i32>) -> RiveArtboardGraph {
    return RiveArtboardGraph {
        stream_end: objects.len(),
        stream_start: 0,
        objects,
        parent_indices,
    };
}

fn object(type_key: u64, properties: &[(u64, f32)]) -> RiveCoreObject {
    return RiveCoreObject {
        properties: properties
            .iter()
            .map(|(key, value)| RiveProperty {
                key: *key,
                r#type: RiveFieldType::Double,
                value: RiveValue::Double(*value),
            })
            .collect(),
        type_key,
    };
}

fn run(text: &str, style_id: i32) -> RiveCoreObject {
    let mut properties = vec![RiveProperty {
        key: RUN_TEXT,
        r#type: RiveFieldType::String,
        value: RiveValue::String(text.to_string()),
    }];
    if style_id >= 0 {
        properties.push(RiveProperty {
            key: RUN_STYLE_ID,
            r#type: RiveFieldType::Uint,
            value: RiveValue::Uint(style_id as u64),
        });
    }
    return RiveCoreObject {
        properties,
        type_key: RUN,
    };
}

fn text_format(label: &Ref<RichText>) -> Ref<TextFormat> {
    return label.read().unwrap().data.text_format.clone();
}
