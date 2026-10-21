use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use flight_entity::{Record, Ref, set_record_value};
use flight_textureatlas::{GridSliceOptions, TextureAtlas, create_texture_atlas_from_grid};

use crate::spritesheet::create_spritesheet;
use crate::spritesheet_animation::create_spritesheet_animation;
use crate::spritesheet_frame::create_spritesheet_frame;
use crate::types::*;

/// Hydrates a runtime sheet over `atlas` (shared): each frame resolves its name to an atlas region id
/// (the last region of that name), falling back to its position; each animation resolves its frame
/// names to frame indices (unknown names dropped, an empty list meaning every frame) and is keyed by
/// its name.
// flight-lint: allow(f64) D1: animation frame references are JS numbers
pub fn create_spritesheet_from_data(
    data: &SpritesheetData,
    atlas: &Ref<TextureAtlas>,
) -> Spritesheet {
    let mut name_to_region_id: HashMap<String, i32> = HashMap::new();
    for region in &atlas.read().unwrap().regions {
        let region = region.read().unwrap();
        if let Some(name) = &region.name {
            name_to_region_id.insert(name.clone(), region.id);
        }
    }
    let frames = data
        .frames
        .iter()
        .enumerate()
        .map(|(index, fd)| {
            let region_id = if fd.name.is_empty() {
                index as i32
            } else {
                name_to_region_id
                    .get(&fd.name)
                    .copied()
                    .unwrap_or(index as i32)
            };
            create_spritesheet_frame(Some(&SpritesheetFrameOptions {
                id: Some(region_id),
                offset_x: Some(fd.offset_x),
                offset_y: Some(fd.offset_y),
                pivot_x: fd.pivot_x,
                pivot_y: fd.pivot_y,
                rotated: Some(fd.rotated),
            }))
        })
        .collect();
    let mut data_frame_index: HashMap<&str, usize> = HashMap::new();
    for (i, fd) in data.frames.iter().enumerate() {
        if !fd.name.is_empty() {
            data_frame_index.insert(fd.name.as_str(), i);
        }
    }
    let mut animations = Record::default();
    for ad in &data.animations {
        let resolved: Vec<f64> = if ad.frame_names.is_empty() {
            (0..data.frames.len()).map(|i| i as f64).collect()
        } else {
            ad.frame_names
                .iter()
                .filter_map(|name| data_frame_index.get(name.as_str()))
                .map(|i| *i as f64)
                .collect()
        };
        let animation = create_spritesheet_animation(Some(&SpritesheetAnimationOptions {
            direction: Some(ad.direction),
            frame_duration: Some(ad.frame_duration),
            frame_durations: ad.frame_durations.clone(),
            frames: Some(resolved),
            origin_x: Some(ad.origin_x),
            origin_y: Some(ad.origin_y),
            repeat_count: Some(ad.repeat_count),
        }));
        set_record_value(&mut animations, ad.name.clone(), animation);
    }
    return create_spritesheet(Some(SpritesheetOptions {
        animations: Some(animations),
        atlas: Some(atlas.clone()),
        frames: Some(frames),
    }));
}

/// A sheet over a regular grid sliced from the image: the grid atlas's row-major regions, one frame
/// per region.
pub fn create_spritesheet_from_grid(options: &GridSliceOptions) -> Spritesheet {
    let atlas = create_texture_atlas_from_grid(options, None);
    let frames = atlas
        .regions
        .iter()
        .map(|region| {
            create_spritesheet_frame(Some(&SpritesheetFrameOptions {
                id: Some(region.read().unwrap().id),
                ..SpritesheetFrameOptions::default()
            }))
        })
        .collect();
    return create_spritesheet(Some(SpritesheetOptions {
        atlas: Some(Arc::new(RwLock::new(atlas))),
        frames: Some(frames),
        ..SpritesheetOptions::default()
    }));
}
