//! Host-neutral Rust implementation of the `piratepig` setup path.

use example_common::{ExamplePrimitive, ExampleScene};
use flighthq_application::create_application;
use flighthq_audio::load_audio_resource_from_urls;
use flighthq_displayobject::{
    DisplayObjectArena, add_display_object_child, create_bitmap, create_display_object,
    set_bitmap_image, set_bitmap_smoothing, set_display_object_scale_x, set_display_object_scale_y,
};
use flighthq_font::load_font_from_url;
use flighthq_image::load_image_resource_from_url;
use flighthq_input::create_input_manager;
use flighthq_interaction::{
    InteractionManager, create_interaction_manager, hit_test_graph_local_bounds,
    register_hit_test_point,
};
use flighthq_media::play_audio_resource;
use flighthq_tween::{TweenManager, create_tween_manager};
use flighthq_types::{AudioResourceUrl, ImageResource, display_object_kind};

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

pub struct PiratePigApiScene {
    pub arena: DisplayObjectArena,
    pub manager: TweenManager,
    pub interaction_manager: InteractionManager,
    pub root: flighthq_node::NodeId,
    pub tile_images: Vec<ImageResource>,
}

pub fn create_scene() -> ExampleScene {
    let _api_scene = create_api_scene();
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

pub fn create_api_scene() -> Result<PiratePigApiScene, Box<dyn std::error::Error + Send + Sync>> {
    let bg_image = load_image_resource_from_url(&asset_path("assets/images/background_tile.png"))?;
    let footer_image =
        load_image_resource_from_url(&asset_path("assets/images/center_bottom.png"))?;
    let logo_image = load_image_resource_from_url(&asset_path("assets/images/logo.png"))?;
    let font = load_font_from_url(
        &asset_path("assets/fonts/FreebooterUpdated.ttf"),
        "FreebooterUpdated",
    )?;
    let tile_images = [
        "game_bear.png",
        "game_bunny_02.png",
        "game_carrot.png",
        "game_lemon.png",
        "game_panda.png",
        "game_piratePig.png",
    ]
    .into_iter()
    .map(|name| load_image_resource_from_url(&asset_path(&format!("assets/images/{name}"))))
    .collect::<Result<Vec<_>, _>>()?;

    register_hit_test_point(display_object_kind(), bounds_hit_test);
    let _app = create_application();
    let _input = create_input_manager();
    let manager = create_tween_manager(None);
    let mut arena = DisplayObjectArena::default();
    let root = create_display_object(&mut arena);
    set_display_object_scale_x(&mut arena, root, 1.0);
    set_display_object_scale_y(&mut arena, root, 1.0);

    let background = create_bitmap(&mut arena);
    set_bitmap_image(&mut arena, background, Some(bg_image));
    set_bitmap_smoothing(&mut arena, background, true);
    add_display_object_child(&mut arena, root, background);

    let footer = create_bitmap(&mut arena);
    set_bitmap_image(&mut arena, footer, Some(footer_image));
    set_bitmap_smoothing(&mut arena, footer, true);
    add_display_object_child(&mut arena, root, footer);

    let logo = create_bitmap(&mut arena);
    set_bitmap_image(&mut arena, logo, Some(logo_image));
    set_bitmap_smoothing(&mut arena, logo, true);
    add_display_object_child(&mut arena, root, logo);

    let interaction_manager = create_interaction_manager(root, Default::default());
    let _font_name = font.name;

    let theme = load_audio_resource_from_urls(&audio_sources("theme"))?;
    let _sound3 = load_audio_resource_from_urls(&audio_sources("sound3"))?;
    let _sound4 = load_audio_resource_from_urls(&audio_sources("sound4"))?;
    let _sound5 = load_audio_resource_from_urls(&audio_sources("sound5"))?;
    let _channel = play_audio_resource(&theme, None);

    Ok(PiratePigApiScene {
        arena,
        manager,
        interaction_manager,
        root,
        tile_images,
    })
}

fn audio_sources(name: &str) -> [AudioResourceUrl; 2] {
    [
        AudioResourceUrl {
            url: asset_path(&format!("assets/sounds/{name}.ogg")),
            mime_type: None,
        },
        AudioResourceUrl {
            url: asset_path(&format!("assets/sounds/{name}.mp3")),
            mime_type: None,
        },
    ]
}

fn asset_path(path: &str) -> String {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../packages/piratepig/public")
        .join(path)
        .to_string_lossy()
        .into_owned()
}

fn bounds_hit_test(
    arena: &DisplayObjectArena,
    source: flighthq_node::NodeId,
    x: f32,
    y: f32,
    _shape_flag: bool,
) -> bool {
    hit_test_graph_local_bounds(arena, source, x, y)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_scene() {
        assert_eq!(create_scene().id, "piratepig");
    }

    #[test]
    fn calls_setup_apis_and_surfaces_audio_decoder_gap() {
        match create_api_scene() {
            Ok(_) => panic!("audio decoder unexpectedly available"),
            Err(err) => assert!(err.to_string().contains("decoder backend")),
        }
    }
}
