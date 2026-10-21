use std::collections::HashMap;

use flight_xml::{XmlElement, parse_xml_document};

use crate::types::*;

// flight-lint: allow(conform-params) D24: caller-owned map replaces the structured Map return (user-approved)
pub fn collect_svg_counts(out: &mut HashMap<String, usize>, source: &str) -> bool {
    out.clear();
    let Some(document) = parse_xml_document(source) else {
        return false;
    };
    if svg_local_name(&document.name) != "svg" {
        return false;
    }
    tally_elements(out, &document);
    return true;
}

fn element_kind_name(name: &str) -> Option<&'static str> {
    return match name {
        "a" | "g" | "svg" | "switch" => Some(SVG_ELEMENT_KIND_CONTAINER),
        "circle" | "ellipse" | "line" | "path" | "polygon" | "polyline" | "rect" => {
            Some(SVG_ELEMENT_KIND_GEOMETRY)
        }
        "image" => Some(SVG_ELEMENT_KIND_IMAGE),
        "text" => Some(SVG_ELEMENT_KIND_TEXT),
        "use" => Some(SVG_ELEMENT_KIND_USE),
        _ => None,
    };
}

fn svg_local_name(name: &str) -> &str {
    return name.split_once(':').map(|(_, local)| local).unwrap_or(name);
}

fn tally_elements(counts: &mut HashMap<String, usize>, element: &XmlElement) {
    if let Some(kind) = element_kind_name(svg_local_name(&element.name)) {
        *counts.entry(kind.to_string()).or_default() += 1;
    }
    if element.attributes.contains_key("clip-path") || element.attributes.contains_key("mask") {
        *counts.entry(SVG_CLIP_KIND_PATH.to_string()).or_default() += 1;
    }
    for child in &element.children {
        tally_elements(counts, &child.read().unwrap());
    }
}
