use flight_textureatlas::{
    TextureAtlas, TextureAtlasRegionOptions, TextureAtlasRotation, create_texture_atlas_region,
};

use crate::json::{RawAtlasDocument, RawFrame, RawFrames, RawMeta};
use crate::texture_atlas_page_meta::{reset_texture_atlas_page_meta, texture_atlas_read_raw_scale};
use crate::types::*;

/// Populates `atlas` from an already typed Aseprite document.
// flight-lint: allow(conform-params) D9: mutable output is first and the source chaining return is unit
pub fn parse_texture_atlas_aseprite_document(
    atlas: &mut TextureAtlas,
    doc: &TextureAtlasAsepriteDocument,
) {
    atlas.regions.clear();
    match doc {
        TextureAtlasAsepriteDocument::Array(doc) => {
            texture_atlas_aseprite_apply_declared_meta(atlas, &doc.value.meta);
            for entry in &doc.value.frames {
                texture_atlas_aseprite_apply_declared_frame(
                    atlas,
                    &entry.filename,
                    &entry.frame,
                    entry.rotated,
                    &entry.source_size,
                    &entry.sprite_source_size,
                    entry.trimmed,
                );
            }
        }
        TextureAtlasAsepriteDocument::Hash(doc) => {
            texture_atlas_aseprite_apply_declared_meta(atlas, &doc.value.meta);
            for entry in &doc.value.frames {
                texture_atlas_aseprite_apply_declared_frame(
                    atlas,
                    &entry.name,
                    &entry.frame.frame,
                    entry.frame.rotated,
                    &entry.frame.source_size,
                    &entry.frame.sprite_source_size,
                    entry.frame.trimmed,
                );
            }
        }
    }
}

/// Parses Aseprite JSON without throwing. Malformed JSON leaves `atlas` unchanged.
// flight-lint: allow(conform-params) D9: mutable output is first and the source chaining return is unit
pub fn parse_texture_atlas_aseprite_json(atlas: &mut TextureAtlas, json: &str) {
    let Ok(doc) = serde_json::from_str::<RawAtlasDocument>(json) else {
        return;
    };
    atlas.regions.clear();
    texture_atlas_aseprite_apply_raw_meta(atlas, doc.meta.as_ref());
    match doc.frames {
        RawFrames::Array(frames) => {
            for entry in frames.values {
                let name = entry.filename.clone().unwrap_or_default();
                texture_atlas_aseprite_apply_raw_frame(atlas, &name, &entry);
            }
        }
        RawFrames::Hash(frames) => {
            for entry in frames.values {
                texture_atlas_aseprite_apply_raw_frame(atlas, &entry.name, &entry.value);
            }
        }
    }
}

fn texture_atlas_aseprite_apply_declared_frame(
    atlas: &mut TextureAtlas,
    name: &str,
    frame: &TextureAtlasAsepriteRect,
    rotated: bool,
    source_size: &TextureAtlasAsepriteSize,
    sprite_source_size: &TextureAtlasAsepriteRect,
    trimmed: bool,
) {
    let region = create_texture_atlas_region(Some(&TextureAtlasRegionOptions {
        height: Some(frame.h),
        id: Some(atlas.regions.len() as i32),
        name: Some(name.to_string()),
        original_height: if trimmed { Some(source_size.h) } else { None },
        original_width: if trimmed { Some(source_size.w) } else { None },
        pivot_x: None,
        pivot_y: None,
        rotation: Some(if rotated {
            TextureAtlasRotation::Clockwise90
        } else {
            TextureAtlasRotation::None
        }),
        source_x: Some(sprite_source_size.x),
        source_y: Some(sprite_source_size.y),
        trimmed: Some(trimmed),
        width: Some(frame.w),
        x: Some(frame.x),
        y: Some(frame.y),
        ..TextureAtlasRegionOptions::default()
    }));
    atlas.regions.push(region);
}

fn texture_atlas_aseprite_apply_declared_meta(
    atlas: &mut TextureAtlas,
    meta: &TextureAtlasAsepriteMeta,
) {
    reset_texture_atlas_page_meta(atlas);
    atlas.image_name = Some(meta.image.clone());
    atlas.image_width = meta.size.w;
    atlas.image_height = meta.size.h;
    atlas.scale = crate::texture_atlas_page_meta::read_texture_atlas_scale(Some(&meta.scale));
}

fn texture_atlas_aseprite_apply_raw_frame(atlas: &mut TextureAtlas, name: &str, entry: &RawFrame) {
    let Some(frame) = &entry.frame else {
        return;
    };
    let trimmed = entry.trimmed == Some(true);
    let region = create_texture_atlas_region(Some(&TextureAtlasRegionOptions {
        height: Some(frame.h),
        id: Some(atlas.regions.len() as i32),
        name: Some(name.to_string()),
        original_height: if trimmed {
            entry.source_size.as_ref().map(|size| size.h)
        } else {
            None
        },
        original_width: if trimmed {
            entry.source_size.as_ref().map(|size| size.w)
        } else {
            None
        },
        pivot_x: None,
        pivot_y: None,
        rotation: Some(if entry.rotated == Some(true) {
            TextureAtlasRotation::Clockwise90
        } else {
            TextureAtlasRotation::None
        }),
        source_x: Some(entry.sprite_source_size.as_ref().map_or(0.0, |size| size.x)),
        source_y: Some(entry.sprite_source_size.as_ref().map_or(0.0, |size| size.y)),
        trimmed: Some(trimmed),
        width: Some(frame.w),
        x: Some(frame.x),
        y: Some(frame.y),
        ..TextureAtlasRegionOptions::default()
    }));
    atlas.regions.push(region);
}

fn texture_atlas_aseprite_apply_raw_meta(atlas: &mut TextureAtlas, meta: Option<&RawMeta>) {
    reset_texture_atlas_page_meta(atlas);
    let Some(meta) = meta else {
        return;
    };
    atlas.image_name = meta.image.clone();
    atlas.image_width = meta.size.as_ref().map_or(0.0, |size| size.w);
    atlas.image_height = meta.size.as_ref().map_or(0.0, |size| size.h);
    atlas.scale = texture_atlas_read_raw_scale(meta.scale.as_ref());
}
