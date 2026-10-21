use serde::ser::{Serialize, SerializeMap, SerializeSeq, Serializer};

#[derive(Clone, Debug)]
// flight-lint: allow(f64) JSON numbers are source JavaScript numbers
pub(crate) enum OrderedJson {
    Array(Vec<OrderedJson>),
    Bool(bool),
    Number(f64),
    Object(Vec<(String, OrderedJson)>),
    String(String),
}

pub(crate) fn array(values: Vec<OrderedJson>) -> OrderedJson {
    return OrderedJson::Array(values);
}

pub(crate) fn boolean(value: bool) -> OrderedJson {
    return OrderedJson::Bool(value);
}

// flight-lint: allow(f64) JSON numbers are source JavaScript numbers
pub(crate) fn number(value: impl Into<f64>) -> OrderedJson {
    return OrderedJson::Number(value.into());
}

pub(crate) fn object(values: Vec<(&str, OrderedJson)>) -> OrderedJson {
    return OrderedJson::Object(
        values
            .into_iter()
            .map(|(key, value)| (key.to_string(), value))
            .collect(),
    );
}

// flight-lint: allow(f64) JSON numbers are source JavaScript numbers
fn serialize_ordered_json<S>(value: &OrderedJson, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    return match value {
        OrderedJson::Array(values) => {
            let mut sequence = serializer.serialize_seq(Some(values.len()))?;
            for value in values {
                sequence.serialize_element(value)?;
            }
            sequence.end()
        }
        OrderedJson::Bool(value) => serializer.serialize_bool(*value),
        OrderedJson::Number(value) => {
            if !value.is_finite() {
                serializer.serialize_none()
            } else if value.fract() == 0.0 && *value >= i64::MIN as f64 && *value <= i64::MAX as f64
            {
                serializer.serialize_i64(*value as i64)
            } else {
                serializer.serialize_f64(*value)
            }
        }
        OrderedJson::Object(values) => {
            let mut map = serializer.serialize_map(Some(values.len()))?;
            for (key, value) in values {
                map.serialize_entry(key, value)?;
            }
            map.end()
        }
        OrderedJson::String(value) => serializer.serialize_str(value),
    };
}

pub(crate) fn string(value: impl Into<String>) -> OrderedJson {
    return OrderedJson::String(value.into());
}

pub(crate) fn to_pretty_json(value: &OrderedJson) -> String {
    return serde_json::to_string_pretty(value).unwrap();
}

impl Serialize for OrderedJson {
    // flight-lint: allow(f64) JSON numbers are source JavaScript numbers
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        return serialize_ordered_json(self, serializer);
    }
}
