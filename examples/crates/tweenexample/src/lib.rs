use example_common::{ExamplePrimitive, ExampleScene};

pub fn create_scene() -> ExampleScene {
    let primitives = (0..7)
        .map(|index| ExamplePrimitive::Circle {
            x: 130.0 + index as f32 * 90.0,
            y: 200.0,
            radius: 18.0 + index as f32 * 4.0,
        })
        .collect();
    ExampleScene::new("tweenexample", "Tween example").with_primitives(primitives)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_scene() {
        assert_eq!(create_scene().id, "tweenexample");
    }
}
