use std::sync::{Arc, Mutex};

use flight_host::{InputIngressSource, ProviderRef};
use flight_input::contract::*;
use flight_signals::connect_signal;

fn source() -> InputIngressSource {
    return InputIngressSource {
        provider: Arc::new(()),
        handle: Arc::new(()),
    };
}

#[derive(Clone)]
struct Recorder {
    attachments: Arc<Mutex<Vec<(String, InputIngressSource)>>>,
    releases: Arc<Mutex<Vec<String>>>,
    sinks: Arc<Mutex<Vec<InputIngressSink>>>,
}

fn recorder() -> Recorder {
    return Recorder {
        attachments: Arc::new(Mutex::new(Vec::new())),
        releases: Arc::new(Mutex::new(Vec::new())),
        sinks: Arc::new(Mutex::new(Vec::new())),
    };
}

fn recording_host(recorder: Recorder) -> HostInputIngressCapability {
    let attach = |kind: &'static str| -> InputIngressAttach {
        let recorder = recorder.clone();
        return Arc::new(
            move |source: &InputIngressSource,
                  sink: InputIngressSink,
                  _options: Option<&AttachInputOptions>| {
                recorder
                    .attachments
                    .lock()
                    .unwrap()
                    .push((kind.to_string(), source.clone()));
                recorder.sinks.lock().unwrap().push(sink);
                let releases = recorder.releases.clone();
                let release: InputIngressRelease = Arc::new(move || {
                    releases.lock().unwrap().push(kind.to_string());
                });
                return release;
            },
        );
    };
    return HostInputIngressCapability {
        provider: Arc::new(()),
        attach_gamepad: attach("gamepad"),
        attach_keyboard: attach("keyboard"),
        attach_pointer: attach("pointer"),
        attach_relative_pointer: attach("relativePointer"),
        attach_text: attach("text"),
        attach_wheel: attach("wheel"),
    };
}

fn keyboard_data(key_code: i32) -> InputKeyboardData {
    return InputKeyboardData {
        alt_key: false,
        caps_lock: false,
        code: String::new(),
        ctrl_key: false,
        key: String::new(),
        key_code,
        location: 0,
        meta_key: false,
        modifier: 0,
        num_lock: false,
        repeat: false,
        shift_key: false,
        time_stamp: 0.0,
    };
}

mod attach_gamepad_input {
    use super::*;

    #[test]
    fn binds_the_exact_source_through_the_ingress_provider() {
        let recorder = recorder();
        let host = recording_host(recorder.clone());
        let manager = create_input_manager();
        let source = source();
        attach_gamepad_input(&host, &manager, &source, None);
        let attachments = recorder.attachments.lock().unwrap();
        assert_eq!(attachments.len(), 1);
        assert_eq!(attachments[0].0, "gamepad");
        assert!(Arc::ptr_eq(&attachments[0].1.handle, &source.handle));
    }
}

mod attach_keyboard_input {
    use super::*;

    #[test]
    fn forwards_normalized_events_and_respects_the_enabled_flag() {
        let recorder = recorder();
        let host = recording_host(recorder.clone());
        let manager = create_input_manager();
        let events = Arc::new(Mutex::new(Vec::new()));
        let captured = events.clone();
        connect_signal(
            &manager.read().unwrap().on_key_down.clone(),
            Arc::new(move |_data: &InputKeyboardData| captured.lock().unwrap().push("key")),
            None,
        );
        attach_keyboard_input(&host, &manager, &source(), None);
        let sink = recorder.sinks.lock().unwrap()[0].clone();
        (sink.key_down)(&keyboard_data(65));
        assert!(!events.lock().unwrap().is_empty());

        manager.write().unwrap().enabled = false;
        (sink.key_down)(&keyboard_data(65));
        assert_eq!(events.lock().unwrap().len(), 1);
    }
}

mod attach_pointer_input {
    use super::*;

    #[test]
    fn reattaching_the_same_source_releases_the_old_origin_once() {
        let recorder = recorder();
        let host = recording_host(recorder.clone());
        let manager = create_input_manager();
        let source = source();
        attach_pointer_input(&host, &manager, &source, None);
        attach_pointer_input(&host, &manager, &source, None);
        assert_eq!(
            *recorder.releases.lock().unwrap(),
            vec!["pointer".to_string()]
        );
        detach_pointer_input(&manager, &source);
        detach_pointer_input(&manager, &source);
        assert_eq!(recorder.releases.lock().unwrap().len(), 2);
    }
}

mod attach_relative_pointer_input {
    use super::*;

    #[test]
    fn binds_relative_pointer_ingress() {
        let recorder = recorder();
        let host = recording_host(recorder.clone());
        attach_relative_pointer_input(&host, &create_input_manager(), &source(), None);
        assert_eq!(recorder.attachments.lock().unwrap()[0].0, "relativePointer");
    }
}

mod attach_text_input {
    use super::*;

    #[test]
    fn binds_text_ingress() {
        let recorder = recorder();
        let host = recording_host(recorder.clone());
        attach_text_input(&host, &create_input_manager(), &source(), None);
        assert_eq!(recorder.attachments.lock().unwrap()[0].0, "text");
    }
}

mod attach_wheel_input {
    use super::*;

    #[test]
    fn binds_wheel_ingress() {
        let recorder = recorder();
        let host = recording_host(recorder.clone());
        attach_wheel_input(&host, &create_input_manager(), &source(), None);
        assert_eq!(recorder.attachments.lock().unwrap()[0].0, "wheel");
    }
}

mod detach_gamepad_input {
    use super::*;

    #[test]
    fn releases_the_attachment() {
        let recorder = recorder();
        let host = recording_host(recorder.clone());
        let manager = create_input_manager();
        let source = source();
        attach_gamepad_input(&host, &manager, &source, None);
        detach_gamepad_input(&manager, &source);
        detach_gamepad_input(&manager, &source);
        assert_eq!(
            *recorder.releases.lock().unwrap(),
            vec!["gamepad".to_string()]
        );
    }
}

mod detach_keyboard_input {
    use super::*;

    #[test]
    fn ends_only_its_own_binding() {
        let recorder = recorder();
        let host = recording_host(recorder.clone());
        let manager = create_input_manager();
        let kept = source();
        let dropped = source();
        attach_keyboard_input(&host, &manager, &kept, None);
        attach_keyboard_input(&host, &manager, &dropped, None);
        detach_keyboard_input(&manager, &dropped);
        assert_eq!(recorder.releases.lock().unwrap().len(), 1);
        detach_keyboard_input(&manager, &kept);
        assert_eq!(recorder.releases.lock().unwrap().len(), 2);
    }
}

mod detach_pointer_input {
    use super::*;

    #[test]
    fn is_idempotent_when_never_attached() {
        let manager = create_input_manager();
        detach_pointer_input(&manager, &source());
        detach_pointer_input(&manager, &source());
    }
}

mod detach_relative_pointer_input {
    use super::*;

    #[test]
    fn releases_relative_pointer_ingress() {
        let recorder = recorder();
        let host = recording_host(recorder.clone());
        let manager = create_input_manager();
        let source = source();
        attach_relative_pointer_input(&host, &manager, &source, None);
        detach_relative_pointer_input(&manager, &source);
        assert_eq!(recorder.releases.lock().unwrap().len(), 1);
    }
}

mod detach_text_input {
    use super::*;

    #[test]
    fn releases_text_ingress() {
        let recorder = recorder();
        let host = recording_host(recorder.clone());
        let manager = create_input_manager();
        let source = source();
        attach_text_input(&host, &manager, &source, None);
        detach_text_input(&manager, &source);
        assert_eq!(recorder.releases.lock().unwrap().len(), 1);
    }
}

mod detach_wheel_input {
    use super::*;

    #[test]
    fn releases_wheel_ingress() {
        let recorder = recorder();
        let host = recording_host(recorder.clone());
        let manager = create_input_manager();
        let source = source();
        attach_wheel_input(&host, &manager, &source, None);
        detach_wheel_input(&manager, &source);
        assert_eq!(recorder.releases.lock().unwrap().len(), 1);
    }
}

mod explicit_input_ingress_parameter {
    use super::*;

    #[test]
    fn passes_each_exact_source_identity_through_all_six_families_and_releases_each_once() {
        let recorder = recorder();
        let host = recording_host(recorder.clone());
        let manager = create_input_manager();
        let sources = [source(), source(), source(), source(), source(), source()];
        attach_gamepad_input(&host, &manager, &sources[0], None);
        attach_keyboard_input(&host, &manager, &sources[1], None);
        attach_pointer_input(&host, &manager, &sources[2], None);
        attach_relative_pointer_input(&host, &manager, &sources[3], None);
        attach_text_input(&host, &manager, &sources[4], None);
        attach_wheel_input(&host, &manager, &sources[5], None);
        let attachments = recorder.attachments.lock().unwrap().clone();
        assert_eq!(attachments.len(), 6);
        for index in 0..attachments.len() {
            assert!(Arc::ptr_eq(
                &attachments[index].1.handle,
                &sources[index].handle
            ));
        }
        detach_gamepad_input(&manager, &sources[0]);
        detach_keyboard_input(&manager, &sources[1]);
        detach_pointer_input(&manager, &sources[2]);
        detach_relative_pointer_input(&manager, &sources[3]);
        detach_text_input(&manager, &sources[4]);
        detach_wheel_input(&manager, &sources[5]);
        detach_gamepad_input(&manager, &sources[0]);
        detach_keyboard_input(&manager, &sources[1]);
        detach_pointer_input(&manager, &sources[2]);
        detach_relative_pointer_input(&manager, &sources[3]);
        detach_text_input(&manager, &sources[4]);
        detach_wheel_input(&manager, &sources[5]);
        assert_eq!(recorder.releases.lock().unwrap().len(), 6);
    }
}

mod provider_identity {
    use super::*;

    fn host_with(provider: ProviderRef, attach: InputIngressAttach) -> HostInputIngressCapability {
        return HostInputIngressCapability {
            provider,
            attach_gamepad: attach.clone(),
            attach_keyboard: attach.clone(),
            attach_pointer: attach.clone(),
            attach_relative_pointer: attach.clone(),
            attach_text: attach.clone(),
            attach_wheel: attach,
        };
    }

    #[test]
    fn facets_from_one_provider_share_identity_and_distinct_providers_stay_distinct() {
        let provider: ProviderRef = Arc::new(());
        let callback: InputIngressRelease = Arc::new(|| {});
        let attach: InputIngressAttach = Arc::new(
            move |_source: &InputIngressSource,
                  _sink: InputIngressSink,
                  _options: Option<&AttachInputOptions>| {
                return callback.clone();
            },
        );
        let first = host_with(provider.clone(), attach.clone());
        let second = host_with(provider, attach.clone());
        assert!(Arc::ptr_eq(&first.provider, &second.provider));
        assert!(Arc::ptr_eq(&first.attach_gamepad, &second.attach_gamepad));

        let other = host_with(Arc::new(()), attach);
        assert!(!Arc::ptr_eq(&first.provider, &other.provider));
    }
}
