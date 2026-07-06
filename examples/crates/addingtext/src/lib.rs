//! Host-neutral Rust implementation of the `addingtext` example.
//!
//! The TypeScript example loads a font, creates a root display object, creates a
//! text label, assigns text/format/position, and adds the label to the root.

use example_common::{ExamplePrimitive, ExampleScene};
use flighthq_displayobject::{
    DisplayObjectArena, add_display_object_child, create_display_object, set_display_object_x,
    set_display_object_y,
};
use flighthq_font::load_font_from_url;
use flighthq_text::{TextLabel, create_text_label, set_text_label_format, set_text_label_string};
use flighthq_types::TextFormat;

pub struct AddingTextApiScene {
    pub arena: DisplayObjectArena,
    pub root: flighthq_node::NodeId,
    pub text_field: TextLabel,
}

pub fn create_scene() -> ExampleScene {
    let _api_scene = create_api_scene().expect("addingtext API scene");
    ExampleScene::new("addingtext", "Adding text")
        .with_size(400, 200)
        .with_background(0xff_ff_ff_ff)
        .with_fill(0x7a_00_26_ff)
        .with_primitives(vec![ExamplePrimitive::Text {
            x: 50.0,
            y: 50.0,
            value: "Hello World",
            size: 30.0,
        }])
}

pub fn create_api_scene() -> Result<AddingTextApiScene, Box<dyn std::error::Error + Send + Sync>> {
    let font = load_font_from_url(&asset_path("assets/KatamotzIkasi.woff"), "Katamotz Ikasi")?;

    let mut arena = DisplayObjectArena::default();
    let root = create_display_object(&mut arena);
    let text_node = create_display_object(&mut arena);

    let mut text_field = create_text_label(None);
    set_text_label_string(&mut text_field, "Hello World".to_string());
    set_text_label_format(
        &mut text_field,
        TextFormat {
            font: Some(font.name),
            size: Some(30.0),
            color: Some(0x7a_00_26_ff),
            ..Default::default()
        },
    );
    set_display_object_x(&mut arena, text_node, 50.0);
    set_display_object_y(&mut arena, text_node, 50.0);
    add_display_object_child(&mut arena, root, text_node);

    Ok(AddingTextApiScene {
        arena,
        root,
        text_field,
    })
}

fn asset_path(path: &str) -> String {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../packages/addingtext/public")
        .join(path)
        .to_string_lossy()
        .into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_displayobject::get_display_object_children;

    #[test]
    fn creates_scene() {
        assert_eq!(create_scene().id, "addingtext");
    }

    #[test]
    fn creates_matching_api_scene() {
        let scene = create_api_scene().expect("font asset loads");
        assert_eq!(scene.text_field.data.text, "Hello World");
        assert_eq!(
            scene.text_field.data.text_format.font.as_deref(),
            Some("Katamotz Ikasi")
        );
        assert_eq!(
            get_display_object_children(&scene.arena, scene.root).len(),
            1
        );
    }
}
