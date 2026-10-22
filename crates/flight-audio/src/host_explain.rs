//! Host capability explanations for the capability group this crate owns (`audioDecode`),
//! redistributed from the former aggregate host (D26; TS `hostExplain.ts`). Each explainer appends
//! to a caller-owned explanation, so a host provider composes its own host's explanation; there is
//! no aggregate.

use flight_host::{HostCapabilityGroupExplanation, HostExplanation};

use crate::HostAudioDecodeCapabilities;

/// Appends the `audioDecode` group and its filled slot names, in source property order, to a host
/// explanation (TS `explainHost` over `host.audioDecode`). A host provider composes its host's
/// explanation by calling each group's explainer in group order.
// flight-lint: allow(conform-extra) D26: the audioDecode group's share of the former aggregate explainHost, owned by its feature
pub fn explain_host_audio_decode_capabilities(
    out: &mut HostExplanation,
    audio_decode: &HostAudioDecodeCapabilities,
) {
    let mut slots = Vec::new();
    if audio_decode.aac.is_some() {
        slots.push("aac".to_string());
    }
    if audio_decode.flac.is_some() {
        slots.push("flac".to_string());
    }
    if audio_decode.mp3.is_some() {
        slots.push("mp3".to_string());
    }
    if audio_decode.mp4.is_some() {
        slots.push("mp4".to_string());
    }
    if audio_decode.ogg.is_some() {
        slots.push("ogg".to_string());
    }
    if audio_decode.wav.is_some() {
        slots.push("wav".to_string());
    }
    if audio_decode.webm.is_some() {
        slots.push("webm".to_string());
    }
    out.groups.push(HostCapabilityGroupExplanation {
        group: "audioDecode".to_string(),
        slots,
    });
}
