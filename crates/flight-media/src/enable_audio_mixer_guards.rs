use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use flight_log::{LogData, LogLevel, LogStateRef, LogValue, log_once};

use crate::audio_mixer::set_audio_bus_mixer_guard;
use crate::types::*;

// flight-lint: allow(conform-extra) D5: Rust callers need an explicit owner for the source module-global guard slot
pub fn create_audio_mixer_guard_state() -> AudioMixerGuardStateRef {
    return Arc::new(RwLock::new(AudioMixerGuardState::default()));
}

// flight-lint: allow(conform-params) D5: caller-owned guard state replaces the source module-global guard slot
pub fn disable_audio_mixer_guards(guard_state: &AudioMixerGuardStateRef) {
    set_audio_bus_mixer_guard(guard_state, None);
}

/// Installs the opt-in unmixed-bus warning. The log state and live clock are captured at enable
/// time; the clock is sampled only when an unmixed write actually reaches the guard.
// flight-lint: allow(f64) the injected flight-log clock returns millisecond operation timestamps
// flight-lint: allow(conform-params) D5: caller-owned guard state, LogState and live clock replace the source module glue
pub fn enable_audio_mixer_guards(
    guard_state: &AudioMixerGuardStateRef,
    log_state: &LogStateRef,
    clock: Arc<dyn Fn() -> f64 + Send + Sync>,
) {
    let log_state = log_state.clone();
    let guard: AudioBusMixerGuard = Arc::new(move |operation, bus| {
        let (setter, operation_name) = match operation {
            AudioBusMixerOperation::Gain => ("setAudioBusGain", "gain"),
            AudioBusMixerOperation::Mute => ("setAudioBusMuted", "mute"),
            AudioBusMixerOperation::Pan => ("setAudioBusPan", "pan"),
        };
        let bus_name = bus.read().unwrap().name.clone();
        let mut data = HashMap::new();
        data.insert(
            "message".to_string(),
            LogValue::Str(format!(
                "{setter}: bus \"{bus_name}\" belongs to no mixer, so the value was stored but reached no audio node and nothing changed audibly. Add the bus with addAudioBusToMixer(hostAudioMixer, mixer, bus) — or route a channel through it with routeAudioChannelToMixerBus(hostAudioMixer, mixer, channel, bus) — before setting its properties."
            )),
        );
        let _ = log_once(
            &log_state,
            clock(),
            &format!("media:unmixed-bus-{operation_name}"),
            LogLevel::Warn,
            LogData::Record(data).into(),
            Some("media".to_string()),
        );
    });
    set_audio_bus_mixer_guard(guard_state, Some(guard));
}
