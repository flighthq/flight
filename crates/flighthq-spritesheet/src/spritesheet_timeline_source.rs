//! `create_spritesheet_timeline_source` — exposes a spritesheet animation as a
//! `TimelineSource` so a MovieClip timeline can play it.
//!
//! This is the spritesheet side of the timeline frame-source contract:
//! `flighthq-timeline` consumes a `TimelineSource`, this produces one, and
//! neither crate depends on the other beyond the shared `TimelineSource` type
//! in `flighthq-types`.
//!
//! In the TS SDK each frame swaps the displayed atlas region and offset on a
//! `Bitmap` child the source lazily creates on the target display object. The
//! Rust `TimelineSource.construct_frame` callback receives only the opaque
//! target node id (`u64`) and the 1-based frame number — it has no access to a
//! display-object arena — so this port resolves the per-frame placement (the
//! atlas region plus the offset, with the animation origin subtracted) and
//! forwards it to a caller-supplied `apply` callback. The caller wires that
//! placement onto a bitmap in their own display graph, which keeps the
//! spritesheet crate decoupled from `flighthq-displayobject`.

use flighthq_types::{Spritesheet, SpritesheetAnimation, TextureAtlasRegion, TimelineSource};

/// The resolved display state for a single spritesheet timeline frame: which
/// atlas region to show and where to position it. Mirrors the per-frame
/// `bitmap.data.sourceRectangle` / `bitmap.x` / `bitmap.y` writes the TS
/// `constructFrame` performs.
#[derive(Clone, Debug)]
pub struct SpritesheetFramePlacement {
    pub region: TextureAtlasRegion,
    pub x: f32,
    pub y: f32,
}

/// Builds a [`TimelineSource`] that plays `animation` from `spritesheet`.
///
/// `total_frames` is the animation's frame count and `frame_rate` is
/// `1000 / frame_duration`, matching the TS source exactly. On each frame the
/// source resolves the spritesheet frame (`spritesheet.frames[animation.frames
/// [frame - 1]]`), looks up its atlas region, subtracts the animation origin
/// from the frame offset, and calls `apply(target_id, placement)`.
///
/// `apply` is a no-op when the spritesheet has no atlas, when the animation
/// frame index is out of range, or when the resolved frame has no matching
/// atlas region — mirroring the early returns in the TS `constructFrame`.
pub fn create_spritesheet_timeline_source(
    spritesheet: Spritesheet,
    animation: SpritesheetAnimation,
    apply: Box<dyn Fn(u64, SpritesheetFramePlacement) + Send + Sync>,
) -> TimelineSource {
    let total_frames = animation.frames.len() as u32;
    let frame_rate = Some(1000.0 / animation.frame_duration);
    TimelineSource {
        total_frames,
        frame_rate,
        labels: Vec::new(),
        construct_frame: Box::new(move |target_id, frame| {
            let Some(atlas) = spritesheet.atlas.as_ref() else {
                return;
            };
            let Some(frame_id) = animation.frames.get((frame - 1) as usize).copied() else {
                return;
            };
            let Some(sheet_frame) = spritesheet.frames.get(frame_id as usize) else {
                return;
            };
            let Some(region) = atlas.regions.iter().find(|r| r.id == sheet_frame.id) else {
                return;
            };
            apply(
                target_id,
                SpritesheetFramePlacement {
                    region: region.clone(),
                    x: sheet_frame.offset_x - animation.origin_x,
                    y: sheet_frame.offset_y - animation.origin_y,
                },
            );
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::spritesheet::{CreateSpritesheetOptions, create_spritesheet};
    use crate::spritesheet_animation::{
        CreateSpritesheetAnimationOptions, create_spritesheet_animation,
    };
    use crate::spritesheet_frame::{CreateSpritesheetFrameOptions, create_spritesheet_frame};
    use flighthq_textureatlas::{add_texture_atlas_region, create_texture_atlas};
    use std::sync::{Arc, Mutex};

    fn make_sheet(frame_count: u32) -> Spritesheet {
        let mut atlas = create_texture_atlas(None, Vec::new());
        let mut frames = Vec::new();
        for i in 0..frame_count {
            add_texture_atlas_region(&mut atlas, (i * 32) as f32, 0.0, 32.0, 32.0, None, None);
            frames.push(create_spritesheet_frame(CreateSpritesheetFrameOptions {
                id: Some(i),
                ..Default::default()
            }));
        }
        create_spritesheet(CreateSpritesheetOptions {
            atlas: Some(atlas),
            frames: Some(frames),
            ..Default::default()
        })
    }

    #[test]
    fn create_spritesheet_timeline_source_reports_total_frames_and_frame_rate() {
        let sheet = make_sheet(3);
        let anim = create_spritesheet_animation(CreateSpritesheetAnimationOptions {
            frame_duration: Some(200.0),
            frames: Some(vec![0, 1, 2]),
            ..Default::default()
        });
        let source = create_spritesheet_timeline_source(sheet, anim, Box::new(|_, _| {}));
        assert_eq!(source.total_frames, 3);
        assert!((source.frame_rate.unwrap() - 1000.0 / 200.0).abs() < 1e-4);
    }

    #[test]
    fn create_spritesheet_timeline_source_resolves_the_frame_region_and_offset() {
        let sheet = make_sheet(2);
        let anim = create_spritesheet_animation(CreateSpritesheetAnimationOptions {
            frame_duration: Some(100.0),
            frames: Some(vec![0, 1]),
            ..Default::default()
        });
        let placements = Arc::new(Mutex::new(Vec::<(u64, SpritesheetFramePlacement)>::new()));
        let sink = placements.clone();
        let source = create_spritesheet_timeline_source(
            sheet,
            anim,
            Box::new(move |id, placement| sink.lock().unwrap().push((id, placement))),
        );
        (source.construct_frame)(7, 1);
        (source.construct_frame)(7, 2);
        let got = placements.lock().unwrap();
        assert_eq!(got.len(), 2);
        assert_eq!(got[0].0, 7);
        assert_eq!(got[0].1.region.x, 0.0);
        assert_eq!(got[1].1.region.x, 32.0);
    }

    #[test]
    fn create_spritesheet_timeline_source_subtracts_the_animation_origin() {
        let mut sheet = make_sheet(1);
        sheet.frames[0].offset_x = 10.0;
        sheet.frames[0].offset_y = 20.0;
        let anim = create_spritesheet_animation(CreateSpritesheetAnimationOptions {
            frame_duration: Some(100.0),
            frames: Some(vec![0]),
            origin_x: Some(4.0),
            origin_y: Some(6.0),
            ..Default::default()
        });
        let placements = Arc::new(Mutex::new(Vec::<SpritesheetFramePlacement>::new()));
        let sink = placements.clone();
        let source = create_spritesheet_timeline_source(
            sheet,
            anim,
            Box::new(move |_, placement| sink.lock().unwrap().push(placement)),
        );
        (source.construct_frame)(0, 1);
        let got = placements.lock().unwrap();
        assert_eq!(got[0].x, 6.0);
        assert_eq!(got[0].y, 14.0);
    }

    #[test]
    fn create_spritesheet_timeline_source_does_not_apply_when_the_spritesheet_has_no_atlas() {
        let sheet = create_spritesheet(CreateSpritesheetOptions::default());
        let anim = create_spritesheet_animation(CreateSpritesheetAnimationOptions {
            frame_duration: Some(100.0),
            frames: Some(vec![0]),
            ..Default::default()
        });
        let called = Arc::new(Mutex::new(false));
        let sink = called.clone();
        let source = create_spritesheet_timeline_source(
            sheet,
            anim,
            Box::new(move |_, _| *sink.lock().unwrap() = true),
        );
        (source.construct_frame)(0, 1);
        assert!(!*called.lock().unwrap());
    }
}
