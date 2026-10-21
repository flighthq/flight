use crate::types::{
    HapticImpactStyle, HapticNotificationType, HapticsCapabilities, HostHapticsCapability,
};

pub fn cancel_device_vibration(host_haptics: &HostHapticsCapability) -> bool {
    return (host_haptics.cancel)();
}

// flight-lint: allow(conform-params) D9 out-first/unit: TS (hostHaptics, out) returning out becomes (out, host_haptics) returning unit
pub fn get_haptics_capabilities(
    out: &mut HapticsCapabilities,
    host_haptics: &HostHapticsCapability,
) {
    (host_haptics.capabilities)(out);
}

pub fn is_haptics_supported(host_haptics: &HostHapticsCapability) -> bool {
    return (host_haptics.is_supported)();
}

pub fn prepare_haptics(host_haptics: &HostHapticsCapability) {
    if let Some(prepare) = &host_haptics.prepare {
        prepare();
    }
}

pub fn trigger_haptic_impact(
    host_haptics: &HostHapticsCapability,
    style: HapticImpactStyle,
    intensity: Option<f32>,
) -> bool {
    return (host_haptics.impact)(style, Some(intensity.unwrap_or(1.0)));
}

// flight-lint: allow(conform-params) Rust raw identifier r#type is the TS parameter named type; the conform parser preserves the raw prefix
pub fn trigger_haptic_notification(
    host_haptics: &HostHapticsCapability,
    r#type: HapticNotificationType,
) -> bool {
    return (host_haptics.notification)(r#type);
}

pub fn trigger_haptic_selection(host_haptics: &HostHapticsCapability) -> bool {
    return (host_haptics.selection)();
}

pub fn vibrate_device(host_haptics: &HostHapticsCapability, duration_ms: f32) -> bool {
    return (host_haptics.vibrate)(duration_ms);
}

pub fn vibrate_device_pattern(host_haptics: &HostHapticsCapability, pattern: &Vec<f32>) -> bool {
    if pattern.is_empty() {
        return false;
    }
    return (host_haptics.vibrate_pattern)(pattern);
}

pub fn vibrate_device_waveform(
    host_haptics: &HostHapticsCapability,
    timings: &Vec<f32>,
    amplitudes: &Vec<f32>,
    repeat: Option<i32>,
) -> bool {
    if timings.is_empty() {
        return false;
    }
    if let Some(vibrate_waveform) = &host_haptics.vibrate_waveform {
        return vibrate_waveform(timings, amplitudes, Some(repeat.unwrap_or(-1)));
    }
    return (host_haptics.vibrate_pattern)(timings);
}

impl HostHapticsCapability {
    pub fn cancel_device_vibration(&self) -> bool {
        return cancel_device_vibration(self);
    }

    pub fn get_haptics_capabilities(&self, out: &mut HapticsCapabilities) {
        get_haptics_capabilities(out, self);
    }

    pub fn is_haptics_supported(&self) -> bool {
        return is_haptics_supported(self);
    }

    pub fn prepare_haptics(&self) {
        prepare_haptics(self);
    }

    pub fn trigger_haptic_impact(&self, style: HapticImpactStyle, intensity: Option<f32>) -> bool {
        return trigger_haptic_impact(self, style, intensity);
    }

    pub fn trigger_haptic_notification(&self, r#type: HapticNotificationType) -> bool {
        return trigger_haptic_notification(self, r#type);
    }

    pub fn trigger_haptic_selection(&self) -> bool {
        return trigger_haptic_selection(self);
    }

    pub fn vibrate_device(&self, duration_ms: f32) -> bool {
        return vibrate_device(self, duration_ms);
    }

    pub fn vibrate_device_pattern(&self, pattern: &Vec<f32>) -> bool {
        return vibrate_device_pattern(self, pattern);
    }

    pub fn vibrate_device_waveform(
        &self,
        timings: &Vec<f32>,
        amplitudes: &Vec<f32>,
        repeat: Option<i32>,
    ) -> bool {
        return vibrate_device_waveform(self, timings, amplitudes, repeat);
    }
}
