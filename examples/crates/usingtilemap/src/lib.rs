use example_common::{ExamplePrimitive, ExampleScene};

pub fn create_scene() -> ExampleScene {
    let mut primitives = Vec::new();
    for y in 0..7 {
        for x in 0..12 {
            if y == 6 || x == 0 || x == 11 || (x + y) % 3 == 0 {
                primitives.push(ExamplePrimitive::Rectangle {
                    x: 88.0 + x as f32 * 52.0,
                    y: 42.0 + y as f32 * 44.0,
                    width: 50.0,
                    height: 42.0,
                });
            }
        }
    }
    ExampleScene::new("usingtilemap", "Using tilemap").with_primitives(primitives)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_scene() {
        assert_eq!(create_scene().id, "usingtilemap");
    }
}
