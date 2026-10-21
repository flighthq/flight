use std::collections::HashMap;

use flight_entity::EntityRuntimeSlot;

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

#[derive(Clone, Debug)]
pub enum ItemStyle {
    None,
    Anchor(AnchorLayoutItemStyle),
    Flex(FlexLayoutItemStyle),
    Grid(GridLayoutItemStyle),
    Invalid,
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

#[derive(Default)]
pub struct LayoutState {
    runtime: EntityRuntimeSlot,
    pub guard: Option<LayoutResolutionGuard>,
    pub last_failure_actual_length: i32,
    pub last_failure_kind: Option<LayoutResolutionFailureKind>,
    pub last_failure_node_index: i32,
    pub last_failure_parent_index: i32,
    pub last_failure_required_length: i32,
    pub last_failure_resolver_kind: Option<String>,
    pub resolvers: HashMap<String, LayoutResolver>,
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS FlexLayoutAlign string union; TS exports no get_/parse_ free functions
pub fn get_flex_layout_align_string(value: FlexLayoutAlign) -> &'static str {
    return match value {
        FlexLayoutAlign::Center => "center",
        FlexLayoutAlign::End => "end",
        FlexLayoutAlign::Start => "start",
        FlexLayoutAlign::Stretch => "stretch",
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS FlexLayoutDirection string union; TS exports no get_/parse_ free functions
pub fn get_flex_layout_direction_string(value: FlexLayoutDirection) -> &'static str {
    return match value {
        FlexLayoutDirection::Column => "column",
        FlexLayoutDirection::ColumnReverse => "column-reverse",
        FlexLayoutDirection::Row => "row",
        FlexLayoutDirection::RowReverse => "row-reverse",
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS FlexLayoutJustify string union; TS exports no get_/parse_ free functions
pub fn get_flex_layout_justify_string(value: FlexLayoutJustify) -> &'static str {
    return match value {
        FlexLayoutJustify::Center => "center",
        FlexLayoutJustify::End => "end",
        FlexLayoutJustify::SpaceAround => "space-around",
        FlexLayoutJustify::SpaceBetween => "space-between",
        FlexLayoutJustify::SpaceEvenly => "space-evenly",
        FlexLayoutJustify::Start => "start",
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS FlexLayoutWrap string union; TS exports no get_/parse_ free functions
pub fn get_flex_layout_wrap_string(value: FlexLayoutWrap) -> &'static str {
    return match value {
        FlexLayoutWrap::NoWrap => "nowrap",
        FlexLayoutWrap::Wrap => "wrap",
        FlexLayoutWrap::WrapReverse => "wrap-reverse",
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS LayoutResolutionFailureKind string union; TS exports no get_/parse_ free functions
pub fn get_layout_resolution_failure_kind_string(value: LayoutResolutionFailureKind) -> &'static str {
    return match value {
        LayoutResolutionFailureKind::IntrinsicSizesTooSmall => "IntrinsicSizesTooSmall",
        LayoutResolutionFailureKind::InvalidContainerStyle => "InvalidContainerStyle",
        LayoutResolutionFailureKind::InvalidHierarchy => "InvalidHierarchy",
        LayoutResolutionFailureKind::InvalidItemStyle => "InvalidItemStyle",
        LayoutResolutionFailureKind::OutputTooSmall => "OutputTooSmall",
        LayoutResolutionFailureKind::UnregisteredKind => "UnregisteredKind",
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS ViewportAlign string union; TS exports no get_/parse_ free functions
pub fn get_viewport_align_string(value: ViewportAlign) -> &'static str {
    return match value {
        ViewportAlign::Bottom => "bottom",
        ViewportAlign::BottomLeft => "bottomleft",
        ViewportAlign::BottomRight => "bottomright",
        ViewportAlign::Left => "left",
        ViewportAlign::Right => "right",
        ViewportAlign::Top => "top",
        ViewportAlign::TopLeft => "topleft",
        ViewportAlign::TopRight => "topright",
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS FlexLayoutAlign string union; TS exports no get_/parse_ free functions
pub fn parse_flex_layout_align(value: &str) -> Option<FlexLayoutAlign> {
    return match value {
        "center" => Some(FlexLayoutAlign::Center),
        "end" => Some(FlexLayoutAlign::End),
        "start" => Some(FlexLayoutAlign::Start),
        "stretch" => Some(FlexLayoutAlign::Stretch),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS FlexLayoutDirection string union; TS exports no get_/parse_ free functions
pub fn parse_flex_layout_direction(value: &str) -> Option<FlexLayoutDirection> {
    return match value {
        "column" => Some(FlexLayoutDirection::Column),
        "column-reverse" => Some(FlexLayoutDirection::ColumnReverse),
        "row" => Some(FlexLayoutDirection::Row),
        "row-reverse" => Some(FlexLayoutDirection::RowReverse),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS FlexLayoutJustify string union; TS exports no get_/parse_ free functions
pub fn parse_flex_layout_justify(value: &str) -> Option<FlexLayoutJustify> {
    return match value {
        "center" => Some(FlexLayoutJustify::Center),
        "end" => Some(FlexLayoutJustify::End),
        "space-around" => Some(FlexLayoutJustify::SpaceAround),
        "space-between" => Some(FlexLayoutJustify::SpaceBetween),
        "space-evenly" => Some(FlexLayoutJustify::SpaceEvenly),
        "start" => Some(FlexLayoutJustify::Start),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS FlexLayoutWrap string union; TS exports no get_/parse_ free functions
pub fn parse_flex_layout_wrap(value: &str) -> Option<FlexLayoutWrap> {
    return match value {
        "nowrap" => Some(FlexLayoutWrap::NoWrap),
        "wrap" => Some(FlexLayoutWrap::Wrap),
        "wrap-reverse" => Some(FlexLayoutWrap::WrapReverse),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS LayoutResolutionFailureKind string union; TS exports no get_/parse_ free functions
pub fn parse_layout_resolution_failure_kind(value: &str) -> Option<LayoutResolutionFailureKind> {
    return match value {
        "IntrinsicSizesTooSmall" => Some(LayoutResolutionFailureKind::IntrinsicSizesTooSmall),
        "InvalidContainerStyle" => Some(LayoutResolutionFailureKind::InvalidContainerStyle),
        "InvalidHierarchy" => Some(LayoutResolutionFailureKind::InvalidHierarchy),
        "InvalidItemStyle" => Some(LayoutResolutionFailureKind::InvalidItemStyle),
        "OutputTooSmall" => Some(LayoutResolutionFailureKind::OutputTooSmall),
        "UnregisteredKind" => Some(LayoutResolutionFailureKind::UnregisteredKind),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS ViewportAlign string union; TS exports no get_/parse_ free functions
pub fn parse_viewport_align(value: &str) -> Option<ViewportAlign> {
    return match value {
        "bottom" => Some(ViewportAlign::Bottom),
        "bottomleft" => Some(ViewportAlign::BottomLeft),
        "bottomright" => Some(ViewportAlign::BottomRight),
        "left" => Some(ViewportAlign::Left),
        "right" => Some(ViewportAlign::Right),
        "top" => Some(ViewportAlign::Top),
        "topleft" => Some(ViewportAlign::TopLeft),
        "topright" => Some(ViewportAlign::TopRight),
        _ => None,
    };
}

flight_entity::impl_entity!(LayoutState);

impl Default for ContainerStyle {
    fn default() -> Self {
        return ContainerStyle::None;
    }
}

impl Default for ItemStyle {
    fn default() -> Self {
        return ItemStyle::None;
    }
}
