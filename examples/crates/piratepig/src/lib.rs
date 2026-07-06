//! Host-neutral Rust structural approximation of the `piratepig` example.
//!
//! The TypeScript original is a bitmap match-three game: an 8x8 board of loaded
//! tile sprites (six animal images) over a tiled background bitmap, with a logo,
//! a footer bitmap, a blur-filtered translucent score panel, a TrueType score
//! label, and audio. `ExamplePrimitive` can only build single-fill vector shapes,
//! so none of the bitmaps, the blur, the font, or the audio survive the port.
//!
//! What remains is the geometry the vector model *can* carry: the 8x8 tile board
//! laid out at the game's exact tile coordinates, so the structure and footprint
//! of the play field match the original even though the sprites do not.

use example_common::{ExamplePrimitive, ExampleScene};

pub const ID: &str = "piratepig";
pub const TITLE: &str = "Pirate pig";

const NUM_COLUMNS: u32 = 8;
const NUM_ROWS: u32 = 8;
const TILE_SIZE: f32 = 57.0;
const TILE_STEP: f32 = TILE_SIZE + 16.0;
const TILE_CONTAINER_X: f32 = 14.0;
const TILE_CONTAINER_Y: f32 = 99.0;
const TILE_RADIUS: f32 = 12.0;
const CONTENT_WIDTH: f32 = TILE_STEP * NUM_COLUMNS as f32;

const STAGE_WIDTH: u32 = 612;
const STAGE_HEIGHT: u32 = 700;
const BACKGROUND: u32 = 0xf4_ec_d8_ff;
const TILE_FILL: u32 = 0x2f_9f_b3_ff;

pub fn create_scene() -> ExampleScene {
    let mut primitives = Vec::new();

    for row in 0..NUM_ROWS {
        for col in 0..NUM_COLUMNS {
            primitives.push(ExamplePrimitive::RoundRectangle {
                x: TILE_CONTAINER_X + col as f32 * TILE_STEP,
                y: TILE_CONTAINER_Y + row as f32 * TILE_STEP,
                width: TILE_SIZE,
                height: TILE_SIZE,
                radius: TILE_RADIUS,
            });
        }
    }

    // The right-aligned score label. Text is not rasterized by the vector shape
    // builder, but it records the label's place in the scene the original draws.
    primitives.push(ExamplePrimitive::Text {
        x: CONTENT_WIDTH - 200.0,
        y: 12.0,
        value: "0",
        size: 60.0,
    });

    ExampleScene::new(ID, TITLE)
        .with_size(STAGE_WIDTH, STAGE_HEIGHT)
        .with_background(BACKGROUND)
        .with_fill(TILE_FILL)
        .with_primitives(primitives)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_scene() {
        assert_eq!(create_scene().id, "piratepig");
    }
}
