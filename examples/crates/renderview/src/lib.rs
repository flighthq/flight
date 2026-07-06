//! Host-neutral Rust implementation of the `renderview` example.
//!
//! The TypeScript example loads `assets/tileset.png`, wraps it in a
//! `TextureAtlas`, and renders a single 32×32 tile as a `Sprite` scaled 4×
//! (nearest-neighbor) centered on a 256×256 stage with a `0xeeddccff`
//! background. Loaded bitmaps, texture atlases, and sprites are outside the
//! `ExamplePrimitive` vocabulary, so this port stands in for the tile with a
//! correctly sized and positioned rectangle: the displayed tile is
//! `TILE_SIZE * SCALE = 128` px square, centered at `(64, 64)` on the stage.

use example_common::{ExamplePrimitive, ExampleScene};

const WIDTH: u32 = 256;
const HEIGHT: u32 = 256;
const TILE_SIZE: f32 = 32.0;
const SCALE: f32 = 4.0;
const BACKGROUND: u32 = 0xee_dd_cc_ff;

pub fn create_scene() -> ExampleScene {
    let tile = TILE_SIZE * SCALE;
    let x = (WIDTH as f32 - tile) / 2.0;
    let y = (HEIGHT as f32 - tile) / 2.0;

    ExampleScene::new("renderview", "Render view")
        .with_size(WIDTH, HEIGHT)
        .with_background(BACKGROUND)
        .with_primitives(vec![ExamplePrimitive::Rectangle {
            x,
            y,
            width: tile,
            height: tile,
        }])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_scene() {
        assert_eq!(create_scene().id, "renderview");
    }
}
