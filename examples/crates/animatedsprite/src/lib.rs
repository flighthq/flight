use example_common::{ExamplePrimitive, ExampleScene};

pub fn create_scene() -> ExampleScene {
    let primitives = (0..6)
        .map(|index| ExamplePrimitive::RoundRectangle {
            x: 150.0 + index as f32 * 72.0,
            y: 150.0,
            width: 48.0,
            height: 72.0,
            radius: 8.0,
        })
        .collect();
    ExampleScene::new("animatedsprite", "Animated sprite").with_primitives(primitives)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_scene() {
        assert_eq!(create_scene().id, "animatedsprite");
    }
}
