//! The spritesheet side of the timeline frame-source contract (TS
//! `spritesheetTimelineSource.ts`): a spritesheet animation exposed as a `TimelineSource` that
//! lazily realizes one reused sprite child per target.

use std::sync::{Arc, Mutex, RwLock, Weak};

use flight_entity::Ref;
use flight_geometry::create_rectangle;
use flight_node::{NodeRef, add_node_child, invalidate_node_local_transform};
use flight_scene2d::{Node2DRef, create_sprite};
use flight_spritesheet::{Spritesheet, SpritesheetAnimation, SpritesheetAnimationDirection};
use flight_texture::{Texture, Texture2D};
use flight_textureatlas::{
    TextureAtlas, get_texture_atlas_region_by_id, get_texture_atlas_region_frame,
    get_texture_atlas_region_texture,
};
use flight_timeline::contract::{
    FrameConstruct, TimelineSource, TimelineSourceOptions, TimelineSourceRef,
    initialize_timeline_source,
};

use crate::enable_movie_clip_guards::MovieClipGuardState;
use crate::types::*;

/// Creates a shareable timeline source over `animation`, expanding its direction into an ordinary
/// forward frame list (TS `createSpritesheetTimelineSource`).
// flight-lint: allow(conform-params) D5: caller-owned guard state replaces the source module guard slot
pub fn create_spritesheet_timeline_source(
    guards: &MovieClipGuardState,
    spritesheet: &Ref<Spritesheet>,
    animation: &Ref<SpritesheetAnimation>,
) -> TimelineSourceRef {
    let mut out: TimelineSource = flight_entity::allocate_entity();
    initialize_spritesheet_timeline_source(&mut out, guards, spritesheet, animation);
    return Arc::new(RwLock::new(out));
}

/// The construction initializer of `create_spritesheet_timeline_source` (TS
/// `initializeSpritesheetTimelineSource`): every source is independently shareable across clips and
/// keeps a weak per-target sprite cache in its own frame-realization closure.
// flight-lint: allow(conform-params) D5: caller-owned guard state replaces the source module guard slot
pub fn initialize_spritesheet_timeline_source(
    out: &mut TimelineSource,
    guards: &MovieClipGuardState,
    spritesheet: &Ref<Spritesheet>,
    animation: &Ref<SpritesheetAnimation>,
) {
    let frames = materialize_spritesheet_timeline_frames(animation);
    let explanation = explain_spritesheet_timeline_source(animation);
    let guard = guards.spritesheet_timeline_source_guard.clone();
    if let Some(guard) = guard {
        guard(animation, &explanation);
    }
    let frames = Arc::new(frames);
    let frame_rate = {
        let frame_duration = animation.read().unwrap().frame_duration;
        if frame_duration == 0.0 {
            None
        } else {
            Some(1000.0 / frame_duration)
        }
    };
    let cache: Arc<SpriteCache> = Arc::new(Mutex::new(Vec::new()));
    let construct: FrameConstruct = {
        let spritesheet = spritesheet.clone();
        let animation = animation.clone();
        let frames = frames.clone();
        Arc::new(move |target: &Node2DRef, frame: i32| {
            construct_spritesheet_frame(&spritesheet, &animation, &frames, &cache, target, frame);
        })
    };
    initialize_timeline_source(
        out,
        Some(&TimelineSourceOptions {
            total_frames: Some(frames.len() as i32),
            frame_rate,
            labels: None,
            cues: None,
            construct_frame: Some(construct),
        }),
    );
}

fn bitmap_node_ref(bitmap: &Ref<flight_scene2d::Sprite>) -> NodeRef {
    return bitmap.clone() as NodeRef;
}

// flight-lint: allow(f64) D1: animation origins and frame references are JS numbers
fn construct_spritesheet_frame(
    spritesheet: &Ref<Spritesheet>,
    animation: &Ref<SpritesheetAnimation>,
    frames: &Arc<Vec<f64>>,
    cache: &Arc<SpriteCache>,
    target: &Node2DRef,
    frame: i32,
) {
    let atlas: Option<Ref<TextureAtlas>> = spritesheet.read().unwrap().atlas.clone();
    let Some(atlas) = atlas else {
        return;
    };
    let bitmap = get_or_create_bitmap(cache, target);
    let (offset_x, offset_y) = {
        let animation = animation.read().unwrap();
        (animation.origin_x, animation.origin_y)
    };
    let frame_index = (frame - 1) as usize;
    let Some(sheet_frame_index) = frames.get(frame_index) else {
        return;
    };
    let sheet_frame = {
        let sheet = spritesheet.read().unwrap();
        sheet.frames.get(*sheet_frame_index as usize).cloned()
    };
    let Some(sheet_frame) = sheet_frame else {
        return;
    };
    let (id, offset_x_frame, offset_y_frame, pivot_x, pivot_y) = {
        let sheet_frame = sheet_frame.read().unwrap();
        (
            sheet_frame.id,
            sheet_frame.offset_x,
            sheet_frame.offset_y,
            sheet_frame.pivot_x,
            sheet_frame.pivot_y,
        )
    };
    let region = {
        let atlas = atlas.read().unwrap();
        get_texture_atlas_region_by_id(&atlas, id)
    };
    let Some(region) = region else {
        return;
    };
    let texture = get_texture_atlas_region_texture(&atlas, id, None);
    let Some(texture) = texture else {
        return;
    };
    let mut region_frame = create_rectangle(0.0, 0.0, 0.0, 0.0);
    get_texture_atlas_region_frame(&mut region_frame, &region.read().unwrap());
    let texture_union: Ref<Texture> = {
        let texture: &Texture2D = &texture.read().unwrap();
        Arc::new(RwLock::new(Texture::Texture2D(texture.clone())))
    };
    let node_ref = bitmap_node_ref(&bitmap);
    {
        let mut bitmap = bitmap.write().unwrap();
        bitmap.data.texture = Some(texture_union);
        bitmap.x = offset_x_frame - offset_x;
        bitmap.y = offset_y_frame - offset_y;
        bitmap.pivot_x = pivot_x
            .map(|pivot| pivot * region_frame.width)
            .unwrap_or(0.0);
        bitmap.pivot_y = pivot_y
            .map(|pivot| pivot * region_frame.height)
            .unwrap_or(0.0);
    }
    invalidate_node_local_transform(&node_ref);
}

/// Reports the authored playback fields the timeline source vocabulary cannot carry; direction is
/// materialized rather than lost (TS `explainSpritesheetTimelineSource`).
pub fn explain_spritesheet_timeline_source(
    animation: &Ref<SpritesheetAnimation>,
) -> SpritesheetTimelineSourceExplanation {
    let frame_durations = animation.read().unwrap().frame_durations.is_some();
    return SpritesheetTimelineSourceExplanation {
        direction_materialized: true,
        unsupported_fields: if frame_durations {
            vec![
                SpritesheetTimelineSourceUnsupportedField::FrameDurations,
                SpritesheetTimelineSourceUnsupportedField::RepeatCount,
            ]
        } else {
            vec![SpritesheetTimelineSourceUnsupportedField::RepeatCount]
        },
    };
}

// The source's per-source WeakMap<Node2D, Sprite>: one reused child per target, not retained once
// the target is collected. The cache is the frame-realization closure's own cell, never a module
// global.
fn get_or_create_bitmap(
    cache: &Arc<SpriteCache>,
    target: &Node2DRef,
) -> Ref<flight_scene2d::Sprite> {
    let mut cache = cache.lock().unwrap();
    cache.retain(|(key, _)| key.strong_count() > 0);
    for (key, bitmap) in cache.iter() {
        if let Some(alive) = key.upgrade() {
            if Arc::ptr_eq(&alive, target) {
                return bitmap.clone();
            }
        }
    }
    let bitmap = create_sprite();
    let node_ref = bitmap_node_ref(&bitmap);
    let target_node_ref = target_node_ref(target);
    add_node_child(&target_node_ref, &node_ref);
    cache.push((Arc::downgrade(target), bitmap.clone()));
    return bitmap;
}

/// Converts the authored direction into a forward frame sequence without duplicating endpoints (TS
/// `materializeSpritesheetTimelineFrames`).
// flight-lint: allow(f64) D1: animation frame references are JS numbers indexed into the sheet's frames
fn materialize_spritesheet_timeline_frames(animation: &Ref<SpritesheetAnimation>) -> Vec<f64> {
    let guard = animation.read().unwrap();
    let frames = &guard.frames;
    if frames.len() < 2 || guard.direction == SpritesheetAnimationDirection::Forward {
        return frames.clone();
    }
    if guard.direction == SpritesheetAnimationDirection::Reverse {
        return frames.iter().rev().cloned().collect();
    }
    let mut out: Vec<f64> = Vec::new();
    if guard.direction == SpritesheetAnimationDirection::Pingpong {
        for index in 0..frames.len() {
            out.push(frames[index]);
        }
        let mut index = frames.len() as isize - 2;
        while index > 0 {
            out.push(frames[index as usize]);
            index -= 1;
        }
        return out;
    }
    for index in (0..frames.len()).rev() {
        out.push(frames[index]);
    }
    let mut index = 1usize;
    while index < frames.len() - 1 {
        out.push(frames[index]);
        index += 1;
    }
    return out;
}

type SpriteCache = Mutex<
    Vec<(
        Weak<RwLock<dyn flight_scene2d::Node2D>>,
        Ref<flight_scene2d::Sprite>,
    )>,
>;

/// Installs or clears the spritesheet adapter diagnostic seam; `None` restores the silent path (TS
/// `setSpritesheetTimelineSourceGuard`).
// flight-lint: allow(conform-params) D5: caller-owned guard state replaces the source module guard slot
pub fn set_spritesheet_timeline_source_guard(
    guards: &mut MovieClipGuardState,
    guard: Option<SpritesheetTimelineSourceGuard>,
) {
    guards.spritesheet_timeline_source_guard = guard;
}

fn target_node_ref(target: &Node2DRef) -> NodeRef {
    return target.clone() as NodeRef;
}
