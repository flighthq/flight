use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_path::PathWinding;
use flight_scene2d_formats::contract::*;
use flight_xml::{XmlElement, parse_xml_document};

mod collect_css_rules {
    use super::*;

    #[test]
    fn finds_none_in_a_document_that_declares_no_style() {
        let document = element("<svg><rect/></svg>");
        let mut rules = vec![SvgCssRule {
            declarations: HashMap::new(),
            order: 7,
            selector: "stale".to_string(),
            specificity: 0,
        }];
        collect_css_rules(&mut rules, &document);
        assert!(rules.is_empty());
    }

    #[test]
    fn reads_the_rules_out_of_every_style_element_in_the_document() {
        let document = element("<svg><style>rect { fill: red } .a { fill: blue }</style></svg>");
        let mut rules = Vec::new();
        collect_css_rules(&mut rules, &document);
        assert_eq!(rules.len(), 2);
        assert_eq!(
            rules
                .iter()
                .map(|rule| rule.selector.as_str())
                .collect::<Vec<_>>(),
            ["rect", ".a"]
        );
    }
}

mod parse_style_declarations {
    use super::*;

    #[test]
    fn reads_semicolon_separated_declarations_and_trims_around_the_colon() {
        let declarations = parse_style_declarations("fill: red; stroke : blue ;");
        assert_eq!(declarations.get("fill").map(String::as_str), Some("red"));
        assert_eq!(declarations.get("stroke").map(String::as_str), Some("blue"));
        assert!(parse_style_declarations("").is_empty());
    }
}

mod resolve_svg_definition_style {
    use super::*;

    #[test]
    fn leaves_stop_colours_at_the_initial_black_when_only_a_css_rule_names_them() {
        let colors = gradient_stop_colors(
            "<style>stop { stop-color: red }</style><defs><linearGradient><stop offset=\"0\"/><stop offset=\"1\"/></linearGradient></defs>",
        );
        assert_eq!(colors, [0x000000, 0x000000]);
    }

    #[test]
    fn resolves_stop_colours_from_each_authored_form() {
        for stops in [
            "<defs><linearGradient><stop offset=\"0\" stop-color=\"red\"/><stop offset=\"1\" stop-color=\"blue\"/></linearGradient></defs>",
            "<defs><linearGradient><stop offset=\"0\" style=\"stop-color: red\"/><stop offset=\"1\" style=\"stop-color: blue\"/></linearGradient></defs>",
        ] {
            assert_eq!(gradient_stop_colors(stops), [0xff0000, 0x0000ff]);
        }
    }
}

mod resolve_svg_style {
    use super::*;

    #[test]
    fn lets_a_css_rule_beat_a_presentation_attribute_and_an_inline_style_beat_both() {
        assert_eq!(fill_of(r#"<svg><rect fill="red"/></svg>"#), "red");
        assert_eq!(
            fill_of(r#"<svg><style>rect { fill: green }</style><rect fill="red"/></svg>"#),
            "green"
        );
        assert_eq!(
            fill_of(
                r#"<svg><style>rect { fill: green }</style><rect fill="red" style="fill: blue"/></svg>"#,
            ),
            "blue"
        );
    }
}

mod resolve_svg_winding {
    use super::*;

    #[test]
    fn maps_the_svg_spelling_and_falls_back_for_absent_or_unreadable_values() {
        assert_eq!(
            resolve_svg_winding(Some("evenodd"), PathWinding::NonZero),
            PathWinding::EvenOdd
        );
        assert_eq!(
            resolve_svg_winding(None, PathWinding::NonZero),
            PathWinding::NonZero
        );
        assert_eq!(
            resolve_svg_winding(Some("bogus"), PathWinding::EvenOdd),
            PathWinding::EvenOdd
        );
    }
}

fn element(xml: &str) -> XmlElement {
    return parse_xml_document(xml).expect("valid test XML");
}

fn empty_context(registry: &SvgRegistry) -> SvgImportContext<'_> {
    return SvgImportContext {
        css_rules: Vec::new(),
        diagnostics: None,
        elements_by_id: HashMap::new(),
        gradients_by_id: HashMap::new(),
        object_bounding_boxes: Vec::new(),
        options: None,
        parent_by_element: Vec::new(),
        registry,
        reported_unsupported_elements: Vec::new(),
        resolved_definition_styles: Vec::new(),
        resolving_clip_uses: Vec::new(),
        resolving_clips: Vec::new(),
        resolving_gradients: Vec::new(),
        resolving_uses: Vec::new(),
    };
}

fn fill_of(xml: &str) -> String {
    let root: Ref<XmlElement> = Arc::new(RwLock::new(element(xml)));
    let registry = create_svg_registry();
    let mut context = empty_context(&registry);
    collect_css_rules(&mut context.css_rules, &root.read().unwrap());
    let rectangle = find_elements(&root, "rect").remove(0);
    let style = resolve_svg_style(&rectangle.read().unwrap(), &DEFAULT_SVG_STYLE, &context);
    return style.fill;
}

fn find_elements(root: &Ref<XmlElement>, name: &str) -> Vec<Ref<XmlElement>> {
    let mut elements = Vec::new();
    if svg_local_name(&root.read().unwrap().name) == name {
        elements.push(root.clone());
    }
    let children = root.read().unwrap().children.clone();
    for child in children {
        elements.extend(find_elements(&child, name));
    }
    return elements;
}

fn gradient_stop_colors(fragment: &str) -> Vec<u32> {
    let root: Ref<XmlElement> = Arc::new(RwLock::new(element(&format!("<svg>{fragment}</svg>"))));
    let registry = create_svg_registry();
    let mut context = empty_context(&registry);
    collect_css_rules(&mut context.css_rules, &root.read().unwrap());
    index_parents(&mut context, &root, None);
    return find_elements(&root, "stop")
        .into_iter()
        .map(|stop| {
            let style = resolve_svg_definition_style(&stop, &mut context);
            let stop = stop.read().unwrap();
            let declarations =
                parse_style_declarations(svg_attribute(&stop, "style").unwrap_or(""));
            let color = svg_attribute(&stop, "stop-color")
                .map(str::to_string)
                .or_else(|| declarations.get("stop-color").cloned())
                .unwrap_or(style.color);
            return parse_svg_color(&color).expect("resolved stop color").rgb;
        })
        .collect();
}

fn index_parents(
    context: &mut SvgImportContext<'_>,
    element: &Ref<XmlElement>,
    parent: Option<Ref<XmlElement>>,
) {
    context
        .parent_by_element
        .push((element.clone(), parent.clone()));
    let children = element.read().unwrap().children.clone();
    for child in children {
        index_parents(context, &child, Some(element.clone()));
    }
}
