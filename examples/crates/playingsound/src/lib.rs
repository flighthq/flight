use example_common::{ExamplePrimitive, ExampleScene};

pub fn create_scene() -> ExampleScene {
    let primitives = (0..24)
        .map(|index| {
            let height = 24.0 + (index % 7) as f32 * 18.0;
            ExamplePrimitive::Rectangle {
                x: 104.0 + index as f32 * 24.0,
                y: 240.0 - height,
                width: 14.0,
                height,
            }
        })
        .collect();
    ExampleScene::new("playingsound", "Playing sound").with_primitives(primitives)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_scene() {
        assert_eq!(create_scene().id, "playingsound");
    }
}
