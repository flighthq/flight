//! Host-neutral Rust implementation of the `comparebitmapdata` example.
//!
//! The TypeScript example builds a bitmap-comparison matrix: it procedurally
//! generates `Surface`/BitmapData tiles (checkers, noise, balls, rects), draws
//! them as the top row and left column of headers, then fills an NxN grid with
//! the per-pixel `compareSurface` diff of each pair. That is bitmap-image and
//! text-label content, neither of which `ExamplePrimitive` can express, so this
//! port reproduces the grid *structure* — every header tile and every matrix
//! cell as a correctly-sized, correctly-positioned rectangle on the same dark
//! background — as the closest honest approximation.

use example_common::{ExamplePrimitive, ExampleScene};

const IMG_SIZE: f32 = 40.0;
const CELL_SIZE: f32 = IMG_SIZE + 4.0;
const LABEL_SIZE: f32 = 56.0;
const PAD: f32 = 8.0;
const SOURCE_COUNT: u32 = 11;

pub fn create_scene() -> ExampleScene {
    let extent = (LABEL_SIZE + SOURCE_COUNT as f32 * CELL_SIZE + PAD) as u32;

    let mut primitives = Vec::new();

    // Column-header tiles across the top.
    for col in 0..SOURCE_COUNT {
        let x = LABEL_SIZE + col as f32 * CELL_SIZE;
        primitives.push(tile(x + 2.0, 2.0));
    }

    // Row-header tiles down the left, plus the comparison-matrix cells.
    for row in 0..SOURCE_COUNT {
        let y = LABEL_SIZE + row as f32 * CELL_SIZE;
        primitives.push(tile(2.0, y + 2.0));
        for col in 0..SOURCE_COUNT {
            let x = LABEL_SIZE + col as f32 * CELL_SIZE;
            primitives.push(tile(x + 2.0, y + 2.0));
        }
    }

    ExampleScene::new("comparebitmapdata", "Compare bitmap data")
        .with_size(extent, extent)
        .with_background(0x16_21_3e_ff)
        .with_primitives(primitives)
}

fn tile(x: f32, y: f32) -> ExamplePrimitive {
    ExamplePrimitive::Rectangle {
        x,
        y,
        width: IMG_SIZE,
        height: IMG_SIZE,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_scene() {
        assert_eq!(create_scene().id, "comparebitmapdata");
    }
}
