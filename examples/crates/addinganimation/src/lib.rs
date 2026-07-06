//! Host-neutral Rust implementation of the `addinganimation` example.
//!
//! The TypeScript example loads the `wabbit_alpha.png` bunny bitmap, centres it
//! on a 550x400 stage over an `0xeeddccff` background, and drives an elastic
//! tween that scales it from the centre out (alpha/scaleX/scaleY 0 -> 2,
//! reflecting forever). `ExamplePrimitive` has no bitmap or tween/animation
//! primitive, so this is a structural approximation: a rectangle standing in
//! for the bunny sprite, sized to the source image and centred exactly where
//! the animated bitmap sits.

use example_common::{ExamplePrimitive, ExampleScene};

const STAGE_WIDTH: u32 = 550;
const STAGE_HEIGHT: u32 = 400;
const BACKGROUND: u32 = 0xee_dd_cc_ff;

// wabbit_alpha.png is 26x37px; the TS bitmap is centred by offsetting -w/2, -h/2
// under a container pinned at the stage centre.
const BUNNY_WIDTH: f32 = 26.0;
const BUNNY_HEIGHT: f32 = 37.0;

pub fn create_scene() -> ExampleScene {
    let center_x = STAGE_WIDTH as f32 / 2.0;
    let center_y = STAGE_HEIGHT as f32 / 2.0;
    let bunny = ExamplePrimitive::Rectangle {
        x: center_x - BUNNY_WIDTH / 2.0,
        y: center_y - BUNNY_HEIGHT / 2.0,
        width: BUNNY_WIDTH,
        height: BUNNY_HEIGHT,
    };
    ExampleScene::new("addinganimation", "Adding animation")
        .with_size(STAGE_WIDTH, STAGE_HEIGHT)
        .with_background(BACKGROUND)
        .with_primitives(vec![bunny])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_scene() {
        assert_eq!(create_scene().id, "addinganimation");
    }
}
