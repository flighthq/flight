//! Host-neutral Rust implementation of the `nyancat` example.

use example_common::{ExamplePrimitive, ExampleScene};
use flighthq_displayobject::DisplayObjectArena;
use flighthq_image::load_image_resource_from_url;
use flighthq_spritesheet::spritesheet::{CreateSpritesheetOptions, create_spritesheet};
use flighthq_spritesheet::spritesheet_animation::{
    CreateSpritesheetAnimationOptions, create_spritesheet_animation,
};
use flighthq_spritesheet::spritesheet_frame::{
    CreateSpritesheetFrameOptions, create_spritesheet_frame,
};
use flighthq_spritesheet::spritesheet_timeline_source::create_spritesheet_timeline_source;
use flighthq_textureatlas::{add_texture_atlas_region, create_texture_atlas};
use flighthq_timeline::{
    MovieClipData, create_movie_clip, create_movie_clip_data, play_movie_clip,
    set_movie_clip_source, update_movie_clip,
};

pub const ID: &str = "nyancat";
pub const TITLE: &str = "Nyan cat";
pub const WIDTH: u32 = 220;
pub const HEIGHT: u32 = 220;
pub const BACKGROUND: u32 = 0x00_00_00_ff;
pub const FILL: u32 = 0xff_99_cc_ff;

const FRAME_W: f32 = 34.0;
const FRAME_H: f32 = 21.0;
const MARGIN: f32 = 2.0;
const GAP: f32 = 4.0;
const FRAME_COUNT: u32 = 6;

pub struct NyanCatApiScene {
    pub arena: DisplayObjectArena,
    pub clip: flighthq_node::NodeId,
    pub data: MovieClipData,
}

pub fn create_scene() -> ExampleScene {
    let _api_scene = create_api_scene().expect("nyancat API scene");
    ExampleScene::new(ID, TITLE)
        .with_size(WIDTH, HEIGHT)
        .with_background(BACKGROUND)
        .with_fill(FILL)
        .with_primitives(nyancat_primitives())
}

pub fn create_api_scene() -> Result<NyanCatApiScene, Box<dyn std::error::Error + Send + Sync>> {
    let source = load_image_resource_from_url(&asset_path("assets/nyancat.png"))?;
    let mut atlas = create_texture_atlas(Some(source), Vec::new());
    let mut frames = Vec::new();
    let mut frame_ids = Vec::new();
    for frame in 0..FRAME_COUNT {
        let id = atlas.regions.len() as u32;
        add_texture_atlas_region(
            &mut atlas,
            MARGIN + frame as f32 * (FRAME_W + GAP),
            MARGIN,
            FRAME_W,
            FRAME_H,
            None,
            None,
            None,
        );
        frames.push(create_spritesheet_frame(CreateSpritesheetFrameOptions {
            id: Some(id),
            ..Default::default()
        }));
        frame_ids.push(frame);
    }
    let animation = create_spritesheet_animation(CreateSpritesheetAnimationOptions {
        frames: Some(frame_ids),
        frame_duration: Some(100.0),
        loop_: Some(true),
        ..Default::default()
    });
    let spritesheet = create_spritesheet(CreateSpritesheetOptions {
        atlas: Some(atlas),
        frames: Some(frames),
        ..Default::default()
    });
    let mut arena = DisplayObjectArena::default();
    let clip = create_movie_clip(&mut arena);
    let mut data = create_movie_clip_data(None);
    let source = create_spritesheet_timeline_source(spritesheet, animation, Box::new(|_, _| {}));
    set_movie_clip_source(&mut data, source, 1);
    play_movie_clip(&mut data);
    update_movie_clip(&mut data, 1.0 / 60.0);
    Ok(NyanCatApiScene { arena, clip, data })
}

fn asset_path(path: &str) -> String {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../packages/nyancat/public")
        .join(path)
        .to_string_lossy()
        .into_owned()
}

fn nyancat_primitives() -> Vec<ExamplePrimitive> {
    let mut primitives = Vec::new();

    // Rainbow trail on the left: six horizontal stripes with gaps so the bands
    // still read as stripes under a single fill colour.
    for index in 0..6 {
        primitives.push(ExamplePrimitive::Rectangle {
            x: 6.0,
            y: 78.0 + index as f32 * 12.0,
            width: 88.0,
            height: 8.0,
        });
    }

    // Pop-tart body.
    primitives.push(ExamplePrimitive::RoundRectangle {
        x: 96.0,
        y: 82.0,
        width: 72.0,
        height: 62.0,
        radius: 8.0,
    });

    // Tail trailing off the back (left) of the body.
    primitives.push(ExamplePrimitive::Rectangle {
        x: 84.0,
        y: 106.0,
        width: 16.0,
        height: 8.0,
    });

    // Four legs beneath the body.
    for index in 0..4 {
        primitives.push(ExamplePrimitive::Rectangle {
            x: 104.0 + index as f32 * 16.0,
            y: 144.0,
            width: 9.0,
            height: 12.0,
        });
    }

    // Cat head at the front (right) of the body.
    primitives.push(ExamplePrimitive::Circle {
        x: 176.0,
        y: 108.0,
        radius: 26.0,
    });

    // Two triangular ears atop the head.
    primitives.push(ExamplePrimitive::Polygon {
        points: vec![(160.0, 88.0), (172.0, 88.0), (160.0, 74.0)],
    });
    primitives.push(ExamplePrimitive::Polygon {
        points: vec![(180.0, 88.0), (192.0, 88.0), (192.0, 74.0)],
    });

    primitives
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_scene() {
        assert_eq!(create_scene().id, "nyancat");
    }

    #[test]
    fn creates_matching_api_scene() {
        let scene = create_api_scene().expect("image loads");
        assert_eq!(
            flighthq_timeline::get_movie_clip_total_frames(&scene.data),
            FRAME_COUNT
        );
    }
}
