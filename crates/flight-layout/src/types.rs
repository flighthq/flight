use std::collections::HashMap;

// -- Layout resolution failure kinds --

#[derive(Clone, Copy, Debug, PartialEq)]
#[repr(u8)]
pub enum LayoutResolutionFailureKind {
    InvalidContainerStyle,
    InvalidHierarchy,
    InvalidItemStyle,
    IntrinsicSizesTooSmall,
    OutputTooSmall,
    UnregisteredKind,
}

// -- Layout kind constants --

pub const ANCHOR_LAYOUT_KIND: &str = "AnchorLayout";
pub const FLEX_LAYOUT_KIND: &str = "FlexLayout";
pub const GRID_LAYOUT_KIND: &str = "GridLayout";

// -- Viewport alignment --

#[derive(Clone, Copy, Debug, PartialEq)]
#[repr(u8)]
pub enum ViewportAlign {
    Bottom,
    BottomLeft,
    BottomRight,
    Left,
    Right,
    Top,
    TopLeft,
    TopRight,
}

// -- Anchor layout styles --

#[derive(Clone, Debug, Default)]
pub struct AnchorLayoutItemStyle {
    pub align: Option<ViewportAlign>,
    pub bottom: Option<f32>,
    pub height: Option<f32>,
    pub left: Option<f32>,
    pub right: Option<f32>,
    pub top: Option<f32>,
    pub width: Option<f32>,
}

// -- Flex layout types --

#[derive(Clone, Copy, Debug, PartialEq)]
#[repr(u8)]
pub enum FlexLayoutAlign {
    Center,
    End,
    Start,
    Stretch,
}

#[derive(Clone, Copy, Debug, PartialEq)]
#[repr(u8)]
pub enum FlexLayoutDirection {
    Column,
    ColumnReverse,
    Row,
    RowReverse,
}

#[derive(Clone, Copy, Debug, PartialEq)]
#[repr(u8)]
pub enum FlexLayoutJustify {
    Center,
    End,
    SpaceAround,
    SpaceBetween,
    SpaceEvenly,
    Start,
}

#[derive(Clone, Copy, Debug, PartialEq)]
#[repr(u8)]
pub enum FlexLayoutWrap {
    NoWrap,
    Wrap,
    WrapReverse,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum FlexAlignSelf {
    Auto,
    Align(FlexLayoutAlign),
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum FlexBasis {
    Auto,
    Fixed(f32),
}

#[derive(Clone, Debug, Default)]
pub struct FlexLayoutContainerStyle {
    pub align: Option<FlexLayoutAlign>,
    pub direction: Option<FlexLayoutDirection>,
    pub gap: Option<f32>,
    pub justify: Option<FlexLayoutJustify>,
    pub padding_bottom: Option<f32>,
    pub padding_left: Option<f32>,
    pub padding_right: Option<f32>,
    pub padding_top: Option<f32>,
    pub wrap: Option<FlexLayoutWrap>,
}

#[derive(Clone, Debug, Default)]
pub struct FlexLayoutItemStyle {
    pub align_self: Option<FlexAlignSelf>,
    pub basis: Option<FlexBasis>,
    pub grow: Option<f32>,
    pub shrink: Option<f32>,
}

// -- Grid layout types --

#[derive(Clone, Debug)]
pub enum GridLayoutTrack {
    Auto,
    Fixed { size: f32 },
    Fraction { fraction: f32 },
}

#[derive(Clone, Debug, Default)]
pub struct GridLayoutContainerStyle {
    pub column_gap: Option<f32>,
    pub columns: Vec<GridLayoutTrack>,
    pub padding_bottom: Option<f32>,
    pub padding_left: Option<f32>,
    pub padding_right: Option<f32>,
    pub padding_top: Option<f32>,
    pub row_gap: Option<f32>,
    pub rows: Vec<GridLayoutTrack>,
}

#[derive(Clone, Debug, Default)]
pub struct GridLayoutItemStyle {
    pub column: Option<i32>,
    pub column_span: Option<i32>,
    pub row: Option<i32>,
    pub row_span: Option<i32>,
}

// -- Style wrappers --

#[derive(Clone, Debug)]
pub enum ContainerStyle {
    None,
    Flex(FlexLayoutContainerStyle),
    Grid(GridLayoutContainerStyle),
    Invalid,
}

impl Default for ContainerStyle {
    fn default() -> Self {
        ContainerStyle::None
    }
}

#[derive(Clone, Debug)]
pub enum ItemStyle {
    None,
    Anchor(AnchorLayoutItemStyle),
    Flex(FlexLayoutItemStyle),
    Grid(GridLayoutItemStyle),
    Invalid,
}

impl Default for ItemStyle {
    fn default() -> Self {
        ItemStyle::None
    }
}

// -- Layout tree types --

#[derive(Clone, Debug)]
pub struct LayoutNode {
    pub container_style: ContainerStyle,
    pub item_style: ItemStyle,
    pub kind: String,
    pub parent_index: i32,
}

#[derive(Clone, Debug)]
pub struct LayoutTree {
    pub nodes: Vec<LayoutNode>,
}

// -- Layout resolver type --

pub type LayoutResolver = fn(
    out: &mut [f32],
    tree: &LayoutTree,
    intrinsic_sizes: &[f32],
    parent_index: usize,
    child_index: usize,
) -> Option<LayoutResolutionFailureKind>;

// -- Layout resolution explanation --

#[derive(Clone, Debug, PartialEq)]
pub struct LayoutResolutionExplanation {
    pub actual_length: i32,
    pub kind: LayoutResolutionFailureKind,
    pub node_index: i32,
    pub parent_index: i32,
    pub required_length: i32,
    pub resolver_kind: Option<String>,
}

// -- Layout resolution guard --

pub type LayoutResolutionGuard = fn(&LayoutResolutionExplanation);

// -- Layout state --

pub struct LayoutState {
    pub guard: Option<LayoutResolutionGuard>,
    pub last_failure_actual_length: i32,
    pub last_failure_kind: Option<LayoutResolutionFailureKind>,
    pub last_failure_node_index: i32,
    pub last_failure_parent_index: i32,
    pub last_failure_required_length: i32,
    pub last_failure_resolver_kind: Option<String>,
    pub resolvers: HashMap<String, LayoutResolver>,
}
