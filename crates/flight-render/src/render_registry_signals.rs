use flight_entity::Kind;
use flight_signals::{create_signal, emit_signal};

use crate::{RenderRegistrySignals, RenderRegistryTable, RenderState};

// flight-lint: allow(conform-extra) internal dispatch seam used by backend-neutral registry lookups
pub fn emit_render_registry_miss<S: RenderState>(
    state: &mut S,
    registry: RenderRegistryTable,
    kind: Kind,
) {
    if let Some(signals) = &state.render_runtime().registry_signals {
        emit_signal(&signals.on_registry_miss, &(registry, kind.clone()));
    }
}

pub fn enable_render_registry_signals<S: RenderState>(state: &mut S) -> RenderRegistrySignals {
    if let Some(signals) = &state.render_runtime().registry_signals {
        return signals.clone();
    }
    let signals = RenderRegistrySignals {
        on_registry_miss: create_signal(),
    };
    state.render_runtime_mut().registry_signals = Some(signals.clone());
    return signals;
}
// flight-lint: allow-file(contract-vocabulary) D12/D17 approved generic RenderState and backend-typed callback families are IR dispatch contracts
