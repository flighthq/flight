use example_common::{ExamplePrimitive, ExampleScene};

pub fn create_scene() -> ExampleScene {
    ExampleScene::new("addingtext", "Adding text").with_primitives(vec![
        ExamplePrimitive::Text {
            x: 88.0,
            y: 156.0,
            value: "Hello Flight",
            size: 56.0,
        },
        ExamplePrimitive::Rectangle {
            x: 88.0,
            y: 184.0,
            width: 360.0,
            height: 8.0,
        },
    ])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_scene() {
        assert_eq!(create_scene().id, "addingtext");
    }
}
