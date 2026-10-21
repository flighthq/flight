use std::sync::OnceLock;

use flight_xml::XmlElement;
use regex::Regex;

pub fn parse_svg_coordinate(value: Option<&str>, fallback: f32) -> f32 {
    let Some(value) = value else {
        return fallback;
    };
    let Some(parsed) = parse_svg_float(value).filter(|number| number.is_finite()) else {
        return fallback;
    };
    return if value.trim().ends_with('%') {
        parsed / 100.0
    } else {
        parsed
    };
}

pub fn parse_svg_css_number(value: Option<&str>, fallback: f32) -> f32 {
    return value
        .and_then(parse_svg_float)
        .filter(|number| number.is_finite())
        .unwrap_or(fallback);
}

fn parse_svg_float(value: &str) -> Option<f32> {
    let capture = svg_number_expression().find(value.trim_start())?;
    if capture.start() != 0 {
        return None;
    }
    return capture.as_str().parse::<f32>().ok();
}

pub fn parse_svg_length(value: Option<&str>, fallback: f32) -> f32 {
    return value
        .and_then(parse_svg_float)
        .filter(|number| number.is_finite())
        .unwrap_or(fallback);
}

pub fn parse_svg_number_list(value: &str) -> Vec<f32> {
    return svg_number_expression()
        .find_iter(value)
        .filter_map(|capture| capture.as_str().parse::<f32>().ok())
        .collect();
}

pub fn parse_url_reference(value: Option<&str>) -> Option<String> {
    let captures = svg_url_reference_expression().captures(value?.trim())?;
    return Some(captures.get(1)?.as_str().to_string());
}

pub fn svg_attribute<'a>(element: &'a XmlElement, name: &str) -> Option<&'a str> {
    if let Some(value) = element.attributes.get(name) {
        return Some(value);
    }
    return element
        .attributes
        .get(&format!("xlink:{name}"))
        .map(String::as_str);
}

pub fn svg_first_number(value: Option<&str>, fallback: f32) -> f32 {
    return parse_svg_number_list(value.unwrap_or(""))
        .first()
        .copied()
        .unwrap_or(fallback);
}

pub fn svg_local_name(name: &str) -> &str {
    return name.split_once(':').map(|(_, local)| local).unwrap_or(name);
}

pub fn svg_number_attribute(element: &XmlElement, name: &str, fallback: f32) -> f32 {
    return parse_svg_length(svg_attribute(element, name), fallback);
}

fn svg_number_expression() -> &'static Regex {
    static EXPRESSION: OnceLock<Regex> = OnceLock::new();
    return EXPRESSION.get_or_init(|| {
        Regex::new(r"(?i)[+-]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:e[+-]?[0-9]+)?")
            .expect("static SVG number regex")
    });
}

pub fn svg_optional_number_attribute(element: &XmlElement, name: &str) -> Option<f32> {
    return parse_svg_float(svg_attribute(element, name)?).filter(|number| number.is_finite());
}

fn svg_url_reference_expression() -> &'static Regex {
    static EXPRESSION: OnceLock<Regex> = OnceLock::new();
    return EXPRESSION.get_or_init(|| {
        Regex::new(r#"^url\(\s*['"]?#([^'")\s]+)['"]?\s*\)$"#)
            .expect("static SVG URL reference regex")
    });
}

pub fn visit_svg_elements(element: &XmlElement, visitor: &mut dyn FnMut(&XmlElement)) {
    visitor(element);
    for child in &element.children {
        visit_svg_elements(&child.read().unwrap(), visitor);
    }
}
