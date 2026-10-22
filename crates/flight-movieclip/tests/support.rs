use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_spritesheet::{
    Spritesheet, SpritesheetAnimation, SpritesheetFrame, create_spritesheet,
    create_spritesheet_animation, create_spritesheet_frame,
};
use flight_texture::create_texture_2d;
use flight_textureatlas::{TextureAtlas, add_texture_atlas_region, create_texture_atlas};

pub fn atlas_with_regions(count: i32) -> Ref<TextureAtlas> {
    let texture = Arc::new(RwLock::new(create_texture_2d()));
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
            let frame = create_spritesheet_frame();
            frame.write().unwrap().id = index;
            return frame;
        })
        .collect();
    let mut sheet = create_spritesheet();
    sheet.atlas = Some(atlas);
    sheet.frames = frames;
    return Arc::new(RwLock::new(sheet));
}

// flight-lint: allow(f64) D1: animation frame references and millisecond frame durations are JS numbers
pub fn animation(
    frames: Vec<f64>,
    direction: Option<flight_spritesheet::SpritesheetAnimationDirection>,
) -> Ref<SpritesheetAnimation> {
    let animation = create_spritesheet_animation();
    {
        let mut animation = animation.write().unwrap();
        if let Some(direction) = direction {
            animation.direction = direction;
        }
        animation.frame_duration = 100.0;
        animation.frames = frames;
    }
    return animation;
}
