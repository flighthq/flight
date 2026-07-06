//! Host-neutral Rust implementation of the `displayingabitmap` example.

use example_common::{ExamplePrimitive, ExampleScene};
use flighthq_displayobject::{
    DisplayObjectArena, add_display_object_child, create_bitmap, create_display_object,
    set_bitmap_image, set_display_object_x, set_display_object_y,
};
use flighthq_image::load_image_resource_from_url;

const STAGE_WIDTH: u32 = 550;
const STAGE_HEIGHT: u32 = 400;
const BACKGROUND: u32 = 0xee_dd_cc_ff;

// wabbit_alpha.png intrinsic dimensions.
const BITMAP_WIDTH: f32 = 26.0;
const BITMAP_HEIGHT: f32 = 37.0;

pub struct DisplayingBitmapApiScene {
    pub arena: DisplayObjectArena,
    pub root: flighthq_node::NodeId,
    pub bitmap: flighthq_node::NodeId,
}

pub fn create_scene() -> ExampleScene {
    let _api_scene = create_api_scene().expect("displayingabitmap API scene");
    let x = (STAGE_WIDTH as f32 - BITMAP_WIDTH) / 2.0;
    let y = (STAGE_HEIGHT as f32 - BITMAP_HEIGHT) / 2.0;
    ExampleScene::new("displayingabitmap", "Displaying a bitmap")
        .with_size(STAGE_WIDTH, STAGE_HEIGHT)
        .with_background(BACKGROUND)
        .with_fill(0x99_99_99_ff)
        .with_primitives(vec![ExamplePrimitive::Rectangle {
            x,
            y,
            width: BITMAP_WIDTH,
            height: BITMAP_HEIGHT,
        }])
}

pub fn create_api_scene()
-> Result<DisplayingBitmapApiScene, Box<dyn std::error::Error + Send + Sync>> {
    let mut arena = DisplayObjectArena::default();
    let root = create_display_object(&mut arena);
    let bitmap = create_bitmap(&mut arena);
    let image = load_image_resource_from_url(&asset_path("assets/wabbit_alpha.png"))?;
    set_display_object_x(
        &mut arena,
        bitmap,
        (STAGE_WIDTH as f32 - image.width as f32) / 2.0,
    );
    set_display_object_y(
        &mut arena,
        bitmap,
        (STAGE_HEIGHT as f32 - image.height as f32) / 2.0,
    );
    set_bitmap_image(&mut arena, bitmap, Some(image));
    add_display_object_child(&mut arena, root, bitmap);
    Ok(DisplayingBitmapApiScene {
        arena,
        root,
        bitmap,
    })
}

fn asset_path(path: &str) -> String {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../packages/displayingabitmap/public")
        .join(path)
        .to_string_lossy()
        .into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_displayobject::{get_bitmap_image, get_display_object_children};

    #[test]
    fn creates_scene() {
        assert_eq!(create_scene().id, "displayingabitmap");
    }

    #[test]
    fn creates_matching_api_scene() {
        let scene = create_api_scene().expect("image loads");
        assert_eq!(
            get_display_object_children(&scene.arena, scene.root),
            vec![scene.bitmap]
        );
        let image = get_bitmap_image(&scene.arena, scene.bitmap).expect("bitmap image");
        assert_eq!((image.width, image.height), (26, 37));
    }
}
