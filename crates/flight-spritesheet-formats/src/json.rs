use std::fmt;

use serde::de::{MapAccess, SeqAccess, Visitor};
use serde::{Deserialize, Deserializer};

use flight_textureatlas_formats::{
    TextureAtlasAsepriteBaseFrame, TextureAtlasAsepriteFrameTag, TextureAtlasAsepriteRect,
    TextureAtlasAsepriteSize, TextureAtlasFrameTagDirection, TextureAtlasScale,
    TextureAtlasScaleNumber, TextureAtlasScaleString, TexturePackerAtlasArrayDocument,
    TexturePackerAtlasArrayDocumentValue, TexturePackerAtlasArrayFrame, TexturePackerAtlasFrameTag,
    TexturePackerAtlasHashDocument, TexturePackerAtlasHashDocumentValue,
    TexturePackerAtlasHashFrame, TexturePackerAtlasMeta, TexturePackerAtlasNamedFrame,
    TexturePackerAtlasPivot, TexturePackerAtlasRect, TexturePackerAtlasSize,
    parse_texture_atlas_frame_tag_direction,
};

use crate::types::*;

#[derive(Clone, Debug, Deserialize)]
struct RawDocument {
    frames: RawFrames,
    #[serde(default)]
    meta: RawMeta,
}

#[derive(Clone, Debug)]
enum RawFrames {
    Array(Vec<RawFrame>),
    Hash(Vec<RawNamedFrame>),
}

#[derive(Clone, Debug, Default)]
struct RawNamedFrame {
    name: String,
    value: RawFrame,
}

#[derive(Clone, Debug, Default, Deserialize)]
struct RawFrame {
    #[serde(default)]
    duration: f32,
    #[serde(default)]
    filename: String,
    #[serde(default)]
    frame: RawRect,
    #[serde(default)]
    pivot: Option<RawPivot>,
    #[serde(default)]
    rotated: bool,
    #[serde(default, rename = "sourceSize")]
    source_size: RawSize,
    #[serde(default, rename = "spriteSourceSize")]
    sprite_source_size: RawRect,
    #[serde(default)]
    trimmed: bool,
}

#[derive(Clone, Debug, Default, Deserialize)]
struct RawFrameTag {
    #[serde(default)]
    color: Option<String>,
    #[serde(default = "default_direction")]
    direction: String,
    #[serde(default)]
    from: i32,
    #[serde(default)]
    name: String,
    #[serde(default)]
    to: i32,
}

#[derive(Clone, Debug, Default, Deserialize)]
struct RawLayer {
    #[serde(default, rename = "blendMode")]
    blend_mode: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    opacity: f32,
}

#[derive(Clone, Debug, Default, Deserialize)]
struct RawMeta {
    #[serde(default)]
    app: String,
    #[serde(default)]
    format: String,
    #[serde(default, rename = "frameTags")]
    frame_tags: Option<Vec<RawFrameTag>>,
    #[serde(default)]
    image: String,
    #[serde(default)]
    layers: Option<Vec<RawLayer>>,
    #[serde(default)]
    scale: RawScale,
    #[serde(default)]
    size: RawSize,
    #[serde(default)]
    version: String,
}

#[derive(Clone, Debug, Default, Deserialize)]
struct RawPivot {
    #[serde(default)]
    x: f32,
    #[serde(default)]
    y: f32,
}

#[derive(Clone, Debug, Default, Deserialize)]
struct RawRect {
    #[serde(default)]
    h: f32,
    #[serde(default)]
    w: f32,
    #[serde(default)]
    x: f32,
    #[serde(default)]
    y: f32,
}

#[derive(Clone, Debug, Default)]
struct RawScale {
    number: Option<f32>,
    string: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize)]
struct RawSize {
    #[serde(default)]
    h: f32,
    #[serde(default)]
    w: f32,
}

struct RawFramesVisitor;
struct RawScaleVisitor;

fn aseprite_array_frame(raw: RawFrame) -> AsepriteArrayFrame {
    let base = aseprite_base_frame(raw.clone());
    return AsepriteArrayFrame {
        duration: base.duration,
        filename: raw.filename,
        frame: base.frame,
        rotated: base.rotated,
        source_size: base.source_size,
        sprite_source_size: base.sprite_source_size,
        trimmed: base.trimmed,
    };
}

fn aseprite_base_frame(raw: RawFrame) -> AsepriteBaseFrame {
    return TextureAtlasAsepriteBaseFrame {
        duration: raw.duration,
        frame: aseprite_rect(raw.frame),
        rotated: raw.rotated,
        source_size: aseprite_size(raw.source_size),
        sprite_source_size: aseprite_rect(raw.sprite_source_size),
        trimmed: raw.trimmed,
    };
}

fn aseprite_meta(raw: RawMeta) -> AsepriteMeta {
    return AsepriteMeta {
        app: raw.app,
        format: raw.format,
        frame_tags: raw
            .frame_tags
            .unwrap_or_default()
            .into_iter()
            .map(|tag| TextureAtlasAsepriteFrameTag {
                color: tag.color,
                direction: parse_texture_atlas_frame_tag_direction(&tag.direction)
                    .unwrap_or(TextureAtlasFrameTagDirection::Forward),
                from: tag.from,
                name: tag.name,
                to: tag.to,
            })
            .collect(),
        image: raw.image,
        layers: raw.layers.map(|layers| {
            layers
                .into_iter()
                .map(|layer| AsepriteLayer {
                    blend_mode: layer.blend_mode,
                    name: layer.name,
                    opacity: layer.opacity,
                })
                .collect()
        }),
        scale: atlas_scale(raw.scale),
        size: aseprite_size(raw.size),
        version: raw.version,
    };
}

fn aseprite_rect(raw: RawRect) -> TextureAtlasAsepriteRect {
    return TextureAtlasAsepriteRect {
        h: raw.h,
        w: raw.w,
        x: raw.x,
        y: raw.y,
    };
}

fn aseprite_size(raw: RawSize) -> TextureAtlasAsepriteSize {
    return TextureAtlasAsepriteSize { h: raw.h, w: raw.w };
}

fn atlas_scale(raw: RawScale) -> TextureAtlasScale {
    if let Some(value) = raw.string {
        return TextureAtlasScale::String(TextureAtlasScaleString { value });
    }
    return TextureAtlasScale::Number(TextureAtlasScaleNumber {
        value: raw.number.unwrap_or(0.0),
    });
}

fn default_direction() -> String {
    return "forward".to_string();
}

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

pub(crate) fn parse_aseprite_document(json: &str) -> Result<AsepriteDocument, serde_json::Error> {
    let raw = serde_json::from_str::<RawDocument>(json)?;
    let meta = aseprite_meta(raw.meta);
    return Ok(match raw.frames {
        RawFrames::Array(frames) => AsepriteDocument::Array(AsepriteArrayDocumentValue {
            value: AsepriteArrayDocument {
                frames: frames.into_iter().map(aseprite_array_frame).collect(),
                meta,
            },
        }),
        RawFrames::Hash(frames) => AsepriteDocument::Hash(AsepriteHashDocumentValue {
            value: AsepriteHashDocument {
                frames: frames
                    .into_iter()
                    .map(|entry| AsepriteNamedFrame {
                        frame: aseprite_base_frame(entry.value),
                        name: entry.name,
                    })
                    .collect(),
                meta,
            },
        }),
    });
}

pub(crate) fn parse_texture_packer_document(
    json: &str,
) -> Result<TexturePackerDocument, serde_json::Error> {
    let raw = serde_json::from_str::<RawDocument>(json)?;
    let meta = texture_packer_meta(raw.meta);
    return Ok(match raw.frames {
        RawFrames::Array(frames) => {
            TexturePackerDocument::Array(TexturePackerAtlasArrayDocumentValue {
                value: TexturePackerAtlasArrayDocument {
                    frames: frames.into_iter().map(texture_packer_array_frame).collect(),
                    meta,
                },
            })
        }
        RawFrames::Hash(frames) => {
            TexturePackerDocument::Hash(TexturePackerAtlasHashDocumentValue {
                value: TexturePackerAtlasHashDocument {
                    frames: frames
                        .into_iter()
                        .map(|entry| TexturePackerAtlasNamedFrame {
                            frame: texture_packer_hash_frame(entry.value),
                            name: entry.name,
                        })
                        .collect(),
                    meta,
                },
            })
        }
    });
}

fn texture_packer_array_frame(raw: RawFrame) -> TexturePackerAtlasArrayFrame {
    let frame = texture_packer_hash_frame(raw.clone());
    return TexturePackerAtlasArrayFrame {
        filename: raw.filename,
        frame: frame.frame,
        pivot: frame.pivot,
        rotated: frame.rotated,
        source_size: frame.source_size,
        sprite_source_size: frame.sprite_source_size,
        trimmed: frame.trimmed,
    };
}

fn texture_packer_hash_frame(raw: RawFrame) -> TexturePackerAtlasHashFrame {
    return TexturePackerAtlasHashFrame {
        frame: TexturePackerAtlasRect {
            h: raw.frame.h,
            w: raw.frame.w,
            x: raw.frame.x,
            y: raw.frame.y,
        },
        pivot: raw.pivot.map(|pivot| TexturePackerAtlasPivot {
            x: pivot.x,
            y: pivot.y,
        }),
        rotated: raw.rotated,
        source_size: TexturePackerAtlasSize {
            h: raw.source_size.h,
            w: raw.source_size.w,
        },
        sprite_source_size: TexturePackerAtlasRect {
            h: raw.sprite_source_size.h,
            w: raw.sprite_source_size.w,
            x: raw.sprite_source_size.x,
            y: raw.sprite_source_size.y,
        },
        trimmed: raw.trimmed,
    };
}

fn texture_packer_meta(raw: RawMeta) -> TexturePackerAtlasMeta {
    return TexturePackerAtlasMeta {
        app: raw.app,
        format: raw.format,
        frame_tags: raw.frame_tags.map(|tags| {
            tags.into_iter()
                .map(|tag| TexturePackerAtlasFrameTag {
                    direction: parse_texture_atlas_frame_tag_direction(&tag.direction),
                    from: tag.from,
                    name: tag.name,
                    to: tag.to,
                })
                .collect()
        }),
        image: raw.image,
        scale: atlas_scale(raw.scale),
        size: TexturePackerAtlasSize {
            h: raw.size.h,
            w: raw.size.w,
        },
        version: raw.version,
    };
}

fn visit_raw_frame_map<'de, A>(mut map: A) -> Result<RawFrames, A::Error>
where
    A: MapAccess<'de>,
{
    let mut values = Vec::new();
    while let Some((name, value)) = map.next_entry::<String, RawFrame>()? {
        values.push(RawNamedFrame { name, value });
    }
    return Ok(RawFrames::Hash(values));
}

fn visit_raw_frame_sequence<'de, A>(mut sequence: A) -> Result<RawFrames, A::Error>
where
    A: SeqAccess<'de>,
{
    let mut values = Vec::new();
    while let Some(value) = sequence.next_element::<RawFrame>()? {
        values.push(value);
    }
    return Ok(RawFrames::Array(values));
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

impl<'de> Deserialize<'de> for RawFrames {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        return deserialize_raw_frames(deserializer);
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

impl<'de> Deserialize<'de> for RawScale {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        return deserialize_raw_scale(deserializer);
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
