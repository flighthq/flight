//! The backend-agnostic drawing input the harness builds a scene graph from.
//!
//! A [`HarnessShape`] is one filled shape node: a command list under a single
//! fill color, placed by a local transform. It is the neutral currency between a
//! caller's declarative scene form (the functional `Scene`, an `ExampleScene`,
//! …) and [`build_scene_graph`](crate::build_scene_graph): every caller lowers
//! its own scene type to `HarnessShape`s, and every render target consumes the
//! resulting graph identically. Commands mirror the OpenFL/`flighthq-shape`
//! drawing API; coordinates are in the shape's local space (the space the
//! [`transform`](HarnessShape::transform) places).

use flighthq_types::geometry::Matrix;

/// One command in a filled shape, mirroring the `flighthq-shape` drawing API.
/// Path commands (`MoveTo`/`LineTo`/`CurveTo`/`CubicCurveTo`) and whole-primitive
/// commands (`Rectangle`/`Circle`/`Ellipse`/`RoundRectangle`) may be mixed under
/// one fill.
#[derive(Copy, Clone, Debug)]
pub enum ShapeCommand {
    /// Start a new contour at `(x, y)`.
    MoveTo(f32, f32),
    /// Straight segment to `(x, y)`.
    LineTo(f32, f32),
    /// Quadratic curve through control `(cx, cy)` to anchor `(x, y)`.
    CurveTo(f32, f32, f32, f32),
    /// Cubic curve through controls `(c1x, c1y)`, `(c2x, c2y)` to anchor `(x, y)`.
    CubicCurveTo(f32, f32, f32, f32, f32, f32),
    /// Axis-aligned rectangle at `(x, y)` sized `w`×`h`.
    Rectangle(f32, f32, f32, f32),
    /// Circle centered at `(x, y)` with the given radius.
    Circle(f32, f32, f32),
    /// Axis-aligned ellipse at `(x, y)` sized `w`×`h`.
    Ellipse(f32, f32, f32, f32),
    /// Rounded rectangle at `(x, y)` sized `w`×`h` with corner diameters
    /// `(corner_w, corner_h)` (the `flighthq-shape` corner convention).
    RoundRectangle(f32, f32, f32, f32, f32, f32),
}

/// One filled shape node for the harness graph: the commands that define it, its
/// solid fill color (packed `0xRRGGBBAA`) and alpha, and the local transform that
/// places it under the stage. The graph builder emits one shape node per
/// `HarnessShape`, in order.
#[derive(Clone, Debug)]
pub struct HarnessShape {
    pub commands: Vec<ShapeCommand>,
    pub fill_color: u32,
    pub fill_alpha: f32,
    pub transform: Matrix,
}

impl HarnessShape {
    /// A shape with the given fill and an identity local transform.
    pub fn new(fill_color: u32, commands: Vec<ShapeCommand>) -> Self {
        Self {
            commands,
            fill_color,
            fill_alpha: 1.0,
            transform: Matrix::default(),
        }
    }

    /// Places the shape under the given local transform (rotation/translation
    /// about its origin), consuming and returning `self` for builder chaining.
    pub fn with_transform(mut self, transform: Matrix) -> Self {
        self.transform = transform;
        self
    }
}
