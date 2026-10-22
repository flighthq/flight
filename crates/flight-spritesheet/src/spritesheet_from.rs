use std::collections::HashMap;

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
            let frame = create_spritesheet_frame();
            {
                let mut frame = frame.write().unwrap();
                frame.id = region_id;
                frame.offset_x = fd.offset_x;
                frame.offset_y = fd.offset_y;
                frame.pivot_x = fd.pivot_x;
                frame.pivot_y = fd.pivot_y;
                frame.rotated = fd.rotated;
            }
            return frame;
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
        let animation = create_spritesheet_animation();
        {
            let mut animation = animation.write().unwrap();
            animation.direction = ad.direction;
            animation.frame_duration = ad.frame_duration;
            animation.frame_durations = ad.frame_durations.clone();
            animation.frames = resolved;
            animation.origin_x = ad.origin_x;
            animation.origin_y = ad.origin_y;
            animation.repeat_count = ad.repeat_count;
        }
        set_record_value(&mut animations, ad.name.clone(), animation);
    }
    let mut spritesheet = create_spritesheet();
    spritesheet.animations = animations;
    spritesheet.atlas = Some(atlas.clone());
    spritesheet.frames = frames;
    return spritesheet;
}

/// A sheet over a regular grid sliced from the image: the grid atlas's row-major regions, one frame
/// per region.
pub fn create_spritesheet_from_grid(options: &GridSliceOptions) -> Spritesheet {
    let atlas = create_texture_atlas_from_grid(options, None);
    let frames = atlas
        .read()
        .unwrap()
        .regions
        .iter()
        .map(|region| {
            let frame = create_spritesheet_frame();
            frame.write().unwrap().id = region.read().unwrap().id;
            return frame;
        })
        .collect();
    let mut spritesheet = create_spritesheet();
    spritesheet.atlas = Some(atlas);
    spritesheet.frames = frames;
    return spritesheet;
}
