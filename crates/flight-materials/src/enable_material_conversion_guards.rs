use std::sync::Arc;

use flight_log::{LogData, LogDataOrProvider, LogLevel, LogStateRef, log_once};

use crate::{
    MaterialConversionContext, MaterialConversionDropReason, MaterialConversionExplanation,
    MaterialConversionGuard, create_material_conversion_context,
};

// flight-lint: allow(f64) D1: millisecond timestamp from caller's clock source
pub type ClockProvider = Arc<dyn Fn() -> f64 + Send + Sync>;

// flight-lint: allow(conform-params) D5: Rust returns caller-owned context; TS sets module-scoped state
pub fn disable_material_conversion_guards() {}

// flight-lint: allow(conform-params) D5: Rust requires explicit log state and clock provider, returns caller-owned context; TS uses module-scoped logOnce and returns void
pub fn enable_material_conversion_guards(
    log_state: LogStateRef,
    clock: ClockProvider,
) -> MaterialConversionContext {
    let guard: MaterialConversionGuard = Arc::new(
        move |explanation: &MaterialConversionExplanation, conversion: &str| {
            let now_ms = clock();
            warn_material_conversion_drop(&log_state, now_ms, explanation, conversion);
        },
    );
    return create_material_conversion_context(guard);
}

// flight-lint: allow(f64) D1: millisecond timestamp sampled from the clock provider at operation time
fn warn_material_conversion_drop(
    log_state: &LogStateRef,
    now_ms: f64,
    explanation: &MaterialConversionExplanation,
    conversion: &str,
) {
    let maps = explanation.dropped_maps.join(", ");
    let key = format!("materials:conversion-dropped-map:{}", conversion);
    let message = match explanation.reason {
        Some(MaterialConversionDropReason::IncompatibleChannelSemantics) => {
            format!(
                "{} discarded {}: its channels pack different quantities than the target slot, so no assignment preserves meaning. Bake the texture into the target's own layout and pass it explicitly.",
                conversion, maps
            )
        }
        _ => {
            format!(
                "{} discarded {}: the target material model has no slot for that quantity. Supply the nearest target map explicitly if the surface needs it.",
                conversion, maps
            )
        }
    };
    log_once(
        log_state,
        now_ms,
        &key,
        LogLevel::Warn,
        LogDataOrProvider::Data(LogData::Message(message)),
        Some("materials".to_string()),
    );
}
