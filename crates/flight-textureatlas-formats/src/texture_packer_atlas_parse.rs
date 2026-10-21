use flight_textureatlas::{
    TextureAtlas, TextureAtlasRegionOptions, TextureAtlasRotation, create_texture_atlas_region,
};

use crate::json::{RawAtlasDocument, RawFrame, RawFrames, RawMeta};
use crate::texture_atlas_page_meta::{read_raw_texture_atlas_scale, reset_texture_atlas_page_meta};
use crate::types::*;

/// Populates `atlas` from an already typed TexturePacker document.
// flight-lint: allow(conform-params) D9: mutable output is first and the source chaining return is unit
pub fn parse_texture_packer_atlas_document(
    atlas: &mut TextureAtlas,
    doc: &TexturePackerAtlasDocument,
    options: Option<&TexturePackerAtlasParseOptions>,
) {
    let defaults = TexturePackerAtlasParseOptions::default();
    let options = options.unwrap_or(&defaults);
    atlas.regions.clear();
    match doc {
        TexturePackerAtlasDocument::Array(doc) => {
            apply_declared_meta(atlas, &doc.value.meta);
            for entry in &doc.value.frames {
                apply_declared_frame(
                    atlas,
                    &entry.filename,
                    &entry.frame,
                    entry.pivot.as_ref(),
                    entry.rotated,
                    &entry.source_size,
                    &entry.sprite_source_size,
                    entry.trimmed,
                    options,
                );
            }
        }
        TexturePackerAtlasDocument::Hash(doc) => {
            apply_declared_meta(atlas, &doc.value.meta);
            for entry in &doc.value.frames {
                apply_declared_frame(
                    atlas,
                    &entry.name,
                    &entry.frame.frame,
                    entry.frame.pivot.as_ref(),
                    entry.frame.rotated,
                    &entry.frame.source_size,
                    &entry.frame.sprite_source_size,
                    entry.frame.trimmed,
                    options,
                );
            }
        }
    }
}

/// Parses TexturePacker JSON without throwing. Malformed JSON leaves `atlas` unchanged.
// flight-lint: allow(conform-params) D9: mutable output is first and the source chaining return is unit
pub fn parse_texture_packer_atlas_json(
    atlas: &mut TextureAtlas,
    json: &str,
    options: Option<&TexturePackerAtlasParseOptions>,
) {
    let Ok(doc) = serde_json::from_str::<RawAtlasDocument>(json) else {
        return;
    };
    let defaults = TexturePackerAtlasParseOptions::default();
    let options = options.unwrap_or(&defaults);
    atlas.regions.clear();
    apply_raw_meta(atlas, doc.meta.as_ref());
    match doc.frames {
        RawFrames::Array(frames) => {
            for entry in frames.values {
                let name = entry.filename.clone().unwrap_or_default();
                apply_raw_frame(atlas, &name, &entry, options);
            }
        }
        RawFrames::Hash(frames) => {
            for entry in frames.values {
                apply_raw_frame(atlas, &entry.name, &entry.value, options);
            }
        }
    }
}

fn apply_declared_frame(
    atlas: &mut TextureAtlas,
    name: &str,
    frame: &TexturePackerAtlasRect,
    pivot: Option<&TexturePackerAtlasPivot>,
    rotated: bool,
    source_size: &TexturePackerAtlasSize,
    sprite_source_size: &TexturePackerAtlasRect,
    trimmed: bool,
    options: &TexturePackerAtlasParseOptions,
) {
    let name = normalize_frame_name(name, options.strip_path_prefix.unwrap_or(false));
    let region = create_texture_atlas_region(Some(&TextureAtlasRegionOptions {
        height: Some(frame.h),
        id: Some(atlas.regions.len() as i32),
        name: Some(name),
        original_height: if trimmed { Some(source_size.h) } else { None },
        original_width: if trimmed { Some(source_size.w) } else { None },
        pivot_x: pivot.map(|pivot| pivot.x),
        pivot_y: pivot.map(|pivot| pivot.y),
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

fn apply_declared_meta(atlas: &mut TextureAtlas, meta: &TexturePackerAtlasMeta) {
    reset_texture_atlas_page_meta(atlas);
    atlas.image_name = Some(meta.image.clone());
    atlas.image_width = meta.size.w;
    atlas.image_height = meta.size.h;
    atlas.scale = crate::texture_atlas_page_meta::read_texture_atlas_scale(Some(&meta.scale));
}

fn apply_raw_frame(
    atlas: &mut TextureAtlas,
    name: &str,
    entry: &RawFrame,
    options: &TexturePackerAtlasParseOptions,
) {
    let Some(frame) = &entry.frame else {
        return;
    };
    let name = normalize_frame_name(name, options.strip_path_prefix.unwrap_or(false));
    let trimmed = entry.trimmed == Some(true);
    let region = create_texture_atlas_region(Some(&TextureAtlasRegionOptions {
        height: Some(frame.h),
        id: Some(atlas.regions.len() as i32),
        name: Some(name),
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
        pivot_x: entry.pivot.as_ref().map(|pivot| pivot.x),
        pivot_y: entry.pivot.as_ref().map(|pivot| pivot.y),
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

fn apply_raw_meta(atlas: &mut TextureAtlas, meta: Option<&RawMeta>) {
    reset_texture_atlas_page_meta(atlas);
    let Some(meta) = meta else {
        return;
    };
    atlas.image_name = meta.image.clone();
    atlas.image_width = meta.size.as_ref().map_or(0.0, |size| size.w);
    atlas.image_height = meta.size.as_ref().map_or(0.0, |size| size.h);
    atlas.scale = read_raw_texture_atlas_scale(meta.scale.as_ref());
}

fn normalize_frame_name(name: &str, strip: bool) -> String {
    if !strip {
        return name.to_string();
    }
    let slash = name.rfind('/');
    let backslash = name.rfind('\\');
    let index = match (slash, backslash) {
        (Some(a), Some(b)) => Some(a.max(b)),
        (Some(index), None) | (None, Some(index)) => Some(index),
        (None, None) => None,
    };
    return match index {
        Some(index) => name[index + 1..].to_string(),
        None => name.to_string(),
    };
}
