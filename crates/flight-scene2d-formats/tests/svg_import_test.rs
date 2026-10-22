use std::sync::Arc;

use flight_geometry::{Matrix, create_rectangle};
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
};
use flight_node::contract::{NodeRef, get_node_child_at, get_node_child_count};
use flight_path::PathWinding;
use flight_scene2d::Node2D;
use flight_scene2d::contract::{DISPLAY_OBJECT_KIND, SPRITE_KIND, Sprite, as_node2d_ref};
use flight_scene2d_formats::contract::*;
use flight_shape::contract::{Shape, ShapeCommandToken, get_shape_bounds};
use flight_text::contract::{RICH_TEXT_KIND, RichText, TEXT_LABEL_KIND, TextLabel};
use flight_texture::contract::{TextureSourceRef, get_texture_source};

use crate::flight_scene2d_formats_svg_document_conformance_test::{
    assert_f32_eq, assert_rectangle, child, clip, clip_rect, has_diagnostic, image_options,
    node_appearance, node_fields, shape_commands, shape_fill_color, shape_local_x, shape_winding,
};

mod create_scene2d_from_svg_document {
    use super::*;

    #[test]
    fn applies_object_bounding_box_clip_and_mask_content_units_to_target_geometry() {
        let root = import(
            "<svg><defs><clipPath id=\"half\" clipPathUnits=\"objectBoundingBox\"><rect width=\"0.5\" height=\"1\"/></clipPath><mask id=\"quarter\" maskContentUnits=\"objectBoundingBox\"><rect x=\"0.25\" width=\"0.5\" height=\"1\"/></mask></defs><rect width=\"200\" height=\"100\" clip-path=\"url(#half)\"/><rect width=\"200\" height=\"100\" mask=\"url(#quarter)\"/></svg>",
        );
        assert_rectangle(&clip_rect(&child(&root, 0)), 0.0, 0.0, 100.0, 100.0);
        assert_rectangle(&clip_rect(&child(&root, 1)), 50.0, 0.0, 100.0, 100.0);
    }

    #[test]
    fn applies_object_bounding_box_clips_in_image_local_geometry() {
        let mut diagnostics = Vec::new();
        let options = image_options(create_ready_image_resource_for_test(Some(20), Some(10)));
        let root = create_scene2d_from_svg_document(
            "<svg><defs><clipPath id=\"half\" clipPathUnits=\"objectBoundingBox\"><rect width=\"0.5\" height=\"1\"/></clipPath><symbol id=\"panel\" viewBox=\"0 0 20 10\" preserveAspectRatio=\"none\"><rect width=\"20\" height=\"10\"/></symbol></defs><image href=\"asset.png\" width=\"200\" height=\"100\" clip-path=\"url(#half)\"/><g clip-path=\"url(#half)\"><rect width=\"200\" height=\"100\"/></g><use href=\"#panel\" width=\"200\" height=\"100\" clip-path=\"url(#half)\"/><text font-size=\"10\" clip-path=\"url(#half)\">Unmeasured</text></svg>",
            Some(&mut diagnostics),
            Some(&options),
        );
        let bitmap = child(&root, 0);
        assert_rectangle(&clip_rect(&bitmap), 0.0, 0.0, 10.0, 10.0);
        let transform = node_transform_full(&bitmap);
        assert_f32_eq(transform.0 * clip_rect(&bitmap).width, 100.0);
        assert_f32_eq(transform.1 * clip_rect(&bitmap).height, 100.0);
        assert_rectangle(&clip_rect(&child(&root, 1)), 0.0, 0.0, 100.0, 100.0);
        assert_rectangle(&clip_rect(&child(&root, 2)), 0.0, 0.0, 100.0, 100.0);
        assert!(clip(&child(&root, 3)).is_none());
        assert!(has_diagnostic(
            &diagnostics,
            "svg.object-bounding-box-clip-unmeasurable-bounds"
        ));
    }

    #[test]
    fn applies_root_presentation_to_descendants() {
        let root = import("<svg fill=\"red\"><rect width=\"10\" height=\"10\"/></svg>");
        assert_eq!(shape_fill_color(&child(&root, 0)), Some(0xff0000ff));
    }

    #[test]
    fn composes_authored_geometry_before_transforms_uniformly_across_element_types() {
        let options = image_options(create_ready_image_resource_for_test(Some(10), Some(10)));
        let root = create_scene2d_from_svg_document(
            "<svg><defs><g id=\"mark\"><rect width=\"1\" height=\"1\"/></g></defs><rect x=\"3\" width=\"10\" height=\"10\" transform=\"translate(10 5)\"/><image href=\"asset.png\" x=\"3\" width=\"10\" height=\"10\" transform=\"translate(10 5)\"/><use href=\"#mark\" x=\"3\" transform=\"translate(10 5)\"/><text x=\"3\" y=\"15\" font-size=\"10\" transform=\"translate(10 5)\">T</text></svg>",
            None,
            Some(&options),
        );
        let shape = child(&root, 0);
        assert_f32_eq(node_fields(&shape).x + shape_local_x(&shape), 13.0);
        for index in 1..4 {
            assert_f32_eq(node_fields(&child(&root, index)).x, 13.0);
        }
    }

    #[test]
    fn composes_image_geometry_before_its_svg_transform() {
        let options = image_options(create_ready_image_resource_for_test(Some(20), Some(10)));
        let root = create_scene2d_from_svg_document(
            "<svg><image href=\"asset.png\" x=\"3\" y=\"4\" width=\"40\" height=\"30\" preserveAspectRatio=\"none\" transform=\"translate(10 20)\"/></svg>",
            None,
            Some(&options),
        );
        assert_transform(&child(&root, 0), 2.0, 3.0, 13.0, 24.0);
    }

    #[test]
    fn composes_text_placement_and_baseline_before_its_svg_transform() {
        let root = import(
            "<svg><text x=\"3\" y=\"20\" font-size=\"10\" transform=\"translate(10 5)\">Hello</text></svg>",
        );
        assert_f32_eq(node_fields(&child(&root, 0)).x, 13.0);
        assert_f32_eq(node_fields(&child(&root, 0)).y, 15.0);
    }

    #[test]
    fn composes_use_placement_before_its_svg_transform() {
        let root = import(
            "<svg><defs><g id=\"mark\"><rect width=\"1\" height=\"1\"/></g></defs><use href=\"#mark\" x=\"7\" y=\"9\" transform=\"scale(2)\"/></svg>",
        );
        assert_transform(&child(&root, 0), 2.0, 2.0, 14.0, 18.0);
    }

    #[test]
    fn diagnoses_applied_filters_and_nested_animation_at_their_use_sites() {
        let mut diagnostics = Vec::new();
        create_scene2d_from_svg_document(
            "<svg><defs><filter id=\"blur\"/></defs><rect width=\"10\" height=\"10\" filter=\"url(#blur)\"><animate attributeName=\"x\" from=\"0\" to=\"10\"/></rect></svg>",
            Some(&mut diagnostics),
            None,
        );
        assert_eq!(
            diagnostic_kinds(&diagnostics),
            ["svg.unsupported-filter", "svg.unsupported-animate"]
        );
    }

    #[test]
    fn drops_a_singular_gradient_transform_and_names_the_gradient() {
        let mut diagnostics = Vec::new();
        create_scene2d_from_svg_document(
            "<svg><defs><linearGradient id=\"collapsed\" gradientTransform=\"scale(0)\" x1=\"0\" x2=\"1\"><stop offset=\"0\" stop-color=\"#f00\"/><stop offset=\"1\" stop-color=\"#00f\"/></linearGradient></defs><rect x=\"0\" y=\"0\" width=\"100\" height=\"100\" fill=\"url(#collapsed)\"/></svg>",
            Some(&mut diagnostics),
            None,
        );
        let matches = diagnostics
            .iter()
            .filter(|entry| entry.kind == "svg.gradient-transform-singular")
            .collect::<Vec<_>>();
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].severity, ImportDiagnosticSeverity::Recover);
        assert_eq!(
            matches[0]
                .detail
                .as_ref()
                .and_then(|detail| detail.get("gradient")),
            Some(&ImportDiagnosticDetailValue::String(
                "collapsed".to_string()
            ))
        );
    }

    #[test]
    fn explicitly_registers_neutral_bounds_for_shapes_imported_without_a_renderer() {
        let root = import("<svg><rect x=\"3\" width=\"10\" height=\"10\"/></svg>");
        let shape = child(&root, 0);
        let shape_guard = shape.read().unwrap();
        let shape = shape_guard.as_any().downcast_ref::<Shape>().unwrap();
        let mut bounds = create_rectangle(0.0, 0.0, 0.0, 0.0);
        assert!(get_shape_bounds(
            &mut bounds,
            shape,
            Some(flight_shape::ShapeBoundsMode::Fill)
        ));
        assert_rectangle(&bounds, 3.0, 0.0, 10.0, 10.0);
    }

    #[test]
    fn honors_clip_rule_winding_and_diagnoses_mixed_clip_child_winding() {
        let mut diagnostics = Vec::new();
        let root = create_scene2d_from_svg_document(
            "<svg><defs><clipPath id=\"hole\" clip-rule=\"evenodd\"><g><path d=\"M0 0 H20 V20 H0 Z M5 5 H15 V15 H5 Z\"/></g></clipPath><clipPath id=\"mixed\"><rect width=\"10\" height=\"10\" clip-rule=\"evenodd\"/><circle cx=\"5\" cy=\"5\" r=\"2\" clip-rule=\"nonzero\"/></clipPath><clipPath id=\"fillOnly\" fill-rule=\"evenodd\"><path d=\"M0 0 H20 V20 H0 Z M5 5 H15 V15 H5 Z\"/></clipPath></defs><rect width=\"20\" height=\"20\" clip-path=\"url(#hole)\"/><rect width=\"20\" height=\"20\" clip-path=\"url(#mixed)\"/><rect width=\"20\" height=\"20\" clip-path=\"url(#fillOnly)\"/></svg>",
            Some(&mut diagnostics),
            None,
        );
        assert_eq!(
            clip(&child(&root, 0)).unwrap().read().unwrap().winding,
            PathWinding::EvenOdd
        );
        assert_eq!(
            clip(&child(&root, 2)).unwrap().read().unwrap().winding,
            PathWinding::NonZero
        );
        assert!(has_diagnostic(&diagnostics, "svg.mixed-clip-rule"));
    }

    #[test]
    fn honors_display_suppression_and_descendant_visibility_overrides_in_clip_geometry() {
        let root = import(
            "<svg><defs><clipPath id=\"visibleOnly\"><rect x=\"0\" width=\"10\" height=\"10\" display=\"none\"/><rect x=\"10\" width=\"10\" height=\"10\"/></clipPath><clipPath id=\"visibilityOverride\"><g visibility=\"hidden\"><rect x=\"0\" width=\"10\" height=\"10\"/><rect x=\"20\" width=\"10\" height=\"10\" visibility=\"visible\"/></g></clipPath></defs><rect width=\"40\" height=\"40\" clip-path=\"url(#visibleOnly)\"/><rect width=\"40\" height=\"40\" clip-path=\"url(#visibilityOverride)\"/></svg>",
        );
        assert_rectangle(&clip_rect(&child(&root, 0)), 10.0, 0.0, 10.0, 10.0);
        assert_rectangle(&clip_rect(&child(&root, 1)), 20.0, 0.0, 10.0, 10.0);
    }

    #[test]
    fn honors_preserve_aspect_ratio_and_forward_gradient_inheritance() {
        let root = import(
            "<svg width=\"200\" height=\"100\" viewBox=\"0 0 50 50\"><defs><linearGradient id=\"derived\" href=\"#base\" x2=\"100%\"/><linearGradient id=\"base\"><stop offset=\"0\" stop-color=\"red\"/><stop offset=\"1\" stop-color=\"blue\"/></linearGradient></defs><rect width=\"50\" height=\"50\" fill=\"url(#derived)\"/></svg>",
        );
        let root_node: NodeRef = root.clone();
        let transform = node_transform_full(&root_node);
        assert_f32_eq(transform.0, 2.0);
        assert_f32_eq(transform.1, 2.0);
        assert_f32_eq(transform.2, 50.0);
        assert_eq!(
            gradient_colors(&child(&root, 0)),
            vec![0xff0000ff, 0x0000ffff]
        );
        let stretched = import(
            "<svg width=\"200\" height=\"100\" viewBox=\"0 0 50 50\" preserveAspectRatio=\"none\"/>",
        );
        let stretched: NodeRef = stretched;
        let transform = node_transform_full(&stretched);
        assert_f32_eq(transform.0, 4.0);
        assert_f32_eq(transform.1, 2.0);
        assert_f32_eq(transform.2, 0.0);
    }

    #[test]
    fn imports_grouped_geometry_with_inherited_css_presentation_and_transforms() {
        let root = import(
            "<svg id=\"art\" width=\"200\" height=\"100\" viewBox=\"0 0 100 50\"><style>.accent { fill: #123456; stroke: rgb(255, 0, 0); stroke-width: 3 }</style><g id=\"layer\" opacity=\"0.5\" transform=\"translate(4 5)\"><path id=\"mark\" class=\"accent\" d=\"M0 0 L20 0 L20 10 Z\"/></g></svg>",
        );
        let root_node: NodeRef = root.clone();
        assert_eq!(node_name(&root_node).as_deref(), Some("art"));
        assert_f32_eq(node_transform_full(&root_node).0, 2.0);
        assert_f32_eq(node_transform_full(&root_node).1, 2.0);
        let group = child(&root, 0);
        assert_eq!(node_name(&group).as_deref(), Some("layer"));
        assert_f32_eq(node_appearance(&group).0, 0.5);
        assert_f32_eq(node_fields(&group).x, 4.0);
        assert_f32_eq(node_fields(&group).y, 5.0);
        let shape = get_node_child_at(&group, 0).unwrap();
        assert_eq!(node_name(&shape).as_deref(), Some("mark"));
        assert!(has_command(&shape, "beginFill"));
        assert!(has_command(&shape, "lineStyle"));
        assert!(has_command(&shape, "drawPath"));
        assert!(has_number(&shape, 0x123456ff_u32 as f64));
        assert!(has_number(&shape, 0xff0000ff_u32 as f64));
    }

    #[test]
    fn inherits_fill_rule_through_groups() {
        let root =
            import("<svg><g fill-rule=\"evenodd\"><path d=\"M0 0 L10 0 L10 10 Z\"/></g></svg>");
        assert_eq!(
            shape_winding(&get_node_child_at(&child(&root, 0), 0).unwrap()),
            PathWinding::EvenOdd
        );
    }

    #[test]
    fn instantiates_use_geometry_inside_clip_paths_with_placement_and_transforms() {
        let root = import(
            "<svg><defs><path id=\"clipShape\" d=\"M0 0 H10 V10 H0 Z\"/><clipPath id=\"used\"><use href=\"#clipShape\" x=\"5\" transform=\"scale(2)\"/></clipPath></defs><rect width=\"40\" height=\"40\" clip-path=\"url(#used)\"/></svg>",
        );
        assert_rectangle(&clip_rect(&child(&root, 0)), 10.0, 0.0, 20.0, 20.0);
    }

    #[test]
    fn keeps_an_invertible_gradient_transform_and_reports_nothing() {
        let mut diagnostics = Vec::new();
        create_scene2d_from_svg_document(
            "<svg><defs><linearGradient id=\"fine\" gradientTransform=\"scale(2)\" x1=\"0\" x2=\"1\"><stop offset=\"0\" stop-color=\"#f00\"/><stop offset=\"1\" stop-color=\"#00f\"/></linearGradient></defs><rect x=\"0\" y=\"0\" width=\"100\" height=\"100\" fill=\"url(#fine)\"/></svg>",
            Some(&mut diagnostics),
            None,
        );
        assert!(!has_diagnostic(
            &diagnostics,
            "svg.gradient-transform-singular"
        ));
    }

    #[test]
    fn ignores_an_object_bounding_box_gradient_on_a_zero_area_shape_without_diagnostic() {
        let mut diagnostics = Vec::new();
        create_scene2d_from_svg_document(
            "<svg><defs><linearGradient id=\"g\"><stop offset=\"0\" stop-color=\"#f00\"/><stop offset=\"1\" stop-color=\"#00f\"/></linearGradient></defs><rect width=\"0\" height=\"10\" fill=\"url(#g)\"/></svg>",
            Some(&mut diagnostics),
            None,
        );
        assert!(diagnostics.is_empty());
    }

    #[test]
    fn imports_every_common_svg_geometry_element_and_skips_live_features_loudly() {
        let mut diagnostics = Vec::new();
        let root = create_scene2d_from_svg_document(
            "<svg><rect x=\"1\" y=\"2\" width=\"3\" height=\"4\" rx=\"1\"/><circle cx=\"5\" cy=\"6\" r=\"2\"/><ellipse cx=\"8\" cy=\"9\" rx=\"3\" ry=\"2\"/><line x1=\"0\" y1=\"0\" x2=\"4\" y2=\"5\" stroke=\"black\"/><polyline points=\"0,0 1,2 3,4\" fill=\"none\" stroke=\"blue\"/><polygon points=\"0,0 5,0 2,4\"/><image href=\"photo.png\"/><foreignObject><div/></foreignObject></svg>",
            Some(&mut diagnostics),
            None,
        );
        let root: NodeRef = root;
        assert_eq!(get_node_child_count(&root), 6);
        assert_eq!(
            diagnostic_kinds(&diagnostics),
            [
                "svg.image-resolver-unwired",
                "svg.unsupported-foreignObject"
            ]
        );
    }

    #[test]
    fn imports_gradients_use_references_text_clips_and_mask_degradation() {
        let mut diagnostics = Vec::new();
        let root = create_scene2d_from_svg_document(
            "<svg><defs><linearGradient id=\"paint\" x1=\"0\" y1=\"0\" x2=\"80\" y2=\"0\"><stop offset=\"0%\" stop-color=\"#ff0000\"/><stop offset=\"100%\" style=\"stop-color:#0000ff;stop-opacity:.5\"/></linearGradient><clipPath id=\"crop\"><circle cx=\"10\" cy=\"10\" r=\"8\"/></clipPath><mask id=\"matte\"><rect x=\"0\" y=\"0\" width=\"20\" height=\"20\"/></mask><symbol id=\"badge\"><rect width=\"10\" height=\"6\" fill=\"url(#paint)\"/></symbol></defs><use id=\"first\" href=\"#badge\" x=\"7\" y=\"9\" clip-path=\"url(#crop)\"/><text id=\"caption\" x=\"12\" y=\"30\" font-family=\"Inter\" font-size=\"14\" fill=\"#336699\">Hello</text><rect id=\"masked\" width=\"20\" height=\"20\" mask=\"url(#matte)\"/></svg>",
            Some(&mut diagnostics),
            None,
        );
        let used = child(&root, 0);
        assert_eq!(node_name(&used).as_deref(), Some("first"));
        assert_f32_eq(node_fields(&used).x, 7.0);
        assert_f32_eq(node_fields(&used).y, 9.0);
        assert!(clip(&used).is_some());
        let symbol = get_node_child_at(&used, 0).unwrap();
        assert_eq!(
            gradient_colors(&get_node_child_at(&symbol, 0).unwrap()),
            vec![0xff0000ff, 0x0000ffff]
        );
        let text = child(&root, 1);
        assert_eq!(text.read().unwrap().node_fields().kind, TEXT_LABEL_KIND);
        assert_eq!(node_name(&text).as_deref(), Some("caption"));
        let text_guard = text.read().unwrap();
        let label = text_guard.as_any().downcast_ref::<TextLabel>().unwrap();
        assert_eq!(label.data.text, "Hello");
        assert_eq!(
            label.data.text_format.read().unwrap().font.as_deref(),
            Some("Inter")
        );
        assert_eq!(label.data.text_format.read().unwrap().size, Some(14.0));
        drop(text_guard);
        assert_f32_eq(node_fields(&text).x, 12.0);
        assert_f32_eq(node_fields(&text).y, 16.0);
        assert!(clip(&child(&root, 2)).is_some());
        assert!(has_diagnostic(&diagnostics, "svg.mask-as-hard-clip"));
    }

    #[test]
    fn lets_author_css_outrank_presentation_attributes_by_specificity_and_source_order() {
        let root = import(
            "<svg><style>rect { fill: red } .accent { fill: green } .accent { fill: orange }</style><rect class=\"accent\" fill=\"blue\" width=\"10\" height=\"10\"/></svg>",
        );
        let shape = child(&root, 0);
        assert!(has_number(&shape, 0xffa500ff_u32 as f64));
        assert!(!has_number(&shape, 0x0000ffff_u32 as f64));
    }

    #[test]
    fn maps_image_intrinsic_dimensions_with_default_preserve_aspect_ratio_and_none() {
        let options = image_options(create_ready_image_resource_for_test(Some(20), Some(10)));
        let root = create_scene2d_from_svg_document(
            "<svg><image href=\"asset.png\" x=\"10\" y=\"20\" width=\"100\" height=\"100\"/><image href=\"asset.png\" x=\"10\" y=\"20\" width=\"100\" height=\"100\" preserveAspectRatio=\"none\"/></svg>",
            None,
            Some(&options),
        );
        assert_transform(&child(&root, 0), 5.0, 5.0, 10.0, 45.0);
        assert_transform(&child(&root, 1), 5.0, 10.0, 10.0, 20.0);
    }

    #[test]
    fn measures_object_bounding_box_without_stroke_identically_through_shape_and_group() {
        let clip = "<defs><clipPath id=\"c\" clipPathUnits=\"objectBoundingBox\"><rect width=\"0.5\" height=\"1\"/></clipPath></defs>";
        let stroked = "<rect x=\"0\" y=\"0\" width=\"10\" height=\"10\" fill=\"#f00\" stroke=\"#00f\" stroke-width=\"4\"";
        for body in [
            format!("{stroked} clip-path=\"url(#c)\"/>"),
            format!("<g clip-path=\"url(#c)\">{stroked}/></g>"),
        ] {
            let root = import(&format!("<svg>{clip}{body}</svg>"));
            assert_f32_close_4(clip_rect(&child(&root, 0)).width, 5.0);
        }
    }

    #[test]
    fn omits_elements_when_their_handler_is_not_registered() {
        let options = SvgDocumentImportOptions {
            clip_handlers: None,
            element_handlers: Some(Vec::new()),
            resolve_image_resource: None,
        };
        let root = create_scene2d_from_svg_document(
            "<svg><rect width=\"10\" height=\"10\" fill=\"#f00\"/><text font-size=\"10\">Hi</text></svg>",
            None,
            Some(&options),
        );
        let root: NodeRef = root;
        assert_eq!(get_node_child_count(&root), 0);
    }

    #[test]
    fn parses_hsl_colors_and_percentage_alpha_components() {
        let root = import(
            "<svg><rect width=\"10\" height=\"10\" fill=\"hsla(120 100% 25% / 50%)\" stroke=\"rgba(0 0 255 / 25%)\"/></svg>",
        );
        let shape = child(&root, 0);
        let commands = shape_commands(&shape);
        let fill = command_index(&commands, "beginFill");
        assert_eq!(token_number(&commands[fill + 2]) as u32, 0x008000ff);
        assert_eq!(token_number(&commands[fill + 3]), 0.5);
        let stroke = command_index(&commands, "lineStyle");
        assert_eq!(token_number(&commands[stroke + 3]) as u32, 0x0000ffff);
        assert_eq!(token_number(&commands[stroke + 4]), 0.25);
    }

    #[test]
    fn places_a_linear_gradient_box_by_its_origin_spanning_the_shape() {
        let root = import(
            "<svg><defs><linearGradient id=\"g\" x1=\"0\" x2=\"1\"><stop offset=\"0\" stop-color=\"#f00\"/><stop offset=\"1\" stop-color=\"#00f\"/></linearGradient></defs><rect x=\"60\" y=\"0\" width=\"320\" height=\"200\" fill=\"url(#g)\"/></svg>",
        );
        let matrix = gradient_matrix(&child(&root, 0));
        assert_f32_close_4(matrix.a * 1638.4, 320.0);
        assert_f32_close_4(matrix.tx, 220.0);
    }

    #[test]
    fn preserves_meaningful_collapsed_whitespace_across_mixed_text_runs() {
        let root = import(
            "<svg><text font-size=\"12\">Hello <tspan fill=\"red\">world</tspan>!</text></svg>",
        );
        let text = child(&root, 0);
        let text = text.read().unwrap();
        let text = text.as_any().downcast_ref::<RichText>().unwrap();
        assert_eq!(text.data.text, "Hello world!");
        assert_eq!(
            (
                text.data.text_format_ranges[0].start,
                text.data.text_format_ranges[0].end
            ),
            (6, 11)
        );
    }

    #[test]
    fn preserves_mixed_text_and_tspan_source_order() {
        let root =
            import("<svg><text font-size=\"12\">A<tspan fill=\"red\">B</tspan>C</text></svg>");
        let text = child(&root, 0);
        let text = text.read().unwrap();
        let text = text.as_any().downcast_ref::<RichText>().unwrap();
        assert_eq!(text.data.text, "ABC");
        assert_eq!(text.data.text_format_ranges.len(), 1);
        assert_eq!(
            (
                text.data.text_format_ranges[0].start,
                text.data.text_format_ranges[0].end
            ),
            (1, 2)
        );
        assert_eq!(
            text.data.text_format_ranges[0].format.read().unwrap().color,
            Some(0xff0000ff)
        );
    }

    #[test]
    fn produces_identical_output_with_handler_wrappers_and_zero_configuration_defaults() {
        let source = "<svg><defs><rect id=\"r\" width=\"5\" height=\"5\" fill=\"#0f0\"/></defs><rect x=\"1\" y=\"2\" width=\"30\" height=\"40\" fill=\"#ff0000\"/><g transform=\"translate(5,6)\"><circle cx=\"10\" cy=\"10\" r=\"4\" fill=\"#00ff00\"/></g><text font-size=\"12\">Hello</text><use href=\"#r\" x=\"50\"/></svg>";
        let defaults = import(source);
        let options = SvgDocumentImportOptions {
            clip_handlers: None,
            element_handlers: Some(
                [
                    (SVG_ELEMENT_KIND_CONTAINER, 0),
                    (SVG_ELEMENT_KIND_GEOMETRY, 1),
                    (SVG_ELEMENT_KIND_IMAGE, 2),
                    (SVG_ELEMENT_KIND_TEXT, 3),
                    (SVG_ELEMENT_KIND_USE, 4),
                ]
                .into_iter()
                .map(|(kind, index)| SvgElementHandlerEntry {
                    handle: SVG_ALL_ELEMENT_HANDLERS[index].clone(),
                    kind: kind.to_string(),
                })
                .collect(),
            ),
            resolve_image_resource: None,
        };
        let handlers = create_scene2d_from_svg_document(source, None, Some(&options));
        let defaults: NodeRef = defaults;
        let handlers: NodeRef = handlers;
        assert_eq!(node_signature(&handlers), node_signature(&defaults));
    }

    #[test]
    fn raises_no_data_integrity_diagnostic_for_a_well_formed_document() {
        let mut diagnostics = Vec::new();
        create_scene2d_from_svg_document(
            "<svg><rect x=\"1\" y=\"2\" width=\"30\" height=\"40\" fill=\"#ff0000\"/><g transform=\"translate(5,6)\"><circle cx=\"10\" cy=\"10\" r=\"4\" fill=\"#00ff00\"/></g></svg>",
            Some(&mut diagnostics),
            None,
        );
        assert!(
            diagnostics
                .iter()
                .all(|entry| entry.severity == ImportDiagnosticSeverity::Skip)
        );
    }

    #[test]
    fn reports_unsupported_animation_inside_an_instantiated_symbol() {
        let mut diagnostics = Vec::new();
        create_scene2d_from_svg_document(
            "<svg><defs><symbol id=\"animated\"><rect width=\"10\" height=\"10\"><animate attributeName=\"x\" from=\"0\" to=\"10\"/></rect></symbol></defs><use href=\"#animated\"/></svg>",
            Some(&mut diagnostics),
            None,
        );
        let entry = diagnostics
            .iter()
            .find(|entry| entry.kind == "svg.unsupported-animate")
            .unwrap();
        assert_eq!(entry.origin, "reportRemainingUnsupportedSvgElements");
        assert_eq!(entry.severity, ImportDiagnosticSeverity::Skip);
    }

    #[test]
    fn resolves_current_color_in_gradient_stops() {
        let root = import(
            "<svg><defs><linearGradient id=\"current\" color=\"#123456\"><stop offset=\"0\" stop-color=\"CURRENTCOLOR\"/><stop offset=\"1\" color=\"#abcdef\" stop-color=\"currentColor\"/></linearGradient></defs><rect width=\"10\" height=\"10\" fill=\"url(#current)\"/></svg>",
        );
        assert_eq!(
            gradient_colors(&child(&root, 0)),
            vec![0x123456ff, 0xabcdefff]
        );
    }

    #[test]
    fn resolves_image_resources_through_an_explicit_no_io_seam() {
        let image = create_ready_image_resource_for_test(Some(20), Some(10));
        let options = image_options(image.clone());
        let root = create_scene2d_from_svg_document(
            "<svg><image id=\"photo\" href=\"asset.png\" x=\"3\" y=\"4\" width=\"40\" height=\"30\" preserveAspectRatio=\"none\"/></svg>",
            None,
            Some(&options),
        );
        let bitmap = child(&root, 0);
        assert_eq!(bitmap.read().unwrap().node_fields().kind, SPRITE_KIND);
        assert_eq!(node_name(&bitmap).as_deref(), Some("photo"));
        let bitmap_guard = bitmap.read().unwrap();
        let sprite = bitmap_guard.as_any().downcast_ref::<Sprite>().unwrap();
        let texture = sprite.data.texture.clone().unwrap();
        drop(bitmap_guard);
        let source = get_texture_source(&*texture.read().unwrap()).unwrap();
        let expected: TextureSourceRef = image;
        assert!(Arc::ptr_eq(&source, &expected));
        assert_transform(&bitmap, 2.0, 3.0, 3.0, 4.0);
    }

    #[test]
    fn retains_tspan_style_runs_and_diagnoses_positional_flattening() {
        let mut diagnostics = Vec::new();
        let root = create_scene2d_from_svg_document(
            r##"
                <svg>
                  <text id="mixed" font-family="Inter" font-size="12">
                    <tspan x="4" y="20" fill="#ff0000">Red</tspan>
                    <tspan x="30" y="20" fill="#0000ff" font-weight="bold">Blue</tspan>
                  </text>
                </svg>
            "##,
            Some(&mut diagnostics),
            None,
        );
        let text = child(&root, 0);
        assert_eq!(text.read().unwrap().node_fields().kind, RICH_TEXT_KIND);
        let text_guard = text.read().unwrap();
        let rich = text_guard.as_any().downcast_ref::<RichText>().unwrap();
        assert_eq!(rich.data.text, "Red Blue");
        assert_eq!(rich.data.text_format_ranges.len(), 2);
        assert_eq!(
            rich.data.text_format_ranges[0].format.read().unwrap().color,
            Some(0xff0000ff)
        );
        assert_eq!(
            rich.data.text_format_ranges[1].format.read().unwrap().color,
            Some(0x0000ffff)
        );
        assert_eq!(
            rich.data.text_format_ranges[1].format.read().unwrap().bold,
            Some(true)
        );
        drop(text_guard);
        assert_f32_eq(node_fields(&text).x, 4.0);
        assert_f32_eq(node_fields(&text).y, 8.0);
        assert!(has_diagnostic(&diagnostics, "svg.tspan-position-flattened"));
    }

    #[test]
    fn returns_an_empty_tree_and_structured_diagnostic_for_non_svg_input() {
        let mut diagnostics = Vec::new();
        let root = create_scene2d_from_svg_document("<html/>", Some(&mut diagnostics), None);
        assert_eq!(
            root.read().unwrap().node2d_fields().kind,
            DISPLAY_OBJECT_KIND
        );
        let root_node: NodeRef = root;
        assert_eq!(get_node_child_count(&root_node), 0);
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].kind, "svg.invalid-document");
        assert_eq!(diagnostics[0].origin, "createScene2DFromSvgDocument");
        assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Reject);
        assert!(diagnostics[0].detail.is_none());
    }

    #[test]
    fn uses_symbol_view_box_semantics_and_the_use_viewport_size() {
        let root = import(
            "<svg><defs><symbol id=\"icon\" viewBox=\"0 0 10 10\" preserveAspectRatio=\"none\"><rect width=\"10\" height=\"10\"/></symbol></defs><use href=\"#icon\" width=\"20\" height=\"30\"/></svg>",
        );
        let symbol = get_node_child_at(&child(&root, 0), 0).unwrap();
        assert_f32_eq(node_transform_full(&symbol).0, 2.0);
        assert_f32_eq(node_transform_full(&symbol).1, 3.0);
    }
}

#[derive(Debug, PartialEq)]
struct NodeSignature {
    children: Vec<NodeSignature>,
    commands: Option<String>,
    kind: String,
    name: Option<String>,
    transform: (u32, u32, u32, u32),
}

fn assert_f32_close_4(actual: f32, expected: f32) {
    // D1 f32 bound (TS: 0.00005)
    let bound = 0.00005_f32.max(4.0 * f32::EPSILON * expected.abs().max(1.0));
    assert!((actual - expected).abs() <= bound, "{actual} != {expected}");
}

fn assert_transform(node: &NodeRef, scale_x: f32, scale_y: f32, x: f32, y: f32) {
    let actual = node_transform_full(node);
    assert_f32_eq(actual.0, scale_x);
    assert_f32_eq(actual.1, scale_y);
    assert_f32_eq(actual.2, x);
    assert_f32_eq(actual.3, y);
}

fn command_index(commands: &[ShapeCommandToken], key: &str) -> usize {
    return commands
        .iter()
        .position(|token| matches!(token, ShapeCommandToken::String(value) if value == key))
        .unwrap();
}

fn diagnostic_kinds(diagnostics: &[ImportDiagnostic]) -> Vec<&str> {
    return diagnostics
        .iter()
        .map(|entry| entry.kind.as_str())
        .collect();
}

fn gradient_colors(node: &NodeRef) -> Vec<u32> {
    let commands = shape_commands(node);
    let index = command_index(&commands, "beginGradientFill");
    return match &commands[index + 3] {
        ShapeCommandToken::Numbers(values) => {
            values.values.iter().map(|value| *value as u32).collect()
        }
        _ => panic!("missing gradient colors"),
    };
}

fn gradient_matrix(node: &NodeRef) -> Matrix {
    let commands = shape_commands(node);
    let index = command_index(&commands, "beginGradientFill");
    return match &commands[index + 6] {
        ShapeCommandToken::Matrix(value) => value.clone(),
        _ => panic!("missing gradient matrix"),
    };
}

fn has_command(node: &NodeRef, key: &str) -> bool {
    return shape_commands(node)
        .iter()
        .any(|token| matches!(token, ShapeCommandToken::String(value) if value == key));
}

fn has_number(node: &NodeRef, expected: f64) -> bool {
    return shape_commands(node)
        .iter()
        .any(|token| matches!(token, ShapeCommandToken::Number(value) if *value == expected));
}

fn import(source: &str) -> flight_entity::Ref<flight_scene2d::DisplayObject> {
    return create_scene2d_from_svg_document(source, None, None);
}

fn node_name(node: &NodeRef) -> Option<String> {
    return node.read().unwrap().node_fields().name.clone();
}

fn node_signature(node: &NodeRef) -> NodeSignature {
    let children = (0..get_node_child_count(node))
        .map(|index| node_signature(&get_node_child_at(node, index as i32).unwrap()))
        .collect();
    let guard = node.read().unwrap();
    let commands = guard
        .as_any()
        .downcast_ref::<Shape>()
        .map(|shape| format!("{:?}", shape.data.commands));
    let kind = guard.node_fields().kind.clone();
    let name = guard.node_fields().name.clone();
    drop(guard);
    let transform = node_transform_full(node);
    return NodeSignature {
        children,
        commands,
        kind,
        name,
        transform: (
            transform.0.to_bits(),
            transform.1.to_bits(),
            transform.2.to_bits(),
            transform.3.to_bits(),
        ),
    };
}

fn node_transform_full(node: &NodeRef) -> (f32, f32, f32, f32) {
    let node = as_node2d_ref(node).unwrap();
    let node = node.read().unwrap();
    let fields = node.node2d_fields();
    return (fields.scale_x, fields.scale_y, fields.x, fields.y);
}

fn token_number(token: &ShapeCommandToken) -> f64 {
    return match token {
        ShapeCommandToken::Number(value) => *value,
        _ => panic!("not a number"),
    };
}
