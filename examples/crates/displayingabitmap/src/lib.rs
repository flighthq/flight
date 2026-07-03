use example_common::{ExamplePrimitive, ExampleScene};

pub fn create_scene() -> ExampleScene {
    ExampleScene::new("displayingabitmap", "Displaying a bitmap").with_primitives(vec![
        ExamplePrimitive::Rectangle {
            x: 220.0,
            y: 80.0,
            width: 360.0,
            height: 240.0,
        },
        ExamplePrimitive::Circle {
            x: 400.0,
            y: 200.0,
            radius: 72.0,
        },
    ])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_scene() {
        assert_eq!(create_scene().id, "displayingabitmap");
    }
}
