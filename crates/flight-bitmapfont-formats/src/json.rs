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

fn deserialize_raw_bitmap_font_json<'de, D>(deserializer: D) -> Result<RawBitmapFontJson, D::Error>
where
    D: Deserializer<'de>,
{
    return deserializer.deserialize_map(RootVisitor);
}

fn deserialize_raw_chars<'de, D>(deserializer: D) -> Result<RawChars, D::Error>
where
    D: Deserializer<'de>,
{
    return deserializer.deserialize_any(CharsVisitor);
}

fn expect_chars(formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
    return formatter.write_str("an array, object, or invalid chars value");
}

fn expect_root(formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
    return formatter.write_str("a bitmap font JSON object");
}

fn visit_chars_bool<E>(_value: bool) -> Result<RawChars, E> {
    return Ok(RawChars::Invalid);
}

// flight-lint: allow(f64) serde_json exposes JSON number visitation through f64
fn visit_chars_f64<E>(_value: f64) -> Result<RawChars, E> {
    return Ok(RawChars::Invalid);
}

fn visit_chars_i64<E>(_value: i64) -> Result<RawChars, E> {
    return Ok(RawChars::Invalid);
}

fn visit_chars_map<'de, A>(mut map: A) -> Result<RawChars, A::Error>
where
    A: MapAccess<'de>,
{
    let mut values = Vec::new();
    while let Some((_key, value)) = map.next_entry::<String, Value>()? {
        values.push(value);
    }
    return Ok(RawChars::Values(values));
}

fn visit_chars_none<E>() -> Result<RawChars, E> {
    return Ok(RawChars::Invalid);
}

fn visit_chars_seq<'de, A>(mut sequence: A) -> Result<RawChars, A::Error>
where
    A: SeqAccess<'de>,
{
    let mut values = Vec::new();
    while let Some(value) = sequence.next_element::<Value>()? {
        values.push(value);
    }
    return Ok(RawChars::Values(values));
}

fn visit_chars_str<E>(_value: &str) -> Result<RawChars, E> {
    return Ok(RawChars::Invalid);
}

fn visit_chars_u64<E>(_value: u64) -> Result<RawChars, E> {
    return Ok(RawChars::Invalid);
}

fn visit_chars_unit<E>() -> Result<RawChars, E> {
    return Ok(RawChars::Invalid);
}

fn visit_root_map<'de, A>(mut map: A) -> Result<RawBitmapFontJson, A::Error>
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
        return deserialize_raw_bitmap_font_json(deserializer);
    }
}

impl<'de> Visitor<'de> for RootVisitor {
    type Value = RawBitmapFontJson;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        return expect_root(formatter);
    }

    fn visit_map<A>(self, map: A) -> Result<Self::Value, A::Error>
    where
        A: MapAccess<'de>,
    {
        return visit_root_map(map);
    }
}

impl<'de> Deserialize<'de> for RawChars {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        return deserialize_raw_chars(deserializer);
    }
}

impl<'de> Visitor<'de> for CharsVisitor {
    type Value = RawChars;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        return expect_chars(formatter);
    }

    fn visit_bool<E>(self, value: bool) -> Result<Self::Value, E> {
        return visit_chars_bool(value);
    }

    // flight-lint: allow(f64) serde_json exposes JSON number visitation through f64
    fn visit_f64<E>(self, value: f64) -> Result<Self::Value, E> {
        return visit_chars_f64(value);
    }

    fn visit_i64<E>(self, value: i64) -> Result<Self::Value, E> {
        return visit_chars_i64(value);
    }

    fn visit_map<A>(self, map: A) -> Result<Self::Value, A::Error>
    where
        A: MapAccess<'de>,
    {
        return visit_chars_map(map);
    }

    fn visit_none<E>(self) -> Result<Self::Value, E> {
        return visit_chars_none();
    }

    fn visit_seq<A>(self, sequence: A) -> Result<Self::Value, A::Error>
    where
        A: SeqAccess<'de>,
    {
        return visit_chars_seq(sequence);
    }

    fn visit_str<E>(self, value: &str) -> Result<Self::Value, E> {
        return visit_chars_str(value);
    }

    fn visit_u64<E>(self, value: u64) -> Result<Self::Value, E> {
        return visit_chars_u64(value);
    }

    fn visit_unit<E>(self) -> Result<Self::Value, E> {
        return visit_chars_unit();
    }
}
