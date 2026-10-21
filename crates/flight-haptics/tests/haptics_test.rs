use std::sync::{Arc, Mutex};

use flight_haptics::*;

#[derive(Debug, Default)]
struct RecordedCalls {
    impacts: Vec<(HapticImpactStyle, Option<f32>)>,
    names: Vec<&'static str>,
    notifications: Vec<HapticNotificationType>,
    patterns: Vec<Vec<f32>>,
    vibrations: Vec<f32>,
    waveforms: Vec<(Vec<f32>, Vec<f32>, Option<i32>)>,
}

type Calls = Arc<Mutex<RecordedCalls>>;

fn make_host() -> (Calls, HostHapticsCapability) {
    let calls = Arc::new(Mutex::new(RecordedCalls {
        impacts: Vec::new(),
        names: Vec::new(),
        notifications: Vec::new(),
        patterns: Vec::new(),
        vibrations: Vec::new(),
        waveforms: Vec::new(),
    }));

    let cancel_calls = Arc::clone(&calls);
    let capabilities_calls = Arc::clone(&calls);
    let impact_calls = Arc::clone(&calls);
    let is_supported_calls = Arc::clone(&calls);
    let notification_calls = Arc::clone(&calls);
    let selection_calls = Arc::clone(&calls);
    let vibrate_calls = Arc::clone(&calls);
    let pattern_calls = Arc::clone(&calls);

    let host = HostHapticsCapability {
        cancel: Arc::new(move || {
            cancel_calls.lock().unwrap().names.push("cancel");
            return true;
        }),
        capabilities: Arc::new(move |out| {
            capabilities_calls
                .lock()
                .unwrap()
                .names
                .push("capabilities");
            out.patterns = true;
            out.supported = true;
        }),
        impact: Arc::new(move |style, intensity| {
            let mut calls = impact_calls.lock().unwrap();
            calls.names.push("impact");
            calls.impacts.push((style, intensity));
            return true;
        }),
        is_supported: Arc::new(move || {
            is_supported_calls.lock().unwrap().names.push("isSupported");
            return true;
        }),
        notification: Arc::new(move |notification_type| {
            let mut calls = notification_calls.lock().unwrap();
            calls.names.push("notification");
            calls.notifications.push(notification_type);
            return true;
        }),
        prepare: None,
        selection: Arc::new(move || {
            selection_calls.lock().unwrap().names.push("selection");
            return true;
        }),
        vibrate: Arc::new(move |duration_ms| {
            let mut calls = vibrate_calls.lock().unwrap();
            calls.names.push("vibrate");
            calls.vibrations.push(duration_ms);
            return true;
        }),
        vibrate_pattern: Arc::new(move |pattern| {
            let mut calls = pattern_calls.lock().unwrap();
            calls.names.push("vibratePattern");
            calls.patterns.push(pattern.clone());
            return true;
        }),
        vibrate_waveform: None,
    };
    return (calls, host);
}

fn make_capabilities() -> HapticsCapabilities {
    return HapticsCapabilities {
        amplitude_control: false,
        custom_events: false,
        intensity: false,
        patterns: false,
        supported: false,
    };
}

mod cancel_device_vibration {
    use super::*;

    #[test]
    fn forwards_to_the_selected_provider() {
        let (calls, host) = make_host();
        assert!(cancel_device_vibration(&host));
        assert_eq!(calls.lock().unwrap().names, vec!["cancel"]);
    }

    #[test]
    fn returns_whatever_the_provider_reports_rather_than_assuming_success() {
        let (_, mut host) = make_host();
        host.cancel = Arc::new(|| false);
        assert!(!cancel_device_vibration(&host));
    }
}

mod get_haptics_capabilities {
    use super::*;

    #[test]
    fn fills_and_returns_the_caller_owned_out_parameter() {
        let (_, host) = make_host();
        let mut out = make_capabilities();
        get_haptics_capabilities(&mut out, &host);
        assert!(out.supported);
        assert!(out.patterns);
    }

    #[test]
    fn reports_each_host_independently_when_two_providers_are_live_at_once() {
        let (_, supported) = make_host();
        let (_, mut unsupported) = make_host();
        unsupported.capabilities = Arc::new(|out| {
            out.supported = false;
            out.patterns = false;
        });

        let mut supported_out = make_capabilities();
        let mut unsupported_out = make_capabilities();
        get_haptics_capabilities(&mut supported_out, &supported);
        get_haptics_capabilities(&mut unsupported_out, &unsupported);
        assert!(supported_out.supported);
        assert!(!unsupported_out.supported);
    }
}

mod is_haptics_supported {
    use super::*;

    #[test]
    fn forwards_to_the_selected_provider() {
        let (_, host) = make_host();
        assert!(is_haptics_supported(&host));
    }

    #[test]
    fn reports_false_for_a_provider_that_says_so() {
        let (_, mut host) = make_host();
        host.is_supported = Arc::new(|| false);
        assert!(!is_haptics_supported(&host));
    }
}

mod prepare_haptics {
    use super::*;

    #[test]
    fn calls_prepare_on_providers_that_implement_it() {
        let (calls, mut host) = make_host();
        let prepare_calls = Arc::clone(&calls);
        host.prepare = Some(Arc::new(move || {
            prepare_calls.lock().unwrap().names.push("prepare");
        }));
        prepare_haptics(&host);
        assert_eq!(calls.lock().unwrap().names, vec!["prepare"]);
    }

    #[test]
    fn does_nothing_when_the_provider_omits_prepare() {
        let (calls, host) = make_host();
        assert!(host.prepare.is_none());
        prepare_haptics(&host);
        assert!(calls.lock().unwrap().names.is_empty());
    }
}

mod trigger_haptic_impact {
    use super::*;

    #[test]
    fn forwards_the_style_and_defaults_intensity_to_1() {
        let (calls, host) = make_host();
        trigger_haptic_impact(&host, HapticImpactStyle::Heavy, None);
        assert_eq!(
            calls.lock().unwrap().impacts,
            vec![(HapticImpactStyle::Heavy, Some(1.0))]
        );
    }

    #[test]
    fn forwards_an_explicit_intensity_unchanged() {
        let (calls, host) = make_host();
        trigger_haptic_impact(&host, HapticImpactStyle::Light, Some(0.25));
        assert_eq!(
            calls.lock().unwrap().impacts,
            vec![(HapticImpactStyle::Light, Some(0.25))]
        );
    }

    #[test]
    fn forwards_every_impact_style() {
        let styles = vec![
            HapticImpactStyle::Heavy,
            HapticImpactStyle::Light,
            HapticImpactStyle::Medium,
            HapticImpactStyle::Rigid,
            HapticImpactStyle::Soft,
        ];
        let (calls, host) = make_host();
        for style in &styles {
            trigger_haptic_impact(&host, *style, None);
        }
        let actual: Vec<HapticImpactStyle> = calls
            .lock()
            .unwrap()
            .impacts
            .iter()
            .map(|(style, _)| *style)
            .collect();
        assert_eq!(actual, styles);
    }
}

mod trigger_haptic_notification {
    use super::*;

    #[test]
    fn forwards_every_notification_type() {
        let notification_types = vec![
            HapticNotificationType::Error,
            HapticNotificationType::Success,
            HapticNotificationType::Warning,
        ];
        let (calls, host) = make_host();
        for notification_type in &notification_types {
            trigger_haptic_notification(&host, *notification_type);
        }
        assert_eq!(calls.lock().unwrap().notifications, notification_types);
    }
}

mod trigger_haptic_selection {
    use super::*;

    #[test]
    fn forwards_to_the_selected_provider() {
        let (calls, host) = make_host();
        assert!(trigger_haptic_selection(&host));
        assert_eq!(calls.lock().unwrap().names, vec!["selection"]);
    }
}

mod vibrate_device {
    use super::*;

    #[test]
    fn forwards_the_duration_to_the_selected_provider() {
        let (calls, host) = make_host();
        vibrate_device(&host, 42.0);
        assert_eq!(calls.lock().unwrap().vibrations, vec![42.0]);
    }
}

mod vibrate_device_pattern {
    use super::*;

    #[test]
    fn forwards_a_non_empty_pattern() {
        let (calls, host) = make_host();
        let pattern = vec![10.0, 20.0];
        vibrate_device_pattern(&host, &pattern);
        assert_eq!(calls.lock().unwrap().patterns, vec![pattern]);
    }

    #[test]
    fn rejects_an_empty_pattern_before_reaching_the_provider() {
        let (calls, host) = make_host();
        assert!(!vibrate_device_pattern(&host, &Vec::new()));
        assert!(calls.lock().unwrap().names.is_empty());
    }
}

mod vibrate_device_waveform {
    use super::*;

    fn install_waveform(host: &mut HostHapticsCapability, calls: &Calls) {
        let waveform_calls = Arc::clone(calls);
        host.vibrate_waveform = Some(Arc::new(move |timings, amplitudes, repeat| {
            let mut calls = waveform_calls.lock().unwrap();
            calls.names.push("vibrateWaveform");
            calls
                .waveforms
                .push((timings.clone(), amplitudes.clone(), repeat));
            return true;
        }));
    }

    #[test]
    fn uses_vibrate_waveform_when_the_provider_implements_it() {
        let (calls, mut host) = make_host();
        install_waveform(&mut host, &calls);
        let timings = vec![10.0, 20.0];
        let amplitudes = vec![255.0, 128.0];
        assert!(vibrate_device_waveform(
            &host,
            &timings,
            &amplitudes,
            Some(1)
        ));
        assert_eq!(
            calls.lock().unwrap().waveforms,
            vec![(timings, amplitudes, Some(1))]
        );
    }

    #[test]
    fn falls_back_to_vibrate_pattern_with_the_timings_when_vibrate_waveform_is_absent() {
        let (calls, host) = make_host();
        assert!(host.vibrate_waveform.is_none());
        let timings = vec![10.0, 20.0];
        let amplitudes = vec![255.0, 128.0];
        assert!(vibrate_device_waveform(&host, &timings, &amplitudes, None));
        assert_eq!(calls.lock().unwrap().patterns, vec![timings]);
    }

    #[test]
    fn rejects_empty_timings_before_reaching_either_path() {
        let (calls, host) = make_host();
        assert!(!vibrate_device_waveform(
            &host,
            &Vec::new(),
            &Vec::new(),
            None
        ));
        assert!(calls.lock().unwrap().names.is_empty());
    }

    #[test]
    fn defaults_repeat_to_negative_1() {
        let (calls, mut host) = make_host();
        install_waveform(&mut host, &calls);
        let timings = vec![10.0];
        let amplitudes = vec![255.0];
        assert!(vibrate_device_waveform(&host, &timings, &amplitudes, None));
        assert_eq!(
            calls.lock().unwrap().waveforms,
            vec![(timings, amplitudes, Some(-1))]
        );
    }
}
