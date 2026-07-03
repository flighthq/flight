use example_common::{ExamplePrimitive, ExampleScene};

pub fn create_scene() -> ExampleScene {
    let mut primitives = Vec::new();
    for index in 0..6 {
        primitives.push(ExamplePrimitive::Rectangle {
            x: 80.0,
            y: 116.0 + index as f32 * 18.0,
            width: 440.0,
            height: 16.0,
        });
    }
    primitives.push(ExamplePrimitive::RoundRectangle {
        x: 500.0,
        y: 116.0,
        width: 140.0,
        height: 108.0,
        radius: 12.0,
    });
    ExampleScene::new("nyancat", "Nyan cat").with_primitives(primitives)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_scene() {
        assert_eq!(create_scene().id, "nyancat");
    }
}
