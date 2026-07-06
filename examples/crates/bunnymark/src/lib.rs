//! Host-neutral Rust approximation of the `bunnymark` example.
//!
//! The TypeScript original draws thousands of `wabbit_alpha.png` bitmap sprites
//! through a texture atlas + quad batch: each "bunny" spawns at the top-left,
//! falls under gravity, and bounces off the stage edges. `ExamplePrimitive` has
//! no bitmap, texture-atlas, or quad-batch primitive, so a faithful pixel port is
//! impossible here. This scene is the closest structural stand-in: a field of
//! bunny-sized rectangles scattered across the same 550x400 stage and cream
//! background, standing where the falling bunny sprites would be.

use example_common::{ExamplePrimitive, ExampleScene};

pub const ID: &str = "bunnymark";
pub const TITLE: &str = "Bunnymark";
pub const WIDTH: u32 = 550;
pub const HEIGHT: u32 = 400;
pub const BACKGROUND: u32 = 0xee_dd_cc_ff;

const BUNNY_WIDTH: f32 = 26.0;
const BUNNY_HEIGHT: f32 = 37.0;
const BUNNY_COUNT: u32 = 120;

pub fn create_scene() -> ExampleScene {
    ExampleScene::new(ID, TITLE)
        .with_size(WIDTH, HEIGHT)
        .with_background(BACKGROUND)
        .with_fill(0x88_86_84_ff)
        .with_primitives(bunny_primitives())
}

/// A deterministic scatter of bunny-sized rectangles across the stage, standing
/// in for the animated bitmap sprites the TypeScript example renders.
fn bunny_primitives() -> Vec<ExamplePrimitive> {
    let span_x = WIDTH as f32 - BUNNY_WIDTH;
    let span_y = HEIGHT as f32 - BUNNY_HEIGHT;
    let mut seed: u32 = 0x1234_5678;
    (0..BUNNY_COUNT)
        .map(|_| {
            let x = next_unit(&mut seed) * span_x;
            let y = next_unit(&mut seed) * span_y;
            ExamplePrimitive::Rectangle {
                x,
                y,
                width: BUNNY_WIDTH,
                height: BUNNY_HEIGHT,
            }
        })
        .collect()
}

/// A tiny linear-congruential generator so the scatter is stable across runs.
fn next_unit(seed: &mut u32) -> f32 {
    *seed = seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
    (*seed >> 8) as f32 / (1u32 << 24) as f32
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_scene() {
        assert_eq!(create_scene().id, "bunnymark");
    }
}
