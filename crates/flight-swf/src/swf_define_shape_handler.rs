use std::collections::HashMap;
use std::sync::{Arc, LazyLock};

use flight_importdiagnostics::{
    ImportDiagnosticDetailValue, ImportDiagnosticSeverity, report_import_diagnostic,
};
use flight_scene2d::Node2DRef;
use flight_shape::{
    Shape, ShapeScale9Grid, copy_shape_commands, create_scale9_shape, create_shape,
};

use crate::{
    SwfBitmapFillResolver, SwfReader, SwfTagHandler, SwfTagHandlerInstantiation, SwfTagHandlerRef,
    SwfTagParseResult, SwfTagParseState, SwfTagRectangle, SwfTimeline,
    acquire_swf_image_texture_from_map, apply_swf_authored_bounds, create_swf_shape,
    read_swf_bounded_definition_header, read_swf_rectangle,
};

pub static SWF_DEFINE_SHAPE_HANDLER: LazyLock<SwfTagHandlerRef> = LazyLock::new(|| {
    Arc::new(SwfTagHandler {
        finish_timeline: None,
        instantiate: Some(SwfTagHandlerInstantiation {
            create_placement_node: Some(Arc::new(|parsed, character_id, bounds, diagnostics| {
                if let (Some(grid), Some(sprite)) = (
                    parsed.state.scaling_grids.get(&character_id),
                    parsed.state.sprites.get(&character_id),
                ) {
                    if let Some(scale9) = create_swf_scale9_shape_node(sprite, grid, parsed, bounds)
                    {
                        let node: Node2DRef = scale9;
                        return Some(node);
                    }
                    report_swf_scaling_grid_dropped(diagnostics, character_id);
                    return None;
                }
                let shape = parsed.state.shapes.get(&character_id)?;
                let node: Node2DRef = create_swf_shape_node(shape, parsed, bounds);
                return Some(node);
            })),
            create_resources: None,
            has_placement_content: Some(Arc::new(|parsed, character_id| {
                parsed.state.shapes.contains_key(&character_id)
            })),
        }),
        parse: Arc::new(|body, tag, state, _timeline, _diagnostics| {
            let character_id = read_swf_bounded_definition_header(body, state, false);
            if character_id == 0 {
                return false;
            }
            read_swf_shape_body(body, state, character_id, resolve_swf_shape_version(tag));
            return true;
        }),
        resolve: None,
        tags: vec![
            TAG_DEFINE_SHAPE,
            TAG_DEFINE_SHAPE_2,
            TAG_DEFINE_SHAPE_3,
            TAG_DEFINE_SHAPE_4,
        ],
    })
});

fn create_swf_scale9_shape_node(
    sprite: &SwfTimeline,
    grid: &SwfTagRectangle,
    parsed: &SwfTagParseResult,
    bounds: Option<&SwfTagRectangle>,
) -> Option<Node2DRef> {
    if sprite.frames.len() != 1 || !sprite.actions.is_empty() {
        return None;
    }
    let placements = sprite.frames[0].read().unwrap();
    if placements.len() != 1 {
        return None;
    }
    let inner = &placements[0].1;
    if inner.name.is_some() || inner.clip_depth > 0 || inner.alpha != 1.0 {
        return None;
    }
    let matrix = inner.matrix;
    if matrix.a != 1.0
        || matrix.b != 0.0
        || matrix.c != 0.0
        || matrix.d != 1.0
        || matrix.tx != 0.0
        || matrix.ty != 0.0
    {
        return None;
    }
    let shape = parsed.state.shapes.get(&inner.character_id)?;
    let target = create_scale9_shape(&ShapeScale9Grid {
        height: grid.height,
        width: grid.width,
        x: grid.x,
        y: grid.y,
    });
    copy_shape_commands(&target, &*shape.read().unwrap());
    let node: Node2DRef = target.clone();
    apply_swf_authored_bounds(&parsed.state.node_state, &node, bounds);
    return Some(target);
}

fn create_swf_shape_node(
    template: &flight_entity::Ref<Shape>,
    parsed: &SwfTagParseResult,
    bounds: Option<&SwfTagRectangle>,
) -> flight_entity::Ref<Shape> {
    let target = create_shape();
    copy_shape_commands(&target, &*template.read().unwrap());
    let node: Node2DRef = target.clone();
    apply_swf_authored_bounds(&parsed.state.node_state, &node, bounds);
    return target;
}

fn read_swf_shape_body(
    body: &SwfReader,
    state: &mut SwfTagParseState,
    character_id: u32,
    version: u32,
) {
    let mut reader = SwfReader::new(body.source.clone(), body.pos, body.end);
    if version >= 4 {
        read_swf_rectangle(&mut reader);
        reader.read_uint8();
    }
    if !reader.valid {
        return;
    }
    let image_texture_order = state.image_texture_order.clone();
    let image_textures = state.image_textures.clone();
    let resolve_bitmap_fill: SwfBitmapFillResolver = Arc::new(move |id, repeat, smoothed| {
        Some(acquire_swf_image_texture_from_map(
            &image_texture_order,
            &image_textures,
            id,
            repeat,
            smoothed,
        ))
    });
    let shape = match &state.diagnostics {
        Some(diagnostics) => create_swf_shape(
            &mut reader,
            version,
            Some(&resolve_bitmap_fill),
            Some(&mut diagnostics.write().unwrap()),
        ),
        None => create_swf_shape(&mut reader, version, Some(&resolve_bitmap_fill), None),
    };
    let Some(shape) = shape else {
        report_swf_shape_body_unreadable(state, character_id, version);
        return;
    };
    state.shapes.insert(character_id, shape);
}

fn report_swf_scaling_grid_dropped(
    diagnostics: Option<&mut Vec<flight_importdiagnostics::ImportDiagnostic>>,
    character_id: u32,
) {
    let mut detail = HashMap::new();
    detail.insert(
        String::from("characterId"),
        ImportDiagnosticDetailValue::Number(character_id as f32),
    );
    report_import_diagnostic(
        diagnostics,
        ImportDiagnosticSeverity::Drop,
        "swf.scaling-grid-dropped",
        "populateSwfTimelineNode",
        Some(detail),
    );
}

fn report_swf_shape_body_unreadable(state: &SwfTagParseState, character_id: u32, version: u32) {
    let Some(diagnostics) = &state.diagnostics else {
        return;
    };
    let mut detail = HashMap::new();
    detail.insert(
        String::from("capability"),
        ImportDiagnosticDetailValue::String(if version == 1 {
            String::from("swf.shape.define-shape")
        } else {
            format!("swf.shape.define-shape-{version}")
        }),
    );
    detail.insert(
        String::from("characterId"),
        ImportDiagnosticDetailValue::Number(character_id as f32),
    );
    detail.insert(
        String::from("version"),
        ImportDiagnosticDetailValue::Number(version as f32),
    );
    report_import_diagnostic(
        Some(&mut diagnostics.write().unwrap()),
        ImportDiagnosticSeverity::Recover,
        "swf.shape-body-unreadable",
        "readSwfShapeDefinition",
        Some(detail),
    );
}

fn resolve_swf_shape_version(code: u32) -> u32 {
    match code {
        TAG_DEFINE_SHAPE => 1,
        TAG_DEFINE_SHAPE_2 => 2,
        TAG_DEFINE_SHAPE_3 => 3,
        TAG_DEFINE_SHAPE_4 => 4,
        _ => 0,
    }
}

const TAG_DEFINE_SHAPE: u32 = 2;
const TAG_DEFINE_SHAPE_2: u32 = 22;
const TAG_DEFINE_SHAPE_3: u32 = 32;
const TAG_DEFINE_SHAPE_4: u32 = 83;
