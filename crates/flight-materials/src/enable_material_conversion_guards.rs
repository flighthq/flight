use flight_log::{LogLevel, LogStateRef, log_once, LogDataOrProvider, LogData};

use crate::{MaterialConversionExplanation, pbr_materials::set_material_conversion_guard};

pub fn disable_material_conversion_guards() {
    set_material_conversion_guard(None);
}

// flight-lint: allow(f64) D1: the injected clock returns millisecond operation timestamps
pub fn enable_material_conversion_guards(log_state: LogStateRef, now_ms: f64) {
    let guard = Box::new(move |explanation: &MaterialConversionExplanation, conversion: &str| {
        warn_material_conversion_drop(&log_state, now_ms, explanation, conversion);
    });
    set_material_conversion_guard(Some(guard));
}

// flight-lint: allow(f64) D1: millisecond timestamp forwarded from the guard closure
fn warn_material_conversion_drop(
    log_state: &LogStateRef,
    now_ms: f64,
    explanation: &MaterialConversionExplanation,
    conversion: &str,
) {
    let maps = explanation.dropped_maps.join(", ");
    let key = format!("materials:conversion-dropped-map:{}", conversion);
    let message = match explanation.reason {
        Some(crate::MaterialConversionDropReason::IncompatibleChannelSemantics) => {
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
