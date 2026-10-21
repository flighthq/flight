use std::sync::OnceLock;

use flight_geometry::{
    Matrix, Transform2D, create_matrix, create_transform2d, decompose_matrix_to_transform2d,
    multiply_matrix,
};
use flight_scene2d::Node2D;
use flight_xml::XmlElement;
use regex::Regex;

use crate::svg_xml::{
    parse_svg_length, parse_svg_number_list, svg_attribute, svg_number_attribute,
};
use crate::types::{SvgViewport, SvgViewportOptions};

// flight-lint: allow(conform-array) D9 array negotiation: TS readonly number[] maps to the canonical &[f32] slice lane
pub fn create_svg_view_box_matrix(
    view_box: &[f32],
    viewport: &SvgViewport,
    preserve_aspect_ratio_value: &str,
) -> Matrix {
    let height = viewport.height;
    let width = viewport.width;
    let x = viewport.x;
    let y = viewport.y;
    let mut scale_x = if view_box[2] == 0.0 {
        1.0
    } else {
        width / view_box[2]
    };
    let mut scale_y = if view_box[3] == 0.0 {
        1.0
    } else {
        height / view_box[3]
    };
    let preserve_aspect_ratio = preserve_aspect_ratio_value.trim();
    if preserve_aspect_ratio == "none" {
        return create_matrix(
            scale_x,
            0.0,
            0.0,
            scale_y,
            x - view_box[0] * scale_x,
            y - view_box[1] * scale_y,
        );
    }

    let parts = preserve_aspect_ratio
        .split_ascii_whitespace()
        .collect::<Vec<_>>();
    let alignment = if parts.first() == Some(&"defer") {
        parts.get(1).copied().unwrap_or("xMidYMid")
    } else {
        parts.first().copied().unwrap_or("")
    };
    let mode_is_slice = parts.contains(&"slice");
    let uniform_scale = if mode_is_slice {
        scale_x.max(scale_y)
    } else {
        scale_x.min(scale_y)
    };
    scale_x = uniform_scale;
    scale_y = uniform_scale;
    let spare_x = width - view_box[2] * scale_x;
    let spare_y = height - view_box[3] * scale_y;
    let align_x = if alignment.contains("xMax") {
        spare_x
    } else if alignment.contains("xMid") {
        spare_x / 2.0
    } else {
        0.0
    };
    let align_y = if alignment.contains("YMax") {
        spare_y
    } else if alignment.contains("YMid") {
        spare_y / 2.0
    } else {
        0.0
    };
    return create_matrix(
        scale_x,
        0.0,
        0.0,
        scale_y,
        x + align_x - view_box[0] * scale_x,
        y + align_y - view_box[1] * scale_y,
    );
}

pub fn create_svg_viewport_matrix(
    element: &XmlElement,
    viewport: Option<&SvgViewportOptions>,
) -> Option<Matrix> {
    let x = viewport
        .and_then(|viewport| viewport.x)
        .unwrap_or_else(|| svg_number_attribute(element, "x", 0.0));
    let y = viewport
        .and_then(|viewport| viewport.y)
        .unwrap_or_else(|| svg_number_attribute(element, "y", 0.0));
    let view_box = parse_svg_number_list(svg_attribute(element, "viewBox").unwrap_or(""));
    if view_box.len() < 4 {
        if x == 0.0 && y == 0.0 {
            return None;
        }
        return Some(create_matrix(1.0, 0.0, 0.0, 1.0, x, y));
    }
    let width = viewport
        .and_then(|viewport| viewport.width)
        .unwrap_or_else(|| parse_svg_length(svg_attribute(element, "width"), view_box[2]));
    let height = viewport
        .and_then(|viewport| viewport.height)
        .unwrap_or_else(|| parse_svg_length(svg_attribute(element, "height"), view_box[3]));
    return Some(create_svg_view_box_matrix(
        &view_box,
        &SvgViewport {
            height,
            width,
            x,
            y,
        },
        svg_attribute(element, "preserveAspectRatio").unwrap_or("xMidYMid meet"),
    ));
}

pub fn apply_svg_transform(target: &mut dyn Node2D, matrix: Option<&Matrix>) {
    let Some(matrix) = matrix else {
        return;
    };
    let mut transform = create_transform2d(0.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0);
    decompose_matrix_to_transform2d(&mut transform, matrix);
    assign_svg_transform(target, &transform);
}

pub fn assign_svg_transform(target: &mut dyn Node2D, transform: &Transform2D) {
    let fields = target.node2d_fields_mut();
    fields.pivot_x = transform.pivot_x;
    fields.pivot_y = transform.pivot_y;
    fields.rotation = transform.rotation;
    fields.scale_x = transform.scale_x;
    fields.scale_y = transform.scale_y;
    fields.skew_x = transform.skew_x;
    fields.skew_y = transform.skew_y;
    fields.x = transform.x;
    fields.y = transform.y;
}

fn identity_matrix() -> Matrix {
    return create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
}

// flight-lint: allow(conform-params) D24: caller-owned matrix replaces the structured Matrix return (user-approved)
pub fn multiply_svg_matrices(out: &mut Matrix, a: &Matrix, b: &Matrix) {
    multiply_matrix(out, a, b);
}

pub fn parse_svg_transform(value: Option<&str>) -> Option<Matrix> {
    let value = value?;
    if value.trim().is_empty() {
        return None;
    }
    let mut result = identity_matrix();
    let mut matched = false;
    for captures in svg_transform_expression().captures_iter(value) {
        matched = true;
        let name = captures.get(1)?.as_str();
        let values = parse_svg_number_list(captures.get(2)?.as_str());
        let mut operation = identity_matrix();
        if name == "matrix" && values.len() >= 6 {
            operation = create_matrix(
                values[0], values[1], values[2], values[3], values[4], values[5],
            );
        } else if name == "translate" {
            operation.tx = values.first().copied().unwrap_or(0.0);
            operation.ty = values.get(1).copied().unwrap_or(0.0);
        } else if name == "scale" {
            operation.a = values.first().copied().unwrap_or(1.0);
            operation.d = values
                .get(1)
                .copied()
                .or_else(|| values.first().copied())
                .unwrap_or(1.0);
        } else if name == "rotate" {
            let radians = values.first().copied().unwrap_or(0.0) * std::f32::consts::PI / 180.0;
            let cosine = radians.cos();
            let sine = radians.sin();
            let rotation = create_matrix(cosine, sine, -sine, cosine, 0.0, 0.0);
            if values.len() >= 3 {
                let translation = create_matrix(1.0, 0.0, 0.0, 1.0, values[1], values[2]);
                let inverse_translation = create_matrix(1.0, 0.0, 0.0, 1.0, -values[1], -values[2]);
                let mut translated_rotation = identity_matrix();
                multiply_svg_matrices(&mut translated_rotation, &rotation, &inverse_translation);
                multiply_svg_matrices(&mut operation, &translation, &translated_rotation);
            } else {
                operation = rotation;
            }
        } else if name == "skewX" {
            operation.c =
                (values.first().copied().unwrap_or(0.0) * std::f32::consts::PI / 180.0).tan();
        } else if name == "skewY" {
            operation.b =
                (values.first().copied().unwrap_or(0.0) * std::f32::consts::PI / 180.0).tan();
        } else {
            continue;
        }
        let mut composed = identity_matrix();
        multiply_svg_matrices(&mut composed, &result, &operation);
        result = composed;
    }
    return matched.then_some(result);
}

fn svg_transform_expression() -> &'static Regex {
    static EXPRESSION: OnceLock<Regex> = OnceLock::new();
    return EXPRESSION.get_or_init(|| {
        Regex::new(r"([a-zA-Z]+)\s*\(([^)]*)\)").expect("static SVG transform regex")
    });
}
