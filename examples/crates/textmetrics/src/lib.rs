use example_common::{ExamplePrimitive, ExampleScene};

pub fn create_scene() -> ExampleScene {
    ExampleScene::new("textmetrics", "Text metrics").with_primitives(vec![
        ExamplePrimitive::Text {
            x: 110.0,
            y: 170.0,
            value: "Measure me",
            size: 52.0,
        },
        ExamplePrimitive::Rectangle {
            x: 110.0,
            y: 182.0,
            width: 320.0,
            height: 4.0,
        },
        ExamplePrimitive::Rectangle {
            x: 110.0,
            y: 116.0,
            width: 320.0,
            height: 4.0,
        },
    ])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_scene() {
        assert_eq!(create_scene().id, "textmetrics");
    }
}
