use example_common::{ExamplePrimitive, ExampleScene};

pub fn create_scene() -> ExampleScene {
    let primitives = (0..18)
        .map(|index| ExamplePrimitive::Circle {
            x: 108.0 + index as f32 * 34.0,
            y: 250.0 - (index as f32 * 0.55).sin() * 90.0,
            radius: 10.0 + index as f32 * 0.7,
        })
        .collect();
    ExampleScene::new("sparktrail", "Spark trail").with_primitives(primitives)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_scene() {
        assert_eq!(create_scene().id, "sparktrail");
    }
}
