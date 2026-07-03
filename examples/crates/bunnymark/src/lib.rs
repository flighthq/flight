use example_common::{ExamplePrimitive, ExampleScene};

pub fn create_scene() -> ExampleScene {
    let primitives = (0..80)
        .map(|index| ExamplePrimitive::Ellipse {
            x: 24.0 + (index % 20) as f32 * 38.0,
            y: 32.0 + (index / 20) as f32 * 82.0,
            width: 22.0,
            height: 34.0,
        })
        .collect();
    ExampleScene::new("bunnymark", "Bunnymark").with_primitives(primitives)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_scene() {
        assert_eq!(create_scene().id, "bunnymark");
    }
}
