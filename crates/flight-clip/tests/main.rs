use flight_clip::contract::*;
use flight_entity::Ref;
use flight_geometry::{Rectangle, create_rectangle};

mod clip_region_strings_test;
mod clip_region_test;
mod enable_clip_guards_test;

pub(crate) fn rectangle_clip(x: f32, y: f32, width: f32, height: f32) -> Ref<ClipRegion> {
    return create_clip_region_from_rectangle(&create_rectangle(x, y, width, height));
}

pub(crate) fn region_snapshot(
    clip: &Ref<ClipRegion>,
) -> (
    Rectangle,
    Option<Vec<Vec<f64>>>,
    flight_path::PathWinding,
    u32,
) {
    let clip = clip.read().unwrap();
    return (
        clip.rect.clone(),
        clip.contours.clone(),
        clip.winding,
        clip.version,
    );
}
