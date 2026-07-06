//! Host-neutral Rust implementation of the `renderview` example.
//!
//! The TypeScript example loads `assets/tileset.png`, wraps it in a
//! `TextureAtlas`, and renders a single 32x32 tile as a `Sprite` scaled 4x
//! (nearest-neighbor) centered on a 256×256 stage with a `0xeeddccff`
//! background.

use example_common::{ExamplePrimitive, ExampleScene};
use flighthq_displayobject::{
    DisplayObjectArena, set_display_object_scale_x, set_display_object_scale_y,
};
use flighthq_image::load_image_resource_from_url;
use flighthq_sprite::{create_sprite, set_sprite_atlas, set_sprite_id};
use flighthq_textureatlas::{add_texture_atlas_region, create_texture_atlas};

const WIDTH: u32 = 256;
const HEIGHT: u32 = 256;
const TILE_SIZE: f32 = 32.0;
const SCALE: f32 = 4.0;
const BACKGROUND: u32 = 0xee_dd_cc_ff;

pub struct RenderViewApiScene {
    pub arena: DisplayObjectArena,
    pub root: flighthq_node::NodeId,
}

pub fn create_scene() -> ExampleScene {
    let _api_scene = create_api_scene().expect("renderview API scene");
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

pub fn create_api_scene() -> Result<RenderViewApiScene, Box<dyn std::error::Error + Send + Sync>> {
    let source = load_image_resource_from_url(&asset_path("assets/tileset.png"))?;
    let mut atlas = create_texture_atlas(Some(source), Vec::new());
    add_texture_atlas_region(&mut atlas, 0.0, 0.0, TILE_SIZE, TILE_SIZE, None, None, None);
    let mut arena = DisplayObjectArena::default();
    let root = create_sprite(&mut arena);
    set_sprite_atlas(&mut arena, root, Some(atlas));
    set_sprite_id(&mut arena, root, 0);
    set_display_object_scale_x(&mut arena, root, SCALE);
    set_display_object_scale_y(&mut arena, root, SCALE);
    Ok(RenderViewApiScene { arena, root })
}

fn asset_path(path: &str) -> String {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../packages/renderview/public")
        .join(path)
        .to_string_lossy()
        .into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_sprite::get_sprite_atlas;

    #[test]
    fn creates_scene() {
        assert_eq!(create_scene().id, "renderview");
    }

    #[test]
    fn creates_matching_api_scene() {
        let scene = create_api_scene().expect("image loads");
        assert!(get_sprite_atlas(&scene.arena, scene.root).is_some());
    }
}
