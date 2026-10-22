use std::collections::HashMap;
use std::sync::{Arc, LazyLock};

use flight_entity::get_entity_id;
use flight_importdiagnostics::{
    ImportDiagnosticDetailValue, ImportDiagnosticSeverity, report_import_diagnostic,
};

use crate::{
    SwfMorphBitmapFillResolver, SwfMorphShapeDecoder, SwfReader, SwfTagHandler,
    SwfTagHandlerInstantiation, SwfTagHandlerRef, SwfTagParseState,
    acquire_swf_image_texture_from_map, create_swf_morph_shape,
    create_swf_morph_shape_target_with_handle, read_swf_bounded_definition_header,
};

pub static SWF_DEFINE_MORPH_SHAPE_HANDLER: LazyLock<SwfTagHandlerRef> = LazyLock::new(|| {
    Arc::new(SwfTagHandler {
        finish_timeline: None,
        instantiate: Some(SwfTagHandlerInstantiation {
            create_placement_node: Some(Arc::new(|parsed, character_id, bounds, _diagnostics| {
                let decode = parsed.state.morph_shapes.get(&character_id)?;
                let (node, shape) = create_swf_morph_shape_target_with_handle(
                    &parsed.state.node_state,
                    decode,
                    bounds,
                    parsed.state.morph_bounds.get(&character_id),
                );
                if let Some(shape) = shape {
                    let id = get_entity_id(&*shape.read().unwrap()).to_string();
                    parsed
                        .state
                        .morph_instances
                        .write()
                        .unwrap()
                        .insert(id, shape);
                }
                return Some(node);
            })),
            create_resources: None,
            has_placement_content: Some(Arc::new(|parsed, character_id| {
                parsed.state.morph_shapes.contains_key(&character_id)
            })),
        }),
        parse: Arc::new(|body, tag, state, _timeline, _diagnostics| {
            let version = resolve_swf_morph_shape_version(tag);
            let character_id = read_swf_bounded_definition_header(body, state, true);
            if character_id == 0 {
                return false;
            }
            read_swf_morph_shape_body(body, state, character_id, version);
            return true;
        }),
        resolve: None,
        tags: vec![TAG_DEFINE_MORPH_SHAPE, TAG_DEFINE_MORPH_SHAPE_2],
    })
});

fn read_swf_morph_shape_body(
    body: &SwfReader,
    state: &mut SwfTagParseState,
    character_id: u32,
    version: u32,
) {
    let source = body.source.clone();
    let start = body.pos;
    let end = body.end;
    let image_texture_order = state.image_texture_order.clone();
    let image_textures = state.image_textures.clone();
    let resolve_bitmap_fill: SwfMorphBitmapFillResolver = Arc::new({
        let image_texture_order = image_texture_order.clone();
        let image_textures = image_textures.clone();
        move |id, repeat, smoothed| {
            Some(acquire_swf_image_texture_from_map(
                &image_texture_order,
                &image_textures,
                id,
                repeat,
                smoothed,
            ))
        }
    });
    let mut reader = SwfReader::new(source.clone(), start, end);
    let valid = match &state.diagnostics {
        Some(diagnostics) => create_swf_morph_shape(
            &mut reader,
            version,
            Some(&resolve_bitmap_fill),
            Some(&mut diagnostics.write().unwrap()),
        ),
        None => create_swf_morph_shape(&mut reader, version, Some(&resolve_bitmap_fill), None),
    };
    if valid.is_none() {
        report_swf_morph_shape_undecodable(state, character_id, version);
        return;
    }
    let decode: SwfMorphShapeDecoder = Arc::new(move || {
        let image_texture_order = image_texture_order.clone();
        let image_textures = image_textures.clone();
        let resolve: SwfMorphBitmapFillResolver = Arc::new(move |id, repeat, smoothed| {
            Some(acquire_swf_image_texture_from_map(
                &image_texture_order,
                &image_textures,
                id,
                repeat,
                smoothed,
            ))
        });
        return create_swf_morph_shape(
            &mut SwfReader::new(source.clone(), start, end),
            version,
            Some(&resolve),
            None,
        );
    });
    state.morph_shapes.insert(character_id, decode);
}

fn report_swf_morph_shape_undecodable(state: &SwfTagParseState, character_id: u32, version: u32) {
    let Some(diagnostics) = &state.diagnostics else {
        return;
    };
    let mut detail = HashMap::new();
    detail.insert(
        String::from("capability"),
        ImportDiagnosticDetailValue::String(String::from(if version == 2 {
            "swf.morph.define-morph-shape-2"
        } else {
            "swf.morph.define-morph-shape"
        })),
    );
    detail.insert(
        String::from("characterId"),
        ImportDiagnosticDetailValue::Number(character_id as f32),
    );
    report_import_diagnostic(
        Some(&mut diagnostics.write().unwrap()),
        ImportDiagnosticSeverity::Drop,
        "swf.morph-shape-undecodable",
        "readSwfMorphShapeBody",
        Some(detail),
    );
}

fn resolve_swf_morph_shape_version(code: u32) -> u32 {
    if code == TAG_DEFINE_MORPH_SHAPE {
        1
    } else if code == TAG_DEFINE_MORPH_SHAPE_2 {
        2
    } else {
        0
    }
}

const TAG_DEFINE_MORPH_SHAPE: u32 = 46;
const TAG_DEFINE_MORPH_SHAPE_2: u32 = 84;
