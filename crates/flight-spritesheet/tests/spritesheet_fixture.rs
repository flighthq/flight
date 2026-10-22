use flight_entity::Ref;
use flight_spritesheet::contract::*;
use flight_textureatlas::{
    TextureAtlas, TextureAtlasRegionOptions, create_texture_atlas, create_texture_atlas_region,
    set_texture_atlas_region,
};

/// A shared empty atlas (the source's `createTextureAtlas()`).
pub fn atlas() -> Ref<TextureAtlas> {
    return create_texture_atlas();
}

/// Appends a 32x32 region with this id and name.
pub fn push_region(atlas: &Ref<TextureAtlas>, id: i32, name: Option<&str>, x: f32) {
    let make: fn() -> TextureAtlasRegionOptions = TextureAtlasRegionOptions::default;
    let mut options = make();
    options.id = Some(id);
    options.name = name.map(str::to_string);
    options.x = Some(x);
    options.y = Some(0.0);
    options.width = Some(32.0);
    options.height = Some(32.0);
    let region = create_texture_atlas_region();
    set_texture_atlas_region(&mut region.write().unwrap(), &options);
    atlas.write().unwrap().regions.push(region);
}

pub fn frame(id: i32) -> Ref<SpritesheetFrame> {
    let frame = create_spritesheet_frame();
    frame.write().unwrap().id = id;
    return frame;
}

/// The source's `makeAnimation(frames, frameDuration, repeatCount = -1)`.
pub fn animation(
    frames: &[f64],
    frame_duration: f64,
    repeat_count: i32,
) -> Ref<SpritesheetAnimation> {
    let animation = create_spritesheet_animation();
    {
        let mut animation = animation.write().unwrap();
        animation.frames = frames.to_vec();
        animation.frame_duration = frame_duration;
        animation.repeat_count = repeat_count;
    }
    return animation;
}

/// The source's `makeSheet(frameCount)`: frames with ids 0..count and no atlas.
pub fn sheet(frame_count: i32) -> Spritesheet {
    let mut sheet = create_spritesheet();
    for i in 0..frame_count {
        sheet.frames.push(frame(i));
    }
    return sheet;
}

pub fn frame_name_options() -> SpritesheetAnimationFrameNameOptions {
    let make: fn() -> SpritesheetAnimationFrameNameOptions =
        SpritesheetAnimationFrameNameOptions::default;
    return make();
}

pub fn named_frame_data(name: &str) -> SpritesheetFrameData {
    let mut frame = create_spritesheet_frame_data();
    frame.name = name.to_string();
    return frame;
}

pub fn named_animation_data(name: &str, frame_names: &[&str]) -> SpritesheetAnimationData {
    let mut animation = create_spritesheet_animation_data();
    animation.name = name.to_string();
    animation.frame_names = frame_names.iter().map(|n| n.to_string()).collect();
    return animation;
}
