use example_common::{ExamplePrimitive, ExampleScene};

pub fn create_scene() -> ExampleScene {
    ExampleScene::new("renderview", "Render view").with_primitives(vec![
        ExamplePrimitive::Rectangle {
            x: 80.0,
            y: 64.0,
            width: 280.0,
            height: 272.0,
        },
        ExamplePrimitive::Rectangle {
            x: 440.0,
            y: 96.0,
            width: 280.0,
            height: 208.0,
        },
        ExamplePrimitive::Circle {
            x: 400.0,
            y: 200.0,
            radius: 42.0,
        },
    ])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_scene() {
        assert_eq!(create_scene().id, "renderview");
    }
}
