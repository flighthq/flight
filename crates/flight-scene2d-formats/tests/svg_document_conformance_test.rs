use std::sync::Arc;

use flight_clip::contract::ClipRegion;
use flight_entity::Ref;
use flight_geometry::Rectangle;
use flight_importdiagnostics::ImportDiagnostic;
use flight_node::contract::{NodeRef, get_node_child_at, get_node_child_count};
use flight_path::PathWinding;
use flight_scene2d::contract::as_node2d_ref;
use flight_scene2d_formats::contract::*;
use flight_shape::contract::{SHAPE_KIND, Shape, ShapeCommandToken, get_shape_bounds};
use flight_text::contract::RichText;

pub(crate) struct NodePosition {
    pub x: f32,
    pub y: f32,
}

mod svg_conformance_matrix {
    use super::*;

    #[test]
    fn composes_geometry_before_transforms_for_every_element_family() {
        let cases = [
            (
                "<rect x=\"3\" width=\"10\" height=\"10\" transform=\"translate(10 5)\"/>",
                5.0,
                "shape",
            ),
            (
                "<image href=\"asset.png\" x=\"3\" width=\"10\" height=\"10\" transform=\"translate(10 5)\"/>",
                5.0,
                "image",
            ),
            (
                "<text x=\"3\" y=\"15\" font-size=\"10\" transform=\"translate(10 5)\">T</text>",
                10.0,
                "text",
            ),
            (
                "<g transform=\"translate(10 5)\"><rect x=\"3\" width=\"10\" height=\"10\"/></g>",
                5.0,
                "group",
            ),
            (
                "<use href=\"#mark\" x=\"3\" transform=\"translate(10 5)\"/>",
                5.0,
                "use",
            ),
            (
                "<use href=\"#symbol\" x=\"3\" width=\"10\" height=\"10\" transform=\"translate(10 5)\"/>",
                5.0,
                "symbol",
            ),
            (
                "<use href=\"#nested\" x=\"3\" transform=\"translate(10 5)\"/>",
                5.0,
                "nested-use",
            ),
        ];
        for (element, expected_y, kind) in cases {
            let image = create_ready_image_resource_for_test(Some(10), Some(10));
            let options = image_options(image);
            let source = format!(
                "<svg><defs><g id=\"mark\"><rect width=\"1\" height=\"1\"/></g><symbol id=\"symbol\" viewBox=\"0 0 10 10\"><rect width=\"10\" height=\"10\"/></symbol><g id=\"nested\"><use href=\"#mark\"/></g></defs>{element}</svg>"
            );
            let root = create_scene2d_from_svg_document(&source, None, Some(&options));
            let target = child(&root, 0);
            let fields = node_fields(&target);
            if matches!(kind, "image" | "text" | "use" | "symbol" | "nested-use") {
                assert_f32_eq(fields.x, 13.0);
            } else {
                let shape = find_first_shape(&target).unwrap();
                assert_f32_eq(fields.x + shape_local_x(&shape), 13.0);
            }
            assert_f32_eq(fields.y, expected_y);
        }
    }

    #[test]
    fn diagnoses_object_bounding_box_clips_when_text_bounds_are_unmeasurable() {
        let mut diagnostics = Vec::new();
        let root = create_scene2d_from_svg_document(
            "<svg><defs><clipPath id=\"half\" clipPathUnits=\"objectBoundingBox\"><rect width=\".5\" height=\"1\"/></clipPath></defs><text clip-path=\"url(#half)\">Text</text></svg>",
            Some(&mut diagnostics),
            None,
        );
        assert!(clip(&child(&root, 0)).is_none());
        assert!(has_diagnostic(
            &diagnostics,
            "svg.object-bounding-box-clip-unmeasurable-bounds"
        ));
    }

    #[test]
    fn diagnoses_unsupported_clip_text_while_preserving_empty_clip_semantics() {
        let mut diagnostics = Vec::new();
        let root = create_scene2d_from_svg_document(
            "<svg><defs><clipPath id=\"text\"><text>Clip</text></clipPath></defs><rect width=\"20\" height=\"20\" clip-path=\"url(#text)\"/></svg>",
            Some(&mut diagnostics),
            None,
        );
        let rect = clip_rect(&child(&root, 0));
        assert_f32_eq(rect.height, 0.0);
        assert_f32_eq(rect.width, 0.0);
        assert!(has_diagnostic(&diagnostics, "svg.unsupported-clip-text"));
        assert!(!has_diagnostic(
            &diagnostics,
            "svg.unresolved-clip-reference"
        ));
    }

    #[test]
    fn honestly_skips_a_transformed_object_bounding_box_nested_clip_intersection() {
        let mut diagnostics = Vec::new();
        let root = create_scene2d_from_svg_document(
            "<svg><defs><clipPath id=\"half\" clipPathUnits=\"objectBoundingBox\"><rect width=\".5\" height=\"1\"/></clipPath><clipPath id=\"translated\"><rect width=\"10\" height=\"10\" transform=\"translate(10)\" clip-path=\"url(#half)\"/></clipPath></defs><rect width=\"30\" height=\"20\" clip-path=\"url(#translated)\"/></svg>",
            Some(&mut diagnostics),
            None,
        );
        assert_rectangle(&clip_rect(&child(&root, 0)), 10.0, 0.0, 10.0, 10.0);
        assert!(has_diagnostic(
            &diagnostics,
            "svg.clip-nested-intersection-unsupported"
        ));
    }

    #[test]
    fn inherits_clip_rule_from_a_definition_ancestor_not_the_referencing_target() {
        let root = create_scene2d_from_svg_document(
            "<svg><defs><g clip-rule=\"evenodd\"><clipPath id=\"ancestorRule\"><path d=\"M0 0 H20 V20 H0 Z M5 5 H15 V15 H5 Z\"/></clipPath></g></defs><rect clip-rule=\"nonzero\" width=\"20\" height=\"20\" clip-path=\"url(#ancestorRule)\"/></svg>",
            None,
            None,
        );
        assert_eq!(
            clip(&child(&root, 0)).unwrap().read().unwrap().winding,
            PathWinding::EvenOdd
        );
    }

    #[test]
    fn instantiates_path_symbol_and_nested_use_geometry_inside_clip_paths() {
        let root = create_scene2d_from_svg_document(
            "<svg><defs><path id=\"clipPathShape\" d=\"M0 0 H10 V10 H0 Z\"/><symbol id=\"clipSymbol\" viewBox=\"0 0 10 10\" preserveAspectRatio=\"none\"><rect width=\"10\" height=\"10\"/></symbol><g id=\"clipNested\"><use href=\"#clipPathShape\" x=\"5\"/></g><clipPath id=\"pathUse\"><use href=\"#clipPathShape\"/></clipPath><clipPath id=\"symbolUse\"><use href=\"#clipSymbol\" width=\"20\" height=\"30\"/></clipPath><clipPath id=\"nestedUse\"><use href=\"#clipNested\"/></clipPath></defs><rect width=\"40\" height=\"40\" clip-path=\"url(#pathUse)\"/><rect width=\"40\" height=\"40\" clip-path=\"url(#symbolUse)\"/><rect width=\"40\" height=\"40\" clip-path=\"url(#nestedUse)\"/></svg>",
            None,
            None,
        );
        assert_rectangle(&clip_rect(&child(&root, 0)), 0.0, 0.0, 10.0, 10.0);
        assert_rectangle(&clip_rect(&child(&root, 1)), 0.0, 0.0, 20.0, 30.0);
        assert_rectangle(&clip_rect(&child(&root, 2)), 5.0, 0.0, 10.0, 10.0);
    }

    #[test]
    fn intersects_clip_path_references_on_definitions_and_their_children() {
        let root = create_scene2d_from_svg_document(
            "<svg><defs><clipPath id=\"narrow\"><rect width=\"10\" height=\"20\"/></clipPath><clipPath id=\"definition\" clip-path=\"url(#narrow)\"><rect width=\"20\" height=\"20\"/></clipPath><clipPath id=\"child\"><rect width=\"20\" height=\"20\" clip-path=\"url(#narrow)\"/></clipPath></defs><rect width=\"30\" height=\"30\" clip-path=\"url(#definition)\"/><rect width=\"30\" height=\"30\" clip-path=\"url(#child)\"/></svg>",
            None,
            None,
        );
        assert_f32_eq(clip_rect(&child(&root, 0)).width, 10.0);
        assert_f32_eq(clip_rect(&child(&root, 1)).width, 10.0);
    }

    #[test]
    fn keeps_an_empty_hidden_mask_as_a_hard_clip_and_reports_recovery() {
        let mut diagnostics = Vec::new();
        let root = create_scene2d_from_svg_document(
            "<svg><defs><mask id=\"empty\"><rect width=\"10\" height=\"10\" visibility=\"hidden\"/></mask></defs><rect width=\"20\" height=\"20\" mask=\"url(#empty)\"/></svg>",
            Some(&mut diagnostics),
            None,
        );
        let rect = clip_rect(&child(&root, 0));
        assert_f32_eq(rect.height, 0.0);
        assert_f32_eq(rect.width, 0.0);
        assert!(has_diagnostic(&diagnostics, "svg.mask-as-hard-clip"));
        assert!(!has_diagnostic(
            &diagnostics,
            "svg.unresolved-clip-reference"
        ));
    }

    #[test]
    fn keeps_fill_and_clip_winding_properties_independently_inherited() {
        let root = create_scene2d_from_svg_document(
            "<svg><defs><clipPath id=\"fillOnly\" fill-rule=\"evenodd\"><path d=\"M0 0 H10 V10 H0 Z\"/></clipPath><clipPath id=\"clipOnly\" clip-rule=\"evenodd\"><path d=\"M0 0 H10 V10 H0 Z\"/></clipPath></defs><g fill-rule=\"evenodd\"><path d=\"M0 0 H10 V10 H0 Z\"/></g><rect width=\"10\" height=\"10\" clip-path=\"url(#fillOnly)\"/><rect width=\"10\" height=\"10\" clip-path=\"url(#clipOnly)\"/></svg>",
            None,
            None,
        );
        let shape = find_first_shape(&child(&root, 0)).unwrap();
        assert_eq!(shape_winding(&shape), PathWinding::EvenOdd);
        assert_eq!(
            clip(&child(&root, 1)).unwrap().read().unwrap().winding,
            PathWinding::NonZero
        );
        assert_eq!(
            clip(&child(&root, 2)).unwrap().read().unwrap().winding,
            PathWinding::EvenOdd
        );
    }

    #[test]
    fn maps_object_bounding_box_clip_units_for_every_supported_target() {
        let cases = [
            (
                "<rect width=\"200\" height=\"100\" clip-path=\"url(#half)\"/>",
                100.0,
            ),
            (
                "<image href=\"asset.png\" width=\"200\" height=\"100\" clip-path=\"url(#half)\"/>",
                10.0,
            ),
            (
                "<g clip-path=\"url(#half)\"><rect width=\"200\" height=\"100\"/></g>",
                100.0,
            ),
            (
                "<use href=\"#panel\" width=\"200\" height=\"100\" clip-path=\"url(#half)\"/>",
                100.0,
            ),
            (
                "<use href=\"#nestedPanel\" clip-path=\"url(#half)\"/>",
                100.0,
            ),
        ];
        for (target, width) in cases {
            let image = create_ready_image_resource_for_test(Some(20), Some(10));
            let options = image_options(image);
            let source = format!(
                "<svg><defs><clipPath id=\"half\" clipPathUnits=\"objectBoundingBox\"><rect width=\".5\" height=\"1\"/></clipPath><symbol id=\"panel\" viewBox=\"0 0 20 10\" preserveAspectRatio=\"none\"><rect width=\"20\" height=\"10\"/></symbol><g id=\"panelGeometry\"><rect width=\"200\" height=\"100\"/></g><g id=\"nestedPanel\"><use href=\"#panelGeometry\"/></g></defs>{target}</svg>"
            );
            let root = create_scene2d_from_svg_document(&source, None, Some(&options));
            assert_f32_eq(clip_rect(&child(&root, 0)).width, width);
        }
    }

    #[test]
    fn maps_object_bounding_box_mask_content_for_every_supported_target() {
        let cases = [
            (
                "<rect width=\"200\" height=\"100\" mask=\"url(#halfMask)\"/>",
                100.0,
            ),
            (
                "<image href=\"asset.png\" width=\"200\" height=\"100\" mask=\"url(#halfMask)\"/>",
                10.0,
            ),
            (
                "<g mask=\"url(#halfMask)\"><rect width=\"200\" height=\"100\"/></g>",
                100.0,
            ),
            (
                "<use href=\"#panel\" width=\"200\" height=\"100\" mask=\"url(#halfMask)\"/>",
                100.0,
            ),
        ];
        for (target, width) in cases {
            let mut diagnostics = Vec::new();
            let image = create_ready_image_resource_for_test(Some(20), Some(10));
            let options = image_options(image);
            let source = format!(
                "<svg><defs><mask id=\"halfMask\" maskContentUnits=\"objectBoundingBox\"><rect width=\".5\" height=\"1\"/></mask><symbol id=\"panel\" viewBox=\"0 0 20 10\" preserveAspectRatio=\"none\"><rect width=\"20\" height=\"10\"/></symbol></defs>{target}</svg>"
            );
            let root =
                create_scene2d_from_svg_document(&source, Some(&mut diagnostics), Some(&options));
            assert_f32_eq(clip_rect(&child(&root, 0)).width, width);
            assert!(has_diagnostic(&diagnostics, "svg.mask-as-hard-clip"));
        }
    }

    #[test]
    fn shares_use_resolution_and_display_suppression_between_masks_and_clip_paths() {
        let root = create_scene2d_from_svg_document(
            "<svg><defs><path id=\"maskShape\" d=\"M0 0 H10 V10 H0 Z\"/><mask id=\"usedMask\"><rect width=\"10\" height=\"10\" display=\"none\"/><use href=\"#maskShape\" x=\"10\"/></mask></defs><rect width=\"30\" height=\"20\" mask=\"url(#usedMask)\"/></svg>",
            None,
            None,
        );
        assert_rectangle(&clip_rect(&child(&root, 0)), 10.0, 0.0, 10.0, 10.0);
    }

    #[test]
    fn treats_a_resolved_display_none_clip_definition_as_an_empty_clip() {
        let mut diagnostics = Vec::new();
        let root = create_scene2d_from_svg_document(
            "<svg><defs><clipPath id=\"empty\"><rect width=\"10\" height=\"10\" display=\"none\"/></clipPath></defs><rect width=\"20\" height=\"20\" clip-path=\"url(#empty)\"/></svg>",
            Some(&mut diagnostics),
            None,
        );
        let rect = clip_rect(&child(&root, 0));
        assert_f32_eq(rect.height, 0.0);
        assert_f32_eq(rect.width, 0.0);
        assert!(!has_diagnostic(
            &diagnostics,
            "svg.unresolved-clip-reference"
        ));
    }

    #[test]
    fn applies_css_cascade_and_presentation_inheritance_for_each_element_route() {
        let cases = [
            (
                "<rect class=\"accent\" fill=\"blue\" width=\"10\" height=\"10\"/>",
                0xffa500ff,
            ),
            (
                "<g class=\"theme\"><rect width=\"10\" height=\"10\"/></g>",
                0xff0000ff,
            ),
            ("<use href=\"#mark\" class=\"theme\"/>", 0xff0000ff),
            ("<use href=\"#symbol\" class=\"theme\"/>", 0xff0000ff),
        ];
        for (target, expected) in cases {
            let source = format!(
                "<svg><style>.accent {{ fill: red }} .accent {{ fill: orange }} .theme {{ fill: red }}</style><defs><g id=\"mark\"><rect width=\"10\" height=\"10\"/></g><symbol id=\"symbol\"><rect width=\"10\" height=\"10\"/></symbol></defs>{target}</svg>"
            );
            let root = create_scene2d_from_svg_document(&source, None, None);
            let shape = find_first_shape(&child(&root, 0)).unwrap();
            assert_eq!(shape_fill_color(&shape), Some(expected));
        }
    }

    #[test]
    fn applies_stylesheet_cascade_to_text_and_tspan_runs() {
        let root = create_scene2d_from_svg_document(
            "<svg><style>text { fill: red } .accent { fill: blue }</style><text fill=\"green\">A<tspan class=\"accent\">B</tspan></text></svg>",
            None,
            None,
        );
        let text = child(&root, 0);
        let text = text.read().unwrap();
        let text = text.as_any().downcast_ref::<RichText>().unwrap();
        assert_eq!(
            text.data.text_format.read().unwrap().color,
            Some(0xff0000ff)
        );
        assert_eq!(
            text.data.text_format_ranges[0].format.read().unwrap().color,
            Some(0x0000ffff)
        );
    }

    #[test]
    fn composes_nested_tspan_opacity_without_applying_text_opacity_twice() {
        let root = create_scene2d_from_svg_document(
            "<svg><text opacity=\".8\">A<tspan opacity=\".5\">B<tspan opacity=\".5\">C</tspan></tspan></text></svg>",
            None,
            None,
        );
        let text = child(&root, 0);
        assert_f32_close_default(node_appearance(&text).0, 0.8);
        let text = text.read().unwrap();
        let text = text.as_any().downcast_ref::<RichText>().unwrap();
        assert_eq!(text.data.text, "ABC");
        assert_eq!(
            text.data.text_format.read().unwrap().color,
            Some(0x000000ff)
        );
        assert_eq!(text.data.text_format_ranges.len(), 2);
        assert_eq!(
            (
                text.data.text_format_ranges[0].start,
                text.data.text_format_ranges[0].end,
                text.data.text_format_ranges[0].format.read().unwrap().color
            ),
            (1, 2, Some(0x00000080))
        );
        assert_eq!(
            (
                text.data.text_format_ranges[1].start,
                text.data.text_format_ranges[1].end,
                text.data.text_format_ranges[1].format.read().unwrap().color
            ),
            (2, 3, Some(0x00000040))
        );
    }

    #[test]
    fn excludes_hidden_clip_graphics_and_permits_descendant_visibility_overrides() {
        let root = create_scene2d_from_svg_document(
            "<svg><defs><clipPath id=\"visibility\"><rect width=\"10\" height=\"10\" display=\"none\"/><g visibility=\"hidden\"><rect x=\"10\" width=\"10\" height=\"10\"/><rect x=\"20\" width=\"10\" height=\"10\" visibility=\"visible\"/></g></clipPath></defs><rect width=\"40\" height=\"40\" clip-path=\"url(#visibility)\"/></svg>",
            None,
            None,
        );
        assert_rectangle(&clip_rect(&child(&root, 0)), 20.0, 0.0, 10.0, 10.0);
    }

    #[test]
    fn keeps_display_at_its_initial_value_on_descendants_of_a_display_none_ancestor() {
        let root = create_scene2d_from_svg_document(
            "<svg><g display=\"none\"><rect width=\"10\" height=\"10\"/></g></svg>",
            None,
            None,
        );
        let group = child(&root, 0);
        assert!(!node_appearance(&group).1);
        assert!(node_appearance(&get_node_child_at(&group, 0).unwrap()).1);
    }

    #[test]
    fn keeps_fill_none_text_transparent_while_a_painted_tspan_remains_visible() {
        let root = create_scene2d_from_svg_document(
            "<svg><text fill=\"none\">A<tspan fill=\"red\">B</tspan></text></svg>",
            None,
            None,
        );
        let text = child(&root, 0);
        let text = text.read().unwrap();
        let text = text.as_any().downcast_ref::<RichText>().unwrap();
        assert_eq!(text.data.text, "AB");
        assert_eq!(text.data.text_format.read().unwrap().color, Some(0));
        assert_eq!(
            text.data.text_format_ranges[0].format.read().unwrap().color,
            Some(0xff0000ff)
        );
    }

    #[test]
    fn maps_view_box_and_viewport_sizing_for_root_nested_and_symbol_nodes() {
        let cases = [
            (
                "<svg width=\"200\" height=\"100\" viewBox=\"0 0 50 50\" preserveAspectRatio=\"none\"/>",
                "root",
                4.0,
                2.0,
                0.0,
            ),
            (
                "<svg><svg x=\"5\" width=\"20\" height=\"30\" viewBox=\"0 0 10 10\" preserveAspectRatio=\"none\"/></svg>",
                "child",
                2.0,
                3.0,
                5.0,
            ),
            (
                "<svg><defs><symbol id=\"s\" viewBox=\"0 0 10 10\" preserveAspectRatio=\"none\"/></defs><use href=\"#s\" width=\"20\" height=\"30\"/></svg>",
                "symbol",
                2.0,
                3.0,
                0.0,
            ),
        ];
        for (source, target, scale_x, scale_y, x) in cases {
            let root = create_scene2d_from_svg_document(source, None, None);
            let root_node: NodeRef = root.clone();
            let node = match target {
                "root" => root_node,
                "child" => child(&root, 0),
                _ => get_node_child_at(&child(&root, 0), 0).unwrap(),
            };
            let transform = node_transform(&node);
            assert_f32_eq(transform.0, scale_x);
            assert_f32_eq(transform.1, scale_y);
            assert_f32_eq(transform.2, x);
        }
    }

    #[test]
    fn omits_hidden_tspan_content_while_permitting_a_visible_descendant_override() {
        let root = create_scene2d_from_svg_document(
            "<svg><text>A<tspan visibility=\"hidden\">B<tspan visibility=\"visible\">C</tspan></tspan><tspan display=\"none\">D<tspan display=\"inline\">E</tspan></tspan>F</text></svg>",
            None,
            None,
        );
        let text = child(&root, 0);
        let text = text.read().unwrap();
        let text = text.as_any().downcast_ref::<RichText>().unwrap();
        assert_eq!(text.data.text, "ACF");
    }

    #[test]
    fn suppresses_display_none_for_every_element_family() {
        let cases: [(&str, &[i32]); 7] = [
            ("<rect width=\"10\" height=\"10\" display=\"none\"/>", &[0]),
            ("<image href=\"asset.png\" display=\"none\"/>", &[0]),
            ("<text display=\"none\">T</text>", &[0]),
            (
                "<g display=\"none\"><rect width=\"10\" height=\"10\"/></g>",
                &[0],
            ),
            ("<use href=\"#mark\" display=\"none\"/>", &[0]),
            ("<use href=\"#hiddenSymbol\"/>", &[0, 0]),
            ("<use href=\"#hiddenNested\"/>", &[0, 0]),
        ];
        for (target, path) in cases {
            let image = create_ready_image_resource_for_test(Some(10), Some(10));
            let options = image_options(image);
            let source = format!(
                "<svg><defs><g id=\"mark\"><rect width=\"10\" height=\"10\"/></g><symbol id=\"hiddenSymbol\" display=\"none\"><rect width=\"10\" height=\"10\"/></symbol><g id=\"hiddenNested\" display=\"none\"><use href=\"#mark\"/></g></defs>{target}</svg>"
            );
            let root = create_scene2d_from_svg_document(&source, None, Some(&options));
            let mut node: NodeRef = root;
            for index in path {
                node = get_node_child_at(&node, *index).unwrap();
            }
            assert!(!node_appearance(&node).1);
        }
    }

    #[test]
    fn suppresses_display_none_while_allowing_visibility_descendants_to_override() {
        let root = create_scene2d_from_svg_document(
            "<svg><g display=\"none\"><rect width=\"10\" height=\"10\" display=\"inline\"/></g><g visibility=\"hidden\"><rect width=\"10\" height=\"10\"/><rect x=\"20\" width=\"10\" height=\"10\" visibility=\"visible\"/></g></svg>",
            None,
            None,
        );
        let display_group = child(&root, 0);
        let visibility_group = child(&root, 1);
        assert!(!node_appearance(&display_group).1);
        assert!(node_appearance(&get_node_child_at(&display_group, 0).unwrap()).1);
        assert!(node_appearance(&visibility_group).1);
        assert!(!node_appearance(&get_node_child_at(&visibility_group, 0).unwrap()).1);
        assert!(node_appearance(&get_node_child_at(&visibility_group, 1).unwrap()).1);
    }
}

mod svg_inherit_keyword {
    use super::*;

    #[test]
    fn leaves_an_unparented_inherit_at_the_initial_value_without_dropping_geometry() {
        let shape = first_shape(
            "<svg xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"10\" height=\"10\" opacity=\"inherit\"/></svg>",
        );
        assert_f32_eq(node_appearance(&shape).0, 1.0);
        assert!(!shape_commands(&shape).is_empty());
    }

    #[test]
    fn resolves_current_color_against_a_color_that_itself_inherits() {
        let source = "<svg xmlns=\"http://www.w3.org/2000/svg\"><g color=\"#008000\"><g color=\"inherit\"><rect width=\"10\" height=\"10\" fill=\"currentColor\"/></g></g></svg>";
        assert!(shape_commands(&first_shape(source)).iter().any(
            |token| matches!(token, ShapeCommandToken::Number(value) if *value == 0x008000ff as f64)
        ));
    }

    #[test]
    fn takes_the_parent_value_for_each_inherited_paint_form() {
        let cases = [
            ("fill=\"inherit\"", "fill=\"#ff0000\""),
            ("style=\"fill:inherit\"", "fill=\"#ff0000\""),
            (
                "stroke=\"inherit\" fill=\"none\" stroke-width=\"2\"",
                "stroke=\"#ff0000\"",
            ),
        ];
        for (declaration, from) in cases {
            let source = format!(
                "<svg xmlns=\"http://www.w3.org/2000/svg\"><g {from}><rect width=\"10\" height=\"10\" {declaration}/></g></svg>"
            );
            assert!(shape_commands(&first_shape(&source)).iter().any(
                |token| matches!(token, ShapeCommandToken::Number(value) if *value == 0xff0000ff_u32 as f64)
            ));
        }
    }

    #[test]
    fn takes_the_parent_value_for_opacity() {
        let shape = first_shape(
            "<svg xmlns=\"http://www.w3.org/2000/svg\"><g opacity=\"0.5\"><rect width=\"10\" height=\"10\" fill=\"#ff0000\" opacity=\"inherit\"/></g></svg>",
        );
        assert_f32_eq(node_appearance(&shape).0, 0.5);
    }
}

mod svg_internal_dtd_entities {
    use super::*;

    #[test]
    fn imports_an_entity_expanded_document_the_same_as_literal_markup() {
        let inner =
            "<g><circle cx='15' cy='15' r='10' fill='yellow'/><rect width='4' height='4'/></g>";
        let literal = format!("<svg xmlns=\"http://www.w3.org/2000/svg\">{inner}{inner}</svg>");
        let entity = format!(
            "<?xml version=\"1.0\"?><!DOCTYPE svg [<!ENTITY S \"{inner}\">]><svg xmlns=\"http://www.w3.org/2000/svg\">&S;&S;</svg>"
        );
        assert_eq!(
            count_svg_draw_paths(&entity),
            count_svg_draw_paths(&literal)
        );
        assert!(count_svg_draw_paths(&entity) > 0);
    }
}

pub(crate) fn assert_f32_eq(actual: f32, expected: f32) {
    // D1 f32 bound (TS: 0)
    let bound = 4.0 * f32::EPSILON * expected.abs().max(1.0);
    assert!((actual - expected).abs() <= bound, "{actual} != {expected}");
}

fn assert_f32_close_default(actual: f32, expected: f32) {
    // D1 f32 bound (TS: 0.005)
    let bound = 0.005_f32.max(4.0 * f32::EPSILON * expected.abs().max(1.0));
    assert!((actual - expected).abs() <= bound, "{actual} != {expected}");
}

pub(crate) fn assert_rectangle(actual: &Rectangle, x: f32, y: f32, width: f32, height: f32) {
    assert_f32_eq(actual.x, x);
    assert_f32_eq(actual.y, y);
    assert_f32_eq(actual.width, width);
    assert_f32_eq(actual.height, height);
}

pub(crate) fn child(root: &Ref<flight_scene2d::DisplayObject>, index: i32) -> NodeRef {
    let root: NodeRef = root.clone();
    return get_node_child_at(&root, index).unwrap();
}

fn count_svg_draw_paths(source: &str) -> usize {
    let root = create_scene2d_from_svg_document(source, None, None);
    let root: NodeRef = root;
    return count_draw_paths(&root);
}

fn count_draw_paths(node: &NodeRef) -> usize {
    let own = if node.read().unwrap().node_fields().kind == SHAPE_KIND {
        shape_commands(node)
            .iter()
            .filter(
                |token| matches!(token, ShapeCommandToken::String(value) if value == "drawPath"),
            )
            .count()
    } else {
        0
    };
    return own
        + (0..get_node_child_count(node))
            .map(|index| count_draw_paths(&get_node_child_at(node, index as i32).unwrap()))
            .sum::<usize>();
}

fn first_shape(source: &str) -> NodeRef {
    let root = create_scene2d_from_svg_document(source, None, None);
    let root: NodeRef = root;
    return find_first_shape(&root).expect("a shape was imported");
}

pub(crate) fn clip(node: &NodeRef) -> Option<Ref<ClipRegion>> {
    return as_node2d_ref(node)
        .unwrap()
        .read()
        .unwrap()
        .node2d_fields()
        .clip
        .clone();
}

pub(crate) fn clip_rect(node: &NodeRef) -> Rectangle {
    return clip(node).unwrap().read().unwrap().rect.clone();
}

pub(crate) fn find_first_shape(target: &NodeRef) -> Option<NodeRef> {
    if target.read().unwrap().node_fields().kind == SHAPE_KIND {
        return Some(target.clone());
    }
    for index in 0..get_node_child_count(target) {
        let child = get_node_child_at(target, index as i32).unwrap();
        if let Some(shape) = find_first_shape(&child) {
            return Some(shape);
        }
    }
    return None;
}

pub(crate) fn has_diagnostic(diagnostics: &[ImportDiagnostic], kind: &str) -> bool {
    return diagnostics.iter().any(|entry| entry.kind == kind);
}

pub(crate) fn image_options(image: Ref<flight_image::ImageResource>) -> SvgDocumentImportOptions {
    return SvgDocumentImportOptions {
        clip_handlers: None,
        element_handlers: None,
        resolve_image_resource: Some(Arc::new(move |_| Some(image.clone()))),
    };
}

pub(crate) fn node_fields(node: &NodeRef) -> NodePosition {
    let node = as_node2d_ref(node).unwrap();
    let node = node.read().unwrap();
    let fields = node.node2d_fields();
    return NodePosition {
        x: fields.x,
        y: fields.y,
    };
}

pub(crate) fn node_appearance(node: &NodeRef) -> (f32, bool) {
    let node = as_node2d_ref(node).unwrap();
    let node = node.read().unwrap();
    return (node.node2d_fields().alpha, node.node2d_fields().visible);
}

pub(crate) fn node_transform(node: &NodeRef) -> (f32, f32, f32) {
    let node = as_node2d_ref(node).unwrap();
    let node = node.read().unwrap();
    let fields = node.node2d_fields();
    return (fields.scale_x, fields.scale_y, fields.x);
}

pub(crate) fn shape_commands(node: &NodeRef) -> Vec<ShapeCommandToken> {
    let node = node.read().unwrap();
    let shape = node.as_any().downcast_ref::<Shape>().unwrap();
    return shape.data.commands.clone();
}

pub(crate) fn shape_fill_color(node: &NodeRef) -> Option<u32> {
    let commands = shape_commands(node);
    let index = commands.iter().position(
        |token| matches!(token, ShapeCommandToken::String(value) if value == "beginFill"),
    )?;
    return match commands.get(index + 2) {
        Some(ShapeCommandToken::Number(value)) => Some(*value as u32),
        _ => None,
    };
}

pub(crate) fn shape_local_x(node: &NodeRef) -> f32 {
    let node = node.read().unwrap();
    let shape = node.as_any().downcast_ref::<Shape>().unwrap();
    let mut bounds = flight_geometry::create_rectangle(0.0, 0.0, 0.0, 0.0);
    assert!(get_shape_bounds(&mut bounds, shape, None));
    return bounds.x;
}

pub(crate) fn shape_winding(node: &NodeRef) -> PathWinding {
    let node = node.read().unwrap();
    let shape = node.as_any().downcast_ref::<Shape>().unwrap();
    let index = shape
        .data
        .commands
        .iter()
        .position(|token| matches!(token, ShapeCommandToken::String(value) if value == "drawPath"))
        .unwrap();
    return match &shape.data.commands[index + 4] {
        ShapeCommandToken::String(value) if value == "evenOdd" => PathWinding::EvenOdd,
        ShapeCommandToken::String(_) => PathWinding::NonZero,
        _ => panic!("missing winding"),
    };
}
