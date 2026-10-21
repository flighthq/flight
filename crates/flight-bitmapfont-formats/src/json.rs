use std::fmt;

use serde::de::{IgnoredAny, MapAccess, SeqAccess, Visitor};
use serde::{Deserialize, Deserializer};
use serde_json::Value;

#[derive(Clone, Debug, Default)]
pub(crate) struct RawBitmapFontJson {
    pub chars: Option<RawChars>,
    pub common: Option<Value>,
    pub distance_field: Option<Value>,
    pub kernings: Option<Value>,
    pub pages: Option<Value>,
}

#[derive(Clone, Debug)]
pub(crate) enum RawChars {
    Invalid,
    Values(Vec<Value>),
}

struct RootVisitor;
struct CharsVisitor;

impl Default for RawChars {
    fn default() -> Self {
        return RawChars::Invalid;
    }
}

impl<'de> Deserialize<'de> for RawBitmapFontJson {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        return deserializer.deserialize_map(RootVisitor);
    }
}

impl<'de> Visitor<'de> for RootVisitor {
    type Value = RawBitmapFontJson;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        return formatter.write_str("a bitmap font JSON object");
    }

    fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
    where
        A: MapAccess<'de>,
    {
        let mut out = RawBitmapFontJson::default();
        while let Some(key) = map.next_key::<String>()? {
            match key.as_str() {
                "chars" => out.chars = Some(map.next_value::<RawChars>()?),
                "common" => out.common = Some(map.next_value::<Value>()?),
                "distanceField" => out.distance_field = Some(map.next_value::<Value>()?),
                "kernings" => out.kernings = Some(map.next_value::<Value>()?),
                "pages" => out.pages = Some(map.next_value::<Value>()?),
                _ => {
                    map.next_value::<IgnoredAny>()?;
                }
            }
        }
        return Ok(out);
    }
}

impl<'de> Deserialize<'de> for RawChars {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        return deserializer.deserialize_any(CharsVisitor);
    }
}

impl<'de> Visitor<'de> for CharsVisitor {
    type Value = RawChars;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        return formatter.write_str("an array, object, or invalid chars value");
    }

    fn visit_bool<E>(self, _value: bool) -> Result<Self::Value, E> {
        return Ok(RawChars::Invalid);
    }

    // flight-lint: allow(f64) serde_json exposes JSON number visitation through f64
    fn visit_f64<E>(self, _value: f64) -> Result<Self::Value, E> {
        return Ok(RawChars::Invalid);
    }

    fn visit_i64<E>(self, _value: i64) -> Result<Self::Value, E> {
        return Ok(RawChars::Invalid);
    }

    fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
    where
        A: MapAccess<'de>,
    {
        let mut values = Vec::new();
        while let Some((_key, value)) = map.next_entry::<String, Value>()? {
            values.push(value);
        }
        return Ok(RawChars::Values(values));
    }

    fn visit_none<E>(self) -> Result<Self::Value, E> {
        return Ok(RawChars::Invalid);
    }

    fn visit_seq<A>(self, mut sequence: A) -> Result<Self::Value, A::Error>
    where
        A: SeqAccess<'de>,
    {
        let mut values = Vec::new();
        while let Some(value) = sequence.next_element::<Value>()? {
            values.push(value);
        }
        return Ok(RawChars::Values(values));
    }

    fn visit_str<E>(self, _value: &str) -> Result<Self::Value, E> {
        return Ok(RawChars::Invalid);
    }

    fn visit_u64<E>(self, _value: u64) -> Result<Self::Value, E> {
        return Ok(RawChars::Invalid);
    }

    fn visit_unit<E>(self) -> Result<Self::Value, E> {
        return Ok(RawChars::Invalid);
    }
}
