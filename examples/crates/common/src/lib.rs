use flighthq_displayobject::{DisplayObjectArena, get_display_object_local_content_revision};
use flighthq_node::NodeId;
use flighthq_shape::{
    append_shape_begin_fill, append_shape_circle, append_shape_ellipse, append_shape_end_fill,
    append_shape_line_to, append_shape_move_to, append_shape_rectangle,
    append_shape_round_rectangle, create_shape, get_shape_fill_regions,
};
use flighthq_types::ShapeFillRegion;

#[derive(Clone, Debug, PartialEq)]
pub enum ExamplePrimitive {
    Rectangle {
        x: f32,
        y: f32,
        width: f32,
        height: f32,
    },
    Circle {
        x: f32,
        y: f32,
        radius: f32,
    },
    Ellipse {
        x: f32,
        y: f32,
        width: f32,
        height: f32,
    },
    RoundRectangle {
        x: f32,
        y: f32,
        width: f32,
        height: f32,
        radius: f32,
    },
    Polygon {
        points: Vec<(f32, f32)>,
    },
    Text {
        x: f32,
        y: f32,
        value: &'static str,
        size: f32,
    },
}

#[derive(Clone, Debug, PartialEq)]
pub enum ExampleSceneBehavior {
    Static,
    BunnyMark {
        image_path: &'static str,
        initial_count: usize,
        add_count: usize,
        gravity: f32,
    },
}

#[derive(Clone, Debug, PartialEq)]
pub struct ExampleScene {
    pub id: &'static str,
    pub title: &'static str,
    pub width: u32,
    pub height: u32,
    pub background: u32,
    pub behavior: ExampleSceneBehavior,
    pub fill: u32,
    pub primitives: Vec<ExamplePrimitive>,
}

impl ExampleScene {
    pub fn new(id: &'static str, title: &'static str) -> Self {
        Self {
            id,
            title,
            width: 800,
            height: 400,
            background: 0xff_ff_ff_ff,
            behavior: ExampleSceneBehavior::Static,
            fill: 0x24_af_c4_ff,
            primitives: Vec::new(),
        }
    }

    pub fn with_size(mut self, width: u32, height: u32) -> Self {
        self.width = width;
        self.height = height;
        self
    }

    pub fn with_background(mut self, background: u32) -> Self {
        self.background = background;
        self
    }

    pub fn with_behavior(mut self, behavior: ExampleSceneBehavior) -> Self {
        self.behavior = behavior;
        self
    }

    pub fn with_fill(mut self, fill: u32) -> Self {
        self.fill = fill;
        self
    }

    pub fn with_primitives(mut self, primitives: Vec<ExamplePrimitive>) -> Self {
        self.primitives = primitives;
        self
    }
}

pub fn polygon(x: f32, y: f32, radius: f32, sides: u32) -> ExamplePrimitive {
    let step = std::f32::consts::TAU / sides as f32;
    let start = std::f32::consts::FRAC_PI_2;
    let points = (0..sides)
        .map(|index| {
            let angle = start + step * index as f32;
            (angle.cos() * radius + x, -angle.sin() * radius + y)
        })
        .collect();
    ExamplePrimitive::Polygon { points }
}

/// Builds the filled-shape regions for an example scene: every primitive appended
/// to one shape under the scene fill, returned with the shape's content revision.
/// Backend-neutral — the wgpu, gl, and skia example render paths all consume this
/// so the shape geometry is defined once regardless of renderer.
pub fn build_example_shape_regions(scene: &ExampleScene) -> (Vec<ShapeFillRegion>, u32) {
    let mut arena = DisplayObjectArena::default();
    let shape = create_shape(&mut arena);
    append_shape_begin_fill(&mut arena, shape, scene.fill, 1.0);
    for primitive in &scene.primitives {
        append_example_primitive(&mut arena, shape, primitive);
    }
    append_shape_end_fill(&mut arena, shape);
    (
        get_shape_fill_regions(&arena, shape).unwrap_or_default(),
        get_display_object_local_content_revision(&arena, shape),
    )
}

fn append_example_primitive(
    arena: &mut DisplayObjectArena,
    shape: NodeId,
    primitive: &ExamplePrimitive,
) {
    match primitive {
        ExamplePrimitive::Rectangle {
            x,
            y,
            width,
            height,
        } => append_shape_rectangle(arena, shape, *x, *y, *width, *height),
        ExamplePrimitive::Circle { x, y, radius } => {
            append_shape_circle(arena, shape, *x, *y, *radius)
        }
        ExamplePrimitive::Ellipse {
            x,
            y,
            width,
            height,
        } => append_shape_ellipse(arena, shape, *x, *y, *width, *height),
        ExamplePrimitive::RoundRectangle {
            x,
            y,
            width,
            height,
            radius,
        } => append_shape_round_rectangle(
            arena,
            shape,
            *x,
            *y,
            *width,
            *height,
            radius * 2.0,
            radius * 2.0,
        ),
        ExamplePrimitive::Polygon { points } => {
            let Some(&(start_x, start_y)) = points.first() else {
                return;
            };
            append_shape_move_to(arena, shape, start_x, start_y);
            for &(x, y) in &points[1..] {
                append_shape_line_to(arena, shape, x, y);
            }
            append_shape_line_to(arena, shape, start_x, start_y);
        }
        ExamplePrimitive::Text { .. } => {}
    }
}
