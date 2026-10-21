use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticSeverity, report_import_diagnostic,
};
use flight_spritesheet::{
    SpritesheetAnimationDataOptions, SpritesheetAnimationDirection, SpritesheetData,
    SpritesheetDataOptions, create_spritesheet_animation_data, create_spritesheet_data,
};
use flight_textureatlas::TextureAtlas;
use flight_textureatlas_formats::{
    TextureAtlasFrameTagDirection, TextureAtlasScale, parse_texture_packer_atlas_document,
};

use crate::common::frame_from_region;
use crate::json::parse_texture_packer_document;
use crate::types::*;

pub fn parse_texture_packer_spritesheet(
    json: &str,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> SpritesheetData {
    let Ok(document) = parse_texture_packer_document(json) else {
        report_import_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Reject,
            "spritesheet.texture-packer.malformed-json",
            "parseTexturePackerSpritesheet",
            None,
        );
        return create_spritesheet_data(None);
    };
    return texture_packer_document_to_data(&document);
}

pub fn parse_texture_packer_spritesheet_document(
    json: &str,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> TexturePackerParsed {
    let Ok(document) = parse_texture_packer_document(json) else {
        report_import_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Reject,
            "spritesheet.texture-packer.malformed-json",
            "parseTexturePackerSpritesheetDocument",
            None,
        );
        let document = TexturePackerDocument::Array(
            flight_textureatlas_formats::TexturePackerAtlasArrayDocumentValue {
                value: flight_textureatlas_formats::TexturePackerAtlasArrayDocument {
                    frames: Vec::new(),
                    meta: TexturePackerMeta {
                        app: String::new(),
                        format: String::new(),
                        frame_tags: None,
                        image: String::new(),
                        scale: TextureAtlasScale::Number(
                            flight_textureatlas_formats::TextureAtlasScaleNumber { value: 1.0 },
                        ),
                        size: flight_textureatlas_formats::TexturePackerAtlasSize {
                            h: 0.0,
                            w: 0.0,
                        },
                        version: String::new(),
                    },
                },
            },
        );
        return TexturePackerParsed {
            data: create_spritesheet_data(None),
            document,
        };
    };
    return TexturePackerParsed {
        data: texture_packer_document_to_data(&document),
        document,
    };
}

fn texture_packer_document_to_data(document: &TexturePackerDocument) -> SpritesheetData {
    let mut atlas = TextureAtlas::default();
    parse_texture_packer_atlas_document(&mut atlas, document, None);
    let frames = atlas
        .regions
        .iter()
        .map(|region| frame_from_region(&region.read().unwrap(), false))
        .collect::<Vec<_>>();
    let frame_names = frames
        .iter()
        .map(|frame| frame.name.clone())
        .collect::<Vec<_>>();
    let meta = match document {
        TexturePackerDocument::Array(document) => &document.value.meta,
        TexturePackerDocument::Hash(document) => &document.value.meta,
    };
    let animations = meta
        .frame_tags
        .as_deref()
        .unwrap_or_default()
        .iter()
        .map(|tag| {
            let start = usize::try_from(tag.from.max(0))
                .unwrap_or(0)
                .min(frame_names.len());
            let end = usize::try_from(tag.to.saturating_add(1).max(0))
                .unwrap_or(0)
                .min(frame_names.len());
            create_spritesheet_animation_data(Some(SpritesheetAnimationDataOptions {
                direction: Some(
                    match tag
                        .direction
                        .unwrap_or(TextureAtlasFrameTagDirection::Forward)
                    {
                        TextureAtlasFrameTagDirection::Forward => {
                            SpritesheetAnimationDirection::Forward
                        }
                        TextureAtlasFrameTagDirection::PingPong => {
                            SpritesheetAnimationDirection::Pingpong
                        }
                        TextureAtlasFrameTagDirection::PingPongReverse => {
                            SpritesheetAnimationDirection::PingpongReverse
                        }
                        TextureAtlasFrameTagDirection::Reverse => {
                            SpritesheetAnimationDirection::Reverse
                        }
                    },
                ),
                frame_duration: Some(100.0),
                frame_names: Some(if start <= end {
                    frame_names[start..end].to_vec()
                } else {
                    Vec::new()
                }),
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
        scale: Some(match &meta.scale {
            TextureAtlasScale::Number(scale) => scale.value,
            TextureAtlasScale::String(scale) => scale
                .value
                .parse::<f32>()
                .ok()
                .filter(|value| *value != 0.0)
                .unwrap_or(1.0),
        }),
    }));
}
