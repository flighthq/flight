use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use flight_geometry::{create_matrix, create_rectangle};
use flight_importdiagnostics::{
    ImportDiagnosticDetailValue, ImportDiagnosticSeverity, report_import_diagnostic,
};
use flight_scene2d::contract::{Node2DRef, create_sprite};
use flight_texture::contract::{
    CreateTexture2DOptions, CreateTextureOptions, TextureSourceRef, create_texture,
};

use crate::svg_document::{apply_svg_element_appearance, apply_svg_element_clip_family};
use crate::svg_transform::create_svg_view_box_matrix;
use crate::svg_xml::{svg_attribute, svg_number_attribute};
use crate::types::*;

fn create_svg_image_node(context: &mut SvgElementContext<'_, '_>) -> Option<Node2DRef> {
    let href = svg_attribute(&context.element.read().unwrap(), "href").map(str::to_string);
    let resolver = context
        .import
        .options
        .and_then(|options| options.resolve_image_resource.as_ref());
    let image = href
        .as_deref()
        .and_then(|href| resolver.and_then(|resolver| resolver(href)));
    let Some(image) = image else {
        let (kind, detail) = match (href.as_deref(), resolver) {
            (None, _) => ("svg.image-missing-href", None),
            (Some(href), None) => (
                "svg.image-resolver-unwired",
                Some(HashMap::from([(
                    "href".to_string(),
                    ImportDiagnosticDetailValue::String(href.to_string()),
                )])),
            ),
            (Some(href), Some(_)) => (
                "svg.unresolved-image",
                Some(HashMap::from([(
                    "href".to_string(),
                    ImportDiagnosticDetailValue::String(href.to_string()),
                )])),
            ),
        };
        report_import_diagnostic(
            context.import.diagnostics.as_deref_mut(),
            ImportDiagnosticSeverity::Drop,
            kind,
            "createSvgImageNode",
            detail,
        );
        return None;
    };

    let (image_width, image_height) = {
        let image = image.read().unwrap();
        (image.width as f32, image.height as f32)
    };
    let (width, height, x, y, preserve_aspect_ratio) = {
        let element = context.element.read().unwrap();
        (
            svg_number_attribute(&element, "width", image_width),
            svg_number_attribute(&element, "height", image_height),
            svg_number_attribute(&element, "x", 0.0),
            svg_number_attribute(&element, "y", 0.0),
            svg_attribute(&element, "preserveAspectRatio")
                .unwrap_or("xMidYMid meet")
                .to_string(),
        )
    };
    let source: TextureSourceRef = image;
    let texture = Arc::new(RwLock::new(create_texture(Some(
        &CreateTextureOptions::Texture2D(CreateTexture2DOptions {
            source: Some(source),
            ..CreateTexture2DOptions::default()
        }),
    ))));
    let sprite = create_sprite();
    sprite.write().unwrap().data.texture = Some(texture);
    let geometry = if image_width > 0.0 && image_height > 0.0 && width >= 0.0 && height >= 0.0 {
        create_svg_view_box_matrix(
            &[0.0, 0.0, image_width, image_height],
            &SvgViewport {
                height,
                width,
                x,
                y,
            },
            &preserve_aspect_ratio,
        )
    } else {
        create_matrix(1.0, 0.0, 0.0, 1.0, x, y)
    };
    let node: Node2DRef = sprite;
    apply_svg_element_appearance(
        &node,
        &context.element,
        context.parent_style,
        context.import,
        Some(&geometry),
        false,
    );
    context.import.object_bounding_boxes.push((
        node.clone(),
        create_rectangle(0.0, 0.0, image_width, image_height),
    ));
    apply_svg_element_clip_family(&node, &context.element, context.import);
    return Some(node);
}

pub fn svg_image_element_handler(context: &mut SvgElementContext<'_, '_>) -> Option<Node2DRef> {
    return create_svg_image_node(context);
}
