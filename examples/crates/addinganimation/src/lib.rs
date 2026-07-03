use example_common::{ExamplePrimitive, ExampleScene};

pub fn create_scene() -> ExampleScene {
    let primitives = (0..8)
        .map(|index| ExamplePrimitive::Circle {
            x: 120.0 + index as f32 * 82.0,
            y: 200.0 + (index as f32 * 0.8).sin() * 72.0,
            radius: 28.0,
        })
        .collect();
    ExampleScene::new("addinganimation", "Adding animation").with_primitives(primitives)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_scene() {
        assert_eq!(create_scene().id, "addinganimation");
    }
}
