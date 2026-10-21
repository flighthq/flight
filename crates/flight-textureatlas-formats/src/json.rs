use std::fmt;

use serde::de::{MapAccess, SeqAccess, Visitor};
use serde::{Deserialize, Deserializer};

#[derive(Clone, Debug, Default, Deserialize)]
pub(crate) struct RawAtlasDocument {
    pub frames: RawFrames,
    #[serde(default)]
    pub meta: Option<RawMeta>,
}

#[derive(Clone, Debug, Default)]
pub(crate) struct RawArrayFrames {
    pub values: Vec<RawFrame>,
}

#[derive(Clone, Debug, Default)]
pub(crate) struct RawHashFrames {
    pub values: Vec<RawNamedFrame>,
}

#[derive(Clone, Debug)]
pub(crate) enum RawFrames {
    Array(RawArrayFrames),
    Hash(RawHashFrames),
}

#[derive(Clone, Debug, Default)]
pub(crate) struct RawNamedFrame {
    pub name: String,
    pub value: RawFrame,
}

#[derive(Clone, Debug, Default, Deserialize)]
pub(crate) struct RawFrame {
    #[serde(default)]
    pub duration: Option<f32>,
    #[serde(default)]
    pub filename: Option<String>,
    #[serde(default)]
    pub frame: Option<RawRect>,
    #[serde(default)]
    pub pivot: Option<RawPivot>,
    #[serde(default)]
    pub rotated: Option<bool>,
    #[serde(default, rename = "sourceSize")]
    pub source_size: Option<RawSize>,
    #[serde(default, rename = "spriteSourceSize")]
    pub sprite_source_size: Option<RawRect>,
    #[serde(default)]
    pub trimmed: Option<bool>,
}

#[derive(Clone, Debug, Default, Deserialize)]
pub(crate) struct RawMeta {
    #[serde(default)]
    pub app: Option<String>,
    #[serde(default)]
    pub image: Option<String>,
    #[serde(default)]
    pub scale: Option<RawScale>,
    #[serde(default)]
    pub size: Option<RawSize>,
}

#[derive(Clone, Debug, Default, Deserialize)]
pub(crate) struct RawPivot {
    #[serde(default)]
    pub x: f32,
    #[serde(default)]
    pub y: f32,
}

#[derive(Clone, Debug, Default, Deserialize)]
pub(crate) struct RawRect {
    #[serde(default)]
    pub h: f32,
    #[serde(default)]
    pub w: f32,
    #[serde(default)]
    pub x: f32,
    #[serde(default)]
    pub y: f32,
}

#[derive(Clone, Debug, Default)]
pub(crate) struct RawScale {
    pub number: Option<f32>,
    pub string: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize)]
pub(crate) struct RawSize {
    #[serde(default)]
    pub h: f32,
    #[serde(default)]
    pub w: f32,
}

struct RawFramesVisitor;

struct RawScaleVisitor;

fn deserialize_raw_frames<'de, D>(deserializer: D) -> Result<RawFrames, D::Error>
where
    D: Deserializer<'de>,
{
    return deserializer.deserialize_any(RawFramesVisitor);
}

fn deserialize_raw_scale<'de, D>(deserializer: D) -> Result<RawScale, D::Error>
where
    D: Deserializer<'de>,
{
    return deserializer.deserialize_any(RawScaleVisitor);
}

fn expect_raw_frames(formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
    return formatter.write_str("an atlas frame array or object");
}

fn expect_raw_scale(formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
    return formatter.write_str("a numeric or string atlas scale");
}

fn visit_raw_frame_map<'de, A>(mut map: A) -> Result<RawFrames, A::Error>
where
    A: MapAccess<'de>,
{
    let mut values: Vec<RawNamedFrame> = Vec::new();
    while let Some((name, value)) = map.next_entry::<String, RawFrame>()? {
        values.push(RawNamedFrame { name, value });
    }
    return Ok(RawFrames::Hash(RawHashFrames { values }));
}

fn visit_raw_frame_sequence<'de, A>(mut sequence: A) -> Result<RawFrames, A::Error>
where
    A: SeqAccess<'de>,
{
    let mut values: Vec<RawFrame> = Vec::new();
    while let Some(value) = sequence.next_element::<RawFrame>()? {
        values.push(value);
    }
    return Ok(RawFrames::Array(RawArrayFrames { values }));
}

// flight-lint: allow(f64) serde_json exposes JSON number visitation through f64
fn visit_raw_scale_f64<E>(value: f64) -> Result<RawScale, E> {
    return Ok(RawScale {
        number: Some(value as f32),
        string: None,
    });
}

fn visit_raw_scale_i64<E>(value: i64) -> Result<RawScale, E> {
    return Ok(RawScale {
        number: Some(value as f32),
        string: None,
    });
}

fn visit_raw_scale_str<E>(value: &str) -> Result<RawScale, E>
where
    E: serde::de::Error,
{
    return Ok(RawScale {
        number: None,
        string: Some(value.to_string()),
    });
}

fn visit_raw_scale_u64<E>(value: u64) -> Result<RawScale, E> {
    return Ok(RawScale {
        number: Some(value as f32),
        string: None,
    });
}

impl Default for RawFrames {
    fn default() -> Self {
        return RawFrames::Hash(RawHashFrames::default());
    }
}

impl<'de> Visitor<'de> for RawFramesVisitor {
    type Value = RawFrames;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        return expect_raw_frames(formatter);
    }

    fn visit_map<A>(self, map: A) -> Result<Self::Value, A::Error>
    where
        A: MapAccess<'de>,
    {
        return visit_raw_frame_map(map);
    }

    fn visit_seq<A>(self, sequence: A) -> Result<Self::Value, A::Error>
    where
        A: SeqAccess<'de>,
    {
        return visit_raw_frame_sequence(sequence);
    }
}

impl<'de> Deserialize<'de> for RawFrames {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        return deserialize_raw_frames(deserializer);
    }
}

impl<'de> Visitor<'de> for RawScaleVisitor {
    type Value = RawScale;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        return expect_raw_scale(formatter);
    }

    // flight-lint: allow(f64) serde_json exposes JSON number visitation through f64
    fn visit_f64<E>(self, value: f64) -> Result<Self::Value, E> {
        return visit_raw_scale_f64(value);
    }

    fn visit_i64<E>(self, value: i64) -> Result<Self::Value, E> {
        return visit_raw_scale_i64(value);
    }

    fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        return visit_raw_scale_str(value);
    }

    fn visit_u64<E>(self, value: u64) -> Result<Self::Value, E> {
        return visit_raw_scale_u64(value);
    }
}

impl<'de> Deserialize<'de> for RawScale {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        return deserialize_raw_scale(deserializer);
    }
}
