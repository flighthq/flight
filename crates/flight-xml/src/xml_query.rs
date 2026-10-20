// Read-only query helpers over a parsed XmlElement tree, so consumers stop
// hand-filtering `children` and `attributes` at every call site. All lookups
// return a sentinel (None) rather than panicking when the name is absent.

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
pub fn get_xml_element_child_by_name<'a>(
    element: &'a XmlElement,
    name: &str,
) -> Option<&'a XmlElement> {
    element.children.iter().find(|child| child.name == name)
}

/// All direct child elements with tag name `name`, in document order (empty when none match).
pub fn get_xml_element_children_by_name<'a>(
    element: &'a XmlElement,
    name: &str,
) -> Vec<&'a XmlElement> {
    element
        .children
        .iter()
        .filter(|child| child.name == name)
        .collect()
}
