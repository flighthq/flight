use std::future::ready;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, RwLock};

use flight_entity::Ref;
use flight_host::ProviderRef;
use flight_log::{
    LogData, LogLevel, LogStateRef, add_log_sink, create_log_state, create_memory_log_sink,
    get_memory_log_sink_entries,
};
use flight_tray::contract::*;

use crate::block_on;

fn host() -> (HostTrayLifecycleCapability, HostTrayImageCapability) {
    let live: Arc<Mutex<Vec<Ref<TrayIcon>>>> = Arc::new(Mutex::new(Vec::new()));
    let provider: ProviderRef = Arc::new(());
    let (l1, l2, l3, l4) = (live.clone(), live.clone(), live.clone(), live);
    let lifecycle = HostTrayLifecycleCapability {
        provider: provider.clone(),
        create: Arc::new(move |tray: &Ref<TrayIcon>, _options: &TrayIconOptions| {
            l1.lock().unwrap().push(tray.clone());
            let result: TrayProviderFuture<TrayCreateCapabilityResult> =
                Box::pin(ready(Ok(TrayCreateCapabilityResult::Created)));
            return result;
        }),
        destroy: Arc::new(move |tray: &Ref<TrayIcon>| {
            l2.lock().unwrap().retain(|item| !Arc::ptr_eq(item, tray));
            let result: TrayProviderFuture<TrayDestroyCapabilityResult> =
                Box::pin(ready(Ok(TrayDestroyCapabilityResult::Destroyed)));
            return result;
        }),
        is_destroyed: Arc::new(move |tray: &Ref<TrayIcon>| {
            return !l3
                .lock()
                .unwrap()
                .iter()
                .any(|item| Arc::ptr_eq(item, tray));
        }),
        list: Arc::new(move || l4.lock().unwrap().clone()),
    };
    let image = HostTrayImageCapability {
        provider,
        set: Arc::new(|_tray: &Ref<TrayIcon>, _icon: &str| {
            let result: TrayProviderFuture<TrayImageUpdateResult> =
                Box::pin(ready(Ok(TrayImageUpdateResult::Updated)));
            return result;
        }),
    };
    return (lifecycle, image);
}

fn tray() -> (Ref<TrayIcon>, HostTrayImageCapability) {
    let (lifecycle, image) = host();
    let options = TrayIconOptions {
        icon: None,
        icon_template: None,
        signal: None,
        title: None,
        tooltip: None,
    };
    let TrayCreateOutcome::Created(TrayCreated { tray }) =
        block_on(create_tray_icon(&lifecycle, &options)).outcome
    else {
        panic!("not created");
    };
    return (tray, image);
}

fn animation_state() -> TrayAnimationState {
    let spawn = flight_host::HostSpawnCapability {
        provider: Arc::new(()),
        spawn: Arc::new(
            |_future: std::pin::Pin<Box<dyn std::future::Future<Output = ()> + Send>>| {},
        ),
    };
    return create_tray_animation_state(
        spawn,
        Arc::new(RwLock::new(flight_signals::create_signal_timer_state())),
    );
}

fn log_state() -> LogStateRef {
    return Arc::new(RwLock::new(create_log_state()));
}

fn counting_clock(calls: &Arc<AtomicUsize>) -> Arc<dyn Fn() -> f64 + Send + Sync> {
    let calls = calls.clone();
    return Arc::new(move || {
        calls.fetch_add(1, Ordering::SeqCst);
        return 1000.0;
    });
}

fn messages(entries: &[flight_log::LogEntry]) -> String {
    return entries
        .iter()
        .map(|entry| match &entry.data {
            LogData::Message(message) => message.clone(),
            _ => String::new(),
        })
        .collect::<Vec<String>>()
        .join("\n");
}

mod disable_tray_guards {
    use super::*;

    #[test]
    fn stops_inspecting_later_animations() {
        let logs = log_state();
        let sink = create_memory_log_sink(8);
        add_log_sink(&logs, sink.sink.clone());
        let clock_calls = Arc::new(AtomicUsize::new(0));
        let mut state = animation_state();
        enable_tray_guards(&mut state, &logs, counting_clock(&clock_calls));
        disable_tray_guards(&mut state);
        let (icon, image) = tray();
        let started = block_on(start_tray_icon_animation(
            &state,
            &image,
            &icon,
            &["a".to_string()],
            0.0,
        ));
        if let TrayAnimationStartResult::Started(release) = started {
            block_on((release.release)());
        }
        block_on(destroy_tray_icon(&icon));
        assert_eq!(
            messages(&{
                let mut collected = Vec::new();
                get_memory_log_sink_entries(&mut collected, &sink);
                collected
            }),
            ""
        );
        assert_eq!(clock_calls.load(Ordering::SeqCst), 0);
    }
}

mod enable_tray_guards {
    use super::*;

    #[test]
    fn warns_without_refusing_a_non_positive_interval() {
        let logs = log_state();
        let sink = create_memory_log_sink(8);
        add_log_sink(&logs, sink.sink.clone());
        let clock_calls = Arc::new(AtomicUsize::new(0));
        let mut state = animation_state();
        enable_tray_guards(&mut state, &logs, counting_clock(&clock_calls));
        let (icon, image) = tray();
        let started = block_on(start_tray_icon_animation(
            &state,
            &image,
            &icon,
            &["a".to_string()],
            0.0,
        ));
        assert!(matches!(started, TrayAnimationStartResult::Started(..)));
        let entries = {
            let mut collected = Vec::new();
            get_memory_log_sink_entries(&mut collected, &sink);
            collected
        };
        assert!(messages(&entries).contains("intervalMs is 0"));
        assert_eq!(entries[0].level, LogLevel::Warn);
        assert_eq!(entries[0].channel, Some("tray".to_string()));
        assert_eq!(entries[0].timestamp_ms, 1000.0);
        assert_eq!(clock_calls.load(Ordering::SeqCst), 1);
        if let TrayAnimationStartResult::Started(release) = started {
            block_on((release.release)());
        }
    }

    #[test]
    fn stays_silent_for_a_positive_interval_and_warns_once_per_log_state() {
        let logs = log_state();
        let sink = create_memory_log_sink(8);
        add_log_sink(&logs, sink.sink.clone());
        let clock_calls = Arc::new(AtomicUsize::new(0));
        let mut state = animation_state();
        enable_tray_guards(&mut state, &logs, counting_clock(&clock_calls));
        let (icon, image) = tray();
        block_on(start_tray_icon_animation(
            &state,
            &image,
            &icon,
            &["a".to_string()],
            16.0,
        ));
        assert_eq!(
            {
                let mut collected = Vec::new();
                get_memory_log_sink_entries(&mut collected, &sink);
                collected
            }
            .len(),
            0
        );
        block_on(start_tray_icon_animation(
            &state,
            &image,
            &icon,
            &["a".to_string()],
            -1.0,
        ));
        block_on(start_tray_icon_animation(
            &state,
            &image,
            &icon,
            &["a".to_string()],
            0.0,
        ));
        let entries = {
            let mut collected = Vec::new();
            get_memory_log_sink_entries(&mut collected, &sink);
            collected
        };
        assert_eq!(entries.len(), 1);
        assert!(messages(&entries).contains("intervalMs is -1"));
    }
}
