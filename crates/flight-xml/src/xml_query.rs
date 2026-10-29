//! flight-compiler: nullable-options

// Read-only query helpers over a parsed XmlElement tree, so consumers stop
// hand-filtering `children` and `attributes` at every call site. All lookups
// return a sentinel (None) rather than panicking when the name is absent.

use flight_entity::Ref;

use crate::types::XmlElement;
use crate::xml_native::{get_xml_record_value, parse_xml_number_native, xml_trim};

/// The attribute value for `name`, or None when the element has no such attribute.
pub fn get_xml_element_attribute<'a>(element: &'a XmlElement, name: &str) -> Option<&'a str> {
    return get_xml_record_value(&element.attributes, name);
}

/// The attribute value for `name` parsed as a number, or None when the
/// attribute is absent or does not parse to a finite number.
// flight-lint: allow(f64) TS returns `number`, exact for integers to 2^53; XML formats carry exact integer ids beyond f32's 2^24 (e.g. 32-bit tile gids with flip flags)
// Rust's `?` operator is outside the portable compiler subset, so the explicit exits are intentional.
#[allow(clippy::question_mark)]
pub fn get_xml_element_attribute_number(element: &XmlElement, name: &str) -> Option<f64> {
    let Some(value) = get_xml_record_value(&element.attributes, name) else {
        return None;
    };
    if xml_trim(value).is_empty() {
        return None;
    }
    let Some(parsed) = parse_xml_number_native(value) else {
        return None;
    };
    if parsed.is_finite() {
        return Some(parsed);
    }
    return None;
}

/// The first direct child element with tag name `name`, or None when none matches.
/// Returns a cloned shared handle, so the caller keeps the node alive independently.
pub fn get_xml_element_child_by_name(element: &XmlElement, name: &str) -> Option<Ref<XmlElement>> {
    for child in &element.children {
        if child.read().unwrap().name == name {
            return Some(child.clone());
        }
    }
    return None;
}

/// All direct child elements with tag name `name`, in document order (empty when none match).
/// Returns cloned shared handles, so the caller keeps the nodes alive independently.
pub fn get_xml_element_children_by_name(element: &XmlElement, name: &str) -> Vec<Ref<XmlElement>> {
    let mut out: Vec<Ref<XmlElement>> = Vec::new();
    for child in &element.children {
        if child.read().unwrap().name == name {
            out.push(child.clone());
        }
    }
    return out;
}
