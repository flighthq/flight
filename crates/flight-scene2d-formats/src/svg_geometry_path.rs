use flight_path::{
    Path, PathWinding, append_path_circle, append_path_ellipse, append_path_line_to,
    append_path_move_to, append_path_polygon, append_path_polyline, append_path_rectangle,
    append_path_rounded_rectangle, create_path,
};
use flight_path_formats::parse_svg_path_data;
use flight_xml::XmlElement;

use crate::svg_xml::{parse_svg_number_list, svg_attribute, svg_local_name, svg_number_attribute};

// flight-lint: allow(f64) flight-path stores path coordinates as f64 under the approved D1 path candidate
pub fn create_svg_geometry_path(element: &XmlElement, winding: PathWinding) -> Option<Path> {
    let name = svg_local_name(&element.name);
    if name == "path" {
        let mut path = parse_svg_path_data(svg_attribute(element, "d").unwrap_or(""))?;
        path.winding = winding;
        return Some(path);
    }

    let mut path = create_path(Some(flight_path::PathWinding::NonZero));
    path.winding = winding;
    if name == "rect" {
        let x = svg_number_attribute(element, "x", 0.0);
        let y = svg_number_attribute(element, "y", 0.0);
        let width = svg_number_attribute(element, "width", 0.0);
        let height = svg_number_attribute(element, "height", 0.0);
        let radius_x = svg_number_attribute(element, "rx", 0.0).max(0.0);
        let radius_y = svg_number_attribute(element, "ry", radius_x).max(0.0);
        if width <= 0.0 || height <= 0.0 {
            return Some(path);
        }
        if radius_x > 0.0 || radius_y > 0.0 {
            append_path_rounded_rectangle(
                &mut path,
                f64::from(x),
                f64::from(y),
                f64::from(width),
                f64::from(height),
                f64::from(radius_x.max(radius_y).min(width / 2.0).min(height / 2.0)),
            );
        } else {
            append_path_rectangle(
                &mut path,
                f64::from(x),
                f64::from(y),
                f64::from(width),
                f64::from(height),
            );
        }
        return Some(path);
    }
    if name == "circle" {
        append_path_circle(
            &mut path,
            f64::from(svg_number_attribute(element, "cx", 0.0)),
            f64::from(svg_number_attribute(element, "cy", 0.0)),
            f64::from(svg_number_attribute(element, "r", 0.0).max(0.0)),
        );
        return Some(path);
    }
    if name == "ellipse" {
        append_path_ellipse(
            &mut path,
            f64::from(svg_number_attribute(element, "cx", 0.0)),
            f64::from(svg_number_attribute(element, "cy", 0.0)),
            f64::from(svg_number_attribute(element, "rx", 0.0).max(0.0)),
            f64::from(svg_number_attribute(element, "ry", 0.0).max(0.0)),
        );
        return Some(path);
    }
    if name == "line" {
        append_path_move_to(
            &mut path,
            f64::from(svg_number_attribute(element, "x1", 0.0)),
            f64::from(svg_number_attribute(element, "y1", 0.0)),
        );
        append_path_line_to(
            &mut path,
            f64::from(svg_number_attribute(element, "x2", 0.0)),
            f64::from(svg_number_attribute(element, "y2", 0.0)),
        );
        return Some(path);
    }
    if name == "polygon" || name == "polyline" {
        let points = parse_svg_number_list(svg_attribute(element, "points").unwrap_or(""))
            .into_iter()
            .map(f64::from)
            .collect::<Vec<_>>();
        if name == "polygon" {
            append_path_polygon(&mut path, &points);
        } else {
            append_path_polyline(&mut path, &points);
        }
        return Some(path);
    }
    return None;
}
