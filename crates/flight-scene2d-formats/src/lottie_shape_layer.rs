use std::collections::{HashMap, HashSet};
use std::sync::{Arc, RwLock};

use flight_importdiagnostics::contract::ImportDiagnosticDetailValue;
use flight_node::contract::{NodeRef, add_node_child};
use flight_scene2d::contract::{Node2DRef, create_display_object};
use flight_shape::contract::{Shape, clear_shape_commands, create_shape};
use serde_json::Value;

use crate::lottie_document::{
    apply_lottie_transform, report_lottie_expression, report_lottie_skip,
};
use crate::lottie_registry::get_lottie_shape_item_handler;
use crate::lottie_shape_paint::append_lottie_shape_paths;
use crate::types::{
    LottieImportContext, LottieLayerContext, LottieRecord, LottieRerender, LottieShapeItemContext,
    LottieShapeModifier, LottieShapePainter,
};

fn append_lottie_shape_items(
    parent: &Node2DRef,
    items: &[LottieRecord],
    context: &mut LottieImportContext<'_>,
    name: Option<String>,
) {
    let group = create_display_object();
    group.write().unwrap().name = name;
    let group_node: Node2DRef = group.clone();
    if let Some(transform) = items
        .iter()
        .find(|item| item.get("ty").and_then(Value::as_str) == Some("tr"))
    {
        let transform = record_value(transform);
        apply_lottie_transform(&group_node, Some(&transform), context, Some(true), None);
    }
    let shape = create_shape(None);
    let claims = Arc::new(RwLock::new(HashSet::new()));
    let modifiers = Arc::new(RwLock::new(Vec::<LottieShapeModifier>::new()));
    let painters = Arc::new(RwLock::new(Vec::<LottieShapePainter>::new()));
    let paths = Arc::new(RwLock::new(Vec::new()));
    let rerender_painters = painters.clone();
    let rerender_paths = paths.clone();
    let rerender_shape = shape.clone();
    let rerender: LottieRerender = Arc::new(move || {
        render_lottie_shape_state(&rerender_painters, &rerender_paths, &rerender_shape);
    });

    for item in items {
        if item.get("hd").and_then(Value::as_bool) == Some(true) {
            continue;
        }
        let kind = item.get("ty").and_then(Value::as_str).unwrap_or_default();
        if kind == "gr" {
            let nested = item
                .get("it")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .filter_map(|item| item.as_object().cloned().map(LottieRecord::from))
                .collect::<Vec<_>>();
            append_lottie_shape_items(
                &group_node,
                &nested,
                context,
                item.get("nm").and_then(Value::as_str).map(str::to_string),
            );
            continue;
        }
        if kind == "tr" {
            let value = record_value(item);
            report_lottie_expression(Some(&value), context);
            continue;
        }
        if let Some(handler) = get_lottie_shape_item_handler(context.registry, kind) {
            handler(&mut LottieShapeItemContext {
                claims: claims.clone(),
                import: context,
                item,
                modifiers: modifiers.clone(),
                painters: painters.clone(),
                paths: paths.clone(),
                rerender: rerender.clone(),
                shape: shape.clone(),
            });
        } else {
            report_lottie_skip(
                context,
                "lottie.unsupported-shape-item",
                "appendLottieShapeItems",
                Some(HashMap::from([(
                    "shapeType".to_string(),
                    ImportDiagnosticDetailValue::String(kind.to_string()),
                )])),
            );
        }
        let value = record_value(item);
        report_lottie_expression(Some(&value), context);
    }
    {
        let modifiers = modifiers.read().unwrap();
        let mut paths = paths.write().unwrap();
        for modifier in modifiers.iter() {
            modifier(&mut paths);
        }
    }
    rerender();
    if !paths.read().unwrap().is_empty() {
        let parent: NodeRef = group.clone();
        let child: NodeRef = shape;
        add_node_child(&parent, &child);
    }
    let parent: NodeRef = parent.clone();
    let child: NodeRef = group;
    add_node_child(&parent, &child);
}

pub fn lottie_shape_layer_handler(context: &mut LottieLayerContext<'_, '_>) {
    let items = context
        .layer
        .get("shapes")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|item| item.as_object().cloned().map(LottieRecord::from))
        .collect::<Vec<_>>();
    append_lottie_shape_items(&context.container, &items, context.import, None);
}

fn record_value(record: &LottieRecord) -> Value {
    return Value::Object(
        record
            .iter()
            .map(|(key, value)| (key.clone(), value.clone()))
            .collect(),
    );
}

fn render_lottie_shape_state(
    painters: &Arc<RwLock<Vec<LottieShapePainter>>>,
    paths: &Arc<RwLock<Vec<flight_entity::Ref<flight_path::Path>>>>,
    shape: &flight_entity::Ref<Shape>,
) {
    clear_shape_commands(shape);
    let paths = paths.read().unwrap();
    if paths.is_empty() {
        return;
    }
    let painters = painters.read().unwrap();
    if painters.is_empty() {
        append_lottie_shape_paths(&paths, shape, None);
        return;
    }
    for painter in painters.iter() {
        painter(shape, &paths);
    }
}
