use example_common::{ExamplePrimitive, ExampleScene};

pub fn create_scene() -> ExampleScene {
    let mut primitives = Vec::new();
    for y in 0..5 {
        for x in 0..10 {
            if y == 4 || x == 0 || x == 9 || (x + y) % 4 == 0 {
                primitives.push(ExamplePrimitive::Rectangle {
                    x: 120.0 + x as f32 * 56.0,
                    y: 72.0 + y as f32 * 56.0,
                    width: 52.0,
                    height: 52.0,
                });
            }
        }
    }
    primitives.push(ExamplePrimitive::Circle {
        x: 344.0,
        y: 184.0,
        radius: 24.0,
    });
    ExampleScene::new("piratepig", "Pirate pig").with_primitives(primitives)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_scene() {
        assert_eq!(create_scene().id, "piratepig");
    }
}
