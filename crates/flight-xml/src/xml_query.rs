// Read-only query helpers over a parsed XmlElement tree, so consumers stop
// hand-filtering `children` and `attributes` at every call site. All lookups
// return a sentinel (None) rather than panicking when the name is absent.

use flight_entity::Ref;

use crate::types::XmlElement;

/// The attribute value for `name`, or None when the element has no such attribute.
pub fn get_xml_element_attribute<'a>(element: &'a XmlElement, name: &str) -> Option<&'a str> {
    element.attributes.get(name).map(|s| s.as_str())
}

/// The attribute value for `name` parsed as a number, or None when the
/// attribute is absent or does not parse to a finite number.
pub fn get_xml_element_attribute_number(element: &XmlElement, name: &str) -> Option<f64> {
    let value = element.attributes.get(name)?;
    if value.trim().is_empty() {
        return None;
    }
    let parsed: f64 = value.parse().ok()?;
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
pub fn get_xml_element_children_by_name(
    element: &XmlElement,
    name: &str,
) -> Vec<Ref<XmlElement>> {
    return element
        .children
        .iter()
        .filter(|child| child.read().unwrap().name == name)
        .cloned()
        .collect();
}
