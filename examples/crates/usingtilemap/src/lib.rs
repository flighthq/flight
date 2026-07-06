//! Host-neutral Rust implementation of the `usingtilemap` example.
//!
//! The TypeScript example loads `assets/tileset.png` and paints an 8x8
//! `Tilemap` of 32px tiles scaled x2 at a 40px pad.

use example_common::{ExamplePrimitive, ExampleScene};
use flighthq_displayobject::{
    DisplayObjectArena, set_display_object_scale_x, set_display_object_scale_y,
    set_display_object_x, set_display_object_y,
};
use flighthq_sprite::{create_tilemap, resize_tilemap, set_tilemap_tile, set_tilemap_tileset};
use flighthq_tileset::load_tileset_from_url;

const TILE: f32 = 32.0;
const SCALE: f32 = 2.0;
const COLS: u32 = 8;
const ROWS: u32 = 8;
const PAD: f32 = 40.0;
const CELL: f32 = TILE * SCALE;
const INSET: f32 = 4.0;

pub struct UsingTilemapApiScene {
    pub arena: DisplayObjectArena,
    pub tilemap: flighthq_node::NodeId,
}

pub fn create_scene() -> ExampleScene {
    let _api_scene = create_api_scene().expect("usingtilemap API scene");
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

pub fn create_api_scene() -> Result<UsingTilemapApiScene, Box<dyn std::error::Error + Send + Sync>>
{
    let tileset = load_tileset_from_url(&asset_path("assets/tileset.png"), TILE, TILE)?;
    let stride = tileset.columns;
    let mut arena = DisplayObjectArena::default();
    let tilemap = create_tilemap(&mut arena);
    resize_tilemap(&mut arena, tilemap, COLS, ROWS);
    set_tilemap_tileset(&mut arena, tilemap, Some(tileset));
    set_display_object_scale_x(&mut arena, tilemap, SCALE);
    set_display_object_scale_y(&mut arena, tilemap, SCALE);
    set_display_object_x(&mut arena, tilemap, PAD);
    set_display_object_y(&mut arena, tilemap, PAD);
    for row in 0..ROWS {
        for col in 0..COLS {
            set_tilemap_tile(&mut arena, tilemap, col, row, (row * stride) as i16);
        }
    }
    Ok(UsingTilemapApiScene { arena, tilemap })
}

fn asset_path(path: &str) -> String {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../packages/usingtilemap/public")
        .join(path)
        .to_string_lossy()
        .into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_sprite::{get_tilemap_columns, get_tilemap_rows, get_tilemap_tile};

    #[test]
    fn creates_scene() {
        assert_eq!(create_scene().id, "usingtilemap");
    }

    #[test]
    fn creates_matching_api_scene() {
        let scene = create_api_scene().expect("tileset loads");
        assert_eq!(get_tilemap_columns(&scene.arena, scene.tilemap), COLS);
        assert_eq!(get_tilemap_rows(&scene.arena, scene.tilemap), ROWS);
        assert!(get_tilemap_tile(&scene.arena, scene.tilemap, 0, 1) > 0);
    }
}
