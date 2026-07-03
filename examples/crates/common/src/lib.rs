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
pub struct ExampleScene {
    pub id: &'static str,
    pub title: &'static str,
    pub width: u32,
    pub height: u32,
    pub background: u32,
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
