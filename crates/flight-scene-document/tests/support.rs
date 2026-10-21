// flight-lint: allow-file(f64) D1: document and YAML subset numbers are JS Numbers
use flight_entity::{entries, get_record_value, set_record_value};
use flight_scene_document::contract::*;

// Order-insensitive deep equality of subset values (the source's `toEqual` over plain objects).
pub fn yaml_equal(
    left: &SceneDocumentYamlSubsetValue,
    right: &SceneDocumentYamlSubsetValue,
) -> bool {
    use SceneDocumentYamlSubsetValue as V;
    return match (left, right) {
        (V::Boolean(a), V::Boolean(b)) => a == b,
        (V::Null, V::Null) => true,
        (V::Number(a), V::Number(b)) => a == b,
        (V::String(a), V::String(b)) => a == b,
        (V::Sequence(a), V::Sequence(b)) => {
            a.len() == b.len() && a.iter().zip(b).all(|(a, b)| yaml_equal(a, b))
        }
        (V::Mapping(a), V::Mapping(b)) => {
            let a_entries = entries(a);
            a_entries.len() == entries(b).len()
                && a_entries.iter().all(|(key, value)| {
                    return get_record_value(b, key).is_some_and(|other| yaml_equal(value, other));
                })
        }
        _ => false,
    };
}

// Order-insensitive deep equality of document values.
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
    let left_entries = entries(left);
    return left_entries.len() == entries(right).len()
        && left_entries.iter().all(|(key, value)| {
            return get_record_value(right, key).is_some_and(|other| value_equal(value, other));
        });
}

pub fn fields(pairs: Vec<(&str, FlightDocumentValue)>) -> FlightDocumentFields {
    let mut out = FlightDocumentFields::default();
    for (key, value) in pairs {
        set_record_value(&mut out, key.to_string(), value);
    }
    return out;
}

pub fn mapping(pairs: Vec<(&str, SceneDocumentYamlSubsetValue)>) -> SceneDocumentYamlSubsetValue {
    let mut out = SceneDocumentYamlSubsetMapping::default();
    for (key, value) in pairs {
        set_record_value(&mut out, key.to_string(), value);
    }
    return SceneDocumentYamlSubsetValue::Mapping(out);
}

pub fn number(value: f64) -> FlightDocumentValue {
    return FlightDocumentValue::Number(value);
}

pub fn text(value: &str) -> FlightDocumentValue {
    return FlightDocumentValue::String(value.to_string());
}
