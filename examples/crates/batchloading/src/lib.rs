use example_common::{ExamplePrimitive, ExampleScene};

pub fn create_scene() -> ExampleScene {
    let primitives = (0..12)
        .map(|index| ExamplePrimitive::Rectangle {
            x: 92.0 + (index % 6) as f32 * 96.0,
            y: 112.0 + (index / 6) as f32 * 96.0,
            width: 68.0,
            height: 68.0,
        })
        .collect();
    ExampleScene::new("batchloading", "Batch loading").with_primitives(primitives)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_scene() {
        assert_eq!(create_scene().id, "batchloading");
    }
}
