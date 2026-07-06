//! Host-neutral Rust implementation of the `playingvideo` example.
//!
//! The TS example loads an `.mp4`, centers the decoded video frame on a black
//! stage, and draws a 50%-black overlay plus a "Click to play" prompt until the
//! pointer starts playback. `ExamplePrimitive` has no video/bitmap primitive and
//! `build_example_shape_regions` paints every primitive with a single scene fill,
//! so this port is a structural stand-in: a black stage, a centered rectangle
//! occupying the video frame's letterboxed rect, and the prompt text where the
//! overlay label sits.

use example_common::{ExamplePrimitive, ExampleScene};

pub fn create_scene() -> ExampleScene {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_scene() {
        assert_eq!(create_scene().id, "playingvideo");
    }
}
