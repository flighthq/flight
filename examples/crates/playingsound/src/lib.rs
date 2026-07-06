//! Host-neutral Rust implementation of the `playingsound` example.
//!
//! The TypeScript example is an audio player: it loads `stars.ogg`/`stars.mp3`
//! and pulses a single full-window background rectangle's alpha in time with
//! playback, toggling play/pause on pointer down.

use example_common::{ExamplePrimitive, ExampleScene};
use flighthq_application::create_application;
use flighthq_audio::load_audio_resource_from_urls;
use flighthq_displayobject::{
    DisplayObjectArena, add_display_object_child, create_display_object, set_display_object_alpha,
};
use flighthq_input::create_input_manager;
use flighthq_media::{play_audio_resource, set_audio_channel_gain};
use flighthq_shape::{append_shape_begin_fill, append_shape_rectangle, create_shape};
use flighthq_tween::{create_tween, create_tween_manager};
use flighthq_types::{AudioResourceUrl, TweenOptions};

pub const ID: &str = "playingsound";
pub const TITLE: &str = "Playing sound";
pub const WIDTH: u32 = 800;
pub const HEIGHT: u32 = 400;
pub const BACKGROUND: u32 = 0xee_dd_cc_ff;
pub const FILL: u32 = 0x24_af_c4_ff;

pub struct PlayingSoundApiScene {
    pub arena: DisplayObjectArena,
    pub root: flighthq_node::NodeId,
    pub background: flighthq_node::NodeId,
}

pub fn create_scene() -> ExampleScene {
    let _api_scene = create_api_scene();
    ExampleScene::new(ID, TITLE)
        .with_size(WIDTH, HEIGHT)
        .with_background(BACKGROUND)
        .with_fill(FILL)
        .with_primitives(vec![ExamplePrimitive::Rectangle {
            x: 0.0,
            y: 0.0,
            width: WIDTH as f32,
            height: HEIGHT as f32,
        }])
}

pub fn create_api_scene() -> Result<PlayingSoundApiScene, Box<dyn std::error::Error + Send + Sync>>
{
    let _app = create_application();
    let _input = create_input_manager();
    let mut manager = create_tween_manager(None);
    let mut arena = DisplayObjectArena::default();
    let root = create_display_object(&mut arena);
    let background = create_shape(&mut arena);
    append_shape_begin_fill(&mut arena, background, 0x24afc4ff, 1.0);
    append_shape_rectangle(
        &mut arena,
        background,
        0.0,
        0.0,
        WIDTH as f32,
        HEIGHT as f32,
    );
    add_display_object_child(&mut arena, root, background);
    set_display_object_alpha(&mut arena, background, 1.0);
    create_tween(
        &mut manager,
        1,
        1.0,
        vec![("alpha".to_string(), 0.1)],
        Some(TweenOptions {
            overwrite: true,
            ..Default::default()
        }),
    );

    let sound = load_audio_resource_from_urls(&[
        AudioResourceUrl {
            url: asset_path("assets/stars.ogg"),
            mime_type: None,
        },
        AudioResourceUrl {
            url: asset_path("assets/stars.mp3"),
            mime_type: None,
        },
    ])?;
    if let Some(mut channel) = play_audio_resource(&sound, None) {
        set_audio_channel_gain(&mut channel, 1.0);
    }
    Ok(PlayingSoundApiScene {
        arena,
        root,
        background,
    })
}

fn asset_path(path: &str) -> String {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../packages/playingsound/public")
        .join(path)
        .to_string_lossy()
        .into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_scene() {
        assert_eq!(create_scene().id, "playingsound");
    }

    #[test]
    fn calls_audio_api_and_surfaces_decoder_gap() {
        match create_api_scene() {
            Ok(_) => panic!("audio decoder unexpectedly available"),
            Err(err) => assert!(err.to_string().contains("decoder backend")),
        }
    }
}
