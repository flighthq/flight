use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticSeverity, report_import_diagnostic,
};
use flight_spritesheet::{
    SpritesheetAnimationDataOptions, SpritesheetAnimationDirection, SpritesheetData,
    SpritesheetDataOptions, create_spritesheet_animation_data, create_spritesheet_data,
};
use flight_textureatlas::TextureAtlas;
use flight_textureatlas_formats::{
    TextureAtlasAsepriteArrayDocument, TextureAtlasAsepriteArrayDocumentValue,
    TextureAtlasAsepriteDocument, TextureAtlasAsepriteHashDocument,
    TextureAtlasAsepriteHashDocumentValue, TextureAtlasAsepriteMeta,
    TextureAtlasAsepriteNamedFrame, TextureAtlasScale, parse_texture_atlas_aseprite_document,
};

use crate::common::frame_from_region;
use crate::json::parse_aseprite_document;
use crate::types::*;

fn aseprite_atlas_document(document: &AsepriteDocument) -> TextureAtlasAsepriteDocument {
    return match document {
        AsepriteDocument::Array(document) => {
            TextureAtlasAsepriteDocument::Array(TextureAtlasAsepriteArrayDocumentValue {
                value: TextureAtlasAsepriteArrayDocument {
                    frames: document
                        .value
                        .frames
                        .iter()
                        .map(
                            |frame| flight_textureatlas_formats::TextureAtlasAsepriteArrayFrame {
                                duration: frame.duration,
                                filename: frame.filename.clone(),
                                frame: frame.frame.clone(),
                                rotated: frame.rotated,
                                source_size: frame.source_size.clone(),
                                sprite_source_size: frame.sprite_source_size.clone(),
                                trimmed: frame.trimmed,
                            },
                        )
                        .collect(),
                    meta: aseprite_atlas_meta(&document.value.meta),
                },
            })
        }
        AsepriteDocument::Hash(document) => {
            TextureAtlasAsepriteDocument::Hash(TextureAtlasAsepriteHashDocumentValue {
                value: TextureAtlasAsepriteHashDocument {
                    frames: document
                        .value
                        .frames
                        .iter()
                        .map(|frame| TextureAtlasAsepriteNamedFrame {
                            frame: frame.frame.clone(),
                            name: frame.name.clone(),
                        })
                        .collect(),
                    meta: aseprite_atlas_meta(&document.value.meta),
                },
            })
        }
    };
}

fn aseprite_atlas_meta(meta: &AsepriteMeta) -> TextureAtlasAsepriteMeta {
    return TextureAtlasAsepriteMeta {
        app: meta.app.clone(),
        format: meta.format.clone(),
        frame_tags: Some(meta.frame_tags.clone()),
        image: meta.image.clone(),
        scale: meta.scale.clone(),
        size: meta.size.clone(),
        version: meta.version.clone(),
    };
}

// flight-lint: allow(f64) source per-frame millisecond timings are JavaScript numbers
fn aseprite_document_to_data(document: &AsepriteDocument) -> SpritesheetData {
    let atlas_document = aseprite_atlas_document(document);
    let mut atlas = TextureAtlas::default();
    parse_texture_atlas_aseprite_document(&mut atlas, &atlas_document);
    let frames = atlas
        .regions
        .iter()
        .map(|region| {
            let region = region.read().unwrap();
            frame_from_region(&region, false)
        })
        .collect::<Vec<_>>();
    let frame_names = frames
        .iter()
        .map(|frame| frame.name.clone())
        .collect::<Vec<_>>();
    let mut durations: Vec<(String, f64)> = Vec::new();
    let meta = match document {
        AsepriteDocument::Array(document) => {
            for frame in &document.value.frames {
                durations.push((frame.filename.clone(), f64::from(frame.duration)));
            }
            &document.value.meta
        }
        AsepriteDocument::Hash(document) => {
            for frame in &document.value.frames {
                durations.push((frame.name.clone(), f64::from(frame.frame.duration)));
            }
            &document.value.meta
        }
    };
    let animations = meta
        .frame_tags
        .iter()
        .map(|tag| {
            let start = usize::try_from(tag.from.max(0))
                .unwrap_or(0)
                .min(frame_names.len());
            let end = usize::try_from(tag.to.saturating_add(1).max(0))
                .unwrap_or(0)
                .min(frame_names.len());
            let names = if start <= end {
                frame_names[start..end].to_vec()
            } else {
                Vec::new()
            };
            let frame_durations = names
                .iter()
                .map(|name| {
                    durations
                        .iter()
                        .find(|(candidate, _)| candidate == name)
                        .map_or(100.0, |(_, duration)| *duration)
                })
                .collect::<Vec<_>>();
            let frame_duration = frame_durations.first().copied().unwrap_or(100.0);
            let uniform = frame_durations
                .iter()
                .all(|duration| *duration == frame_duration);
            create_spritesheet_animation_data(Some(SpritesheetAnimationDataOptions {
                direction: Some(match tag.direction {
                    flight_textureatlas_formats::TextureAtlasFrameTagDirection::Forward => {
                        SpritesheetAnimationDirection::Forward
                    }
                    flight_textureatlas_formats::TextureAtlasFrameTagDirection::PingPong => {
                        SpritesheetAnimationDirection::Pingpong
                    }
                    flight_textureatlas_formats::TextureAtlasFrameTagDirection::PingPongReverse => {
                        SpritesheetAnimationDirection::PingpongReverse
                    }
                    flight_textureatlas_formats::TextureAtlasFrameTagDirection::Reverse => {
                        SpritesheetAnimationDirection::Reverse
                    }
                }),
                frame_duration: Some(frame_duration),
                frame_durations: if uniform { None } else { Some(frame_durations) },
                frame_names: Some(names),
                name: Some(tag.name.clone()),
                repeat_count: Some(-1),
                ..SpritesheetAnimationDataOptions::default()
            }))
        })
        .collect();
    return create_spritesheet_data(Some(SpritesheetDataOptions {
        animations: Some(animations),
        frames: Some(frames),
        image_file: Some(meta.image.clone()),
        image_height: Some(meta.size.h),
        image_width: Some(meta.size.w),
        scale: Some(scale_value(&meta.scale)),
    }));
}

fn empty_aseprite_document() -> AsepriteDocument {
    return AsepriteDocument::Array(AsepriteArrayDocumentValue {
        value: AsepriteArrayDocument {
            frames: Vec::new(),
            meta: AsepriteMeta {
                app: String::new(),
                format: String::new(),
                frame_tags: Vec::new(),
                image: String::new(),
                layers: None,
                scale: TextureAtlasScale::Number(
                    flight_textureatlas_formats::TextureAtlasScaleNumber { value: 1.0 },
                ),
                size: AsepriteSize { h: 0.0, w: 0.0 },
                slices: None,
                version: String::new(),
            },
        },
    });
}

pub fn parse_aseprite_spritesheet(
    json: &str,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> SpritesheetData {
    let Ok(document) = parse_aseprite_document(json) else {
        report_import_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Reject,
            "spritesheet.aseprite.malformed-json",
            "parseAsepriteSpritesheet",
            None,
        );
        return create_spritesheet_data(None);
    };
    return aseprite_document_to_data(&document);
}

pub fn parse_aseprite_spritesheet_document(
    json: &str,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> AsepriteParsed {
    let Ok(document) = parse_aseprite_document(json) else {
        report_import_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Reject,
            "spritesheet.aseprite.malformed-json",
            "parseAsepriteSpritesheetDocument",
            None,
        );
        let document = empty_aseprite_document();
        return AsepriteParsed {
            data: create_spritesheet_data(None),
            document,
        };
    };
    return AsepriteParsed {
        data: aseprite_document_to_data(&document),
        document,
    };
}

fn scale_value(scale: &TextureAtlasScale) -> f32 {
    return match scale {
        TextureAtlasScale::Number(scale) => scale.value,
        TextureAtlasScale::String(scale) => scale
            .value
            .parse::<f32>()
            .ok()
            .filter(|value| *value != 0.0)
            .unwrap_or(1.0),
    };
}
