use flight_entity::Ref;
use flight_spritesheet::contract::*;
use flight_textureatlas::{
    TextureAtlas, TextureAtlasRegionOptions, create_texture_atlas, create_texture_atlas_region,
};

/// A shared empty atlas (the source's `createTextureAtlas()`).
pub fn atlas() -> Ref<TextureAtlas> {
    return create_texture_atlas(None);
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
    atlas
        .write()
        .unwrap()
        .regions
        .push(create_texture_atlas_region(Some(&options)));
}

pub fn frame(id: i32) -> Ref<SpritesheetFrame> {
    return create_spritesheet_frame(Some(&SpritesheetFrameOptions {
        id: Some(id),
        ..frame_options()
    }));
}

pub fn frame_options() -> SpritesheetFrameOptions {
    let make: fn() -> SpritesheetFrameOptions = SpritesheetFrameOptions::default;
    return make();
}

pub fn animation_options() -> SpritesheetAnimationOptions {
    let make: fn() -> SpritesheetAnimationOptions = SpritesheetAnimationOptions::default;
    return make();
}

/// The source's `makeAnimation(frames, frameDuration, repeatCount = -1)`.
pub fn animation(
    frames: &[f64],
    frame_duration: f64,
    repeat_count: i32,
) -> Ref<SpritesheetAnimation> {
    return create_spritesheet_animation(Some(&SpritesheetAnimationOptions {
        frames: Some(frames.to_vec()),
        frame_duration: Some(frame_duration),
        repeat_count: Some(repeat_count),
        ..animation_options()
    }));
}

/// The source's `makeSheet(frameCount)`: frames with ids 0..count and no atlas.
pub fn sheet(frame_count: i32) -> Spritesheet {
    let mut sheet = create_spritesheet(None);
    for i in 0..frame_count {
        sheet.frames.push(frame(i));
    }
    return sheet;
}

pub fn sheet_options() -> SpritesheetOptions {
    let make: fn() -> SpritesheetOptions = SpritesheetOptions::default;
    return make();
}

pub fn frame_name_options() -> SpritesheetAnimationFrameNameOptions {
    let make: fn() -> SpritesheetAnimationFrameNameOptions =
        SpritesheetAnimationFrameNameOptions::default;
    return make();
}

pub fn frame_data_options() -> SpritesheetFrameDataOptions {
    let make: fn() -> SpritesheetFrameDataOptions = SpritesheetFrameDataOptions::default;
    return make();
}

pub fn animation_data_options() -> SpritesheetAnimationDataOptions {
    let make: fn() -> SpritesheetAnimationDataOptions = SpritesheetAnimationDataOptions::default;
    return make();
}

pub fn data_options() -> SpritesheetDataOptions {
    let make: fn() -> SpritesheetDataOptions = SpritesheetDataOptions::default;
    return make();
}

pub fn named_frame_data(name: &str) -> SpritesheetFrameData {
    return create_spritesheet_frame_data(Some(SpritesheetFrameDataOptions {
        name: Some(name.to_string()),
        ..frame_data_options()
    }));
}

pub fn named_animation_data(name: &str, frame_names: &[&str]) -> SpritesheetAnimationData {
    return create_spritesheet_animation_data(Some(SpritesheetAnimationDataOptions {
        name: Some(name.to_string()),
        frame_names: Some(frame_names.iter().map(|n| n.to_string()).collect()),
        ..animation_data_options()
    }));
}
