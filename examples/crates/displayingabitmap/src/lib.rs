//! Host-neutral Rust approximation of the `displayingabitmap` example.
//!
//! The TS example loads `wabbit_alpha.png` (the 26x37 bunnymark sprite) and
//! centers it on a 550x400 canvas over an `0xeeddccff` background. `ExamplePrimitive`
//! has no bitmap/image variant, so a loaded texture cannot be reproduced here; this
//! scene stands in a correctly-sized, correctly-positioned rectangle where the bitmap
//! would draw, preserving the stage size, background, and placement.

use example_common::{ExamplePrimitive, ExampleScene};

const STAGE_WIDTH: u32 = 550;
const STAGE_HEIGHT: u32 = 400;
const BACKGROUND: u32 = 0xee_dd_cc_ff;

// wabbit_alpha.png intrinsic dimensions.
const BITMAP_WIDTH: f32 = 26.0;
const BITMAP_HEIGHT: f32 = 37.0;

pub fn create_scene() -> ExampleScene {
    let x = (STAGE_WIDTH as f32 - BITMAP_WIDTH) / 2.0;
    let y = (STAGE_HEIGHT as f32 - BITMAP_HEIGHT) / 2.0;
    ExampleScene::new("displayingabitmap", "Displaying a bitmap")
        .with_size(STAGE_WIDTH, STAGE_HEIGHT)
        .with_background(BACKGROUND)
        .with_fill(0x99_99_99_ff)
        .with_primitives(vec![ExamplePrimitive::Rectangle {
            x,
            y,
            width: BITMAP_WIDTH,
            height: BITMAP_HEIGHT,
        }])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_scene() {
        assert_eq!(create_scene().id, "displayingabitmap");
    }
}
