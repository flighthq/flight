use example_common::{ExamplePrimitive, ExampleScene};

pub fn create_scene() -> ExampleScene {
    ExampleScene::new("playingvideo", "Playing video").with_primitives(vec![
        ExamplePrimitive::RoundRectangle {
            x: 200.0,
            y: 70.0,
            width: 400.0,
            height: 260.0,
            radius: 16.0,
        },
        ExamplePrimitive::Polygon {
            points: vec![(360.0, 150.0), (360.0, 250.0), (455.0, 200.0)],
        },
    ])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_scene() {
        assert_eq!(create_scene().id, "playingvideo");
    }
}
