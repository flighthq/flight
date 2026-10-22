use std::collections::HashMap;
use std::sync::Arc;

use flight_entity::{Kind, Ref, get_entity_id};
use flight_log::{LogData, LogDataOrProvider, LogLevel, LogStateRef, LogValue, log_once};
use flight_signals::connect_signal;

use crate::{
    RenderRegistriesMiss, RenderRegistriesMissExplanation, RenderRegistriesMissStatus,
    RenderRegistryTable, RenderState, enable_render_registry_signals,
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

fn get_render_registries_miss_message(registry: RenderRegistryTable) -> &'static str {
    return match registry {
        RenderRegistryTable::BlendRealization => {
            "a blend mode this scene uses has no registered realization"
        }
        RenderRegistryTable::EffectPaddingResolver => {
            "computeEffectPadding: effect kind has no registered padding resolver"
        }
        RenderRegistryTable::MaterialRenderer => {
            "material kind has no registered renderer, so nodes using it do not draw"
        }
        RenderRegistryTable::MaterialTextureLister => {
            "material kind has no registered texture lister"
        }
        RenderRegistryTable::ModifierSnippet => {
            "a modifier on this material has no registered shader snippet"
        }
        RenderRegistryTable::NodeRenderer => {
            "createRenderProxy: node kind has no registered renderer — call registerNodeRenderer(state, kind, renderer)"
        }
        RenderRegistryTable::ShapeCommandHandler => {
            "renderCanvasShapeCommands: shape command key has no registered handler on this state"
        }
        RenderRegistryTable::ShapeRasterizer => {
            "a fill this node uses has no tessellated form and no rasterizer is registered"
        }
        RenderRegistryTable::TextureResolver => "texture source kind has no registered resolver",
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
        registry,
        kind,
    );
}

fn record_render_registries_miss_shared(
    misses: &Ref<Vec<RenderRegistriesMiss>>,
    log_state: Option<&LogStateRef>,
    state_id: u64,
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
        LogValue::Str(get_render_registries_miss_message(registry).to_string()),
    );
    data.insert("registry".to_string(), LogValue::Int(registry as i64));
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
