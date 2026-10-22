use flight_node::NodeRef;

use crate::{
    RenderProxies2D, RenderState, Scene2DRenderBlankReason, Scene2DRenderExplanation,
    get_render_proxy_2d,
};

// flight-lint: allow(conform-params) D17 caller-owned proxy storage is explicit in Rust and the TS transpile contract
pub fn explain_scene_2d_render<S: RenderState>(
    state: &S,
    proxies: &RenderProxies2D<S>,
    source: &NodeRef,
) -> Scene2DRenderExplanation {
    let (kind, raw_visible, raw_alpha) = {
        let source = source.read().unwrap();
        let appearance = source.as_appearance_node().map(|node| node.appearance());
        (
            source.node_fields().kind.clone(),
            appearance
                .as_ref()
                .map(|value| *value.visible)
                .unwrap_or(true),
            appearance.as_ref().map(|value| *value.alpha).unwrap_or(1.0),
        )
    };
    let has_renderer = state
        .render_registries()
        .node_renderers
        .entries
        .contains_key(&kind);
    let proxy = get_render_proxy_2d(proxies, source);
    let prepared = proxy.is_some();
    let visible = proxy.map(|value| value.visible).unwrap_or(raw_visible);
    let effective_alpha = proxy.map(|value| value.alpha).unwrap_or(raw_alpha);
    let reason = if !has_renderer {
        Scene2DRenderBlankReason::NoRenderer
    } else if !prepared {
        Scene2DRenderBlankReason::NotPrepared
    } else if !visible {
        Scene2DRenderBlankReason::NotVisible
    } else if effective_alpha <= 0.0 {
        Scene2DRenderBlankReason::ZeroAlpha
    } else {
        Scene2DRenderBlankReason::Ok
    };
    return Scene2DRenderExplanation {
        kind,
        has_renderer,
        prepared,
        visible,
        effective_alpha,
        reason,
    };
}
// flight-lint: allow-file(contract-vocabulary) D12/D17 approved generic RenderState and backend-typed callback families are IR dispatch contracts
