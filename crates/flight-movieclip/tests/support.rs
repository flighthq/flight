use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_spritesheet::{
    Spritesheet, SpritesheetAnimation, SpritesheetAnimationOptions, SpritesheetFrame,
    SpritesheetFrameOptions, SpritesheetOptions, create_spritesheet, create_spritesheet_animation,
    create_spritesheet_frame,
};
use flight_texture::create_texture_2d;
use flight_textureatlas::{TextureAtlas, add_texture_atlas_region, create_texture_atlas};

pub fn atlas_with_regions(count: i32) -> Ref<TextureAtlas> {
    let texture = Arc::new(RwLock::new(create_texture_2d(None)));
    let atlas = create_texture_atlas();
    atlas.write().unwrap().texture = Some(texture);
    {
        let mut atlas = atlas.write().unwrap();
        for index in 0..count {
            add_texture_atlas_region(
                &mut atlas,
                index as f32 * 32.0,
                0.0,
                32.0,
                32.0,
                None,
                None,
                None,
            );
        }
    }
    return atlas;
}

pub fn sheet_with_frames(count: i32) -> Ref<Spritesheet> {
    let atlas = atlas_with_regions(count);
    let frames: Vec<Ref<SpritesheetFrame>> = (0..count)
        .map(|index| {
            create_spritesheet_frame(Some(&SpritesheetFrameOptions {
                id: Some(index),
                offset_x: None,
                offset_y: None,
                pivot_x: None,
                pivot_y: None,
                rotated: None,
            }))
        })
        .collect();
    let sheet = create_spritesheet(Some(SpritesheetOptions {
        atlas: Some(atlas),
        animations: None,
        frames: Some(frames),
    }));
    return Arc::new(RwLock::new(sheet));
}

// flight-lint: allow(f64) D1: animation frame references and millisecond frame durations are JS numbers
pub fn animation(
    frames: Vec<f64>,
    direction: Option<flight_spritesheet::SpritesheetAnimationDirection>,
) -> Ref<SpritesheetAnimation> {
    return create_spritesheet_animation(Some(&SpritesheetAnimationOptions {
        direction,
        frame_duration: Some(100.0),
        frame_durations: None,
        frames: Some(frames),
        origin_x: None,
        origin_y: None,
        repeat_count: None,
    }));
}
