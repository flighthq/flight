use example_common::{ExamplePrimitive, ExampleScene};

pub fn create_scene() -> ExampleScene {
    let mut primitives = Vec::new();
    for y in 0..8 {
        for x in 0..8 {
            if (x + y) % 2 == 0 {
                primitives.push(ExamplePrimitive::Rectangle {
                    x: 180.0 + x as f32 * 24.0,
                    y: 104.0 + y as f32 * 24.0,
                    width: 24.0,
                    height: 24.0,
                });
                primitives.push(ExamplePrimitive::Rectangle {
                    x: 428.0 + x as f32 * 24.0,
                    y: 104.0 + y as f32 * 24.0,
                    width: 24.0,
                    height: 24.0,
                });
            }
        }
    }
    ExampleScene::new("comparebitmapdata", "Compare bitmap data").with_primitives(primitives)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_scene() {
        assert_eq!(create_scene().id, "comparebitmapdata");
    }
}
