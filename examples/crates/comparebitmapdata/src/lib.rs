//! Host-neutral Rust implementation of the `comparebitmapdata` example.
//!
//! The TypeScript example builds a bitmap-comparison matrix with the surface
//! APIs: procedural sources, header draws, and per-pixel comparison cells.

use example_common::{ExamplePrimitive, ExampleScene};
use flighthq_surface::{
    Surface, clone_surface, compare_surface, create_surface, create_surface_region, draw_surface,
    fill_surface_rectangle, set_surface_pixel,
};

const IMG_SIZE: f32 = 40.0;
const CELL_SIZE: f32 = IMG_SIZE + 4.0;
const LABEL_SIZE: f32 = 56.0;
const PAD: f32 = 8.0;
const SOURCE_COUNT: u32 = 11;

pub struct CompareBitmapDataApiScene {
    pub sources: Vec<Option<Surface>>,
    pub grid: Surface,
}

pub fn create_scene() -> ExampleScene {
    let _api_scene = create_api_scene();
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

pub fn create_api_scene() -> CompareBitmapDataApiScene {
    let mut sources = vec![
        Some(create_checkers(0xffffffff, 0x000000ff, 8)),
        Some(create_checkers(0xffffffff, 0x808080ff, 8)),
        Some(create_noise(0xdead_beef)),
        Some(create_noise(0xcafe_babe)),
        Some(create_ball(0xff0000, 255)),
        Some(create_ball(0xffff00, 255)),
        Some(create_ball(0xff0000, 128)),
        Some(create_rect(0x0000ffff, 4)),
        Some(create_rect(0x00ffffff, 8)),
        None,
        None,
    ];
    sources[9] = Some(clone_surface(sources[4].as_ref().expect("red ball")));

    let n = sources.len() as u32;
    let grid_w = (LABEL_SIZE + n as f32 * CELL_SIZE + PAD) as u32;
    let grid_h = grid_w;
    let mut grid = create_surface(grid_w, grid_h, 0x16213eff);

    for col in 0..n {
        if let Some(img) = &sources[col as usize] {
            draw_surface(
                &mut grid,
                &full_region(img),
                LABEL_SIZE as i32 + col as i32 * 44 + 2,
                2,
            );
        }
    }
    for row in 0..n {
        let y = LABEL_SIZE as i32 + row as i32 * 44;
        if let Some(img) = &sources[row as usize] {
            draw_surface(&mut grid, &full_region(img), 2, y + 2);
        }
        for col in 0..n {
            let x = LABEL_SIZE as i32 + col as i32 * 44;
            let cell = match (&sources[row as usize], &sources[col as usize]) {
                (Some(a), Some(b)) => {
                    compare_surface(a, b).unwrap_or_else(|| create_surface(40, 40, 0))
                }
                _ => create_surface(40, 40, 0x333333ff),
            };
            draw_surface(&mut grid, &full_region(&cell), x + 2, y + 2);
        }
    }
    CompareBitmapDataApiScene { sources, grid }
}

fn full_region(surface: &Surface) -> flighthq_surface::SurfaceRegion {
    create_surface_region(surface.clone(), 0, 0, surface.width, surface.height)
}

fn create_checkers(color1: u32, color2: u32, tile_size: u32) -> Surface {
    let mut img = create_surface(IMG_SIZE as u32, IMG_SIZE as u32, color1);
    for y in 0..IMG_SIZE as u32 {
        for x in 0..IMG_SIZE as u32 {
            if ((x / tile_size + y / tile_size) & 1) == 1 {
                set_surface_pixel(&mut img, x, y, color2);
            }
        }
    }
    img
}

fn create_noise(seed: u32) -> Surface {
    let mut img = create_surface(IMG_SIZE as u32, IMG_SIZE as u32, 0);
    let mut s = seed;
    for byte in &mut img.data {
        s = s.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
        *byte = (s & 0xff) as u8;
    }
    img
}

fn create_ball(color: u32, alpha: u32) -> Surface {
    let mut img = create_surface(IMG_SIZE as u32, IMG_SIZE as u32, 0);
    let cx = IMG_SIZE / 2.0;
    let cy = IMG_SIZE / 2.0;
    let r = IMG_SIZE / 2.0 - 2.0;
    for y in 0..IMG_SIZE as u32 {
        for x in 0..IMG_SIZE as u32 {
            let dx = x as f32 + 0.5 - cx;
            let dy = y as f32 + 0.5 - cy;
            if dx * dx + dy * dy <= r * r {
                set_surface_pixel(&mut img, x, y, ((color & 0xffffff) << 8) | (alpha & 0xff));
            }
        }
    }
    img
}

fn create_rect(color: u32, inset: u32) -> Surface {
    let img = create_surface(IMG_SIZE as u32, IMG_SIZE as u32, 0);
    let mut region = create_surface_region(
        img,
        inset,
        inset,
        IMG_SIZE as u32 - inset * 2,
        IMG_SIZE as u32 - inset * 2,
    );
    fill_surface_rectangle(&mut region, color);
    region.surface
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_scene() {
        assert_eq!(create_scene().id, "comparebitmapdata");
    }

    #[test]
    fn creates_matching_api_scene() {
        let scene = create_api_scene();
        assert_eq!(scene.sources.len(), SOURCE_COUNT as usize);
        assert_eq!(
            scene.grid.width,
            (LABEL_SIZE + SOURCE_COUNT as f32 * CELL_SIZE + PAD) as u32
        );
    }
}
