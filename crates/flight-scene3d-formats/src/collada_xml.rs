use crate::obj_features::is_obj_whitespace;
use crate::stl_features::parse_stl_number;
use flight_entity::Ref;
use flight_xml::XmlElement;

pub fn collada_child(element: Option<&Ref<XmlElement>>, name: &str) -> Option<Ref<XmlElement>> {
    let element = element?.read().unwrap();
    return element
        .children
        .iter()
        .find(|child| {
            let child = child.read().unwrap();
            return child.name == name || child.name.ends_with(&format!(":{name}"));
        })
        .cloned();
}

// flight-lint: allow(conform-params) Principal21f7557f D24: required first output for filtered existing element handles, clear/fill while retaining capacity
pub fn collada_children(
    out: &mut Vec<Ref<XmlElement>>,
    element: Option<&Ref<XmlElement>>,
    name: &str,
) {
    out.clear();
    let Some(element) = element else {
        return;
    };
    let element = element.read().unwrap();
    for child in &element.children {
        let matches = {
            let child = child.read().unwrap();
            child.name == name || child.name.ends_with(&format!(":{name}"))
        };
        if matches {
            out.push(child.clone());
        }
    }
}

// flight-lint: allow(conform-params) Principal21f7557f D24: required first output for queried existing descendant handles, clear/fill while retaining capacity
pub fn collada_descendants(out: &mut Vec<Ref<XmlElement>>, element: &Ref<XmlElement>, name: &str) {
    out.clear();
    walk_collada_element(element, &mut |entry| {
        let matches = {
            let entry = entry.read().unwrap();
            entry.name == name || entry.name.ends_with(&format!(":{name}"))
        };
        if matches {
            out.push(entry.clone());
        }
    });
}

pub fn collada_id_of(element: &Ref<XmlElement>) -> Option<String> {
    return element.read().unwrap().attributes.get("id").cloned();
}

pub fn collada_local_name(element: &Ref<XmlElement>) -> String {
    let element = element.read().unwrap();
    return element
        .name
        .split_once(':')
        .map_or_else(|| element.name.clone(), |(_, local)| local.to_string());
}

pub fn collada_numbers(element: Option<&Ref<XmlElement>>) -> Vec<f32> {
    let Some(element) = element else {
        return Vec::new();
    };
    let element = element.read().unwrap();
    return element
        .text
        .trim_matches(is_obj_whitespace)
        .split(is_obj_whitespace)
        .filter(|token| !token.is_empty())
        .filter_map(parse_collada_number)
        .collect();
}

pub fn collada_text(element: Option<&Ref<XmlElement>>, name: &str) -> Option<String> {
    let child = collada_child(element, name)?;
    let child = child.read().unwrap();
    let text = child.text.trim_matches(is_obj_whitespace);
    return (!text.is_empty()).then(|| text.to_string());
}

pub fn parse_collada_floats(text: &str) -> Vec<f32> {
    let text = text.trim_matches(is_obj_whitespace);
    if text.is_empty() {
        return vec![0.0];
    }
    return text
        .split(is_obj_whitespace)
        .filter(|token| !token.is_empty())
        .filter_map(parse_collada_number)
        .collect();
}

// flight-lint: allow(f64) reuse the existing strict Number finite classifier before the canonical f32 write; no new double arithmetic or public widening
fn parse_collada_number(text: &str) -> Option<f32> {
    let number = parse_stl_number(text);
    return number.is_finite().then_some(number as f32);
}

pub fn walk_collada_element(element: &Ref<XmlElement>, visit: &mut dyn FnMut(&Ref<XmlElement>)) {
    visit(element);
    let mut index = 0;
    loop {
        let child = element.read().unwrap().children.get(index).cloned();
        let Some(child) = child else {
            break;
        };
        walk_collada_element(&child, visit);
        index += 1;
    }
}
