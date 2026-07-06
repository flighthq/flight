//! Host-neutral Rust approximation of the `nyancat` example.
//!
//! The TypeScript example loads `nyancat.png` and plays it as a spritesheet
//! MovieClip on a 220x220 black canvas. The example model here has no bitmap,
//! spritesheet, or animation primitive, and it paints every primitive with a
//! single shared fill colour, so the animated multi-colour sprite cannot be
//! reproduced. This builds the closest honest structural stand-in: the 220x220
//! black stage of the original, with a single-colour Nyan-cat silhouette — the
//! rainbow trail, the pop-tart body, the head with ears, legs, and tail — laid
//! out where the sprite would sit.

use example_common::{ExamplePrimitive, ExampleScene};

pub const ID: &str = "nyancat";
pub const TITLE: &str = "Nyan cat";
pub const WIDTH: u32 = 220;
pub const HEIGHT: u32 = 220;
pub const BACKGROUND: u32 = 0x00_00_00_ff;
pub const FILL: u32 = 0xff_99_cc_ff;

pub fn create_scene() -> ExampleScene {
    ExampleScene::new(ID, TITLE)
        .with_size(WIDTH, HEIGHT)
        .with_background(BACKGROUND)
        .with_fill(FILL)
        .with_primitives(nyancat_primitives())
}

fn nyancat_primitives() -> Vec<ExamplePrimitive> {
    let mut primitives = Vec::new();

    // Rainbow trail on the left: six horizontal stripes with gaps so the bands
    // still read as stripes under a single fill colour.
    for index in 0..6 {
        primitives.push(ExamplePrimitive::Rectangle {
            x: 6.0,
            y: 78.0 + index as f32 * 12.0,
            width: 88.0,
            height: 8.0,
        });
    }

    // Pop-tart body.
    primitives.push(ExamplePrimitive::RoundRectangle {
        x: 96.0,
        y: 82.0,
        width: 72.0,
        height: 62.0,
        radius: 8.0,
    });

    // Tail trailing off the back (left) of the body.
    primitives.push(ExamplePrimitive::Rectangle {
        x: 84.0,
        y: 106.0,
        width: 16.0,
        height: 8.0,
    });

    // Four legs beneath the body.
    for index in 0..4 {
        primitives.push(ExamplePrimitive::Rectangle {
            x: 104.0 + index as f32 * 16.0,
            y: 144.0,
            width: 9.0,
            height: 12.0,
        });
    }

    // Cat head at the front (right) of the body.
    primitives.push(ExamplePrimitive::Circle {
        x: 176.0,
        y: 108.0,
        radius: 26.0,
    });

    // Two triangular ears atop the head.
    primitives.push(ExamplePrimitive::Polygon {
        points: vec![(160.0, 88.0), (172.0, 88.0), (160.0, 74.0)],
    });
    primitives.push(ExamplePrimitive::Polygon {
        points: vec![(180.0, 88.0), (192.0, 88.0), (192.0, 74.0)],
    });

    primitives
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_scene() {
        assert_eq!(create_scene().id, "nyancat");
    }
}
