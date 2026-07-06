//! Host-neutral Rust implementation of the `animatedsprite` example.
//!
//! The TypeScript example loads `assets/tileset.png`, builds a spritesheet with
//! four looping animations (snail, blob, owl, bug), and plays them as four
//! animated sprites laid out in a row on an 800x400 stage. The example model
//! here (`ExamplePrimitive`) has no bitmap, texture atlas, or spritesheet
//! primitive, so the animation itself cannot be reproduced. This scene is the
//! honest structural stand-in: one filled square per sprite, matched to the
//! exact on-screen size and layout the TS example computes, so the composition
//! reads the same even though the tileset frames animating inside each square
//! are absent.

use example_common::{ExamplePrimitive, ExampleScene};

const STAGE_WIDTH: f32 = 800.0;
const STAGE_HEIGHT: f32 = 400.0;
const SCALE: f32 = 4.0;
const TILE_SIZE: f32 = 32.0;
const SPRITE_COUNT: usize = 4;

pub fn create_scene() -> ExampleScene {
    ExampleScene::new("animatedsprite", "Animated sprite")
        .with_size(STAGE_WIDTH as u32, STAGE_HEIGHT as u32)
        .with_primitives(sprite_placeholders())
}

/// Mirrors the TS layout math: four sprites of `TILE_SIZE * SCALE` screen size,
/// evenly gapped across the stage width and vertically centered.
fn sprite_placeholders() -> Vec<ExamplePrimitive> {
    let sprite_size = TILE_SIZE * SCALE;
    let total_width = SPRITE_COUNT as f32 * sprite_size;
    let gap = (STAGE_WIDTH - total_width) / (SPRITE_COUNT as f32 + 1.0);
    let y = (STAGE_HEIGHT - sprite_size) / 2.0;
    (0..SPRITE_COUNT)
        .map(|index| ExamplePrimitive::Rectangle {
            x: gap + index as f32 * (sprite_size + gap),
            y,
            width: sprite_size,
            height: sprite_size,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_scene() {
        assert_eq!(create_scene().id, "animatedsprite");
    }

    #[test]
    fn lays_out_one_square_per_sprite() {
        assert_eq!(create_scene().primitives.len(), SPRITE_COUNT);
    }
}
