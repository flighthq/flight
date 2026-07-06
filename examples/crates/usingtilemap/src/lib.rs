//! Host-neutral Rust implementation of the `usingtilemap` example.
//!
//! The TypeScript example loads `assets/tileset.png` and paints an 8x8
//! `Tilemap` of 32px tiles scaled x2 (64px on screen) at a 40px pad on a
//! 592x592 canvas. A bitmap tileset and a tilemap renderer are outside what
//! `ExamplePrimitive` can express, so this is the closest honest structural
//! stand-in: an 8x8 grid of tile-sized rectangles at the same size and layout,
//! each inset so the individual cells read as distinct tiles.

use example_common::{ExamplePrimitive, ExampleScene};

const TILE: f32 = 32.0;
const SCALE: f32 = 2.0;
const COLS: u32 = 8;
const ROWS: u32 = 8;
const PAD: f32 = 40.0;
const CELL: f32 = TILE * SCALE;
const INSET: f32 = 4.0;

pub fn create_scene() -> ExampleScene {
    let mut primitives = Vec::with_capacity((COLS * ROWS) as usize);
    for row in 0..ROWS {
        for col in 0..COLS {
            primitives.push(ExamplePrimitive::Rectangle {
                x: PAD + col as f32 * CELL + INSET,
                y: PAD + row as f32 * CELL + INSET,
                width: CELL - INSET * 2.0,
                height: CELL - INSET * 2.0,
            });
        }
    }
    ExampleScene::new("usingtilemap", "Using tilemap")
        .with_size(592, 592)
        .with_background(0xee_dd_cc_ff)
        .with_primitives(primitives)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_scene() {
        assert_eq!(create_scene().id, "usingtilemap");
    }
}
