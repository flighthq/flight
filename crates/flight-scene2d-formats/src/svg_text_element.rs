use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use flight_color::contract::pack_color;
use flight_entity::Ref;
use flight_geometry::create_matrix;
use flight_importdiagnostics::{
    ImportDiagnosticDetailValue, ImportDiagnosticSeverity, report_import_diagnostic,
};
use flight_scene2d::contract::{Node2DRef, PartialNode2D};
use flight_text::contract::{
    PartialRichText, PartialTextLabel, RichTextDataOptions, TextLabelDataOptions, create_rich_text,
    create_text_label,
};
use flight_textformat::contract::{TextFormat, TextFormatAlign, TextFormatRange};
use flight_textlayout::contract::{TextAutoSize, create_text_format_range};
use flight_xml::contract::{XmlContent, XmlElement};

use crate::svg_color::resolve_svg_color;
use crate::svg_document::{apply_svg_element_appearance, apply_svg_element_clip_family};
use crate::svg_style::resolve_svg_style;
use crate::svg_xml::{svg_attribute, svg_first_number, svg_local_name};
use crate::types::*;

struct SvgTextRun {
    is_root_style: bool,
    opacity: f32,
    style: SvgStyle,
    text: String,
}

fn create_svg_text_format(style: &SvgStyle, opacity: f32) -> Ref<TextFormat> {
    let color =
        resolve_svg_color(&style.fill, &style.color).unwrap_or(SvgColor { alpha: 0.0, rgb: 0 });
    let mut font = style.font_family.clone();
    if font.starts_with(['\'', '"']) {
        font.remove(0);
    }
    if font.ends_with(['\'', '"']) {
        font.pop();
    }
    return Arc::new(RwLock::new(TextFormat {
        align: Some(match style.text_anchor.as_str() {
            "middle" => TextFormatAlign::Center,
            "end" => TextFormatAlign::Right,
            _ => TextFormatAlign::Left,
        }),
        bold: Some(
            style.font_weight == "bold"
                || style
                    .font_weight
                    .parse::<f32>()
                    .is_ok_and(|weight| weight >= 600.0),
        ),
        color: Some(pack_color(
            ((color.rgb >> 16) & 0xff) as f32 / 255.0,
            ((color.rgb >> 8) & 0xff) as f32 / 255.0,
            (color.rgb & 0xff) as f32 / 255.0,
            color.alpha * style.fill_opacity * opacity,
        )),
        font: Some(font),
        italic: Some(matches!(style.font_style.as_str(), "italic" | "oblique")),
        size: Some(style.font_size),
        ..TextFormat::default()
    }));
}

fn create_svg_text_node(context: &mut SvgElementContext<'_, '_>) -> Node2DRef {
    let style = resolve_svg_style(
        &context.element.read().unwrap(),
        context.parent_style,
        context.import,
    );
    let format = create_svg_text_format(&style, 1.0);
    let direct_tspans = context
        .element
        .read()
        .unwrap()
        .children
        .iter()
        .filter(|child| svg_local_name(&child.read().unwrap().name) == "tspan")
        .cloned()
        .collect::<Vec<_>>();
    let mut tspans = Vec::new();
    collect_svg_tspan_elements(&context.element, &mut tspans);
    let mut runs = Vec::new();
    collect_svg_text_runs(
        &context.element,
        &style,
        context.import,
        &mut runs,
        1.0,
        true,
    );
    if let Some(last) = runs.last_mut() {
        last.text = last.text.trim_end().to_string();
    }
    let text = runs.iter().map(|run| run.text.as_str()).collect::<String>();
    let mut ranges: Vec<TextFormatRange> = Vec::new();
    let mut offset = 0;
    for run in &runs {
        let end = offset + run.text.encode_utf16().count();
        if !run.is_root_style {
            ranges.push(create_text_format_range(
                create_svg_text_format(&run.style, run.opacity),
                offset,
                end,
            ));
        }
        offset = end;
    }
    let first_tspan = direct_tspans.first();
    let x_element = if svg_attribute(&context.element.read().unwrap(), "x").is_none() {
        first_tspan.unwrap_or(&context.element)
    } else {
        &context.element
    };
    let y_element = if svg_attribute(&context.element.read().unwrap(), "y").is_none() {
        first_tspan.unwrap_or(&context.element)
    } else {
        &context.element
    };
    let x = svg_first_number(svg_attribute(&x_element.read().unwrap(), "x"), 0.0)
        + svg_first_number(svg_attribute(&context.element.read().unwrap(), "dx"), 0.0)
        + if Arc::ptr_eq(x_element, &context.element) {
            0.0
        } else {
            svg_first_number(svg_attribute(&x_element.read().unwrap(), "dx"), 0.0)
        };
    let y = svg_first_number(svg_attribute(&y_element.read().unwrap(), "y"), 0.0)
        + svg_first_number(svg_attribute(&context.element.read().unwrap(), "dy"), 0.0)
        + if Arc::ptr_eq(y_element, &context.element) {
            0.0
        } else {
            svg_first_number(svg_attribute(&y_element.read().unwrap(), "dy"), 0.0)
        }
        - style.font_size;
    let node_options = PartialNode2D {
        alpha: Some(style.opacity),
        name: svg_attribute(&context.element.read().unwrap(), "id").map(str::to_string),
        visible: Some(style.display != "none" && style.visibility == "visible"),
        ..PartialNode2D::default()
    };
    let node: Node2DRef = if ranges.is_empty() {
        create_text_label(Some(&PartialTextLabel {
            data: Some(TextLabelDataOptions {
                auto_size: Some(TextAutoSize::Left),
                height: Some(style.font_size * 1.25),
                text: Some(text),
                text_format: Some(format),
                vertical_align: None,
                width: Some(10_000.0),
            }),
            layout_context: None,
            node: node_options,
        }))
    } else {
        create_rich_text(Some(&PartialRichText {
            data: Some(RichTextDataOptions {
                auto_size: Some(TextAutoSize::Left),
                default_text_format: Some(format.clone()),
                height: Some(style.font_size * 1.25),
                text: Some(text),
                text_format: Some(format),
                text_format_ranges: Some(ranges),
                width: Some(10_000.0),
                ..RichTextDataOptions::default()
            }),
            layout_context: None,
            node: node_options,
        }))
    };
    if has_flattened_svg_text_position(&tspans, first_tspan) {
        report_import_diagnostic(
            context.import.diagnostics.as_deref_mut(),
            ImportDiagnosticSeverity::Recover,
            "svg.tspan-position-flattened",
            "createSvgTextNode",
            Some(HashMap::from([(
                "count".to_string(),
                ImportDiagnosticDetailValue::Number(tspans.len() as f32),
            )])),
        );
    }
    let geometry = create_matrix(1.0, 0.0, 0.0, 1.0, x, y);
    apply_svg_element_appearance(
        &node,
        &context.element,
        context.parent_style,
        context.import,
        Some(&geometry),
        false,
    );
    apply_svg_element_clip_family(&node, &context.element, context.import);
    return node;
}

fn append_svg_text_run(
    out: &mut Vec<SvgTextRun>,
    style: &SvgStyle,
    source: &str,
    opacity: f32,
    is_root_style: bool,
) {
    let source = source.replace(['\n', '\r'], "").replace('\t', " ");
    let mut text = String::new();
    let mut previous_space = false;
    for character in source.chars() {
        if character == ' ' {
            if previous_space {
                continue;
            }
            previous_space = true;
        } else {
            previous_space = false;
        }
        text.push(character);
    }
    if out.is_empty() {
        text = text.trim_start().to_string();
    }
    if out
        .last()
        .is_some_and(|previous| previous.text.ends_with(' ') && text.starts_with(' '))
    {
        text.remove(0);
    }
    if !text.is_empty() {
        out.push(SvgTextRun {
            is_root_style,
            opacity,
            style: style.clone(),
            text,
        });
    }
}

fn collect_svg_text_runs(
    element: &Ref<XmlElement>,
    style: &SvgStyle,
    context: &SvgImportContext<'_>,
    out: &mut Vec<SvgTextRun>,
    opacity: f32,
    is_root_style: bool,
) {
    if style.display == "none" {
        return;
    }
    let content = element.read().unwrap().content.clone();
    for content in content {
        match content {
            XmlContent::Text(text) => {
                if style.visibility == "visible" {
                    append_svg_text_run(out, style, &text, opacity, is_root_style);
                }
            }
            XmlContent::Element(child) => {
                if svg_local_name(&child.read().unwrap().name) != "tspan" {
                    continue;
                }
                let child_style = resolve_svg_style(&child.read().unwrap(), style, context);
                collect_svg_text_runs(
                    &child,
                    &child_style,
                    context,
                    out,
                    opacity * child_style.opacity,
                    false,
                );
            }
        }
    }
}

fn collect_svg_tspan_elements(element: &Ref<XmlElement>, out: &mut Vec<Ref<XmlElement>>) {
    let children = element.read().unwrap().children.clone();
    for child in children {
        if svg_local_name(&child.read().unwrap().name) == "tspan" {
            out.push(child.clone());
        }
        collect_svg_tspan_elements(&child, out);
    }
}

fn has_flattened_svg_text_position(
    tspans: &[Ref<XmlElement>],
    first_tspan: Option<&Ref<XmlElement>>,
) -> bool {
    return tspans.iter().any(|tspan| {
        ["x", "y", "dx", "dy", "rotate", "transform"]
            .iter()
            .any(|name| {
                svg_attribute(&tspan.read().unwrap(), name).is_some()
                    && (first_tspan.is_none_or(|first| !Arc::ptr_eq(tspan, first))
                        || matches!(*name, "rotate" | "transform"))
            })
    });
}

pub fn svg_text_element_handler(context: &mut SvgElementContext<'_, '_>) -> Option<Node2DRef> {
    return Some(create_svg_text_node(context));
}
