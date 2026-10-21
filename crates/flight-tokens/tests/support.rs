// flight-lint: allow-file(f64) D1: document values are JavaScript Numbers
use flight_entity::{entries, get_record_value, set_record_value};
use flight_scene_document::{
    FlightDocumentFields, FlightDocumentNode, FlightDocumentScene, FlightDocumentScene2D,
    FlightDocumentToken, FlightDocumentTokenValues, FlightDocumentValue,
};

pub fn number(value: f64) -> FlightDocumentValue {
    return FlightDocumentValue::Number(value);
}

pub fn text(value: &str) -> FlightDocumentValue {
    return FlightDocumentValue::String(value.to_string());
}

pub fn array(items: Vec<FlightDocumentValue>) -> FlightDocumentValue {
    return FlightDocumentValue::Array(items);
}

pub fn fields(pairs: Vec<(&str, FlightDocumentValue)>) -> FlightDocumentFields {
    let mut out = FlightDocumentFields::default();
    for (key, value) in pairs {
        set_record_value(&mut out, key.to_string(), value);
    }
    return out;
}

pub fn object(pairs: Vec<(&str, FlightDocumentValue)>) -> FlightDocumentValue {
    return FlightDocumentValue::Fields(fields(pairs));
}

pub fn node(
    kind: &str,
    node_fields: FlightDocumentFields,
    children: Vec<FlightDocumentNode>,
) -> FlightDocumentNode {
    return FlightDocumentNode {
        children,
        fields: node_fields,
        interactive_states: None,
        kind: kind.to_string(),
        transition: None,
    };
}

pub fn keyed_token(
    key: &str,
    kind: &str,
    values: Vec<(&str, FlightDocumentValue)>,
) -> FlightDocumentToken {
    let mut modes: FlightDocumentTokenValues = FlightDocumentTokenValues::default();
    for (mode, value) in values {
        set_record_value(&mut modes, mode.to_string(), value);
    }
    return FlightDocumentToken {
        key: key.to_string(),
        kind: kind.to_string(),
        values: modes,
    };
}

pub fn token(kind: &str, values: Vec<(&str, FlightDocumentValue)>) -> FlightDocumentToken {
    return keyed_token("a.token", kind, values);
}

pub fn scene2d_with(
    root: FlightDocumentNode,
    tokens: Vec<FlightDocumentToken>,
) -> FlightDocumentScene2D {
    let mut scene: FlightDocumentScene2D = flight_entity::allocate_entity();
    scene.background_color = None;
    scene.layouts = Vec::new();
    scene.scene = root;
    scene.tokens = tokens;
    return scene;
}

pub fn scene_with(
    root: FlightDocumentNode,
    tokens: Vec<FlightDocumentToken>,
) -> FlightDocumentScene {
    return FlightDocumentScene::Scene2D(scene2d_with(root, tokens));
}

// A 2D scene entry with an empty DisplayObject root, carrying only `tokens`.
pub fn scene_with_tokens(tokens: Vec<FlightDocumentToken>) -> FlightDocumentScene {
    return scene_with(node("DisplayObject", fields(vec![]), vec![]), tokens);
}

// Deep structural equality of document values (the source's `toEqual`), order-insensitive for
// field mappings as JavaScript object equality is.
pub fn value_equal(left: &FlightDocumentValue, right: &FlightDocumentValue) -> bool {
    use FlightDocumentValue as V;
    return match (left, right) {
        (V::Boolean(a), V::Boolean(b)) => a == b,
        (V::Null, V::Null) => true,
        (V::Number(a), V::Number(b)) => a == b,
        (V::String(a), V::String(b)) => a == b,
        (V::Array(a), V::Array(b)) => {
            a.len() == b.len() && a.iter().zip(b).all(|(a, b)| value_equal(a, b))
        }
        (V::Fields(a), V::Fields(b)) => fields_equal(a, b),
        _ => false,
    };
}

pub fn fields_equal(left: &FlightDocumentFields, right: &FlightDocumentFields) -> bool {
    let mut left_entries = Vec::new();
    entries(&mut left_entries, left);
    let mut right_entries = Vec::new();
    entries(&mut right_entries, right);
    return left_entries.len() == right_entries.len()
        && left_entries.iter().all(|(key, value)| {
            get_record_value(right, key).is_some_and(|other| value_equal(value, other))
        });
}

pub fn node_equal(left: &FlightDocumentNode, right: &FlightDocumentNode) -> bool {
    return left.kind == right.kind
        && fields_equal(&left.fields, &right.fields)
        && left.children.len() == right.children.len()
        && left
            .children
            .iter()
            .zip(&right.children)
            .all(|(a, b)| node_equal(a, b));
}

pub fn tokens_equal(left: &[FlightDocumentToken], right: &[FlightDocumentToken]) -> bool {
    return left.len() == right.len()
        && left.iter().zip(right).all(|(a, b)| {
            a.key == b.key && a.kind == b.kind && fields_equal(&a.values, &b.values)
        });
}
