use crate::common::*;
use flight_entity::Ref;
use flight_log::{
    LogData, LogStateRef, LogValue, add_log_sink, create_log_state, create_memory_log_sink,
    get_memory_log_sink_entries,
};
use flight_net::contract::*;
use flight_signals::emit_signal;
use std::sync::{Arc, RwLock};

fn log_capture() -> (LogStateRef, flight_log::MemoryLogSink) {
    let log = Arc::new(RwLock::new(create_log_state()));
    let sink = create_memory_log_sink(8);
    add_log_sink(&log, sink.sink.clone());
    return (log, sink);
}

mod are_net_guards_enabled {
    use super::*;
    #[test]
    fn reports_enabled_and_disabled_for_an_independent_caller_context() {
        let state = net_state();
        let (log, _) = log_capture();
        enable_net_guards(&state, &log, Arc::new(|| 0.0));
        assert!(are_net_guards_enabled(&state));
        assert!(!are_net_guards_enabled(&net_state()));
        disable_net_guards(&state);
        assert!(!are_net_guards_enabled(&state));
    }
}

mod disable_net_guards {
    use super::*;
    #[test]
    fn restores_silent_request_delegation() {
        let state = net_state();
        let (log, sink) = log_capture();
        enable_net_guards(&state, &log, Arc::new(|| 0.0));
        disable_net_guards(&state);
        let request = net_request("GET", "u");
        request.write().unwrap().body = Some(Some(NetBody::Text("ignored".to_string())));
        request.write().unwrap().timeout_ms = Some(-1.0);
        block_on(send_net_request(
            &host_net(Arc::new(RwLock::new(response(200, "OK", None)))),
            &request,
            None,
            &state,
        ))
        .unwrap();
        assert!(get_memory_log_sink_entries(&sink).is_empty());
    }
}

mod enable_net_guards {
    use super::*;
    #[test]
    fn warns_once_for_bodyless_method_bodies_and_negative_timeouts() {
        let state = net_state();
        let (log, sink) = log_capture();
        enable_net_guards(&state, &log, Arc::new(|| 0.0));
        for (method, body, timeout, url) in [
            ("GET", "ignored", -1.0, "u"),
            ("HEAD", "ignored again", -2.0, "v"),
        ] {
            let request = net_request(method, url);
            request.write().unwrap().body = Some(Some(NetBody::Text(body.to_string())));
            request.write().unwrap().timeout_ms = Some(timeout);
            block_on(send_net_request(
                &host_net(Arc::new(RwLock::new(response(200, "OK", None)))),
                &request,
                None,
                &state,
            ))
            .unwrap();
        }
        let entries = get_memory_log_sink_entries(&sink);
        assert_eq!(entries.len(), 2);
        for (entry, reason) in entries
            .iter()
            .zip(["body-on-get-or-head", "negative-timeout"])
        {
            let LogData::Record(fields) = &entry.data else {
                panic!("expected metadata");
            };
            assert!(matches!(fields.get("reason"), Some(LogValue::Str(value)) if value == reason));
        }
    }

    #[test]
    fn warns_when_a_successful_provider_ignores_the_supplied_progress_signal() {
        let state = net_state();
        let (log, sink) = log_capture();
        enable_net_guards(&state, &log, Arc::new(|| 0.0));
        let options = net_options();
        let progress = progress_signal();
        *progress.read().unwrap().emit.write().unwrap() = Arc::new(|_| {});
        options.write().unwrap().progress = Some(progress);
        block_on(send_net_request(
            &host_net(Arc::new(RwLock::new(response(
                200,
                "OK",
                Some(Arc::new(String::new())),
            )))),
            &net_request("GET", "u"),
            Some(&options),
            &state,
        ))
        .unwrap();
        let entries = get_memory_log_sink_entries(&sink);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].channel.as_deref(), Some("net"));
        let LogData::Record(fields) = &entries[0].data else {
            panic!("expected metadata");
        };
        assert!(
            matches!(fields.get("reason"), Some(LogValue::Str(value)) if value == "progress-not-emitted")
        );
        assert!(matches!(fields.get("url"), Some(LogValue::Str(value)) if value == "u"));
        assert!(!fields.contains_key("timeoutMs"));
    }

    #[test]
    fn stays_silent_when_the_provider_emits_progress() {
        let state = net_state();
        let (log, sink) = log_capture();
        enable_net_guards(&state, &log, Arc::new(|| 0.0));
        let options = net_options();
        options.write().unwrap().progress = Some(progress_signal());
        let host = HostNetCapability {
            provider: Arc::new(()),
            send_net_request: Arc::new(|_, options: Option<Ref<NetRequestOptions>>| {
                let progress = options.unwrap().read().unwrap().progress.clone().unwrap();
                emit_signal(&progress.read().unwrap(), &progress_tick());
                Box::pin(async {
                    Ok(Arc::new(RwLock::new(response(
                        200,
                        "OK",
                        Some(Arc::new(String::new())),
                    ))))
                })
            }),
        };
        block_on(send_net_request(
            &host,
            &net_request("GET", "u"),
            Some(&options),
            &state,
        ))
        .unwrap();
        assert!(get_memory_log_sink_entries(&sink).is_empty());
    }

    #[test]
    fn captures_the_selected_log_state_and_reads_a_live_clock_after_enabling() {
        use std::sync::atomic::{AtomicU32, Ordering};
        let state = net_state();
        let (log, sink) = log_capture();
        let (other_log, other_sink) = log_capture();
        let now = Arc::new(AtomicU32::new(3));
        let live = now.clone();
        enable_net_guards(
            &state,
            &log,
            Arc::new(move || f64::from(live.load(Ordering::SeqCst))),
        );
        now.store(90, Ordering::SeqCst);
        let request = net_request("GET", "u");
        request.write().unwrap().body = Some(Some(NetBody::Text("x".to_string())));
        block_on(send_net_request(
            &host_net(Arc::new(RwLock::new(response(200, "OK", None)))),
            &request,
            None,
            &state,
        ))
        .unwrap();
        assert_eq!(get_memory_log_sink_entries(&sink)[0].timestamp_ms, 90.0);
        assert!(get_memory_log_sink_entries(&other_sink).is_empty());
        enable_net_guards(&state, &other_log, Arc::new(|| 100.0));
        block_on(send_net_request(
            &host_net(Arc::new(RwLock::new(response(200, "OK", None)))),
            &request,
            None,
            &state,
        ))
        .unwrap();
        assert_eq!(
            get_memory_log_sink_entries(&other_sink)[0].timestamp_ms,
            100.0
        );
    }
}
