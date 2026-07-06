//! Host-neutral Rust implementation of the `addinganimation` example.

use example_common::{ExamplePrimitive, ExampleScene};
use flighthq_displayobject::{
    DisplayObjectArena, add_display_object_child, create_bitmap, create_display_object,
    get_display_object_alpha, get_display_object_scale_x, get_display_object_scale_y,
    set_bitmap_image, set_display_object_alpha, set_display_object_scale_x,
    set_display_object_scale_y, set_display_object_x, set_display_object_y,
};
use flighthq_easing::ease_out_elastic;
use flighthq_image::load_image_resource_from_url;
use flighthq_signals::{SignalConnectOptions, connect_signal};
use flighthq_tween::{TweenManager, create_tween, create_tween_manager, update_tweens};
use flighthq_types::TweenOptions;
use std::sync::Arc;

const STAGE_WIDTH: u32 = 550;
const STAGE_HEIGHT: u32 = 400;
const BACKGROUND: u32 = 0xee_dd_cc_ff;

// wabbit_alpha.png is 26x37px; the TS bitmap is centred by offsetting -w/2, -h/2
// under a container pinned at the stage centre.
const BUNNY_WIDTH: f32 = 26.0;
const BUNNY_HEIGHT: f32 = 37.0;

pub struct AddingAnimationApiScene {
    pub arena: DisplayObjectArena,
    pub manager: TweenManager,
    pub main: flighthq_node::NodeId,
    pub container: flighthq_node::NodeId,
    pub bitmap: flighthq_node::NodeId,
    pub target_id: u64,
}

pub fn create_scene() -> ExampleScene {
    let _api_scene = create_api_scene().expect("addinganimation API scene");
    let center_x = STAGE_WIDTH as f32 / 2.0;
    let center_y = STAGE_HEIGHT as f32 / 2.0;
    let bunny = ExamplePrimitive::Rectangle {
        x: center_x - BUNNY_WIDTH / 2.0,
        y: center_y - BUNNY_HEIGHT / 2.0,
        width: BUNNY_WIDTH,
        height: BUNNY_HEIGHT,
    };
    ExampleScene::new("addinganimation", "Adding animation")
        .with_size(STAGE_WIDTH, STAGE_HEIGHT)
        .with_background(BACKGROUND)
        .with_primitives(vec![bunny])
}

pub fn create_api_scene()
-> Result<AddingAnimationApiScene, Box<dyn std::error::Error + Send + Sync>> {
    let mut manager = create_tween_manager(None);
    let mut arena = DisplayObjectArena::default();
    let main = create_display_object(&mut arena);
    let container = create_display_object(&mut arena);
    let bitmap = create_bitmap(&mut arena);

    set_display_object_alpha(&mut arena, container, 0.0);
    set_display_object_scale_x(&mut arena, container, 0.0);
    set_display_object_scale_y(&mut arena, container, 0.0);
    set_display_object_x(&mut arena, container, STAGE_WIDTH as f32 / 2.0);
    set_display_object_y(&mut arena, container, STAGE_HEIGHT as f32 / 2.0);

    add_display_object_child(&mut arena, container, bitmap);
    add_display_object_child(&mut arena, main, container);

    let image = load_image_resource_from_url(&asset_path("assets/wabbit_alpha.png"))?;
    set_display_object_x(&mut arena, bitmap, -(image.width as f32) / 2.0);
    set_display_object_y(&mut arena, bitmap, -(image.height as f32) / 2.0);
    set_bitmap_image(&mut arena, bitmap, Some(image));

    let target_id = 1;
    let tween_index = create_tween(
        &mut manager,
        target_id,
        3.0,
        vec![
            ("alpha".to_string(), 1.0),
            ("scaleX".to_string(), 2.0),
            ("scaleY".to_string(), 2.0),
        ],
        Some(TweenOptions {
            ease: Some(Arc::new(ease_out_elastic)),
            overwrite: true,
            repeat: -1,
            reflect: true,
            ..Default::default()
        }),
    );
    let tween = manager
        .tweens
        .get(&target_id)
        .and_then(|items| items.get(tween_index))
        .expect("created tween");
    let _guard = connect_signal(
        &tween.on_update,
        Arc::new(|_: &()| {}),
        SignalConnectOptions::default(),
    );

    for (target, key, value) in update_tweens(&mut manager, 1.0 / 60.0, &mut |target, keys| {
        keys.iter()
            .map(|key| {
                let value = if target == target_id {
                    match key.as_str() {
                        "alpha" => get_display_object_alpha(&arena, container),
                        "scaleX" => get_display_object_scale_x(&arena, container),
                        "scaleY" => get_display_object_scale_y(&arena, container),
                        _ => 0.0,
                    }
                } else {
                    0.0
                };
                (key.clone(), value)
            })
            .collect()
    }) {
        if target == target_id {
            match key.as_str() {
                "alpha" => set_display_object_alpha(&mut arena, container, value),
                "scaleX" => set_display_object_scale_x(&mut arena, container, value),
                "scaleY" => set_display_object_scale_y(&mut arena, container, value),
                _ => {}
            }
        }
    }

    Ok(AddingAnimationApiScene {
        arena,
        manager,
        main,
        container,
        bitmap,
        target_id,
    })
}

fn asset_path(path: &str) -> String {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../packages/addinganimation/public")
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
        assert_eq!(create_scene().id, "addinganimation");
    }

    #[test]
    fn creates_matching_api_scene() {
        let scene = create_api_scene().expect("image loads");
        assert_eq!(
            get_display_object_children(&scene.arena, scene.main),
            vec![scene.container]
        );
        assert_eq!(
            get_display_object_children(&scene.arena, scene.container),
            vec![scene.bitmap]
        );
        assert!(get_bitmap_image(&scene.arena, scene.bitmap).is_some());
        assert!(scene.manager.tweens.contains_key(&scene.target_id));
    }
}
