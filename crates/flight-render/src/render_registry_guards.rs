use std::collections::HashMap;
use std::sync::Arc;

use flight_entity::{Kind, Ref, get_entity_id};
use flight_log::{LogData, LogDataOrProvider, LogLevel, LogStateRef, LogValue, log_once};
use flight_signals::connect_signal;

use crate::{
    RenderRegistriesMiss, RenderRegistriesMissExplanation, RenderRegistriesMissStatus,
    RenderRegistryTable, RenderState, RenderStateBackend, enable_render_registry_signals,
};

pub fn are_render_registries_guards_enabled<S: RenderState>(state: &S) -> bool {
    return state.render_runtime().registry_guard_enabled;
}

// flight-lint: allow(conform-params) D5 caller-owned LogState replaces the TS logging singleton
pub fn enable_render_registries_guards<S: RenderState>(
    state: &mut S,
    log_state: Option<LogStateRef>,
) {
    if state.render_runtime().registry_guard_enabled {
        return;
    }
    let signals = enable_render_registry_signals(state);
    let state_id = get_entity_id(state);
    // A state's backend is fixed (TS probes its members structurally), so it is read once here.
    let backend = state.render_backend();
    let misses = state.render_runtime().registry_misses.clone();
    misses.write().unwrap().clear();
    let listener_misses = misses.clone();
    let listener_log = log_state.clone();
    connect_signal(
        &signals.on_registry_miss,
        Arc::new(move |(registry, kind)| {
            record_render_registries_miss_shared(
                &listener_misses,
                listener_log.as_ref(),
                state_id,
                backend,
                *registry,
                kind.clone(),
            );
        }),
        None,
    );
    let runtime = state.render_runtime_mut();
    runtime.registry_guard_enabled = true;
    runtime.registry_guard_log = log_state;
}

pub fn explain_render_registries_misses<S: RenderState>(
    state: &S,
) -> RenderRegistriesMissExplanation {
    let misses = state
        .render_runtime()
        .registry_misses
        .read()
        .unwrap()
        .clone();
    return RenderRegistriesMissExplanation {
        status: if misses.is_empty() {
            RenderRegistriesMissStatus::Complete
        } else {
            RenderRegistriesMissStatus::MissesRecorded
        },
        misses,
    };
}

fn get_render_registries_miss_message(
    backend: RenderStateBackend,
    registry: RenderRegistryTable,
) -> &'static str {
    let wgpu = backend == RenderStateBackend::Wgpu;
    return match registry {
        // GL composites through an explicit per-mode realization; Canvas and DOM express blend
        // modes natively and never report this.
        RenderRegistryTable::BlendRealization => {
            "a blend mode this scene uses has no registered GL realization, so the node composites as Normal instead — call registerGlBlendMode(state, blendMode, realization)"
        }
        RenderRegistryTable::EffectPaddingResolver => {
            "computeEffectPadding: effect kind has no registered padding resolver — call registerEffectPaddingResolver(state, kind, resolver)"
        }
        // Reported by the resource layer, not the frame path: a material kind with no lister has its
        // texture slots invisible to anything that walks materials.
        RenderRegistryTable::MaterialTextureLister => {
            "a material kind in this scene has no registered texture lister, so an all-unlisted mesh gets no fade, while a mixed mesh can reveal before that material's textures settle and show a later texture pop-in — call registerScene3DMaterialTextures(registry, kind, lister), or the named door for that family"
        }
        // Reported only by the GPU backends, where an unresolved material means the node does not
        // draw at all.
        RenderRegistryTable::MaterialRenderer if wgpu => {
            "resolveWgpuQuadMaterialRenderer: material kind has no registered renderer, so nodes using it do not draw — call registerWgpuQuadMaterialRenderer(state, kind, renderer)"
        }
        RenderRegistryTable::MaterialRenderer => {
            "resolveGlQuadMaterialRenderer: material kind has no registered renderer, so nodes using it do not draw — call registerGlQuadMaterialRenderer(state, kind, renderer)"
        }
        RenderRegistryTable::ModifierSnippet if wgpu => {
            "a modifier on this material has no registered shader snippet — call registerWgpuModifierSnippet(state, snippet), or registerBuiltInWgpuModifierSnippets(state)"
        }
        RenderRegistryTable::ModifierSnippet => {
            "a modifier on this material has no registered shader snippet — call registerGlModifierSnippet(state, snippet), or registerBuiltInGlModifierSnippets(state)"
        }
        RenderRegistryTable::NodeRenderer => {
            "createRenderProxy: node kind has no registered renderer — call registerNodeRenderer(state, kind, renderer)"
        }
        RenderRegistryTable::ShapeCommandHandler => {
            "renderCanvasShapeCommands: shape command key has no registered handler on this state — call registerCanvasShapeCommand(state, command)"
        }
        // The kind reported is the node kind that went undrawn.
        RenderRegistryTable::ShapeRasterizer => match backend {
            RenderStateBackend::Wgpu => {
                "drawWgpuShape: a fill this node uses has no tessellated form and no rasterizer is registered, so it does not draw — call registerWgpuShapeRasterizer(state, createCanvasShapeRasterizer(resolvers))"
            }
            RenderStateBackend::Dom => {
                "drawDomShape: a fill this node uses has no tessellated form and no rasterizer is registered, so it does not draw — call registerDomShapeRasterizer(state, createCanvasShapeRasterizer(resolvers))"
            }
            _ => {
                "drawGlShape: a fill this node uses has no tessellated form and no rasterizer is registered, so it does not draw — call registerGlShapeRasterizer(state, createCanvasShapeRasterizer(resolvers))"
            }
        },
        RenderRegistryTable::TextureResolver => match backend {
            RenderStateBackend::Gl => {
                "resolveGlTexture: texture source kind has no registered resolver — rebuild the GlRenderRegistries with the required resolver and create the render state from that registry"
            }
            RenderStateBackend::Wgpu => {
                "resolveWgpuTexture: texture source kind has no registered resolver — call registerWgpuTextureResolver(state, sourceKind, resolver)"
            }
            RenderStateBackend::Dom => {
                "resolveDomTexture: texture source kind has no registered resolver — call registerDomTextureResolver(state, sourceKind, resolver)"
            }
            RenderStateBackend::Canvas => {
                "resolveCanvasTexture: texture source kind has no registered resolver — call registerCanvasTextureResolver(resolvers, sourceKind, resolver) on the set the caller resolves through"
            }
        },
    };
}

// flight-lint: allow(conform-extra) state-local sink for the opt-in registry signal seam
pub fn record_render_registries_miss<S: RenderState>(
    state: &mut S,
    registry: RenderRegistryTable,
    kind: Kind,
) {
    let runtime = state.render_runtime();
    record_render_registries_miss_shared(
        &runtime.registry_misses,
        runtime.registry_guard_log.as_ref(),
        get_entity_id(state),
        state.render_backend(),
        registry,
        kind,
    );
}

fn record_render_registries_miss_shared(
    misses: &Ref<Vec<RenderRegistriesMiss>>,
    log_state: Option<&LogStateRef>,
    state_id: u64,
    backend: RenderStateBackend,
    registry: RenderRegistryTable,
    kind: Kind,
) {
    {
        let mut misses = misses.write().unwrap();
        if misses
            .iter()
            .any(|miss| miss.registry == registry && miss.kind == kind)
        {
            return;
        }
        misses.push(RenderRegistriesMiss {
            kind: kind.clone(),
            registry,
        });
    }
    let Some(log_state) = log_state else {
        return;
    };
    let mut data = HashMap::new();
    data.insert("kind".to_string(), LogValue::Str(kind.clone()));
    data.insert(
        "message".to_string(),
        LogValue::Str(get_render_registries_miss_message(backend, registry).to_string()),
    );
    data.insert(
        "registry".to_string(),
        LogValue::Number((registry as i64) as f64),
    );
    log_once(
        &log_state,
        0.0,
        &format!("render:registry-miss:{state_id}:{}:{kind}", registry as u8),
        LogLevel::Warn,
        LogDataOrProvider::Data(LogData::Record(data)),
        Some("render".to_string()),
    );
}
// flight-lint: allow-file(contract-vocabulary) D12/D17 approved generic RenderState and backend-typed callback families are IR dispatch contracts
