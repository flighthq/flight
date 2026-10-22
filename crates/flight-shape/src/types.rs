//! Shape-owned declarations (TS `Shape.ts`, `ShapeCommand.ts`, `ShapeBounds.ts`, `MorphShape.ts`,
//! `Scale9Shape.ts`): the heterogeneous retained command stream, the open shape node families and
//! their typed kind data, paint/morph bindings, and the caller-owned bounds registry state.

macro_rules! impl_shape_command_stream {
    ($t:ty) => {
        impl Node2DShapeCommandStream for $t {
            fn len(&self) -> usize {
                return self.commands.len();
            }

            fn key_at(&self, index: usize) -> Option<&str> {
                return self.commands.get(index)?.as_str();
            }

            fn arg_count_at(&self, index: usize) -> f64 {
                return match self.commands.get(index).and_then(|token| token.as_number()) {
                    Some(value) => value,
                    None => f64::NAN,
                };
            }

            fn arg_at(&self, index: usize) -> Option<&dyn Any> {
                return self.commands.get(index).map(|token| token.as_any());
            }
        }
    };
}

macro_rules! impl_shape_node2d {
    ($t:ty, $runtime:ident) => {
        flight_scene2d::impl_node2d!($t, custom_node2d);

        impl flight_scene2d::contract::Node2D for $t {
            fn node2d_fields(&self) -> &Node2DFields {
                return &self.node;
            }

            fn node2d_fields_mut(&mut self) -> &mut Node2DFields {
                return &mut self.node;
            }

            fn shape_command_stream(&self) -> Option<&dyn Node2DShapeCommandStream> {
                return Some(&self.data);
            }
        }
    };
}

macro_rules! impl_shape_node {
    ($t:ty) => {
        impl ShapeNode for $t {
            fn shape_commands(&self) -> &Vec<ShapeCommandToken> {
                return &self.data.commands;
            }

            fn shape_commands_mut(&mut self) -> &mut Vec<ShapeCommandToken> {
                return &mut self.data.commands;
            }

            fn shape_bounds_state(&self) -> ShapeBoundsStateRef {
                return self.data.bounds_state.clone();
            }

            fn shape_runtime(&self) -> ShapeRuntimeRef {
                return self.shape_runtime.clone();
            }
        }
    };
}

use std::sync::Arc;

use flight_entity::{EntityRuntimeSlot, Ref};

use flight_geometry::Matrix;

use flight_node::Node;

use flight_path::{Path, PathMorph, PathWinding};

use flight_scene2d::contract::{Node2DFields, Node2DShapeCommandStream};

use flight_texture::contract::Texture;

// flight-lint: allow-file(f64) D1: shape command tokens, path geometry and morph progress use the canonical f64 Path lane; matrices stay f32
// flight-lint: allow-file(contract-vocabulary, sugar-delegates) D16 structural shape family accessors preserve the open kinds and are contract dispatch, not convenience methods
use std::any::Any;

/// Line caps for shape strokes (TS `CapsStyle`), a closed union.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CapsStyle {
    None,
    Round,
    Square,
}

/// Gradient kinds (TS `GradientType`), a closed union.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GradientType {
    Linear,
    Radial,
}

/// Gradient interpolation spaces (TS `InterpolationMethod`), a closed union.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum InterpolationMethod {
    LinearRgb,
    Rgb,
}

/// Line joins for shape strokes (TS `JointStyle`), a closed union.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum JointStyle {
    Bevel,
    Miter,
    Round,
}

/// Line scale modes (TS `LineScaleMode`), a closed union.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LineScaleMode {
    Horizontal,
    None,
    Normal,
    Vertical,
}

/// Gradient spread modes (TS `SpreadMethod`), a closed union.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SpreadMethod {
    Pad,
    Reflect,
    Repeat,
}

/// Triangle culling modes recorded by `drawTriangles` (TS `TriangleCulling`), a closed union.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TriangleCulling {
    Negative,
    None,
    Positive,
}

/// Shape bounds modes (TS `ShapeBoundsMode`), a closed union.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ShapeBoundsMode {
    Fill,
    Ink,
}

/// The named payload of a `ShapeCommandToken::Numbers` slot (D2: a non-struct payload is wrapped).
#[derive(Clone, Debug, PartialEq)]
pub struct ShapeCommandNumbers {
    pub values: Vec<f64>,
}

/// One slot of the flat heterogeneous command buffer (TS `ShapeCommandToken`). Numbers are f64
/// because the tokens carry path-space coordinates consumed by the canonical f64 Path lane and by
/// morph/gradient interpolation; matrices remain the canonical f32 geometry record.
#[derive(Clone, Debug)]
pub enum ShapeCommandToken {
    Boolean(bool),
    Matrix(Matrix),
    Null,
    Number(f64),
    Numbers(ShapeCommandNumbers),
    String(String),
    Texture(Ref<Texture>),
}

/// A read view over a shape data record's command stream, implementing the scene2d structural hook.
/// The fields every shape kind's data carries (TS `ShapeData`): the retained command stream.
pub struct ShapeData {
    runtime: EntityRuntimeSlot,
    pub commands: Vec<ShapeCommandToken>,
    pub bounds_state: ShapeBoundsStateRef,
}

/// The kind runtime extra every shape carries (TS `ShapeRuntime`): the bounds-registry revision the
/// cached local bounds were computed under (`-1` when none) and the caller-owned registry state.
pub struct ShapeRuntime {
    pub shape_bounds_command_registry_revision: i64,
    pub bounds_state: ShapeBoundsStateRef,
}

/// A shared shape runtime extra (the kind struct holds it; bounds reads stamp it while the node may
/// only be read-borrowed).
pub type ShapeRuntimeRef = Ref<ShapeRuntime>;

/// A plain vector shape (TS `Shape`): the 2D node fields composed with the shape kind data.
pub struct Shape {
    node: Node2DFields,
    pub data: ShapeData,
    pub(crate) shape_runtime: ShapeRuntimeRef,
}

/// Morph shape kind data (TS `MorphShapeData`): the command stream plus the retained path/paint
/// morph bindings and the unclamped interpolation progress.
pub struct MorphShapeData {
    runtime: EntityRuntimeSlot,
    pub commands: Vec<ShapeCommandToken>,
    pub morph: Ref<PathMorph>,
    pub paint_bindings: Vec<MorphShapePaintBinding>,
    pub path: Ref<Path>,
    pub path_bindings: Vec<MorphShapePathBinding>,
    pub progress: f64,
    pub bounds_state: ShapeBoundsStateRef,
}

/// One retained path binding: the prepared morph and the live sampled path.
#[derive(Clone)]
pub struct MorphShapePathBinding {
    pub command_index: usize,
    pub morph: Ref<PathMorph>,
    pub path: Ref<Path>,
}

/// A color paint endpoint (TS `MorphShapeColorEndpoint`): packed RGBA plus optional alpha.
#[derive(Clone, Debug, PartialEq)]
pub struct MorphShapeColorEndpoint {
    pub alpha: Option<f32>,
    pub color: u32,
}

/// A gradient paint endpoint (TS `MorphShapeGradientEndpoint`).
#[derive(Clone, Debug, PartialEq)]
pub struct MorphShapeGradientEndpoint {
    pub alphas: Vec<f64>,
    pub colors: Vec<u32>,
    pub focal_point_ratio: Option<f64>,
    pub matrix: Option<Matrix>,
    pub ratios: Vec<f64>,
}

/// A line paint endpoint (TS `MorphShapeLineEndpoint`).
#[derive(Clone, Debug, PartialEq)]
pub struct MorphShapeLineEndpoint {
    pub alpha: Option<f32>,
    pub color: u32,
    pub thickness: f64,
}

/// A retained solid-color paint binding (TS `MorphShapeColorPaintBinding`).
#[derive(Clone, Debug, PartialEq)]
pub struct MorphShapeColorPaintBinding {
    pub command_index: usize,
    pub end_alpha: f32,
    pub end_color: u32,
    pub start_alpha: f32,
    pub start_color: u32,
}

/// A retained gradient paint binding (TS `MorphShapeGradientPaintBinding`).
#[derive(Clone, Debug, PartialEq)]
pub struct MorphShapeGradientPaintBinding {
    pub command_index: usize,
    pub command_key: String,
    pub end_alphas: Vec<f64>,
    pub end_colors: Vec<u32>,
    pub end_focal_point_ratio: f64,
    pub end_matrix: Option<Matrix>,
    pub end_ratios: Vec<f64>,
    pub start_alphas: Vec<f64>,
    pub start_colors: Vec<u32>,
    pub start_focal_point_ratio: f64,
    pub start_matrix: Option<Matrix>,
    pub start_ratios: Vec<f64>,
}

/// A retained line paint binding (TS `MorphShapeLinePaintBinding`).
#[derive(Clone, Debug, PartialEq)]
pub struct MorphShapeLinePaintBinding {
    pub command_index: usize,
    pub end_alpha: f32,
    pub end_color: u32,
    pub end_thickness: f64,
    pub start_alpha: f32,
    pub start_color: u32,
    pub start_thickness: f64,
}

/// A retained texture paint binding (TS `MorphShapeTexturePaintBinding`).
#[derive(Clone, Debug, PartialEq)]
pub struct MorphShapeTexturePaintBinding {
    pub command_index: usize,
    pub command_key: String,
    pub end_matrix: Matrix,
    pub start_matrix: Matrix,
}

/// A retained paint binding (TS `MorphShapePaintBinding`, a closed union).
#[derive(Clone, Debug, PartialEq)]
pub enum MorphShapePaintBinding {
    Color(MorphShapeColorPaintBinding),
    Gradient(MorphShapeGradientPaintBinding),
    Line(MorphShapeLinePaintBinding),
    Texture(MorphShapeTexturePaintBinding),
}

/// A morph shape (TS `MorphShape`): a shape whose retained path and paint values are sampled.
pub struct MorphShape {
    node: Node2DFields,
    pub data: MorphShapeData,
    pub(crate) shape_runtime: ShapeRuntimeRef,
}

/// Scale9 shape kind data (TS `Scale9ShapeData`): the command stream and the nine-slice grid.
pub struct Scale9ShapeData {
    runtime: EntityRuntimeSlot,
    pub commands: Vec<ShapeCommandToken>,
    pub scale9_grid: ShapeScale9Grid,
    pub bounds_state: ShapeBoundsStateRef,
}

/// A scale9 shape (TS `Scale9Shape`).
pub struct Scale9Shape {
    node: Node2DFields,
    pub data: Scale9ShapeData,
    pub(crate) shape_runtime: ShapeRuntimeRef,
}

/// The nine-slice grid rectangle (TS `RectangleLike`), a plain record.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct ShapeScale9Grid {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

/// Maps a coordinate through a nine-slice grid (TS `Scale9Mapper`).
pub type Scale9Mapper = Arc<dyn Fn(f32) -> f32 + Send + Sync>;

/// Maps both axes of a nine-slice grid (TS `Scale9Mapper`'s mapX/mapY pair).
pub struct ShapeScale9Mapper {
    pub map_x: Scale9Mapper,
    pub map_y: Scale9Mapper,
}

/// The bounds-contribution cursor (TS `ShapeCommandArgumentCursor`).
pub trait ShapeCommandArgumentCursor {
    /// The number of arguments the current command carries.
    fn length(&self) -> usize;
    /// The argument at `relative_index`, or `None` outside the command's arguments.
    fn get_argument(&self, relative_index: usize) -> Option<&ShapeCommandToken>;
}

/// The stateful pen a bounds contribution draws into (TS `ShapeBoundsContext`).
pub trait ShapeBoundsContext {
    fn close_path(&mut self);
    fn cubic_curve_to(
        &mut self,
        control_x1: f64,
        control_y1: f64,
        control_x2: f64,
        control_y2: f64,
        x: f64,
        y: f64,
    );
    fn draw_circle(&mut self, center_x: f64, center_y: f64, radius: f64);
    fn draw_ellipse(&mut self, center_x: f64, center_y: f64, radius_x: f64, radius_y: f64);
    fn draw_rectangle(&mut self, x: f64, y: f64, width: f64, height: f64);
    fn draw_rounded_rectangle(&mut self, x: f64, y: f64, width: f64, height: f64, radius: f64);
    fn expand_point(&mut self, x: f64, y: f64);
    fn flush_path(&mut self);
    fn line_to(&mut self, x: f64, y: f64);
    fn move_to(&mut self, x: f64, y: f64);
    fn quadratic_curve_to(&mut self, control_x: f64, control_y: f64, x: f64, y: f64);
    fn set_stroke_style(
        &mut self,
        width: f64,
        caps: CapsStyle,
        joints: JointStyle,
        miter_limit: f64,
    );
}

/// One bounds contribution for a command key (TS `ShapeBoundsCommandHandler`).
pub type ShapeBoundsCommandHandler =
    Arc<dyn Fn(&mut dyn ShapeBoundsContext, &dyn ShapeCommandArgumentCursor) + Send + Sync>;

/// A registered bounds contribution (TS `ShapeBoundsCommand`): both modes are explicit; `None`
/// means the command contributes no geometry in that mode.
#[derive(Clone)]
pub struct ShapeBoundsCommand {
    pub fill_bounds: Option<ShapeBoundsCommandHandler>,
    pub key: String,
    pub stroke_bounds: Option<ShapeBoundsCommandHandler>,
}

/// Missing-command diagnostics from a bounds traversal (TS `ShapeBoundsExplanation`).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ShapeBoundsExplanation {
    pub complete: bool,
    pub missing_command_keys: Vec<String>,
    pub mode: ShapeBoundsMode,
}

/// The opt-in missing-command guard (TS `ShapeBoundsGuard`).
pub type ShapeBoundsGuard = Arc<dyn Fn(&dyn Node, ShapeBoundsMode, &str) + Send + Sync>;

/// Caller-owned bounds registry and guard state (D5 replacement for the source's module globals).
#[derive(Default)]
pub struct ShapeBoundsState {
    pub(crate) commands: Vec<(String, ShapeBoundsCommand)>,
    /// Stable per-state default handler records, so re-registering the defaults compares equal.
    pub(crate) defaults: Option<Vec<ShapeBoundsCommand>>,
    pub(crate) guard: Option<ShapeBoundsGuard>,
    pub(crate) revision: u32,
}

/// A shared caller-owned bounds state, so shapes, registries and guards see one registry.
pub type ShapeBoundsStateRef = Ref<ShapeBoundsState>;

/// One solid-color filled region (TS `ShapeFillRegion`).
#[derive(Clone)]
pub struct ShapeFillRegion {
    pub alpha: f32,
    pub color: u32,
    pub path: Ref<Path>,
}

/// One solid-color stroke region: the authored centerline plus its style (TS `ShapeStrokeRegion`).
#[derive(Clone)]
pub struct ShapeStrokeRegion {
    pub alpha: f32,
    pub color: u32,
    pub path: Ref<Path>,
    pub style: flight_path::StrokeStyle,
}

/// The tessellation answer (TS `ShapeTessellationExplanation`), closed status/blocker tables.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ShapeTessellationBlockedBy {
    NonSolidFill,
    NonSolidStroke,
    None,
    StrokeOutline,
}

/// The tessellation status (TS `ShapeTessellationStatus`), a closed union.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ShapeTessellationStatus {
    NeedsRasterizer,
    Tessellates,
}

/// The tessellation explanation record.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ShapeTessellationExplanation {
    pub blocked_by: ShapeTessellationBlockedBy,
    pub status: ShapeTessellationStatus,
}

/// Gradient endpoint issues (TS `MorphShapeGradientEndpointReason`), a closed table.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MorphShapeGradientEndpointReason {
    EmptyGradient,
    EndStopComponentCountMismatch,
    Ok,
    StartStopComponentCountMismatch,
    StopCountMismatch,
}

/// The gradient endpoint explanation record.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct MorphShapeGradientEndpointExplanation {
    pub end_stop_count: usize,
    pub reason: MorphShapeGradientEndpointReason,
    pub start_stop_count: usize,
    pub supported: bool,
}

/// The opaque animation target that drives one morph shape's progress (TS
/// `MorphShapeAnimationTarget`). The animation channel stores this descriptor's identity.
pub struct MorphShapeAnimationTarget {
    runtime: EntityRuntimeSlot,
    pub shape: Ref<MorphShape>,
}

/// Any shape node (TS `Shape` as a structural contract): the retained command stream plus the
/// caller-owned bounds state and runtime extra every built-in kind composes.
pub trait ShapeNode: flight_scene2d::contract::Node2D + Sized {
    fn shape_commands(&self) -> &Vec<ShapeCommandToken>;
    fn shape_commands_mut(&mut self) -> &mut Vec<ShapeCommandToken>;
    fn shape_bounds_state(&self) -> ShapeBoundsStateRef;
    fn shape_runtime(&self) -> ShapeRuntimeRef;
    fn clear_shape_paint_bindings(&mut self) {}
}

/// The plain shape kind (TS `ShapeKind`).
pub const SHAPE_KIND: &str = "Shape";

/// The morph shape kind (TS `MorphShapeKind`).
pub const MORPH_SHAPE_KIND: &str = "MorphShape";

/// The nine-slice shape kind (TS `Scale9ShapeKind`).
pub const SCALE9_SHAPE_KIND: &str = "Scale9Shape";

pub(crate) fn as_morph_shape(node: &dyn Node) -> Option<&MorphShape> {
    return node.as_any().downcast_ref::<MorphShape>();
}

pub(crate) fn as_scale9_shape(node: &dyn Node) -> Option<&Scale9Shape> {
    return node.as_any().downcast_ref::<Scale9Shape>();
}

/// The shape a node is, when it is any built-in shape kind (the Rust analogue of the source's
/// structural casts on `Shape`).
pub(crate) fn as_shape(node: &dyn Node) -> Option<&Shape> {
    return node.as_any().downcast_ref::<Shape>();
}

pub(crate) fn new_shape_bounds_state() -> ShapeBoundsStateRef {
    return Arc::new(std::sync::RwLock::new(ShapeBoundsState::default()));
}

pub(crate) fn number(value: f64) -> ShapeCommandToken {
    return ShapeCommandToken::Number(value);
}

pub(crate) fn numbers(values: &[f64]) -> ShapeCommandToken {
    return ShapeCommandToken::Numbers(ShapeCommandNumbers {
        values: values.to_vec(),
    });
}

pub(crate) fn parse_winding(value: &str) -> PathWinding {
    return match value {
        "evenOdd" => PathWinding::EvenOdd,
        _ => PathWinding::NonZero,
    };
}

/// The caller-owned bounds state of any built-in shape kind.
pub(crate) fn shape_bounds_state_of(node: &dyn Node) -> Option<ShapeBoundsStateRef> {
    if let Some(shape) = as_shape(node) {
        return Some(shape.data.bounds_state.clone());
    }
    if let Some(shape) = as_morph_shape(node) {
        return Some(shape.data.bounds_state.clone());
    }
    if let Some(shape) = as_scale9_shape(node) {
        return Some(shape.data.bounds_state.clone());
    }
    return None;
}

/// The command stream of any built-in shape kind.
pub(crate) fn shape_commands(node: &dyn Node) -> Option<&Vec<ShapeCommandToken>> {
    if let Some(shape) = as_shape(node) {
        return Some(&shape.data.commands);
    }
    if let Some(shape) = as_morph_shape(node) {
        return Some(&shape.data.commands);
    }
    if let Some(shape) = as_scale9_shape(node) {
        return Some(&shape.data.commands);
    }
    return None;
}

pub(crate) fn shape_runtime_of(node: &dyn Node) -> Option<ShapeRuntimeRef> {
    if let Some(shape) = as_shape(node) {
        return Some(shape.shape_runtime.clone());
    }
    if let Some(shape) = as_morph_shape(node) {
        return Some(shape.shape_runtime.clone());
    }
    if let Some(shape) = as_scale9_shape(node) {
        return Some(shape.shape_runtime.clone());
    }
    return None;
}

pub(crate) fn string(value: &str) -> ShapeCommandToken {
    return ShapeCommandToken::String(String::from(value));
}

pub(crate) fn winding(value: PathWinding) -> ShapeCommandToken {
    return string(match value {
        PathWinding::EvenOdd => "evenOdd",
        PathWinding::NonZero => "nonZero",
    });
}

impl ShapeCommandToken {
    pub fn as_any(&self) -> &dyn Any {
        return self;
    }

    pub fn as_boolean(&self) -> Option<bool> {
        return match self {
            ShapeCommandToken::Boolean(value) => Some(*value),
            _ => None,
        };
    }

    pub fn as_matrix(&self) -> Option<&Matrix> {
        return match self {
            ShapeCommandToken::Matrix(value) => Some(value),
            _ => None,
        };
    }

    pub fn as_matrix_mut(&mut self) -> Option<&mut Matrix> {
        return match self {
            ShapeCommandToken::Matrix(value) => Some(value),
            _ => None,
        };
    }

    pub fn as_number(&self) -> Option<f64> {
        return match self {
            ShapeCommandToken::Number(value) => Some(*value),
            _ => None,
        };
    }

    pub fn as_numbers(&self) -> Option<&Vec<f64>> {
        return match self {
            ShapeCommandToken::Numbers(value) => Some(&value.values),
            _ => None,
        };
    }

    pub fn as_numbers_mut(&mut self) -> Option<&mut Vec<f64>> {
        return match self {
            ShapeCommandToken::Numbers(value) => Some(&mut value.values),
            _ => None,
        };
    }

    pub fn as_str(&self) -> Option<&str> {
        return match self {
            ShapeCommandToken::String(value) => Some(value.as_str()),
            _ => None,
        };
    }

    pub fn as_texture(&self) -> Option<&Ref<Texture>> {
        return match self {
            ShapeCommandToken::Texture(value) => Some(value),
            _ => None,
        };
    }

    pub fn is_null(&self) -> bool {
        return matches!(self, ShapeCommandToken::Null);
    }
}

impl MorphShapePaintBinding {
    pub fn command_index(&self) -> usize {
        return match self {
            MorphShapePaintBinding::Color(binding) => binding.command_index,
            MorphShapePaintBinding::Gradient(binding) => binding.command_index,
            MorphShapePaintBinding::Line(binding) => binding.command_index,
            MorphShapePaintBinding::Texture(binding) => binding.command_index,
        };
    }
}

flight_entity::impl_entity!(ShapeData);

flight_entity::impl_entity!(MorphShapeData);

flight_entity::impl_entity!(Scale9ShapeData);

flight_entity::impl_entity!(MorphShapeAnimationTarget);

impl_shape_command_stream!(ShapeData);
impl_shape_command_stream!(MorphShapeData);
impl_shape_command_stream!(Scale9ShapeData);
impl_shape_node2d!(Shape, shape_runtime);
impl_shape_node2d!(MorphShape, shape_runtime);
impl_shape_node2d!(Scale9Shape, shape_runtime);
impl Default for ShapeData {
    fn default() -> Self {
        return ShapeData {
            runtime: EntityRuntimeSlot::default(),
            bounds_state: new_shape_bounds_state(),
            commands: Vec::new(),
        };
    }
}

impl Default for MorphShapeData {
    fn default() -> Self {
        return MorphShapeData {
            runtime: EntityRuntimeSlot::default(),
            bounds_state: new_shape_bounds_state(),
            commands: Vec::new(),
            morph: Arc::new(std::sync::RwLock::new(PathMorph::default())),
            paint_bindings: Vec::new(),
            path: Arc::new(std::sync::RwLock::new(Path::default())),
            path_bindings: Vec::new(),
            progress: 0.0,
        };
    }
}

impl Default for Scale9ShapeData {
    fn default() -> Self {
        return Scale9ShapeData {
            runtime: EntityRuntimeSlot::default(),
            bounds_state: new_shape_bounds_state(),
            commands: Vec::new(),
            scale9_grid: ShapeScale9Grid::default(),
        };
    }
}

impl Default for MorphShapeAnimationTarget {
    fn default() -> Self {
        return MorphShapeAnimationTarget {
            runtime: EntityRuntimeSlot::default(),
            shape: Arc::new(std::sync::RwLock::new(MorphShape::default())),
        };
    }
}

impl Default for Shape {
    fn default() -> Self {
        return Shape {
            node: Node2DFields::default(),
            data: ShapeData::default(),
            shape_runtime: Arc::new(std::sync::RwLock::new(ShapeRuntime {
                bounds_state: new_shape_bounds_state(),
                shape_bounds_command_registry_revision: -1,
            })),
        };
    }
}

impl Default for MorphShape {
    fn default() -> Self {
        return MorphShape {
            node: Node2DFields::default(),
            data: MorphShapeData::default(),
            shape_runtime: Arc::new(std::sync::RwLock::new(ShapeRuntime {
                bounds_state: new_shape_bounds_state(),
                shape_bounds_command_registry_revision: -1,
            })),
        };
    }
}

impl Default for Scale9Shape {
    fn default() -> Self {
        return Scale9Shape {
            node: Node2DFields::default(),
            data: Scale9ShapeData::default(),
            shape_runtime: Arc::new(std::sync::RwLock::new(ShapeRuntime {
                bounds_state: new_shape_bounds_state(),
                shape_bounds_command_registry_revision: -1,
            })),
        };
    }
}

impl_shape_node!(Shape);
impl_shape_node!(Scale9Shape);
impl ShapeNode for MorphShape {
    fn clear_shape_paint_bindings(&mut self) {
        self.data.paint_bindings.clear();
    }

    fn shape_bounds_state(&self) -> ShapeBoundsStateRef {
        return self.data.bounds_state.clone();
    }

    fn shape_commands(&self) -> &Vec<ShapeCommandToken> {
        return &self.data.commands;
    }

    fn shape_commands_mut(&mut self) -> &mut Vec<ShapeCommandToken> {
        return &mut self.data.commands;
    }

    fn shape_runtime(&self) -> ShapeRuntimeRef {
        return self.shape_runtime.clone();
    }
}
