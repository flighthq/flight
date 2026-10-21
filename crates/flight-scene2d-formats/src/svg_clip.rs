use std::collections::HashMap;

use flight_clip::contract::{
    ClipRegion, create_clip_region_from_path, create_clip_region_state, intersect_clip_regions,
    transform_clip_region, union_clip_regions,
};
use flight_entity::Ref;
use flight_geometry::{Matrix, Rectangle, clone_matrix, create_matrix};
use flight_importdiagnostics::{
    ImportDiagnosticDetailValue, ImportDiagnosticSeverity, report_import_diagnostic,
};
use flight_path::{Path, PathWinding, create_path, transform_path};

use crate::svg_bounds::{create_svg_node2d_bounds, has_unmeasurable_svg_text};
use crate::svg_geometry_path::create_svg_geometry_path;
use crate::svg_style::{resolve_svg_definition_style, resolve_svg_style};
use crate::svg_transform::{
    create_svg_viewport_matrix, multiply_svg_matrices, parse_svg_transform,
};
use crate::svg_xml::{
    parse_url_reference, svg_attribute, svg_local_name, svg_number_attribute,
    svg_optional_number_attribute,
};
use crate::types::*;

struct SvgClipGeometry {
    path: Option<Path>,
    region: Option<Ref<ClipRegion>>,
    winding: PathWinding,
}

fn create_svg_clip_region(
    element: &Ref<flight_xml::XmlElement>,
    target_bounds: Option<&Rectangle>,
    context: &mut SvgImportContext<'_>,
) -> Ref<ClipRegion> {
    let clip_style = resolve_svg_definition_style(element, context);
    let mut out = create_path();
    out.winding = clip_style.clip_rule;
    let mut geometries = Vec::new();
    collect_svg_clip_geometry(element, &clip_style, None, context, &mut geometries);
    let mut winding = None;
    let mut mixed_winding_reported = false;
    let mut clipped_regions = Vec::new();
    for geometry in geometries {
        if winding.is_none() {
            winding = Some(geometry.winding);
            out.winding = geometry.winding;
        } else if winding != Some(geometry.winding) && !mixed_winding_reported {
            mixed_winding_reported = true;
            let id = svg_attribute(&element.read().unwrap(), "id")
                .unwrap_or("")
                .to_string();
            report_import_diagnostic(
                context.diagnostics.as_deref_mut(),
                ImportDiagnosticSeverity::Recover,
                "svg.mixed-clip-rule",
                "createSvgClipRegion",
                Some(HashMap::from([(
                    "id".to_string(),
                    ImportDiagnosticDetailValue::String(id),
                )])),
            );
        }
        if let Some(path) = &geometry.path {
            append_path_data(&mut out, path);
        }
        if let Some(region) = geometry.region {
            clipped_regions.push(region);
        }
    }
    let state = create_clip_region_state();
    let mut region = create_clip_region_from_path(&out, None);
    for clipped_region in clipped_regions {
        let empty = out.commands.is_empty() && {
            let region = region.read().unwrap();
            region.rect.width == 0.0 && region.rect.height == 0.0
        };
        if empty {
            region = clipped_region;
        } else {
            union_clip_regions(&state, &region, &region, &clipped_region);
        }
    }
    region = intersect_svg_clip_reference(&region, element, None, context);
    let (units, authored_transform) = {
        let element = element.read().unwrap();
        let name = svg_local_name(&element.name).to_string();
        let units = if name == "mask" {
            svg_attribute(&element, "maskContentUnits")
        } else {
            svg_attribute(&element, "clipPathUnits")
        }
        .map(str::to_string);
        let transform = parse_svg_transform(svg_attribute(&element, "transform"));
        (units, transform)
    };
    let transform = if units.as_deref() == Some("objectBoundingBox") {
        target_bounds.map(|bounds| {
            let unit = create_matrix(bounds.width, 0.0, 0.0, bounds.height, bounds.x, bounds.y);
            return authored_transform
                .as_ref()
                .map_or(unit.clone(), |authored| {
                    let mut out = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
                    multiply_svg_matrices(&mut out, &unit, authored);
                    return out;
                });
        })
    } else {
        authored_transform
    };
    if let Some(transform) = transform {
        transform_clip_region(&state, &region, &region, &transform);
    }
    return region;
}

fn append_path_data(out: &mut Path, source: &Path) {
    out.commands.extend_from_slice(&source.commands);
    out.data.extend_from_slice(&source.data);
}

fn apply_svg_element_clip(
    target: &flight_scene2d::Node2DRef,
    element: &Ref<flight_xml::XmlElement>,
    context: &mut SvgImportContext<'_>,
    target_bounds: Option<&Rectangle>,
) {
    let (clip_reference, mask_reference) = {
        let element = element.read().unwrap();
        (
            parse_url_reference(svg_attribute(&element, "clip-path")),
            parse_url_reference(svg_attribute(&element, "mask")),
        )
    };
    let Some(clip_id) = clip_reference.as_ref().or(mask_reference.as_ref()) else {
        return;
    };
    let Some(clip_element) = context.elements_by_id.get(clip_id).cloned() else {
        report_clip_diagnostic(
            context,
            ImportDiagnosticSeverity::Drop,
            "svg.unresolved-clip-reference",
            "applySvgElementClip",
            clip_id,
            None,
        );
        return;
    };
    if uses_svg_object_bounding_box_units(&clip_element) && target_bounds.is_none() {
        if has_unmeasurable_svg_text(target) {
            report_clip_diagnostic(
                context,
                ImportDiagnosticSeverity::Skip,
                "svg.object-bounding-box-clip-unmeasurable-bounds",
                "applySvgElementClip",
                clip_id,
                None,
            );
        }
        return;
    }
    let region = create_svg_clip_region(&clip_element, target_bounds, context);
    target.write().unwrap().node2d_fields_mut().clip = Some(region);
    if let Some(mask_reference) = mask_reference {
        report_clip_diagnostic(
            context,
            ImportDiagnosticSeverity::Recover,
            "svg.mask-as-hard-clip",
            "applySvgElementClip",
            &mask_reference,
            None,
        );
    }
}

fn collect_svg_clip_geometry(
    element: &Ref<flight_xml::XmlElement>,
    parent_style: &SvgStyle,
    parent_transform: Option<&Matrix>,
    context: &mut SvgImportContext<'_>,
    out: &mut Vec<SvgClipGeometry>,
) {
    let children = element.read().unwrap().children.clone();
    for child in children {
        collect_svg_clip_geometry_element(
            &child,
            parent_style,
            parent_transform,
            context,
            out,
            None,
        );
    }
}

fn collect_svg_clip_geometry_element(
    element: &Ref<flight_xml::XmlElement>,
    parent_style: &SvgStyle,
    parent_transform: Option<&Matrix>,
    context: &mut SvgImportContext<'_>,
    out: &mut Vec<SvgClipGeometry>,
    viewport_element: Option<&Ref<flight_xml::XmlElement>>,
) {
    let style = resolve_svg_style(&element.read().unwrap(), parent_style, context);
    if style.display == "none" {
        return;
    }
    let name = svg_local_name(&element.read().unwrap().name).to_string();
    let geometry_transform = if name == "use" {
        let element = element.read().unwrap();
        Some(create_matrix(
            1.0,
            0.0,
            0.0,
            1.0,
            svg_number_attribute(&element, "x", 0.0),
            svg_number_attribute(&element, "y", 0.0),
        ))
    } else if name == "svg" {
        create_svg_viewport_matrix(&element.read().unwrap(), None)
    } else if name == "symbol" {
        viewport_element.and_then(|viewport| {
            let viewport = viewport.read().unwrap();
            let options = SvgViewportOptions {
                height: svg_optional_number_attribute(&viewport, "height"),
                width: svg_optional_number_attribute(&viewport, "width"),
                x: Some(0.0),
                y: Some(0.0),
            };
            return create_svg_viewport_matrix(&element.read().unwrap(), Some(&options));
        })
    } else {
        None
    };
    let author_transform =
        parse_svg_transform(svg_attribute(&element.read().unwrap(), "transform"));
    let local_transform =
        combine_svg_transforms(author_transform.as_ref(), geometry_transform.as_ref());
    let transform = combine_svg_transforms(parent_transform, local_transform.as_ref());

    if name == "use" {
        collect_svg_clip_use_geometry(element, &style, transform.as_ref(), context, out);
        return;
    }

    if let Some(path) = create_svg_geometry_path(&element.read().unwrap(), style.clip_rule) {
        if style.visibility != "visible" {
            return;
        }
        let transformed_path = transform.as_ref().map_or(path.clone(), |transform| {
            let mut transformed = create_path();
            transformed.winding = path.winding;
            transform_path(&path, transform, &mut transformed);
            return transformed;
        });
        let clip_reference =
            parse_url_reference(svg_attribute(&element.read().unwrap(), "clip-path"));
        if clip_reference.is_none() {
            out.push(SvgClipGeometry {
                path: Some(transformed_path),
                region: None,
                winding: path.winding,
            });
        } else {
            let base = create_clip_region_from_path(&transformed_path, None);
            let region = intersect_svg_clip_reference(&base, element, transform.as_ref(), context);
            let winding = region.read().unwrap().winding;
            out.push(SvgClipGeometry {
                path: None,
                region: Some(region),
                winding,
            });
        }
        return;
    }
    if matches!(name.as_str(), "a" | "g" | "svg" | "switch" | "symbol") {
        let start = out.len();
        collect_svg_clip_geometry(element, &style, transform.as_ref(), context, out);
        if parse_url_reference(svg_attribute(&element.read().unwrap(), "clip-path")).is_some() {
            for geometry in &mut out[start..] {
                let base = geometry.region.clone().unwrap_or_else(|| {
                    return create_clip_region_from_path(geometry.path.as_ref().unwrap(), None);
                });
                let region =
                    intersect_svg_clip_reference(&base, element, transform.as_ref(), context);
                geometry.path = None;
                geometry.winding = region.read().unwrap().winding;
                geometry.region = Some(region);
            }
        }
        return;
    }
    if name == "text" {
        report_element_diagnostic(
            context,
            ImportDiagnosticSeverity::Skip,
            "svg.unsupported-clip-text",
            "collectSvgClipGeometryElement",
            &name,
        );
    }
}

fn collect_svg_clip_use_geometry(
    element: &Ref<flight_xml::XmlElement>,
    style: &SvgStyle,
    transform: Option<&Matrix>,
    context: &mut SvgImportContext<'_>,
    out: &mut Vec<SvgClipGeometry>,
) {
    let href = svg_attribute(&element.read().unwrap(), "href").map(str::to_string);
    let id = href.as_deref().and_then(|href| href.strip_prefix('#'));
    let Some(id) = id else {
        report_import_diagnostic(
            context.diagnostics.as_deref_mut(),
            ImportDiagnosticSeverity::Drop,
            "svg.unresolved-use",
            "collectSvgClipUseGeometry",
            None,
        );
        return;
    };
    if context
        .resolving_clip_uses
        .iter()
        .any(|candidate| candidate == id)
    {
        report_clip_diagnostic(
            context,
            ImportDiagnosticSeverity::Reject,
            "svg.recursive-use",
            "collectSvgClipUseGeometry",
            id,
            None,
        );
        return;
    }
    let Some(referenced) = context.elements_by_id.get(id).cloned() else {
        report_clip_diagnostic(
            context,
            ImportDiagnosticSeverity::Drop,
            "svg.unresolved-use",
            "collectSvgClipUseGeometry",
            id,
            None,
        );
        return;
    };
    context.resolving_clip_uses.push(id.to_string());
    collect_svg_clip_geometry_element(&referenced, style, transform, context, out, Some(element));
    context
        .resolving_clip_uses
        .retain(|candidate| candidate != id);
}

fn combine_svg_transforms(a: Option<&Matrix>, b: Option<&Matrix>) -> Option<Matrix> {
    return match (a, b) {
        (None, None) => None,
        (Some(a), None) => Some(clone_matrix(a)),
        (None, Some(b)) => Some(clone_matrix(b)),
        (Some(a), Some(b)) => {
            let mut out = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
            multiply_svg_matrices(&mut out, a, b);
            Some(out)
        }
    };
}

fn intersect_svg_clip_reference(
    base: &Ref<ClipRegion>,
    element: &Ref<flight_xml::XmlElement>,
    transform: Option<&Matrix>,
    context: &mut SvgImportContext<'_>,
) -> Ref<ClipRegion> {
    let id = parse_url_reference(svg_attribute(&element.read().unwrap(), "clip-path"));
    let Some(id) = id else {
        return base.clone();
    };
    let recursive = context
        .resolving_clips
        .iter()
        .any(|candidate| candidate == &id);
    let referenced = context.elements_by_id.get(&id).cloned();
    let Some(referenced) = referenced.filter(|_| !recursive) else {
        report_clip_diagnostic(
            context,
            if recursive {
                ImportDiagnosticSeverity::Reject
            } else {
                ImportDiagnosticSeverity::Drop
            },
            "svg.unresolved-clip-reference",
            "intersectSvgClipReference",
            &id,
            None,
        );
        return base.clone();
    };
    if transform.is_some() && uses_svg_object_bounding_box_units(&referenced) {
        report_clip_diagnostic(
            context,
            ImportDiagnosticSeverity::Skip,
            "svg.clip-nested-intersection-unsupported",
            "intersectSvgClipReference",
            &id,
            Some("transformed-object-bounding-box-target"),
        );
        return base.clone();
    }
    context.resolving_clips.push(id.clone());
    let bounds = base.read().unwrap().rect.clone();
    let referenced_region = create_svg_clip_region(&referenced, Some(&bounds), context);
    context.resolving_clips.retain(|candidate| candidate != &id);
    let state = create_clip_region_state();
    if let Some(transform) = transform {
        transform_clip_region(&state, &referenced_region, &referenced_region, transform);
    }
    intersect_clip_regions(&state, base, base, &referenced_region);
    return base.clone();
}

fn report_clip_diagnostic(
    context: &mut SvgImportContext<'_>,
    severity: ImportDiagnosticSeverity,
    kind: &str,
    origin: &str,
    id: &str,
    reason: Option<&str>,
) {
    let mut detail = HashMap::from([(
        "id".to_string(),
        ImportDiagnosticDetailValue::String(id.to_string()),
    )]);
    if let Some(reason) = reason {
        detail.insert(
            "reason".to_string(),
            ImportDiagnosticDetailValue::String(reason.to_string()),
        );
    }
    report_import_diagnostic(
        context.diagnostics.as_deref_mut(),
        severity,
        kind,
        origin,
        Some(detail),
    );
}

fn report_element_diagnostic(
    context: &mut SvgImportContext<'_>,
    severity: ImportDiagnosticSeverity,
    kind: &str,
    origin: &str,
    element: &str,
) {
    report_import_diagnostic(
        context.diagnostics.as_deref_mut(),
        severity,
        kind,
        origin,
        Some(HashMap::from([(
            "element".to_string(),
            ImportDiagnosticDetailValue::String(element.to_string()),
        )])),
    );
}

pub fn svg_path_clip_handler(context: &mut SvgClipContext<'_, '_>) {
    let bounds = create_svg_node2d_bounds(&context.target, context.import);
    apply_svg_element_clip(
        &context.target,
        &context.element,
        context.import,
        bounds.as_ref(),
    );
}

pub fn uses_svg_object_bounding_box_units(element: &Ref<flight_xml::XmlElement>) -> bool {
    let element = element.read().unwrap();
    let attribute = if svg_local_name(&element.name) == "mask" {
        "maskContentUnits"
    } else {
        "clipPathUnits"
    };
    return svg_attribute(&element, attribute) == Some("objectBoundingBox");
}
