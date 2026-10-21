use std::collections::{HashMap, HashSet};
use std::sync::{Arc, LazyLock, OnceLock};

use flight_path::PathWinding;
use flight_xml::XmlElement;
use regex::Regex;

use crate::svg_xml::{
    parse_svg_css_number, parse_svg_length, svg_attribute, svg_local_name, visit_svg_elements,
};
use crate::types::{SvgCssRule, SvgImportContext, SvgStyle};

pub static DEFAULT_SVG_STYLE: LazyLock<SvgStyle> = LazyLock::new(|| SvgStyle {
    clip_rule: PathWinding::NonZero,
    color: "#000000".to_string(),
    display: "inline".to_string(),
    fill: "#000000".to_string(),
    fill_opacity: 1.0,
    fill_rule: PathWinding::NonZero,
    filter: "none".to_string(),
    font_family: "sans-serif".to_string(),
    font_size: 16.0,
    font_style: "normal".to_string(),
    font_weight: "normal".to_string(),
    opacity: 1.0,
    stroke: "none".to_string(),
    stroke_dasharray: "none".to_string(),
    stroke_dashoffset: 0.0,
    stroke_linecap: "butt".to_string(),
    stroke_linejoin: "miter".to_string(),
    stroke_miterlimit: 4.0,
    stroke_opacity: 1.0,
    stroke_width: 1.0,
    text_anchor: "start".to_string(),
    visibility: "visible".to_string(),
});

const SVG_PRESENTATION_ATTRIBUTES: [&str; 22] = [
    "clip-rule",
    "color",
    "display",
    "fill",
    "fill-opacity",
    "fill-rule",
    "filter",
    "font-family",
    "font-size",
    "font-style",
    "font-weight",
    "opacity",
    "stroke",
    "stroke-dasharray",
    "stroke-dashoffset",
    "stroke-linecap",
    "stroke-linejoin",
    "stroke-miterlimit",
    "stroke-opacity",
    "stroke-width",
    "text-anchor",
    "visibility",
];

// flight-lint: allow(conform-params) D24: caller-owned vector replaces the structured array return (user-approved)
pub fn collect_css_rules(out: &mut Vec<SvgCssRule>, root: &XmlElement) {
    out.clear();
    visit_svg_elements(root, &mut |element| {
        if svg_local_name(&element.name) != "style" {
            return;
        }
        let text = css_comment_expression().replace_all(&element.text, "");
        for captures in css_rule_expression().captures_iter(&text) {
            let declarations = parse_style_declarations(
                captures
                    .get(2)
                    .map(|capture| capture.as_str())
                    .unwrap_or(""),
            );
            for selector_text in captures
                .get(1)
                .map(|capture| capture.as_str())
                .unwrap_or("")
                .split(',')
            {
                let selector = selector_text.trim();
                if selector.is_empty()
                    || selector.chars().any(|character| {
                        character.is_whitespace()
                            || matches!(character, '>' | '+' | '~' | ':' | '[' | ']')
                    })
                {
                    continue;
                }
                out.push(SvgCssRule {
                    declarations: declarations.clone(),
                    order: out.len(),
                    selector: selector.to_string(),
                    specificity: get_css_selector_specificity(selector),
                });
            }
        }
    });
}

fn css_comment_expression() -> &'static Regex {
    static EXPRESSION: OnceLock<Regex> = OnceLock::new();
    return EXPRESSION
        .get_or_init(|| Regex::new(r"(?s)/\*.*?\*/").expect("static CSS comment expression"));
}

fn css_rule_expression() -> &'static Regex {
    static EXPRESSION: OnceLock<Regex> = OnceLock::new();
    return EXPRESSION
        .get_or_init(|| Regex::new(r"([^{}]+)\{([^{}]*)\}").expect("static CSS rule expression"));
}

fn css_selector_class_expression() -> &'static Regex {
    static EXPRESSION: OnceLock<Regex> = OnceLock::new();
    return EXPRESSION.get_or_init(|| {
        Regex::new(r"\.[A-Za-z0-9_-]+").expect("static CSS selector class expression")
    });
}

fn css_selector_id_expression() -> &'static Regex {
    static EXPRESSION: OnceLock<Regex> = OnceLock::new();
    return EXPRESSION.get_or_init(|| {
        Regex::new(r"#[A-Za-z0-9_-]+").expect("static CSS selector ID expression")
    });
}

fn css_selector_type_expression() -> &'static Regex {
    static EXPRESSION: OnceLock<Regex> = OnceLock::new();
    return EXPRESSION.get_or_init(|| {
        Regex::new(r"^[a-zA-Z_][A-Za-z0-9_-]*").expect("static CSS selector type expression")
    });
}

fn get_css_selector_specificity(selector: &str) -> usize {
    let ids = css_selector_id_expression().find_iter(selector).count();
    let classes = css_selector_class_expression().find_iter(selector).count();
    let has_type = usize::from(css_selector_type_expression().is_match(selector));
    return ids * 100 + classes * 10 + has_type;
}

fn important_expression() -> &'static Regex {
    static EXPRESSION: OnceLock<Regex> = OnceLock::new();
    return EXPRESSION.get_or_init(|| {
        Regex::new(r"\s*!important\s*$").expect("static CSS important expression")
    });
}

fn matches_css_selector(element: &XmlElement, selector: &str) -> bool {
    if let Some(id) = selector.strip_prefix('#') {
        return svg_attribute(element, "id") == Some(id);
    }
    if let Some(class_name) = selector.strip_prefix('.') {
        return svg_attribute(element, "class")
            .unwrap_or("")
            .split_whitespace()
            .any(|class| class == class_name);
    }
    let (tag, class_name) = selector
        .split_once('.')
        .map_or((selector, None), |(tag, class_name)| {
            (tag, Some(class_name))
        });
    return svg_local_name(&element.name) == tag
        && class_name.is_none_or(|class_name| {
            svg_attribute(element, "class")
                .unwrap_or("")
                .split_whitespace()
                .any(|class| class == class_name)
        });
}

pub fn parse_style_declarations(value: &str) -> HashMap<String, String> {
    let mut out = HashMap::new();
    for part in value.split(';') {
        let Some(colon) = part.find(':') else {
            continue;
        };
        let name = part[..colon].trim();
        let property_value = important_expression()
            .replace(&part[colon + 1..], "")
            .trim()
            .to_string();
        if !name.is_empty() {
            out.insert(name.to_string(), property_value);
        }
    }
    return out;
}

pub fn resolve_svg_definition_style(
    element: &flight_entity::Ref<XmlElement>,
    context: &mut SvgImportContext<'_>,
) -> SvgStyle {
    if let Some((_, cached)) = context
        .resolved_definition_styles
        .iter()
        .find(|(candidate, _)| Arc::ptr_eq(candidate, element))
    {
        return cached.clone();
    }
    let parent = context
        .parent_by_element
        .iter()
        .find(|(candidate, _)| Arc::ptr_eq(candidate, element))
        .and_then(|(_, parent)| parent.clone());
    let parent_style = parent.map_or_else(
        || (*DEFAULT_SVG_STYLE).clone(),
        |parent| resolve_svg_definition_style(&parent, context),
    );
    let style = resolve_svg_style(&element.read().unwrap(), &parent_style, context);
    context
        .resolved_definition_styles
        .push((element.clone(), style.clone()));
    return style;
}

// flight-lint: allow(hashmap-iteration) CSS declaration records are merged by key; property order cannot affect the computed style
pub fn resolve_svg_style(
    element: &XmlElement,
    parent_style: &SvgStyle,
    context: &SvgImportContext<'_>,
) -> SvgStyle {
    let mut declarations = HashMap::new();
    for name in SVG_PRESENTATION_ATTRIBUTES {
        if let Some(value) = svg_attribute(element, name) {
            declarations.insert(name.to_string(), value.to_string());
        }
    }
    let mut matching_rules = context
        .css_rules
        .iter()
        .filter(|rule| matches_css_selector(element, &rule.selector))
        .collect::<Vec<_>>();
    matching_rules.sort_by_key(|rule| (rule.specificity, rule.order));
    for rule in matching_rules {
        for (name, value) in &rule.declarations {
            declarations.insert(name.clone(), value.clone());
        }
    }
    let inline_declarations =
        parse_style_declarations(svg_attribute(element, "style").unwrap_or(""));
    for (name, value) in inline_declarations {
        declarations.insert(name, value);
    }

    let inherited_properties = declarations
        .iter()
        .filter(|(_, value)| value.trim() == "inherit")
        .map(|(name, _)| name.clone())
        .collect::<HashSet<_>>();
    for name in &inherited_properties {
        declarations.remove(name);
    }

    let mut out = parent_style.clone();
    out.clip_rule = resolve_svg_winding(
        declarations.get("clip-rule").map(String::as_str),
        out.clip_rule,
    );
    if let Some(value) = declarations.get("color") {
        out.color.clone_from(value);
    }
    out.display = if inherited_properties.contains("display") {
        parent_style.display.clone()
    } else {
        declarations
            .get("display")
            .cloned()
            .unwrap_or_else(|| "inline".to_string())
    };
    if let Some(value) = declarations.get("fill") {
        out.fill.clone_from(value);
    }
    out.fill_opacity = parse_svg_css_number(
        declarations.get("fill-opacity").map(String::as_str),
        out.fill_opacity,
    )
    .clamp(0.0, 1.0);
    out.fill_rule = resolve_svg_winding(
        declarations.get("fill-rule").map(String::as_str),
        out.fill_rule,
    );
    out.filter = if inherited_properties.contains("filter") {
        parent_style.filter.clone()
    } else {
        declarations
            .get("filter")
            .cloned()
            .unwrap_or_else(|| "none".to_string())
    };
    if let Some(value) = declarations.get("font-family") {
        out.font_family.clone_from(value);
    }
    out.font_size = parse_svg_length(
        declarations.get("font-size").map(String::as_str),
        out.font_size,
    );
    if let Some(value) = declarations.get("font-style") {
        out.font_style.clone_from(value);
    }
    if let Some(value) = declarations.get("font-weight") {
        out.font_weight.clone_from(value);
    }
    out.opacity = if inherited_properties.contains("opacity") {
        parent_style.opacity
    } else {
        parse_svg_css_number(declarations.get("opacity").map(String::as_str), 1.0).clamp(0.0, 1.0)
    };
    if let Some(value) = declarations.get("stroke") {
        out.stroke.clone_from(value);
    }
    if let Some(value) = declarations.get("stroke-dasharray") {
        out.stroke_dasharray.clone_from(value);
    }
    out.stroke_dashoffset = parse_svg_length(
        declarations.get("stroke-dashoffset").map(String::as_str),
        out.stroke_dashoffset,
    );
    if let Some(value) = declarations.get("stroke-linecap") {
        out.stroke_linecap.clone_from(value);
    }
    if let Some(value) = declarations.get("stroke-linejoin") {
        out.stroke_linejoin.clone_from(value);
    }
    out.stroke_miterlimit = parse_svg_css_number(
        declarations.get("stroke-miterlimit").map(String::as_str),
        out.stroke_miterlimit,
    );
    out.stroke_opacity = parse_svg_css_number(
        declarations.get("stroke-opacity").map(String::as_str),
        out.stroke_opacity,
    )
    .clamp(0.0, 1.0);
    out.stroke_width = parse_svg_length(
        declarations.get("stroke-width").map(String::as_str),
        out.stroke_width,
    )
    .max(0.0);
    if let Some(value) = declarations.get("text-anchor") {
        out.text_anchor.clone_from(value);
    }
    if let Some(value) = declarations.get("visibility") {
        out.visibility.clone_from(value);
    }
    return out;
}

pub fn resolve_svg_winding(value: Option<&str>, fallback: PathWinding) -> PathWinding {
    return match value {
        Some("evenodd") => PathWinding::EvenOdd,
        Some("nonzero") => PathWinding::NonZero,
        _ => fallback,
    };
}
