//! Host capability explanations for the capability group this crate owns (`audio`), redistributed
//! from the former aggregate host (D26; TS `hostExplain.ts` and `enableHostGuards.ts`). Each
//! explainer appends to a caller-owned explanation, so a host provider composes its own host's
//! explanation; there is no aggregate.

use flight_host::{
    HostCapabilityBackend, HostCapabilityCoverage, HostCapabilityExplanation,
    HostCapabilityGroupExplanation, HostExplanation, explain_host_capability_slot,
};
use flight_log::{LogStateRef, warn_missing_host_capability};

use crate::HostAudioCapabilities;

/// Warns once for each guarded `audio` slot (`device` and `mixer`) the group is missing (TS
/// `enableHostGuards` over `host.audio`), through the caller-owned log state (D5). The warning is
/// the slot's own explainer, so a warning cannot contradict a query, and `log_once` keys per slot.
// flight-lint: allow(conform-extra, f64) D26: the former aggregate enableHostGuards for this group, owned by its feature; D5: the injected log clock is flight-log's f64 milliseconds
pub fn enable_host_audio_guards(state: &LogStateRef, now_ms: f64, audio: &HostAudioCapabilities) {
    warn_missing_host_capability(state, now_ms, &explain_host_audio_device(audio));
    warn_missing_host_capability(state, now_ms, &explain_host_audio_mixer(audio));
}

/// Appends the `audio` group and its filled slot names, in source property order, and the presence
/// of its covered slots (`device`, `mixer`), to a host explanation (TS `explainHost` over
/// `host.audio`). A host provider composes its host's explanation by calling each group's explainer
/// in group order.
// flight-lint: allow(conform-extra) D26: the audio group's share of the former aggregate explainHost, owned by its feature
pub fn explain_host_audio_capabilities(out: &mut HostExplanation, audio: &HostAudioCapabilities) {
    let mut slots = Vec::new();
    if audio.codec.is_some() {
        slots.push("codec".to_string());
    }
    if audio.device.is_some() {
        slots.push("device".to_string());
    }
    if audio.mixer.is_some() {
        slots.push("mixer".to_string());
    }
    out.groups.push(HostCapabilityGroupExplanation {
        group: "audio".to_string(),
        slots,
    });
    out.capabilities.push(HostCapabilityCoverage {
        capability: "HostAudioDeviceCapability".to_string(),
        group: "audio".to_string(),
        is_present: audio.device.is_some(),
        slot: "device".to_string(),
    });
    out.capabilities.push(HostCapabilityCoverage {
        capability: "HostAudioMixerCapability".to_string(),
        group: "audio".to_string(),
        is_present: audio.mixer.is_some(),
        slot: "mixer".to_string(),
    });
}

/// Whether `host.audio.device` is filled and, when it is absent, which package supplies the
/// capability (TS `explainHostAudioDevice`).
// flight-lint: allow(conform-extra) D26: the per-capability explainer of the former aggregate, owned by the feature that owns the slot
pub fn explain_host_audio_device(audio: &HostAudioCapabilities) -> HostCapabilityExplanation {
    return explain_host_capability_slot(
        "HostAudioDeviceCapability",
        "audio",
        "device",
        audio.device.is_some(),
        "no audio can be decoded or played",
        "build the host from webHost in @flighthq/host-web",
        vec![HostCapabilityBackend {
            entry_point: "webHost".to_string(),
            package_name: "@flighthq/host-web".to_string(),
            platform: "Web".to_string(),
        }],
    );
}

/// Whether `host.audio.mixer` is filled and, when it is absent, which package supplies the
/// capability (TS `explainHostAudioMixer`).
// flight-lint: allow(conform-extra) D26: the per-capability explainer of the former aggregate, owned by the feature that owns the slot
pub fn explain_host_audio_mixer(audio: &HostAudioCapabilities) -> HostCapabilityExplanation {
    return explain_host_capability_slot(
        "HostAudioMixerCapability",
        "audio",
        "mixer",
        audio.mixer.is_some(),
        "sound transforms and mixer routing are inert",
        "build the host from webHost in @flighthq/host-web",
        vec![HostCapabilityBackend {
            entry_point: "webHost".to_string(),
            package_name: "@flighthq/host-web".to_string(),
            platform: "Web".to_string(),
        }],
    );
}
