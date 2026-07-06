//! Host-neutral Rust implementation of the `addingtext` example.
//!
//! The TypeScript example draws a single text label — `Hello World`, size 30,
//! color `0x7a0026` — at (50, 50) on a 400x200 white canvas. The scene fill
//! carries the text color, since `ExamplePrimitive::Text` has no per-primitive
//! color of its own.

use example_common::{ExamplePrimitive, ExampleScene};

pub fn create_scene() -> ExampleScene {
    ExampleScene::new("addingtext", "Adding text")
        .with_size(400, 200)
        .with_background(0xff_ff_ff_ff)
        .with_fill(0x7a_00_26_ff)
        .with_primitives(vec![ExamplePrimitive::Text {
            x: 50.0,
            y: 50.0,
            value: "Hello World",
            size: 30.0,
        }])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_scene() {
        assert_eq!(create_scene().id, "addingtext");
    }
}
