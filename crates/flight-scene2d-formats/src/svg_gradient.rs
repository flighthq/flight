use std::cmp::Ordering;
use std::collections::HashMap;

use flight_geometry::{
    Matrix, clone_matrix, create_gradient_transform_matrix, create_matrix, create_rectangle,
    inverse_matrix,
};
use flight_importdiagnostics::{
    ImportDiagnosticDetailValue, ImportDiagnosticSeverity, report_import_diagnostic,
};
use flight_path::{Path, get_path_bounds};
use flight_shape::contract::SpreadMethod;
use flight_xml::XmlElement;

use crate::svg_color::resolve_svg_color;
use crate::svg_style::{parse_style_declarations, resolve_svg_definition_style};
use crate::svg_transform::{multiply_svg_matrices, parse_svg_transform};
use crate::svg_xml::{
    parse_svg_coordinate, parse_svg_css_number, parse_url_reference, svg_attribute, svg_local_name,
};
use crate::types::{
    SvgGradient, SvgGradientKind, SvgGradientStop, SvgGradientUnits, SvgImportContext,
};

pub fn create_svg_gradient_matrix(gradient: &SvgGradient, path: &Path) -> Matrix {
    let mut bounds = create_rectangle(0.0, 0.0, 0.0, 0.0);
    get_path_bounds(path, &mut bounds);
    let map_x = |value: f32| -> f32 {
        if gradient.units == SvgGradientUnits::ObjectBoundingBox {
            bounds.x + value * bounds.width
        } else {
            value
        }
    };
    let map_y = |value: f32| -> f32 {
        if gradient.units == SvgGradientUnits::ObjectBoundingBox {
            bounds.y + value * bounds.height
        } else {
            value
        }
    };
    let mut matrix = if gradient.kind == SvgGradientKind::Linear {
        let x1 = map_x(gradient.x1);
        let y1 = map_y(gradient.y1);
        let x2 = map_x(gradient.x2);
        let y2 = map_y(gradient.y2);
        let delta_x = x2 - x1;
        let delta_y = y2 - y1;
        let length = delta_x.hypot(delta_y).max(1.0);
        create_gradient_transform_matrix(
            length,
            length,
            delta_y.atan2(delta_x),
            (x1 + x2) / 2.0 - length / 2.0,
            (y1 + y2) / 2.0 - length / 2.0,
        )
    } else {
        let radius_x = if gradient.units == SvgGradientUnits::ObjectBoundingBox {
            gradient.radius * bounds.width
        } else {
            gradient.radius
        };
        let radius_y = if gradient.units == SvgGradientUnits::ObjectBoundingBox {
            gradient.radius * bounds.height
        } else {
            gradient.radius
        };
        let box_width = (radius_x * 2.0).max(1.0);
        let box_height = (radius_y * 2.0).max(1.0);
        create_gradient_transform_matrix(
            box_width,
            box_height,
            0.0,
            map_x(gradient.cx) - box_width / 2.0,
            map_y(gradient.cy) - box_height / 2.0,
        )
    };
    if let Some(transform) = &gradient.transform {
        let mut composed = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        multiply_svg_matrices(&mut composed, transform, &matrix);
        matrix = composed;
    }
    return matrix;
}

fn clone_svg_gradient(source: &SvgGradient) -> SvgGradient {
    return SvgGradient {
        cx: source.cx,
        cy: source.cy,
        fx: source.fx,
        fy: source.fy,
        kind: source.kind,
        radius: source.radius,
        spread_method: source.spread_method,
        stops: source.stops.clone(),
        transform: source.transform.as_ref().map(clone_matrix),
        units: source.units,
        x1: source.x1,
        x2: source.x2,
        y1: source.y1,
        y2: source.y2,
    };
}

pub fn has_zero_area_svg_gradient_box(gradient: &SvgGradient, path: &Path) -> bool {
    if gradient.units != SvgGradientUnits::ObjectBoundingBox {
        return false;
    }
    let mut bounds = create_rectangle(0.0, 0.0, 0.0, 0.0);
    get_path_bounds(path, &mut bounds);
    return bounds.width == 0.0 || bounds.height == 0.0;
}

pub fn parse_svg_gradient(
    element: &flight_entity::Ref<XmlElement>,
    context: &mut SvgImportContext<'_>,
) -> Option<SvgGradient> {
    let (kind, href) = {
        let element = element.read().unwrap();
        (
            if svg_local_name(&element.name) == "linearGradient" {
                SvgGradientKind::Linear
            } else {
                SvgGradientKind::Radial
            },
            svg_attribute(&element, "href").map(str::to_string),
        )
    };
    let inherited_id = href
        .as_deref()
        .and_then(|href| href.strip_prefix('#'))
        .map(str::to_string);
    let mut inherited = inherited_id
        .as_ref()
        .and_then(|id| context.gradients_by_id.get(id))
        .map(clone_svg_gradient);
    if let Some(id) = &inherited_id {
        if inherited.is_none() && !context.resolving_gradients.contains(id) {
            let inherited_element = context.elements_by_id.get(id).cloned();
            let is_gradient = inherited_element.as_ref().is_some_and(|element| {
                matches!(
                    svg_local_name(&element.read().unwrap().name),
                    "linearGradient" | "radialGradient"
                )
            });
            if is_gradient {
                context.resolving_gradients.push(id.clone());
                inherited = parse_svg_gradient(&inherited_element.unwrap(), context);
                context
                    .resolving_gradients
                    .retain(|candidate| candidate != id);
                if let Some(inherited) = &inherited {
                    context
                        .gradients_by_id
                        .insert(id.clone(), clone_svg_gradient(inherited));
                }
            }
        }
        if inherited.is_none() {
            let recursive = context.resolving_gradients.contains(id);
            report_import_diagnostic(
                context.diagnostics.as_deref_mut(),
                if recursive {
                    ImportDiagnosticSeverity::Reject
                } else {
                    ImportDiagnosticSeverity::Drop
                },
                if recursive {
                    "svg.recursive-gradient"
                } else {
                    "svg.unresolved-gradient-reference"
                },
                "parseSvgGradient",
                Some(HashMap::from([(
                    "id".to_string(),
                    ImportDiagnosticDetailValue::String(id.clone()),
                )])),
            );
        }
    }

    let children = element.read().unwrap().children.clone();
    let mut stops = Vec::new();
    for child in children {
        let (name, style, stop_color, stop_opacity, offset) = {
            let child = child.read().unwrap();
            (
                svg_local_name(&child.name).to_string(),
                svg_attribute(&child, "style").unwrap_or("").to_string(),
                svg_attribute(&child, "stop-color").map(str::to_string),
                svg_attribute(&child, "stop-opacity").map(str::to_string),
                svg_attribute(&child, "offset").map(str::to_string),
            )
        };
        if name != "stop" {
            continue;
        }
        let declarations = parse_style_declarations(&style);
        let definition_style = resolve_svg_definition_style(&child, context);
        let color_text = stop_color
            .as_deref()
            .or_else(|| declarations.get("stop-color").map(String::as_str))
            .unwrap_or("#000000");
        let Some(mut color) = resolve_svg_color(color_text, &definition_style.color) else {
            continue;
        };
        color.alpha *= parse_svg_css_number(
            stop_opacity
                .as_deref()
                .or_else(|| declarations.get("stop-opacity").map(String::as_str)),
            1.0,
        )
        .clamp(0.0, 1.0);
        stops.push(SvgGradientStop {
            color,
            offset: parse_svg_coordinate(offset.as_deref(), 0.0).clamp(0.0, 1.0),
        });
    }
    let mut resolved_stops = if stops.is_empty() {
        inherited
            .as_ref()
            .map(|gradient| gradient.stops.clone())
            .unwrap_or_default()
    } else {
        stops
    };
    if resolved_stops.is_empty() {
        return None;
    }
    resolved_stops.sort_by(|left, right| {
        left.offset
            .partial_cmp(&right.offset)
            .unwrap_or(Ordering::Equal)
    });

    let (cx, cy, fx, fy, radius, spread_method, units, x1, x2, y1, y2) = {
        let element = element.read().unwrap();
        (
            svg_attribute(&element, "cx").map(str::to_string),
            svg_attribute(&element, "cy").map(str::to_string),
            svg_attribute(&element, "fx").map(str::to_string),
            svg_attribute(&element, "fy").map(str::to_string),
            svg_attribute(&element, "r").map(str::to_string),
            svg_attribute(&element, "spreadMethod").map(str::to_string),
            svg_attribute(&element, "gradientUnits").map(str::to_string),
            svg_attribute(&element, "x1").map(str::to_string),
            svg_attribute(&element, "x2").map(str::to_string),
            svg_attribute(&element, "y1").map(str::to_string),
            svg_attribute(&element, "y2").map(str::to_string),
        )
    };
    let transform = resolve_svg_gradient_transform(element, inherited.as_ref(), context);
    return Some(SvgGradient {
        cx: parse_svg_coordinate(
            cx.as_deref(),
            inherited.as_ref().map_or(0.5, |value| value.cx),
        ),
        cy: parse_svg_coordinate(
            cy.as_deref(),
            inherited.as_ref().map_or(0.5, |value| value.cy),
        ),
        fx: parse_svg_coordinate(
            fx.as_deref(),
            inherited.as_ref().map_or(0.5, |value| value.fx),
        ),
        fy: parse_svg_coordinate(
            fy.as_deref(),
            inherited.as_ref().map_or(0.5, |value| value.fy),
        ),
        kind,
        radius: parse_svg_coordinate(
            radius.as_deref(),
            inherited.as_ref().map_or(0.5, |value| value.radius),
        ),
        spread_method: parse_svg_spread_method(spread_method.as_deref())
            .or_else(|| inherited.as_ref().map(|value| value.spread_method))
            .unwrap_or(SpreadMethod::Pad),
        stops: resolved_stops,
        transform,
        units: if units.as_deref() == Some("userSpaceOnUse") {
            SvgGradientUnits::UserSpaceOnUse
        } else {
            inherited
                .as_ref()
                .map_or(SvgGradientUnits::ObjectBoundingBox, |value| value.units)
        },
        x1: parse_svg_coordinate(
            x1.as_deref(),
            inherited.as_ref().map_or(0.0, |value| value.x1),
        ),
        x2: parse_svg_coordinate(
            x2.as_deref(),
            inherited.as_ref().map_or(1.0, |value| value.x2),
        ),
        y1: parse_svg_coordinate(
            y1.as_deref(),
            inherited.as_ref().map_or(0.0, |value| value.y1),
        ),
        y2: parse_svg_coordinate(
            y2.as_deref(),
            inherited.as_ref().map_or(0.0, |value| value.y2),
        ),
    });
}

fn parse_svg_spread_method(value: Option<&str>) -> Option<SpreadMethod> {
    return match value {
        Some("pad") => Some(SpreadMethod::Pad),
        Some("reflect") => Some(SpreadMethod::Reflect),
        Some("repeat") => Some(SpreadMethod::Repeat),
        _ => None,
    };
}

pub fn resolve_svg_gradient<'a>(
    value: &str,
    context: &'a SvgImportContext<'_>,
) -> Option<&'a SvgGradient> {
    let id = parse_url_reference(Some(value))?;
    return context.gradients_by_id.get(&id);
}

fn resolve_svg_gradient_transform(
    element: &flight_entity::Ref<XmlElement>,
    inherited: Option<&SvgGradient>,
    context: &mut SvgImportContext<'_>,
) -> Option<Matrix> {
    let (authored_transform, id) = {
        let element = element.read().unwrap();
        (
            svg_attribute(&element, "gradientTransform").map(str::to_string),
            svg_attribute(&element, "id")
                .unwrap_or("<unnamed>")
                .to_string(),
        )
    };
    let transform = parse_svg_transform(authored_transform.as_deref()).or_else(|| {
        inherited
            .and_then(|gradient| gradient.transform.as_ref())
            .map(clone_matrix)
    })?;
    let mut scratch = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
    if inverse_matrix(&mut scratch, &transform) {
        return Some(transform);
    }
    report_import_diagnostic(
        context.diagnostics.as_deref_mut(),
        ImportDiagnosticSeverity::Recover,
        "svg.gradient-transform-singular",
        "resolveSvgGradientTransform",
        Some(HashMap::from([(
            "gradient".to_string(),
            ImportDiagnosticDetailValue::String(id),
        )])),
    );
    return None;
}
