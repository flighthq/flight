//! Host-neutral Rust implementation of the `playingsound` example.
//!
//! The TypeScript example is an audio player: it loads `stars.ogg`/`stars.mp3`
//! and pulses a single full-window background rectangle's alpha (0.1 -> 1.0) in
//! time with playback, toggling play/pause on pointer down. The only on-screen
//! geometry is that one stage-filling rectangle, filled with `0x24afc4` over a
//! canvas background of `0xeeddcc`. This scene reproduces that static frame; the
//! audio playback, pointer toggling, and the alpha tween have no
//! `ExamplePrimitive` expression.

use example_common::{ExamplePrimitive, ExampleScene};

pub const ID: &str = "playingsound";
pub const TITLE: &str = "Playing sound";
pub const WIDTH: u32 = 800;
pub const HEIGHT: u32 = 400;
pub const BACKGROUND: u32 = 0xee_dd_cc_ff;
pub const FILL: u32 = 0x24_af_c4_ff;

pub fn create_scene() -> ExampleScene {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_scene() {
        assert_eq!(create_scene().id, "playingsound");
    }
}
