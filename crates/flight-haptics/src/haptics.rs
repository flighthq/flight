use crate::types::{
    HapticImpactStyle, HapticNotificationType, HapticsCapabilities, HostHapticsCapability,
};
#[cfg(test)]
mod sugar_tests {
    use std::sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    };

    use super::*;

    fn make_capabilities() -> HapticsCapabilities {
        return HapticsCapabilities {
            amplitude_control: false,
            custom_events: false,
            intensity: false,
            patterns: false,
            supported: false,
        };
    }

    fn make_host(prepare_count: Option<Arc<AtomicUsize>>) -> HostHapticsCapability {
        return HostHapticsCapability {
            cancel: Arc::new(|| false),
            capabilities: Arc::new(|out| {
                out.amplitude_control = true;
                out.custom_events = false;
                out.intensity = true;
                out.patterns = true;
                out.supported = true;
            }),
            impact: Arc::new(|style, intensity| {
                return style == HapticImpactStyle::Heavy && intensity == Some(0.5);
            }),
            is_supported: Arc::new(|| true),
            notification: Arc::new(|r#type| {
                return r#type == HapticNotificationType::Warning;
            }),
            prepare: prepare_count.map(|count| {
                let prepare: Arc<dyn Fn() + Send + Sync> = Arc::new(move || {
                    count.fetch_add(1, Ordering::SeqCst);
                });
                return prepare;
            }),
            selection: Arc::new(|| true),
            vibrate: Arc::new(|duration_ms| return duration_ms == 42.0),
            vibrate_pattern: Arc::new(|pattern| return pattern == &vec![10.0, 20.0]),
            vibrate_waveform: Some(Arc::new(|timings, amplitudes, repeat| {
                return timings == &vec![10.0, 20.0]
                    && amplitudes == &vec![255.0, 128.0]
                    && repeat == Some(1);
            })),
        };
    }

    #[test]
    fn get_matches_free_function() {
        let host = make_host(None);
        let mut method_out = make_capabilities();
        let mut free_out = make_capabilities();
        method_out.get(&host);
        get_haptics_capabilities(&mut free_out, &host);
        assert_eq!(method_out, free_out);
    }

    #[test]
    fn cancel_device_vibration_matches_free_function() {
        let host = make_host(None);
        assert_eq!(
            host.cancel_device_vibration(),
            cancel_device_vibration(&host)
        );
    }

    #[test]
    fn is_supported_matches_free_function() {
        let host = make_host(None);
        assert_eq!(host.is_supported(), is_haptics_supported(&host));
    }

    #[test]
    fn prepare_matches_free_function() {
        let method_count = Arc::new(AtomicUsize::new(0));
        let free_count = Arc::new(AtomicUsize::new(0));
        let method_host = make_host(Some(Arc::clone(&method_count)));
        let free_host = make_host(Some(Arc::clone(&free_count)));
        method_host.prepare();
        prepare_haptics(&free_host);
        assert_eq!(
            method_count.load(Ordering::SeqCst),
            free_count.load(Ordering::SeqCst)
        );
    }

    #[test]
    fn trigger_impact_matches_free_function() {
        let host = make_host(None);
        assert_eq!(
            host.trigger_impact(HapticImpactStyle::Heavy, Some(0.5)),
            trigger_haptic_impact(&host, HapticImpactStyle::Heavy, Some(0.5))
        );
    }

    #[test]
    fn trigger_notification_matches_free_function() {
        let host = make_host(None);
        assert_eq!(
            host.trigger_notification(HapticNotificationType::Warning),
            trigger_haptic_notification(&host, HapticNotificationType::Warning)
        );
    }

    #[test]
    fn trigger_selection_matches_free_function() {
        let host = make_host(None);
        assert_eq!(host.trigger_selection(), trigger_haptic_selection(&host));
    }

    #[test]
    fn vibrate_device_matches_free_function() {
        let host = make_host(None);
        assert_eq!(host.vibrate_device(42.0), vibrate_device(&host, 42.0));
    }

    #[test]
    fn vibrate_device_pattern_matches_free_function() {
        let host = make_host(None);
        let pattern = vec![10.0, 20.0];
        assert_eq!(
            host.vibrate_device_pattern(&pattern),
            vibrate_device_pattern(&host, &pattern)
        );
    }

    #[test]
    fn vibrate_device_waveform_matches_free_function() {
        let host = make_host(None);
        let timings = vec![10.0, 20.0];
        let amplitudes = vec![255.0, 128.0];
        assert_eq!(
            host.vibrate_device_waveform(&timings, &amplitudes, Some(1)),
            vibrate_device_waveform(&host, &timings, &amplitudes, Some(1))
        );
    }
}

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

impl HapticsCapabilities {
    pub fn get(&mut self, host_haptics: &HostHapticsCapability) {
        get_haptics_capabilities(self, host_haptics);
    }
}

impl HostHapticsCapability {
    pub fn cancel_device_vibration(&self) -> bool {
        return cancel_device_vibration(self);
    }

    pub fn is_supported(&self) -> bool {
        return is_haptics_supported(self);
    }

    pub fn prepare(&self) {
        prepare_haptics(self);
    }

    pub fn trigger_impact(&self, style: HapticImpactStyle, intensity: Option<f32>) -> bool {
        return trigger_haptic_impact(self, style, intensity);
    }

    pub fn trigger_notification(&self, r#type: HapticNotificationType) -> bool {
        return trigger_haptic_notification(self, r#type);
    }

    pub fn trigger_selection(&self) -> bool {
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
