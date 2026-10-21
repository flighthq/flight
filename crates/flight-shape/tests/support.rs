use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_geometry::Matrix;
use flight_geometry::create_matrix;
use flight_path::{
    Path, PathWinding, StrokeCap, StrokeJoin, StrokeStyle, create_path, create_path_morph,
};
use flight_scene2d::contract::PartialNode2D;
use flight_shape::contract::*;
use flight_texture::contract::{Texture, create_texture};

pub fn shape() -> Ref<Shape> {
    return create_shape(None);
}

pub fn morph() -> Ref<MorphShape> {
    let start: Path = create_path(Some(PathWinding::NonZero));
    let end: Path = create_path(Some(PathWinding::NonZero));
    let morph = create_path_morph(&start, &end).expect("morph");
    return create_morph_shape(&Arc::new(RwLock::new(morph)), None);
}

pub fn scale9_grid() -> ShapeScale9Grid {
    return ShapeScale9Grid {
        x: 1.0,
        y: 2.0,
        width: 9.0,
        height: 18.0,
    };
}

pub fn scale9() -> Ref<Scale9Shape> {
    return create_scale9_shape(&scale9_grid(), None);
}

pub fn texture() -> Ref<Texture> {
    return Arc::new(RwLock::new(create_texture(None)));
}

pub fn stroke_style() -> StrokeStyle {
    return StrokeStyle {
        width: 2.0,
        cap: StrokeCap::Round,
        join: StrokeJoin::Miter,
        miter_limit: 4.0,
        dash: Vec::new(),
        dash_offset: 0.0,
    };
}

pub fn number(value: f64) -> ShapeCommandToken {
    return ShapeCommandToken::Number(value);
}

pub fn numbers(values: &[f64]) -> ShapeCommandToken {
    return ShapeCommandToken::Numbers(ShapeCommandNumbers {
        values: values.to_vec(),
    });
}

pub fn string(value: &str) -> ShapeCommandToken {
    return ShapeCommandToken::String(String::from(value));
}

pub fn null_token() -> ShapeCommandToken {
    return ShapeCommandToken::Null;
}

pub struct Args {
    pub tokens: Vec<ShapeCommandToken>,
}

impl ShapeCommandArgumentCursor for Args {
    fn length(&self) -> usize {
        return self.tokens.len();
    }

    fn get_argument(&self, relative_index: usize) -> Option<&ShapeCommandToken> {
        return self.tokens.get(relative_index);
    }
}

pub fn args(tokens: Vec<ShapeCommandToken>) -> Args {
    return Args { tokens };
}

#[derive(Default)]
pub struct RecordingContext {
    pub circles: usize,
    pub closed: usize,
    pub curves: usize,
    pub ellipses: usize,
    pub expanded: usize,
    pub flushed: usize,
    pub lines: usize,
    pub moves: usize,
    pub rectangles: usize,
    pub styles: usize,
}

impl ShapeBoundsContext for RecordingContext {
    fn close_path(&mut self) {
        self.closed += 1;
    }

    fn cubic_curve_to(
        &mut self,
        _control_x1: f64,
        _control_y1: f64,
        _control_x2: f64,
        _control_y2: f64,
        _x: f64,
        _y: f64,
    ) {
        self.curves += 1;
    }

    fn draw_circle(&mut self, _center_x: f64, _center_y: f64, _radius: f64) {
        self.circles += 1;
    }

    fn draw_ellipse(&mut self, _center_x: f64, _center_y: f64, _radius_x: f64, _radius_y: f64) {
        self.ellipses += 1;
    }

    fn draw_rectangle(&mut self, _x: f64, _y: f64, _width: f64, _height: f64) {
        self.rectangles += 1;
    }

    fn draw_rounded_rectangle(
        &mut self,
        _x: f64,
        _y: f64,
        _width: f64,
        _height: f64,
        _radius: f64,
    ) {
        self.rectangles += 1;
    }

    fn expand_point(&mut self, _x: f64, _y: f64) {
        self.expanded += 1;
    }

    fn flush_path(&mut self) {
        self.flushed += 1;
    }

    fn line_to(&mut self, _x: f64, _y: f64) {
        self.lines += 1;
    }

    fn move_to(&mut self, _x: f64, _y: f64) {
        self.moves += 1;
    }

    fn quadratic_curve_to(&mut self, _control_x: f64, _control_y: f64, _x: f64, _y: f64) {
        self.curves += 1;
    }

    fn set_stroke_style(
        &mut self,
        _width: f64,
        _caps: CapsStyle,
        _joints: JointStyle,
        _miter_limit: f64,
    ) {
        self.styles += 1;
    }
}

pub fn recording() -> RecordingContext {
    return RecordingContext::default();
}

pub fn identity() -> Matrix {
    return create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
}

pub fn stream(parts: &[(&str, Vec<ShapeCommandToken>)]) -> Vec<ShapeCommandToken> {
    let mut out = Vec::new();
    for (name, values) in parts {
        out.push(string(name));
        out.push(number(values.len() as f64));
        out.extend(values.iter().cloned());
    }
    return out;
}

pub fn log_state() -> flight_log::LogStateRef {
    return Arc::new(RwLock::new(flight_log::create_log_state()));
}

pub fn tokens<T: ShapeNode + 'static>(shape: &Ref<T>) -> Vec<ShapeCommandToken> {
    return shape.read().unwrap().shape_commands().clone();
}

pub fn keys<T: ShapeNode + 'static>(shape: &Ref<T>) -> Vec<String> {
    let tokens = tokens(shape);
    let mut out = Vec::new();
    let mut index = 0;
    while index + 1 < tokens.len() {
        let ShapeCommandToken::String(key) = &tokens[index] else {
            break;
        };
        let ShapeCommandToken::Number(arg_count) = &tokens[index + 1] else {
            break;
        };
        out.push(key.clone());
        index += *arg_count as usize + 2;
    }
    return out;
}

pub fn expect_commands<T: ShapeNode + 'static>(shape: &Ref<T>, expected: &[ShapeCommandToken]) {
    assert_eq!(format!("{:?}", tokens(shape)), format!("{:?}", expected));
}

pub fn matrix(a: f32, b: f32, c: f32, d: f32, tx: f32, ty: f32) -> Matrix {
    return create_matrix(a, b, c, d, tx, ty);
}

pub fn number_at<T: ShapeNode + 'static>(shape: &Ref<T>, index: usize) -> f64 {
    match &tokens(shape)[index] {
        ShapeCommandToken::Number(value) => return *value,
        other => panic!("token {} is not a number: {:?}", index, other),
    }
}

pub fn token_texture(token: &ShapeCommandToken) -> Option<&Ref<Texture>> {
    return match token {
        ShapeCommandToken::Texture(texture) => Some(texture),
        _ => None,
    };
}

pub fn partial_node() -> PartialNode2D {
    return Default::default();
}

pub fn registered_shape(commands: Option<Vec<ShapeCommandToken>>) -> Ref<Shape> {
    let state = create_shape_bounds_state();
    register_default_shape_bounds_commands(&state);
    let partial = PartialShape {
        data: Some(PartialShapeData {
            bounds_state: Some(state),
            commands,
        }),
        node: partial_node(),
    };
    return create_shape(Some(&partial));
}

pub fn empty_rect() -> flight_geometry::Rectangle {
    return flight_geometry::create_rectangle(0.0, 0.0, 0.0, 0.0);
}

pub fn rect_values(rect: &flight_geometry::Rectangle) -> (f64, f64, f64, f64) {
    return (
        rect.x as f64,
        rect.y as f64,
        rect.width as f64,
        rect.height as f64,
    );
}
