// flight-lint: allow-file(f64) SVG paint feeds the canonical f64 retained path and shape-command lanes

use std::collections::HashMap;

use flight_geometry::create_rectangle;
use flight_importdiagnostics::{
    report_import_diagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
};
use flight_path::{create_path, dash_path, get_path_bounds, Path};
use flight_scene2d::contract::Node2DRef;
use flight_shape::contract::{
    append_shape_begin_fill, append_shape_begin_gradient_fill, append_shape_end_fill,
    append_shape_line_gradient_style, append_shape_line_style, append_shape_path, create_shape,
    get_shape_runtime, register_default_shape_bounds_commands, CapsStyle, GradientType, JointStyle,
    LineScaleMode, Shape,
};

use crate::svg_color::resolve_svg_color;
use crate::svg_document::{apply_svg_element_appearance, apply_svg_element_clip_family};
use crate::svg_geometry_path::create_svg_geometry_path;
use crate::svg_gradient::{
    create_svg_gradient_matrix, has_zero_area_svg_gradient_box, resolve_svg_gradient,
};
use crate::svg_style::resolve_svg_style;
use crate::svg_xml::{parse_svg_number_list, parse_url_reference, svg_local_name};
use crate::types::*;

fn append_svg_shape_paint(
    shape: &flight_entity::Ref<Shape>,
    path: &Path,
    style: &SvgStyle,
    context: &mut SvgElementContext<'_, '_>,
) {
    let fill_gradient = resolve_svg_gradient(&style.fill, context.import);
    let fill_color = resolve_svg_color(&style.fill, &style.color);
    if fill_gradient
        .as_ref()
        .is_some_and(|gradient| has_zero_area_svg_gradient_box(gradient, path))
    {
        return;
    }
    if let Some(gradient) = &fill_gradient {
        let colors = gradient
            .stops
            .iter()
            .map(|stop| (stop.color.rgb << 8) | 0xff)
            .collect::<Vec<_>>();
        let alphas = gradient
            .stops
            .iter()
            .map(|stop| f64::from(stop.color.alpha * style.fill_opacity))
            .collect::<Vec<_>>();
        let ratios = gradient
            .stops
            .iter()
            .map(|stop| f64::from((stop.offset * 255.0).round()))
            .collect::<Vec<_>>();
        let matrix = create_svg_gradient_matrix(gradient, path);
        append_shape_begin_gradient_fill(
            shape,
            map_svg_gradient_kind(gradient.kind),
            &colors,
            &alphas,
            &ratios,
            Some(&matrix),
            Some(gradient.spread_method),
            None,
            None,
        );
    } else if let Some(color) = &fill_color {
        append_shape_begin_fill(
            shape,
            (color.rgb << 8) | 0xff,
            Some(f64::from(color.alpha * style.fill_opacity)),
        );
    }
    if fill_gradient.is_some() || fill_color.is_some() {
        append_shape_path(shape, &path.commands, &path.data, Some(path.winding));
        append_shape_end_fill(shape);
    } else if parse_url_reference(Some(&style.fill)).is_some() {
        report_svg_paint_drop(
            context,
            "svg.unresolved-fill-gradient",
            "appendSvgShapePaint",
        );
    }

    let stroke_gradient = resolve_svg_gradient(&style.stroke, context.import);
    let stroke_color = resolve_svg_color(&style.stroke, &style.color);
    if stroke_gradient.is_none() && stroke_color.is_none() {
        if parse_url_reference(Some(&style.stroke)).is_some() {
            report_svg_paint_drop(
                context,
                "svg.unresolved-stroke-gradient",
                "appendSvgShapePaint",
            );
        }
        return;
    }

    append_shape_line_style(
        shape,
        Some(f64::from(style.stroke_width)),
        stroke_color
            .as_ref()
            .map_or(0x000000ff, |color| (color.rgb << 8) | 0xff),
        Some(f64::from(
            stroke_color.as_ref().map_or(1.0, |color| color.alpha) * style.stroke_opacity,
        )),
        Some(false),
        Some(LineScaleMode::Normal),
        Some(map_svg_line_cap(&style.stroke_linecap)),
        Some(map_svg_line_join(&style.stroke_linejoin)),
        Some(f64::from(style.stroke_miterlimit)),
    );
    if let Some(gradient) = &stroke_gradient {
        let colors = gradient
            .stops
            .iter()
            .map(|stop| (stop.color.rgb << 8) | 0xff)
            .collect::<Vec<_>>();
        let alphas = gradient
            .stops
            .iter()
            .map(|stop| f64::from(stop.color.alpha * style.stroke_opacity))
            .collect::<Vec<_>>();
        let ratios = gradient
            .stops
            .iter()
            .map(|stop| f64::from((stop.offset * 255.0).round()))
            .collect::<Vec<_>>();
        let matrix = create_svg_gradient_matrix(gradient, path);
        append_shape_line_gradient_style(
            shape,
            map_svg_gradient_kind(gradient.kind),
            &colors,
            &alphas,
            &ratios,
            Some(&matrix),
            Some(gradient.spread_method),
            None,
            None,
        );
    }
    if style.stroke_dasharray == "none" {
        append_shape_path(shape, &path.commands, &path.data, Some(path.winding));
        return;
    }
    let mut dash = parse_svg_number_list(&style.stroke_dasharray)
        .into_iter()
        .filter(|value| *value >= 0.0)
        .map(f64::from)
        .collect::<Vec<_>>();
    if dash.is_empty() {
        append_shape_path(shape, &path.commands, &path.data, Some(path.winding));
        return;
    }
    if dash.len() % 2 != 0 {
        dash.extend(dash.clone());
    }
    let mut dashed = create_path();
    dashed.winding = path.winding;
    dash_path(
        path,
        &dash,
        f64::from(style.stroke_dashoffset),
        &mut dashed,
        None,
    );
    append_shape_path(shape, &dashed.commands, &dashed.data, Some(dashed.winding));
}

fn map_svg_gradient_kind(value: SvgGradientKind) -> GradientType {
    return match value {
        SvgGradientKind::Linear => GradientType::Linear,
        SvgGradientKind::Radial => GradientType::Radial,
    };
}

fn map_svg_line_cap(value: &str) -> CapsStyle {
    return match value {
        "round" => CapsStyle::Round,
        "square" => CapsStyle::Square,
        _ => CapsStyle::None,
    };
}

fn map_svg_line_join(value: &str) -> JointStyle {
    return match value {
        "bevel" => JointStyle::Bevel,
        "round" => JointStyle::Round,
        _ => JointStyle::Miter,
    };
}

fn report_svg_paint_drop(context: &mut SvgElementContext<'_, '_>, kind: &str, origin: &str) {
    let name = svg_local_name(&context.element.read().unwrap().name).to_string();
    report_import_diagnostic(
        context.import.diagnostics.as_deref_mut(),
        ImportDiagnosticSeverity::Drop,
        kind,
        origin,
        Some(HashMap::from([(
            "element".to_string(),
            ImportDiagnosticDetailValue::String(name),
        )])),
    );
}

pub fn svg_geometry_element_handler(context: &mut SvgElementContext<'_, '_>) -> Option<Node2DRef> {
    let style = resolve_svg_style(
        &context.element.read().unwrap(),
        context.parent_style,
        context.import,
    );
    let path = create_svg_geometry_path(&context.element.read().unwrap(), style.fill_rule)?;
    let shape = create_shape(None);
    let bounds_state = get_shape_runtime(&*shape.read().unwrap())?
        .read()
        .unwrap()
        .bounds_state
        .clone();
    register_default_shape_bounds_commands(&bounds_state);
    let node: Node2DRef = shape.clone();
    apply_svg_element_appearance(
        &node,
        &context.element,
        context.parent_style,
        context.import,
        None,
        false,
    );
    append_svg_shape_paint(&shape, &path, &style, context);
    let mut bounds = create_rectangle(0.0, 0.0, 0.0, 0.0);
    get_path_bounds(&path, &mut bounds);
    context
        .import
        .object_bounding_boxes
        .push((node.clone(), bounds));
    apply_svg_element_clip_family(&node, &context.element, context.import);
    return Some(node);
}
