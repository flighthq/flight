use flight_entity::Ref;
use flight_node::{Node, NodeRef, get_node_local_content_revision};
use flight_textlayout::{
    TextLayoutResult, TextMetrics, compute_text_layout, create_text_layout_result,
    get_text_layout_measure_provider, get_text_metrics,
};

use crate::text_layout_runtime::get_text_layout_result;
use crate::types::*;

pub fn ensure_text_layout(source: &NodeRef) {
    let source = source.read().unwrap();
    ensure_text_layout_for_node(&*source);
}

pub(crate) fn ensure_text_layout_for_node(source: &dyn Node) {
    let Some((runtime, live_text)) = text_runtime_and_string(source) else {
        return;
    };
    let content_id = get_node_local_content_revision(source);
    let (cached, rasterized, context, builder) = {
        let runtime = runtime.read().unwrap();
        (
            runtime.text_layout.is_some()
                && runtime.text_layout_using_content_id == content_id as i32,
            runtime.text_layout_using_text.clone(),
            runtime.layout_context.clone(),
            runtime.build_text_layout_params.clone(),
        )
    };
    if cached {
        let guard = context.read().unwrap().guard.clone();
        if let (Some(guard), Some(rasterized)) = (guard, rasterized)
            && live_text != rasterized
        {
            guard(&live_text, &rasterized);
        }
        return;
    }

    let measure = {
        let context = context.read().unwrap();
        get_text_layout_measure_provider(&context.measure_state, context.host_text_shaper.as_ref())
    };
    let Some(measure) = measure else {
        return;
    };
    let Some(params) = builder(source, measure) else {
        return;
    };
    let result = {
        let mut runtime = runtime.write().unwrap();
        get_text_layout_result(&mut runtime)
    };

    // Compute off-cache so a measure callback may reenter layout without locking the shared result.
    let mut computed = create_text_layout_result();
    compute_text_layout(&mut computed, &params);
    *result.write().unwrap() = computed;

    let mut runtime = runtime.write().unwrap();
    runtime.text_layout_using_content_id = content_id as i32;
    runtime.text_layout_using_text = Some(live_text);
}

pub fn get_text_layout(source: &NodeRef) -> Option<Ref<TextLayoutResult>> {
    let source = source.read().unwrap();
    return get_text_layout_for_node(&*source);
}

pub(crate) fn get_text_layout_for_node(source: &dyn Node) -> Option<Ref<TextLayoutResult>> {
    ensure_text_layout_for_node(source);
    let (runtime, _) = text_runtime_and_string(source)?;
    let layout = runtime.read().unwrap().text_layout.clone();
    return layout;
}

pub fn get_text_layout_metrics(out: &mut TextMetrics, source: &NodeRef) {
    let Some(layout) = get_text_layout(source) else {
        out.height = 0.0;
        out.num_lines = 0;
        out.width = 0.0;
        return;
    };
    get_text_metrics(out, &layout.read().unwrap());
}

// flight-lint: allow(conform-params) D5 explicit caller-owned context replaces the source module guard slot
pub fn set_text_label_guard(context: &Ref<TextLayoutContext>, guard: Option<TextLabelGuard>) {
    context.write().unwrap().guard = guard;
}

pub(crate) fn text_runtime_and_string(
    source: &dyn Node,
) -> Option<(Ref<TextLabelRuntime>, String)> {
    if let Some(source) = source.as_any().downcast_ref::<TextLabel>() {
        return Some((source.text_label_runtime.clone(), source.data.text.clone()));
    }
    if let Some(source) = source.as_any().downcast_ref::<RichText>() {
        let runtime = source.rich_text_runtime.read().unwrap().text_label.clone();
        return Some((runtime, source.data.text.clone()));
    }
    return None;
}
