//! Host-neutral Rust implementation of the `playingvideo` example.
//!
//! The TS example loads an `.mp4`, centers the decoded video frame on a black
//! stage, and draws a 50%-black overlay plus a "Click to play" prompt until the
//! pointer starts playback.

use example_common::{ExamplePrimitive, ExampleScene};
use flighthq_application::create_application;
use flighthq_displayobject::{
    DisplayObjectArena, add_display_object_child, create_display_object, create_video,
    set_display_object_x, set_display_object_y, set_video_source,
};
use flighthq_input::create_input_manager;
use flighthq_media::play_video_resource;
use flighthq_shape::{append_shape_begin_fill, append_shape_rectangle, create_shape};
use flighthq_text::{create_text_label, set_text_label_string};
use flighthq_video::load_video_resource_from_url;

pub struct PlayingVideoApiScene {
    pub arena: DisplayObjectArena,
    pub root: flighthq_node::NodeId,
    pub video_node: flighthq_node::NodeId,
    pub overlay: flighthq_node::NodeId,
    pub has_channel: bool,
}

pub fn create_scene() -> ExampleScene {
    let _api_scene = create_api_scene().expect("playingvideo API scene");
    // 16:9 video frame letterboxed into the 800x400 stage: fit = min(800/640, 400/360)
    // centers a 640x360 rect at (80, 20).
    ExampleScene::new("playingvideo", "Playing video")
        .with_size(800, 400)
        .with_background(0x00_00_00_ff)
        .with_fill(0x22_22_22_ff)
        .with_primitives(vec![
            ExamplePrimitive::Rectangle {
                x: 80.0,
                y: 20.0,
                width: 640.0,
                height: 360.0,
            },
            ExamplePrimitive::Text {
                x: 340.0,
                y: 188.0,
                value: "Click to play",
                size: 24.0,
            },
        ])
}

pub fn create_api_scene() -> Result<PlayingVideoApiScene, Box<dyn std::error::Error + Send + Sync>>
{
    let _app = create_application();
    let _input = create_input_manager();
    let mut arena = DisplayObjectArena::default();
    let root = create_display_object(&mut arena);
    let video_source = load_video_resource_from_url(&asset_path("assets/example.mp4"))?;
    let video_node = create_video(&mut arena);
    set_video_source(&mut arena, video_node, Some(video_source.clone()));
    set_display_object_x(&mut arena, video_node, 80.0);
    set_display_object_y(&mut arena, video_node, 20.0);
    add_display_object_child(&mut arena, root, video_node);

    let overlay = create_shape(&mut arena);
    append_shape_begin_fill(&mut arena, overlay, 0x000000ff, 0.5);
    append_shape_rectangle(&mut arena, overlay, 0.0, 0.0, 800.0, 400.0);
    add_display_object_child(&mut arena, root, overlay);

    let mut prompt = create_text_label(None);
    set_text_label_string(&mut prompt, "Click to play".to_string());
    let has_channel = play_video_resource(&video_source, None).is_some();

    Ok(PlayingVideoApiScene {
        arena,
        root,
        video_node,
        overlay,
        has_channel,
    })
}

fn asset_path(path: &str) -> String {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../packages/playingvideo/public")
        .join(path)
        .to_string_lossy()
        .into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_scene() {
        assert_eq!(create_scene().id, "playingvideo");
    }

    #[test]
    fn creates_matching_api_scene() {
        let scene = create_api_scene().expect("video asset exists");
        assert!(scene.has_channel);
        assert_eq!(
            flighthq_displayobject::get_display_object_children(&scene.arena, scene.root).len(),
            2
        );
    }
}
