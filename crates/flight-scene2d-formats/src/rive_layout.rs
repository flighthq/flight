use std::collections::{BTreeMap, HashMap};
use std::sync::Arc;

use flight_importdiagnostics::{
    report_import_diagnostic, ImportDiagnostic, ImportDiagnosticDetailValue,
    ImportDiagnosticSeverity,
};
use flight_layout::{
    ContainerStyle, FlexAlignSelf, FlexBasis, FlexLayoutAlign, FlexLayoutContainerStyle,
    FlexLayoutDirection, FlexLayoutItemStyle, FlexLayoutJustify, FlexLayoutWrap,
    GridLayoutContainerStyle, GridLayoutItemStyle, GridLayoutTrack, ItemStyle, LayoutNode,
    LayoutTree, FLEX_LAYOUT_KIND, GRID_LAYOUT_KIND,
};
use flight_scene2d::{create_display_object, Node2DRef, PartialNode2D};

use crate::rive_core_types::is_rive_core_type_derived_from;
use crate::rive_import_registry::{
    import_rive_core_object_as_data, register_rive_core_object_handler,
};
use crate::types::*;

#[derive(Clone, Copy, PartialEq, Eq)]
enum RiveLayoutProviderType {
    Component,
    Nested,
    Participant,
}

#[derive(Clone)]
struct RiveLayoutProvider {
    source_index: usize,
    style_index: usize,
    target_index: usize,
    r#type: RiveLayoutProviderType,
}

struct RiveLayoutContext<'a> {
    child_count: usize,
    layout_type: i32,
    row: bool,
    rtl: bool,
    source_index: usize,
    style: &'a RiveCoreObject,
}

struct RiveSizingValues {
    fractional_height: f32,
    fractional_width: f32,
    height: f32,
    height_scale: i32,
    height_units: i32,
    width: f32,
    width_scale: i32,
    width_units: i32,
}

fn create_rive_flex_container_style(
    style: &RiveCoreObject,
    context: &RiveLayoutContext<'_>,
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> FlexLayoutContainerStyle {
    let raw_direction =
        read_rive_number(style, RIVE_FLEX_DIRECTION, RIVE_FLEX_DIRECTION_ROW as f32);
    let direction = map_rive_flex_direction(
        raw_direction as i32,
        context.rtl,
        diagnostics.as_deref_mut(),
    );
    let (align, justify) = map_rive_flex_alignment(
        read_rive_number(style, RIVE_LAYOUT_ALIGNMENT, 0.0) as i32,
        context.row,
        context.rtl,
        diagnostics.as_deref_mut(),
    );
    let wrap = match read_rive_number(style, RIVE_FLEX_WRAP, 0.0) as i32 {
        1 => FlexLayoutWrap::Wrap,
        2 => FlexLayoutWrap::WrapReverse,
        _ => FlexLayoutWrap::NoWrap,
    };
    let horizontal_gap =
        read_rive_point_length(style, RIVE_GAP_HORIZONTAL, RIVE_GAP_HORIZONTAL_UNITS);
    let vertical_gap = read_rive_point_length(style, RIVE_GAP_VERTICAL, RIVE_GAP_VERTICAL_UNITS);
    let gap = if context.row {
        horizontal_gap
    } else {
        vertical_gap
    };
    let (padding_left, padding_right, padding_top, padding_bottom) =
        apply_rive_insets(style, context.rtl);
    return FlexLayoutContainerStyle {
        align: Some(align),
        direction: Some(direction),
        gap: (gap > 0.0).then_some(gap),
        justify: Some(justify),
        padding_bottom,
        padding_left,
        padding_right,
        padding_top,
        wrap: Some(wrap),
    };
}

fn create_rive_flex_item_style(
    provider: &RiveLayoutProvider,
    source: &RiveCoreObject,
    style: &RiveCoreObject,
    parent_is_row: bool,
) -> FlexLayoutItemStyle {
    let sizing = read_rive_sizing_values(provider, source, style);
    let (main_scale, main_value, main_units, main_fraction, cross_scale) = if parent_is_row {
        (
            sizing.width_scale,
            sizing.width,
            sizing.width_units,
            sizing.fractional_width,
            sizing.height_scale,
        )
    } else {
        (
            sizing.height_scale,
            sizing.height,
            sizing.height_units,
            sizing.fractional_height,
            sizing.width_scale,
        )
    };
    let basis = if main_scale == RIVE_SCALE_FILL {
        Some(match provider.r#type {
            RiveLayoutProviderType::Participant => FlexBasis::Fixed(0.0),
            RiveLayoutProviderType::Nested => FlexBasis::Auto,
            RiveLayoutProviderType::Component => read_rive_flex_basis(style),
        })
    } else if main_scale == RIVE_SCALE_FIXED && main_units == RIVE_UNIT_POINT && main_value >= 0.0 {
        Some(FlexBasis::Fixed(finite_non_negative(main_value)))
    } else {
        Some(FlexBasis::Auto)
    };
    let scale = if main_scale == RIVE_SCALE_FILL {
        finite_non_negative(main_fraction)
    } else {
        0.0
    };
    return FlexLayoutItemStyle {
        align_self: Some(if cross_scale == RIVE_SCALE_FILL {
            FlexAlignSelf::Align(FlexLayoutAlign::Stretch)
        } else {
            FlexAlignSelf::Auto
        }),
        basis,
        grow: Some(scale),
        shrink: Some(scale),
    };
}

fn create_rive_grid_container_style(
    artboard: &RiveArtboardGraph,
    source_index: usize,
    style: &RiveCoreObject,
    context: &RiveLayoutContext<'_>,
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> GridLayoutContainerStyle {
    if context.layout_type == RIVE_LAYOUT_TYPE_STACK {
        let (padding_left, padding_right, padding_top, padding_bottom) =
            apply_rive_insets(style, context.rtl);
        return GridLayoutContainerStyle {
            columns: vec![GridLayoutTrack::Fraction { fraction: 1.0 }],
            rows: vec![GridLayoutTrack::Fraction { fraction: 1.0 }],
            padding_bottom,
            padding_left,
            padding_right,
            padding_top,
            ..GridLayoutContainerStyle::default()
        };
    }
    let mut columns = Vec::new();
    let mut rows = Vec::new();
    for index in 1..artboard.objects.len() {
        if artboard.parent_indices.get(index).copied() != Some(source_index as i32) {
            continue;
        }
        let track = &artboard.objects[index];
        if i32::try_from(track.type_key)
            .ok()
            .is_none_or(|key| !is_rive_core_type_derived_from(key, RIVE_GRID_TRACK_TYPE_KEY))
        {
            continue;
        }
        let collection = read_rive_number(track, RIVE_GRID_TRACK_COLLECTION, 0.0) as i32;
        if collection == RIVE_GRID_TEMPLATE_COLUMNS {
            columns.push(map_rive_grid_track(track, diagnostics.as_deref_mut()));
        } else if collection == RIVE_GRID_TEMPLATE_ROWS {
            rows.push(map_rive_grid_track(track, diagnostics.as_deref_mut()));
        }
    }
    if columns.is_empty() {
        columns.push(GridLayoutTrack::Auto);
    }
    let required_rows = 1_usize.max(context.child_count.div_ceil(columns.len()));
    if rows.is_empty() {
        rows.push(GridLayoutTrack::Auto);
    }
    while rows.len() < required_rows {
        rows.push(GridLayoutTrack::Auto);
    }
    let column_gap = read_rive_point_length(style, RIVE_GAP_HORIZONTAL, RIVE_GAP_HORIZONTAL_UNITS);
    let row_gap = read_rive_point_length(style, RIVE_GAP_VERTICAL, RIVE_GAP_VERTICAL_UNITS);
    let (padding_left, padding_right, padding_top, padding_bottom) =
        apply_rive_insets(style, context.rtl);
    return GridLayoutContainerStyle {
        column_gap: (column_gap > 0.0).then_some(column_gap),
        columns,
        padding_bottom,
        padding_left,
        padding_right,
        padding_top,
        row_gap: (row_gap > 0.0).then_some(row_gap),
        rows,
    };
}

fn create_rive_grid_item_style(
    placement: &RiveCoreObject,
    column_count: usize,
    row_count: usize,
) -> GridLayoutItemStyle {
    let column = map_rive_grid_cell(
        read_rive_number(placement, RIVE_GRID_COLUMN, 0.0) as i32,
        column_count,
    );
    let row = map_rive_grid_cell(
        read_rive_number(placement, RIVE_GRID_ROW, 0.0) as i32,
        row_count,
    );
    let column_span = positive_integer(read_rive_number(placement, RIVE_GRID_COLUMN_SPAN, 1.0));
    let row_span = positive_integer(read_rive_number(placement, RIVE_GRID_ROW_SPAN, 1.0));
    let (Some(column), Some(row)) = (column, row) else {
        return GridLayoutItemStyle::default();
    };
    if column + column_span > column_count || row + row_span > row_count {
        return GridLayoutItemStyle::default();
    }
    return GridLayoutItemStyle {
        column: Some(column as i32),
        column_span: (column_span > 1).then_some(column_span as i32),
        row: Some(row as i32),
        row_span: (row_span > 1).then_some(row_span as i32),
    };
}

fn create_rive_item_style(
    artboard: &RiveArtboardGraph,
    provider: &RiveLayoutProvider,
    source: &RiveCoreObject,
    style: &RiveCoreObject,
    parent: &RiveLayoutContext<'_>,
    placement: Option<&RiveCoreObject>,
) -> ItemStyle {
    if parent.layout_type == RIVE_LAYOUT_TYPE_STACK {
        return ItemStyle::Grid(GridLayoutItemStyle {
            column: Some(0),
            row: Some(0),
            ..GridLayoutItemStyle::default()
        });
    }
    if parent.layout_type == RIVE_LAYOUT_TYPE_GRID {
        let Some(placement) = placement else {
            return ItemStyle::None;
        };
        let parent_container = create_rive_grid_container_style(
            artboard,
            parent.source_index,
            parent.style,
            parent,
            None,
        );
        return ItemStyle::Grid(create_rive_grid_item_style(
            placement,
            parent_container.columns.len(),
            parent_container.rows.len(),
        ));
    }
    return ItemStyle::Flex(create_rive_flex_item_style(
        provider, source, style, parent.row,
    ));
}

fn create_rive_layout_context<'a>(
    source_index: usize,
    style: &'a RiveCoreObject,
    inherited_rtl: bool,
    child_count: usize,
) -> RiveLayoutContext<'a> {
    let raw_direction =
        read_rive_number(style, RIVE_DIRECTION, RIVE_DIRECTION_INHERIT as f32) as i32;
    let rtl = raw_direction == RIVE_DIRECTION_RTL
        || (raw_direction == RIVE_DIRECTION_INHERIT && inherited_rtl);
    let flex_direction =
        read_rive_number(style, RIVE_FLEX_DIRECTION, RIVE_FLEX_DIRECTION_ROW as f32) as i32;
    return RiveLayoutContext {
        child_count,
        layout_type: read_rive_number(style, RIVE_LAYOUT_TYPE, RIVE_LAYOUT_TYPE_FLEX as f32) as i32,
        row: matches!(
            flex_direction,
            RIVE_FLEX_DIRECTION_ROW | RIVE_FLEX_DIRECTION_ROW_REVERSE
        ),
        rtl,
        source_index,
        style,
    };
}

// flight-lint: allow(hashmap-iteration) provider roots come from a BTreeMap and retain source-index order
pub fn create_rive_layout_imports(
    artboard: &RiveArtboardGraph,
    nodes: &[Option<Node2DRef>],
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Vec<RiveLayoutImport> {
    let component_providers =
        find_rive_layout_components(artboard, nodes, diagnostics.as_deref_mut());
    if component_providers.is_empty() {
        return Vec::new();
    }
    let mut providers = component_providers.clone();
    let mut placements = BTreeMap::new();
    for index in 1..artboard.objects.len() {
        let object = &artboard.objects[index];
        let type_key = i32::try_from(object.type_key).ok();
        if type_key.is_some_and(|key| {
            is_rive_core_type_derived_from(key, RIVE_LAYOUT_PARTICIPANT_TYPE_KEY)
        }) {
            if let Some(target_index) = artboard
                .parent_indices
                .get(index)
                .copied()
                .and_then(|value| usize::try_from(value).ok())
                .filter(|target| *target > 0 && nodes.get(*target).is_some_and(Option::is_some))
            {
                providers.insert(
                    target_index,
                    RiveLayoutProvider {
                        source_index: target_index,
                        style_index: index,
                        target_index,
                        r#type: RiveLayoutProviderType::Participant,
                    },
                );
            }
            continue;
        }
        if type_key.is_some_and(|key| {
            is_rive_core_type_derived_from(key, RIVE_NESTED_ARTBOARD_LAYOUT_TYPE_KEY)
        }) {
            if nodes.get(index).is_some_and(Option::is_some) {
                providers.insert(
                    index,
                    RiveLayoutProvider {
                        source_index: index,
                        style_index: index,
                        target_index: index,
                        r#type: RiveLayoutProviderType::Nested,
                    },
                );
            }
            continue;
        }
        if type_key.is_some_and(|key| {
            is_rive_core_type_derived_from(key, RIVE_GRID_ITEM_PLACEMENT_TYPE_KEY)
        }) {
            if let Some(owner) = artboard
                .parent_indices
                .get(index)
                .copied()
                .and_then(|value| usize::try_from(value).ok())
            {
                placements.insert(owner, object);
            }
        }
    }
    let mut provider_parents = BTreeMap::new();
    let mut provider_children = BTreeMap::<usize, Vec<RiveLayoutProvider>>::new();
    for provider in providers.values() {
        let start = artboard
            .parent_indices
            .get(provider.source_index)
            .copied()
            .unwrap_or(RIVE_NO_PARENT);
        let parent = find_rive_layout_parent(
            artboard,
            &component_providers,
            start,
            provider.source_index as i32,
        );
        provider_parents.insert(provider.source_index, parent);
        if let Ok(parent) = usize::try_from(parent) {
            provider_children
                .entry(parent)
                .or_default()
                .push(provider.clone());
        }
    }
    for children in provider_children.values_mut() {
        children.sort_by_key(|provider| provider.source_index);
    }
    let roots = component_providers
        .values()
        .filter(|provider| {
            provider_parents
                .get(&provider.source_index)
                .copied()
                .unwrap_or(RIVE_NO_PARENT)
                < 0
        })
        .collect::<Vec<_>>();
    let mut imports = Vec::new();
    for root in roots {
        let mut layout_nodes = Vec::new();
        let mut targets = Vec::new();
        append_rive_layout_provider(
            artboard,
            nodes,
            &component_providers,
            &provider_children,
            &placements,
            root,
            RIVE_NO_PARENT,
            None,
            &mut layout_nodes,
            &mut targets,
            &mut diagnostics,
        );
        if !layout_nodes.is_empty() {
            imports.push(RiveLayoutImport {
                targets,
                tree: LayoutTree {
                    nodes: layout_nodes,
                },
            });
        }
    }
    return imports;
}

fn append_rive_layout_provider(
    artboard: &RiveArtboardGraph,
    display_nodes: &[Option<Node2DRef>],
    components: &BTreeMap<usize, RiveLayoutProvider>,
    children_by_provider: &BTreeMap<usize, Vec<RiveLayoutProvider>>,
    placements: &BTreeMap<usize, &RiveCoreObject>,
    provider: &RiveLayoutProvider,
    parent_index: i32,
    parent_context: Option<&RiveLayoutContext<'_>>,
    nodes: &mut Vec<LayoutNode>,
    targets: &mut Vec<Node2DRef>,
    diagnostics: &mut Option<&mut Vec<ImportDiagnostic>>,
) {
    let Some(Some(target)) = display_nodes.get(provider.target_index) else {
        return;
    };
    let source = &artboard.objects[provider.source_index];
    let style = &artboard.objects[provider.style_index];
    let children = children_by_provider
        .get(&provider.source_index)
        .map_or(&[][..], Vec::as_slice);
    let context = (provider.r#type == RiveLayoutProviderType::Component).then(|| {
        create_rive_layout_context(
            provider.source_index,
            style,
            parent_context.is_some_and(|parent| parent.rtl),
            children.len(),
        )
    });
    let item_style = parent_context.map_or(ItemStyle::None, |parent| {
        create_rive_item_style(
            artboard,
            provider,
            source,
            style,
            parent,
            placements.get(&provider.source_index).copied(),
        )
    });
    let kind = if context
        .as_ref()
        .is_none_or(|context| context.layout_type == RIVE_LAYOUT_TYPE_FLEX)
    {
        FLEX_LAYOUT_KIND
    } else {
        GRID_LAYOUT_KIND
    };
    let container_style = context.as_ref().map_or(ContainerStyle::None, |context| {
        if context.layout_type == RIVE_LAYOUT_TYPE_FLEX {
            ContainerStyle::Flex(create_rive_flex_container_style(
                style,
                context,
                diagnostics.as_deref_mut(),
            ))
        } else {
            ContainerStyle::Grid(create_rive_grid_container_style(
                artboard,
                provider.source_index,
                style,
                context,
                diagnostics.as_deref_mut(),
            ))
        }
    });
    let node_index = nodes.len();
    nodes.push(LayoutNode {
        container_style,
        item_style,
        kind: kind.to_string(),
        parent_index,
    });
    targets.push(target.clone());
    if !components.contains_key(&provider.source_index) || context.is_none() {
        return;
    }
    for child in children {
        append_rive_layout_provider(
            artboard,
            display_nodes,
            components,
            children_by_provider,
            placements,
            child,
            node_index as i32,
            context.as_ref(),
            nodes,
            targets,
            diagnostics,
        );
    }
}

fn apply_rive_insets(
    style: &RiveCoreObject,
    rtl: bool,
) -> (Option<f32>, Option<f32>, Option<f32>, Option<f32>) {
    let logical_left = read_rive_point_length(style, RIVE_PADDING_LEFT, RIVE_PADDING_LEFT_UNITS)
        + read_rive_point_length(style, RIVE_BORDER_LEFT, RIVE_BORDER_LEFT_UNITS);
    let logical_right = read_rive_point_length(style, RIVE_PADDING_RIGHT, RIVE_PADDING_RIGHT_UNITS)
        + read_rive_point_length(style, RIVE_BORDER_RIGHT, RIVE_BORDER_RIGHT_UNITS);
    let top = read_rive_point_length(style, RIVE_PADDING_TOP, RIVE_PADDING_TOP_UNITS)
        + read_rive_point_length(style, RIVE_BORDER_TOP, RIVE_BORDER_TOP_UNITS);
    let bottom = read_rive_point_length(style, RIVE_PADDING_BOTTOM, RIVE_PADDING_BOTTOM_UNITS)
        + read_rive_point_length(style, RIVE_BORDER_BOTTOM, RIVE_BORDER_BOTTOM_UNITS);
    let (left, right) = if rtl {
        (logical_right, logical_left)
    } else {
        (logical_left, logical_right)
    };
    return (
        (left > 0.0).then_some(left),
        (right > 0.0).then_some(right),
        (top > 0.0).then_some(top),
        (bottom > 0.0).then_some(bottom),
    );
}

fn find_rive_layout_components(
    artboard: &RiveArtboardGraph,
    nodes: &[Option<Node2DRef>],
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> BTreeMap<usize, RiveLayoutProvider> {
    let mut providers = BTreeMap::new();
    for (index, object) in artboard.objects.iter().enumerate() {
        if i32::try_from(object.type_key)
            .ok()
            .is_none_or(|key| !is_rive_core_type_derived_from(key, RIVE_LAYOUT_COMPONENT_TYPE_KEY))
        {
            continue;
        }
        let Some(style_property) = object
            .properties
            .iter()
            .find(|property| property.key == RIVE_LAYOUT_STYLE_ID)
        else {
            continue;
        };
        let style_index = read_rive_property_number(style_property, -1.0) as i32;
        let style = usize::try_from(style_index)
            .ok()
            .and_then(|style| artboard.objects.get(style));
        if style.is_none_or(|style| {
            i32::try_from(style.type_key).ok().is_none_or(|key| {
                !is_rive_core_type_derived_from(key, RIVE_LAYOUT_COMPONENT_STYLE_TYPE_KEY)
            })
        }) || nodes.get(index).is_none_or(Option::is_none)
        {
            report_import_diagnostic(
                diagnostics.as_deref_mut(),
                ImportDiagnosticSeverity::Drop,
                "rive.layout-unresolved-style",
                "findRiveLayoutComponents",
                Some(HashMap::from([
                    (
                        "index".to_string(),
                        ImportDiagnosticDetailValue::Number(index as f32),
                    ),
                    (
                        "styleId".to_string(),
                        ImportDiagnosticDetailValue::Number(style_index as f32),
                    ),
                ])),
            );
            continue;
        }
        providers.insert(
            index,
            RiveLayoutProvider {
                source_index: index,
                style_index: style_index as usize,
                target_index: index,
                r#type: RiveLayoutProviderType::Component,
            },
        );
    }
    return providers;
}

fn find_rive_layout_parent(
    artboard: &RiveArtboardGraph,
    components: &BTreeMap<usize, RiveLayoutProvider>,
    start: i32,
    initial_child: i32,
) -> i32 {
    let mut index = start;
    let mut child = initial_child;
    while let Ok(current) = usize::try_from(index) {
        if components.contains_key(&current) {
            return index;
        }
        let Some(object) = artboard.objects.get(current) else {
            return RIVE_NO_PARENT;
        };
        if object.type_key == RIVE_NODE_TYPE_KEY as u64 {
            child = index;
            index = artboard
                .parent_indices
                .get(current)
                .copied()
                .unwrap_or(RIVE_NO_PARENT);
            continue;
        }
        if i32::try_from(object.type_key)
            .ok()
            .is_some_and(|key| is_rive_core_type_derived_from(key, RIVE_SOLO_TYPE_KEY))
        {
            let active = read_rive_number(object, RIVE_SOLO_ACTIVE_COMPONENT, -1.0) as i32;
            if active >= 0 && active != child {
                return RIVE_NO_PARENT;
            }
            child = index;
            index = artboard
                .parent_indices
                .get(current)
                .copied()
                .unwrap_or(RIVE_NO_PARENT);
            continue;
        }
        return RIVE_NO_PARENT;
    }
    return RIVE_NO_PARENT;
}

fn finite_non_negative(value: f32) -> f32 {
    return if value.is_finite() && value > 0.0 {
        value
    } else {
        0.0
    };
}

pub fn import_rive_layout_component(
    context: &mut RiveArtboardImportContext<'_>,
    index: usize,
) -> Option<Node2DRef> {
    let source = context.artboard.objects.get(index)?;
    return Some(create_display_object(Some(&PartialNode2D {
        name: Some(read_rive_layout_name(source)),
        ..PartialNode2D::default()
    })));
}

fn map_rive_alignment_axis(value: i32) -> FlexLayoutAlign {
    return match value {
        1 => FlexLayoutAlign::Center,
        2 => FlexLayoutAlign::End,
        _ => FlexLayoutAlign::Start,
    };
}

fn map_rive_flex_alignment(
    value: i32,
    row: bool,
    rtl: bool,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> (FlexLayoutAlign, FlexLayoutJustify) {
    if (9..=11).contains(&value) {
        let cross = map_rive_alignment_axis(value - 9);
        return (
            if row || !rtl {
                cross
            } else {
                reverse_flex_align(cross)
            },
            FlexLayoutJustify::SpaceBetween,
        );
    }
    if !(0..=8).contains(&value) {
        report_import_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Recover,
            "rive.flex-alignment-substituted",
            "mapRiveFlexAlignment",
            Some(HashMap::from([
                (
                    "alignmentValue".to_string(),
                    ImportDiagnosticDetailValue::Number(value as f32),
                ),
                (
                    "substitutedAs".to_string(),
                    ImportDiagnosticDetailValue::String("start".to_string()),
                ),
            ])),
        );
    }
    let normalized = if (0..=8).contains(&value) { value } else { 0 };
    let horizontal = map_rive_alignment_axis(normalized % 3);
    let vertical = map_rive_alignment_axis(normalized / 3);
    return if row {
        (vertical, to_rive_justify(horizontal))
    } else {
        (
            if rtl {
                reverse_flex_align(horizontal)
            } else {
                horizontal
            },
            to_rive_justify(vertical),
        )
    };
}

fn map_rive_flex_direction(
    value: i32,
    rtl: bool,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> FlexLayoutDirection {
    return match value {
        RIVE_FLEX_DIRECTION_COLUMN => FlexLayoutDirection::Column,
        RIVE_FLEX_DIRECTION_COLUMN_REVERSE => FlexLayoutDirection::ColumnReverse,
        RIVE_FLEX_DIRECTION_ROW_REVERSE => {
            if rtl {
                FlexLayoutDirection::Row
            } else {
                FlexLayoutDirection::RowReverse
            }
        }
        RIVE_FLEX_DIRECTION_ROW => {
            if rtl {
                FlexLayoutDirection::RowReverse
            } else {
                FlexLayoutDirection::Row
            }
        }
        _ => {
            report_import_diagnostic(
                diagnostics,
                ImportDiagnosticSeverity::Recover,
                "rive.flex-direction-substituted",
                "mapRiveFlexDirection",
                Some(HashMap::from([
                    (
                        "directionValue".to_string(),
                        ImportDiagnosticDetailValue::Number(value as f32),
                    ),
                    (
                        "substitutedAs".to_string(),
                        ImportDiagnosticDetailValue::String("row".to_string()),
                    ),
                ])),
            );
            if rtl {
                FlexLayoutDirection::RowReverse
            } else {
                FlexLayoutDirection::Row
            }
        }
    };
}

fn map_rive_grid_cell(value: i32, count: usize) -> Option<usize> {
    if value > 0 && value as usize <= count {
        return Some(value as usize - 1);
    }
    if value < 0 && count as i32 + value >= 0 {
        return Some((count as i32 + value) as usize);
    }
    return None;
}

fn map_rive_grid_track(
    source: &RiveCoreObject,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> GridLayoutTrack {
    let track_type =
        read_rive_number(source, RIVE_GRID_TRACK_TYPE, RIVE_GRID_TRACK_AUTO as f32) as i32;
    let value = finite_non_negative(read_rive_number(source, RIVE_GRID_TRACK_VALUE, 0.0));
    if track_type == RIVE_GRID_TRACK_POINTS {
        return GridLayoutTrack::Fixed { size: value };
    }
    if track_type == RIVE_GRID_TRACK_FRACTION && value > 0.0 {
        return GridLayoutTrack::Fraction { fraction: value };
    }
    if track_type != RIVE_GRID_TRACK_AUTO {
        report_import_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Recover,
            "rive.grid-track-substituted",
            "mapRiveGridTrack",
            Some(HashMap::from([
                (
                    "substitutedAs".to_string(),
                    ImportDiagnosticDetailValue::String("auto".to_string()),
                ),
                (
                    "trackType".to_string(),
                    ImportDiagnosticDetailValue::Number(track_type as f32),
                ),
                (
                    "trackValue".to_string(),
                    ImportDiagnosticDetailValue::Number(value),
                ),
            ])),
        );
    }
    return GridLayoutTrack::Auto;
}

fn positive_integer(value: f32) -> usize {
    return if value.is_finite() && value > 0.0 && value.fract() == 0.0 {
        value as usize
    } else {
        1
    };
}

fn read_rive_flex_basis(style: &RiveCoreObject) -> FlexBasis {
    let units = read_rive_number(style, RIVE_FLEX_BASIS_UNITS, RIVE_UNIT_AUTO as f32) as i32;
    return if units == RIVE_UNIT_POINT {
        FlexBasis::Fixed(finite_non_negative(read_rive_number(
            style,
            RIVE_FLEX_BASIS,
            0.0,
        )))
    } else {
        FlexBasis::Auto
    };
}

fn read_rive_layout_name(source: &RiveCoreObject) -> String {
    return source
        .properties
        .iter()
        .find(|candidate| candidate.key == RIVE_NAME)
        .and_then(|property| match &property.value {
            RiveValue::String(value) => Some(value.clone()),
            _ => None,
        })
        .unwrap_or_default();
}

fn read_rive_number(source: &RiveCoreObject, key: u64, fallback: f32) -> f32 {
    return source
        .properties
        .iter()
        .find(|candidate| candidate.key == key)
        .map_or(fallback, |property| {
            read_rive_property_number(property, fallback)
        });
}

fn read_rive_point_length(source: &RiveCoreObject, value_key: u64, units_key: u64) -> f32 {
    let value = read_rive_number(source, value_key, 0.0);
    let units = read_rive_number(source, units_key, RIVE_UNIT_UNDEFINED as f32) as i32;
    return if units == RIVE_UNIT_POINT {
        finite_non_negative(value)
    } else {
        0.0
    };
}

fn read_rive_property_number(property: &RiveProperty, fallback: f32) -> f32 {
    return match property.value {
        RiveValue::Uint(value) => value as f32,
        RiveValue::Double(value) => value,
        RiveValue::Color(value) => value as f32,
        _ => fallback,
    };
}

fn read_rive_sizing_values(
    provider: &RiveLayoutProvider,
    source: &RiveCoreObject,
    style: &RiveCoreObject,
) -> RiveSizingValues {
    return match provider.r#type {
        RiveLayoutProviderType::Component => RiveSizingValues {
            fractional_height: read_rive_number(
                source,
                RIVE_LAYOUT_COMPONENT_FRACTIONAL_HEIGHT,
                1.0,
            ),
            fractional_width: read_rive_number(source, RIVE_LAYOUT_COMPONENT_FRACTIONAL_WIDTH, 1.0),
            height: read_rive_number(source, RIVE_HEIGHT, 0.0),
            height_scale: read_rive_number(style, RIVE_HEIGHT_SCALE, RIVE_SCALE_FIXED as f32)
                as i32,
            height_units: read_rive_number(style, RIVE_HEIGHT_UNITS, RIVE_UNIT_POINT as f32) as i32,
            width: read_rive_number(source, RIVE_WIDTH, 0.0),
            width_scale: read_rive_number(style, RIVE_WIDTH_SCALE, RIVE_SCALE_FIXED as f32) as i32,
            width_units: read_rive_number(style, RIVE_WIDTH_UNITS, RIVE_UNIT_POINT as f32) as i32,
        },
        RiveLayoutProviderType::Nested => RiveSizingValues {
            fractional_height: 1.0,
            fractional_width: 1.0,
            height: read_rive_number(source, RIVE_NESTED_HEIGHT, -1.0),
            height_scale: read_rive_number(
                source,
                RIVE_NESTED_HEIGHT_SCALE,
                RIVE_SCALE_FIXED as f32,
            ) as i32,
            height_units: read_rive_number(source, RIVE_NESTED_HEIGHT_UNITS, RIVE_UNIT_POINT as f32)
                as i32,
            width: read_rive_number(source, RIVE_NESTED_WIDTH, -1.0),
            width_scale: read_rive_number(source, RIVE_NESTED_WIDTH_SCALE, RIVE_SCALE_FIXED as f32)
                as i32,
            width_units: read_rive_number(source, RIVE_NESTED_WIDTH_UNITS, RIVE_UNIT_POINT as f32)
                as i32,
        },
        RiveLayoutProviderType::Participant => RiveSizingValues {
            fractional_height: read_rive_number(style, RIVE_PARTICIPANT_FRACTIONAL_HEIGHT, 1.0),
            fractional_width: read_rive_number(style, RIVE_PARTICIPANT_FRACTIONAL_WIDTH, 1.0),
            height: read_rive_number(style, RIVE_PARTICIPANT_HEIGHT, 0.0),
            height_scale: read_rive_number(style, RIVE_HEIGHT_SCALE, RIVE_SCALE_FIXED as f32)
                as i32,
            height_units: read_rive_number(style, RIVE_HEIGHT_UNITS, RIVE_UNIT_POINT as f32) as i32,
            width: read_rive_number(style, RIVE_PARTICIPANT_WIDTH, 0.0),
            width_scale: read_rive_number(style, RIVE_WIDTH_SCALE, RIVE_SCALE_FIXED as f32) as i32,
            width_units: read_rive_number(style, RIVE_WIDTH_UNITS, RIVE_UNIT_POINT as f32) as i32,
        },
    };
}

pub fn register_rive_layout_handlers(registry: &mut RiveImportRegistry) {
    register_rive_core_object_handler(
        registry,
        RIVE_LAYOUT_COMPONENT_TYPE_KEY,
        Arc::new(RiveCoreObjectHandler {
            apply_artboard: Some(Arc::new(|context| {
                let layouts = create_rive_layout_imports(
                    context.artboard,
                    &context.nodes,
                    context.diagnostics.as_deref_mut(),
                );
                context.layouts.extend(layouts);
            })),
            apply_document: None,
            import_component: Some(Arc::new(import_rive_layout_component)),
        }),
    );
    let style = Arc::new(RiveCoreObjectHandler {
        import_component: Some(Arc::new(|_, _| import_rive_core_object_as_data())),
        ..RiveCoreObjectHandler::default()
    });
    for type_key in [
        RIVE_LAYOUT_SIZING_STYLE_TYPE_KEY,
        RIVE_GRID_TRACK_TYPE_KEY,
        RIVE_GRID_ITEM_PLACEMENT_TYPE_KEY,
    ] {
        register_rive_core_object_handler(registry, type_key, style.clone());
    }
}

fn reverse_flex_align(value: FlexLayoutAlign) -> FlexLayoutAlign {
    return match value {
        FlexLayoutAlign::Start => FlexLayoutAlign::End,
        FlexLayoutAlign::End => FlexLayoutAlign::Start,
        _ => value,
    };
}

fn to_rive_justify(value: FlexLayoutAlign) -> FlexLayoutJustify {
    return match value {
        FlexLayoutAlign::Center => FlexLayoutJustify::Center,
        FlexLayoutAlign::End => FlexLayoutJustify::End,
        _ => FlexLayoutJustify::Start,
    };
}

const RIVE_NO_PARENT: i32 = -1;
const RIVE_NODE_TYPE_KEY: i32 = 2;
const RIVE_SOLO_TYPE_KEY: i32 = 147;
const RIVE_LAYOUT_COMPONENT_TYPE_KEY: i32 = 409;
const RIVE_LAYOUT_COMPONENT_STYLE_TYPE_KEY: i32 = 420;
const RIVE_LAYOUT_SIZING_STYLE_TYPE_KEY: i32 = 1056;
const RIVE_NESTED_ARTBOARD_LAYOUT_TYPE_KEY: i32 = 452;
const RIVE_LAYOUT_PARTICIPANT_TYPE_KEY: i32 = 1066;
const RIVE_GRID_TRACK_TYPE_KEY: i32 = 1058;
const RIVE_GRID_ITEM_PLACEMENT_TYPE_KEY: i32 = 1068;
const RIVE_NAME: u64 = 4;
const RIVE_WIDTH: u64 = 7;
const RIVE_HEIGHT: u64 = 8;
const RIVE_LAYOUT_STYLE_ID: u64 = 494;
const RIVE_SOLO_ACTIVE_COMPONENT: u64 = 296;
const RIVE_GAP_HORIZONTAL: u64 = 498;
const RIVE_GAP_VERTICAL: u64 = 499;
const RIVE_BORDER_LEFT: u64 = 504;
const RIVE_BORDER_RIGHT: u64 = 505;
const RIVE_BORDER_TOP: u64 = 506;
const RIVE_BORDER_BOTTOM: u64 = 507;
const RIVE_PADDING_LEFT: u64 = 512;
const RIVE_PADDING_RIGHT: u64 = 513;
const RIVE_PADDING_TOP: u64 = 514;
const RIVE_PADDING_BOTTOM: u64 = 515;
const RIVE_FLEX_BASIS: u64 = 523;
const RIVE_FLEX_DIRECTION: u64 = 598;
const RIVE_DIRECTION: u64 = 599;
const RIVE_FLEX_WRAP: u64 = 604;
const RIVE_WIDTH_UNITS: u64 = 607;
const RIVE_HEIGHT_UNITS: u64 = 608;
const RIVE_BORDER_LEFT_UNITS: u64 = 609;
const RIVE_BORDER_RIGHT_UNITS: u64 = 610;
const RIVE_BORDER_TOP_UNITS: u64 = 611;
const RIVE_BORDER_BOTTOM_UNITS: u64 = 612;
const RIVE_PADDING_LEFT_UNITS: u64 = 617;
const RIVE_PADDING_RIGHT_UNITS: u64 = 618;
const RIVE_PADDING_TOP_UNITS: u64 = 619;
const RIVE_PADDING_BOTTOM_UNITS: u64 = 620;
const RIVE_GAP_HORIZONTAL_UNITS: u64 = 625;
const RIVE_GAP_VERTICAL_UNITS: u64 = 626;
const RIVE_LAYOUT_ALIGNMENT: u64 = 632;
const RIVE_WIDTH_SCALE: u64 = 655;
const RIVE_HEIGHT_SCALE: u64 = 656;
const RIVE_NESTED_WIDTH: u64 = 663;
const RIVE_NESTED_HEIGHT: u64 = 664;
const RIVE_NESTED_WIDTH_UNITS: u64 = 665;
const RIVE_NESTED_HEIGHT_UNITS: u64 = 666;
const RIVE_NESTED_WIDTH_SCALE: u64 = 667;
const RIVE_NESTED_HEIGHT_SCALE: u64 = 668;
const RIVE_FLEX_BASIS_UNITS: u64 = 705;
const RIVE_LAYOUT_COMPONENT_FRACTIONAL_WIDTH: u64 = 706;
const RIVE_LAYOUT_COMPONENT_FRACTIONAL_HEIGHT: u64 = 707;
const RIVE_GRID_COLUMN: u64 = 1047;
const RIVE_GRID_ROW: u64 = 1048;
const RIVE_GRID_COLUMN_SPAN: u64 = 1049;
const RIVE_GRID_ROW_SPAN: u64 = 1050;
const RIVE_PARTICIPANT_FRACTIONAL_WIDTH: u64 = 1057;
const RIVE_PARTICIPANT_FRACTIONAL_HEIGHT: u64 = 1058;
const RIVE_LAYOUT_TYPE: u64 = 1059;
const RIVE_GRID_TRACK_COLLECTION: u64 = 1061;
const RIVE_GRID_TRACK_TYPE: u64 = 1062;
const RIVE_GRID_TRACK_VALUE: u64 = 1063;
const RIVE_PARTICIPANT_WIDTH: u64 = 1066;
const RIVE_PARTICIPANT_HEIGHT: u64 = 1067;
const RIVE_LAYOUT_TYPE_FLEX: i32 = 0;
const RIVE_LAYOUT_TYPE_GRID: i32 = 1;
const RIVE_LAYOUT_TYPE_STACK: i32 = 2;
const RIVE_SCALE_FIXED: i32 = 0;
const RIVE_SCALE_FILL: i32 = 1;
const RIVE_UNIT_UNDEFINED: i32 = 0;
const RIVE_UNIT_POINT: i32 = 1;
const RIVE_UNIT_AUTO: i32 = 3;
const RIVE_DIRECTION_INHERIT: i32 = 0;
const RIVE_DIRECTION_RTL: i32 = 2;
const RIVE_FLEX_DIRECTION_COLUMN: i32 = 0;
const RIVE_FLEX_DIRECTION_COLUMN_REVERSE: i32 = 1;
const RIVE_FLEX_DIRECTION_ROW: i32 = 2;
const RIVE_FLEX_DIRECTION_ROW_REVERSE: i32 = 3;
const RIVE_GRID_TEMPLATE_COLUMNS: i32 = 0;
const RIVE_GRID_TEMPLATE_ROWS: i32 = 1;
const RIVE_GRID_TRACK_AUTO: i32 = 0;
const RIVE_GRID_TRACK_POINTS: i32 = 1;
const RIVE_GRID_TRACK_FRACTION: i32 = 3;
