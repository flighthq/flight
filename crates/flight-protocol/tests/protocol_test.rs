use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use flight_entity::{Entity, Record, entries, get_record_value, set_record_value};
use flight_hostcapability::ProviderRef;
use flight_protocol::contract::*;
use flight_signals::{connect_signal, has_signal_slots};

struct OpenState {
    listeners: Vec<(Arc<AtomicBool>, ProtocolOpenListener)>,
    subscribes: usize,
    unsubscribes: usize,
}

#[derive(Clone)]
struct OpenProvider {
    capability: HostProtocolOpenCapability,
    state: Arc<Mutex<OpenState>>,
}

impl OpenProvider {
    fn active_subscriptions(&self) -> usize {
        return self
            .state
            .lock()
            .unwrap()
            .listeners
            .iter()
            .filter(|(active, _)| active.load(Ordering::SeqCst))
            .count();
    }

    fn fire(&self, url: &str) {
        let listeners: Vec<(Arc<AtomicBool>, ProtocolOpenListener)> = self
            .state
            .lock()
            .unwrap()
            .listeners
            .iter()
            .cloned()
            .collect();
        for (active, listener) in listeners {
            if active.load(Ordering::SeqCst) {
                listener(url);
            }
        }
    }

    fn unsubscribes(&self) -> usize {
        return self.state.lock().unwrap().unsubscribes;
    }
}

fn empty_record() -> Record<String> {
    return parse_protocol_url("flight:").unwrap().query;
}

fn open_provider(provider: ProviderRef) -> OpenProvider {
    let state = Arc::new(Mutex::new(OpenState {
        listeners: Vec::new(),
        subscribes: 0,
        unsubscribes: 0,
    }));
    let shared = state.clone();
    let subscribe = Arc::new(move |listener: ProtocolOpenListener| {
        let active = Arc::new(AtomicBool::new(true));
        {
            let mut state = shared.lock().unwrap();
            state.subscribes += 1;
            state.listeners.push((active.clone(), listener));
        }
        let shared = shared.clone();
        let release: ProtocolUnsubscribe = Arc::new(move || {
            if active.swap(false, Ordering::SeqCst) {
                shared.lock().unwrap().unsubscribes += 1;
            }
        });
        return release;
    });
    return OpenProvider {
        capability: HostProtocolOpenCapability {
            provider,
            subscribe,
        },
        state,
    };
}

fn provider_ref() -> ProviderRef {
    return Arc::new(());
}

fn query(values: &[(&str, &str)]) -> Record<String> {
    let mut query = empty_record();
    for (key, value) in values {
        set_record_value(&mut query, (*key).to_string(), (*value).to_string());
    }
    return query;
}

fn url_parts(
    scheme: Option<&str>,
    host: Option<&str>,
    path: Option<&str>,
    query: Option<Record<String>>,
) -> ProtocolUrlParts {
    return ProtocolUrlParts {
        scheme: scheme.map(str::to_string),
        host: host.map(str::to_string),
        path: path.map(str::to_string),
        query,
    };
}

mod attach_protocol_handler {
    use super::*;

    #[test]
    fn forwards_open_urls_and_replaces_the_previous_source_first() {
        let a = open_provider(provider_ref());
        let b = open_provider(provider_ref());
        let mut handler = create_protocol_handler();
        let received = Arc::new(Mutex::new(Vec::<String>::new()));
        let sink = received.clone();
        connect_signal(
            &handler.on_open_url,
            Arc::new(move |url: &String| sink.lock().unwrap().push(url.clone())),
            None,
        );
        attach_protocol_handler(&a.capability, &mut handler);
        a.fire("flight://warm");
        attach_protocol_handler(&b.capability, &mut handler);
        assert_eq!(a.unsubscribes(), 1);
        assert_eq!(a.active_subscriptions(), 0);
        assert_eq!(b.active_subscriptions(), 1);
        a.fire("flight://stale");
        b.fire("flight://open");
        assert_eq!(
            *received.lock().unwrap(),
            vec!["flight://warm".to_string(), "flight://open".to_string()]
        );
    }

    #[test]
    fn keeps_provider_identity_shared_across_capability_facets() {
        let provider = provider_ref();
        let open = open_provider(provider.clone());
        let launch = HostProtocolLaunchCapability {
            provider: provider.clone(),
            get_launch_url: Arc::new(|| None),
        };
        let unrelated = HostProtocolLaunchCapability {
            provider: provider_ref(),
            get_launch_url: Arc::new(|| None),
        };
        assert!(Arc::ptr_eq(&open.capability.provider, &launch.provider));
        assert!(!Arc::ptr_eq(&open.capability.provider, &unrelated.provider));
    }

    #[test]
    fn permits_synchronous_callback_reentry_without_holding_provider_state() {
        let provider = open_provider(provider_ref());
        let mut handler = create_protocol_handler();
        let received = Arc::new(Mutex::new(Vec::<String>::new()));
        let sink = received.clone();
        let reentry = provider.clone();
        connect_signal(
            &handler.on_open_url,
            Arc::new(move |url: &String| {
                sink.lock().unwrap().push(url.clone());
                if url == "outer" {
                    reentry.fire("inner");
                }
            }),
            None,
        );
        attach_protocol_handler(&provider.capability, &mut handler);
        provider.fire("outer");
        assert_eq!(
            *received.lock().unwrap(),
            vec!["outer".to_string(), "inner".to_string()]
        );
    }
}

mod create_protocol_handler {
    use super::*;

    fn assert_entity<T: Entity>(_value: &T) {}

    #[test]
    fn creates_an_entity_with_an_inert_open_signal() {
        let handler = create_protocol_handler();
        assert_entity(&handler);
        assert!(!has_signal_slots(&handler.on_open_url));
    }
}

mod create_protocol_url {
    use super::*;

    #[test]
    fn applies_source_defaults_and_authority_free_paths() {
        assert_eq!(
            create_protocol_url(&url_parts(None, None, None, None)),
            "unknown:"
        );
        assert_eq!(
            create_protocol_url(&url_parts(Some("flight"), None, Some("/open"), None)),
            "flight:/open"
        );
    }

    #[test]
    fn normalizes_the_path_and_encodes_query_components_like_encode_uri_component() {
        let query = query(&[("name", "a b"), ("unsafe&=", "雪/🙂"), ("", "ignored")]);
        assert_eq!(
            create_protocol_url(&url_parts(
                Some("flight"),
                Some("open"),
                Some("file"),
                Some(query)
            )),
            "flight://open/file?name=a%20b&unsafe%26%3D=%E9%9B%AA%2F%F0%9F%99%82"
        );
    }

    #[test]
    fn uses_javascript_property_enumeration_for_query_keys() {
        let query = query(&[("10", "ten"), ("name", "value"), ("2", "two")]);
        assert_eq!(
            create_protocol_url(&url_parts(
                Some("flight"),
                Some("open"),
                Some("/"),
                Some(query)
            )),
            "flight://open/?2=two&10=ten&name=value"
        );
    }
}

mod detach_protocol_handler {
    use super::*;

    #[test]
    fn consumes_the_current_release_exactly_once() {
        let provider = open_provider(provider_ref());
        let mut handler = create_protocol_handler();
        attach_protocol_handler(&provider.capability, &mut handler);
        detach_protocol_handler(&mut handler);
        detach_protocol_handler(&mut handler);
        assert_eq!(provider.unsubscribes(), 1);
        assert_eq!(provider.active_subscriptions(), 0);
    }
}

mod dispose_protocol_handler {
    use super::*;

    #[test]
    fn detaches_and_clears_the_open_signal() {
        let provider = open_provider(provider_ref());
        let mut handler = create_protocol_handler();
        let received = Arc::new(Mutex::new(0));
        let sink = received.clone();
        connect_signal(
            &handler.on_open_url,
            Arc::new(move |_url: &String| *sink.lock().unwrap() += 1),
            None,
        );
        attach_protocol_handler(&provider.capability, &mut handler);
        dispose_protocol_handler(&mut handler);
        provider.fire("flight://ignored");
        assert_eq!(provider.unsubscribes(), 1);
        assert!(!has_signal_slots(&handler.on_open_url));
        assert_eq!(*received.lock().unwrap(), 0);
    }
}

mod get_protocol_launch_url {
    use super::*;

    #[test]
    fn returns_the_provider_launch_sentinel_unchanged() {
        let present = HostProtocolLaunchCapability {
            provider: provider_ref(),
            get_launch_url: Arc::new(|| Some("flight://open".to_string())),
        };
        let absent = HostProtocolLaunchCapability {
            provider: provider_ref(),
            get_launch_url: Arc::new(|| None),
        };
        assert_eq!(
            get_protocol_launch_url(&present),
            Some("flight://open".to_string())
        );
        assert_eq!(get_protocol_launch_url(&absent), None);
    }
}

mod get_registered_protocol_schemes {
    use super::*;

    #[test]
    fn returns_schemes_in_provider_order() {
        let capability = HostProtocolRegistrationCapability {
            provider: provider_ref(),
            get_registered_schemes: Arc::new(|| {
                vec!["flight-b".to_string(), "flight-a".to_string()]
            }),
            register: Arc::new(|_scheme: &str| true),
        };
        assert_eq!(
            get_registered_protocol_schemes(&capability),
            vec!["flight-b".to_string(), "flight-a".to_string()]
        );
    }
}

mod initialize_protocol_handler {
    use super::*;

    #[test]
    fn initializes_a_fresh_inert_signal() {
        let mut handler: ProtocolHandler = flight_entity::allocate_entity();
        initialize_protocol_handler(&mut handler);
        assert!(!has_signal_slots(&handler.on_open_url));
    }
}

mod is_protocol_scheme_default {
    use super::*;

    #[test]
    fn validates_before_calling_the_provider() {
        let calls = Arc::new(Mutex::new(Vec::<String>::new()));
        let sink = calls.clone();
        let capability = HostProtocolDefaultCapability {
            provider: provider_ref(),
            is_default: Arc::new(move |scheme: &str| {
                sink.lock().unwrap().push(scheme.to_string());
                true
            }),
            remove_as_default: Arc::new(|_scheme: &str| true),
            set_as_default: Arc::new(|_scheme: &str| true),
        };
        assert!(is_protocol_scheme_default(&capability, "flight"));
        assert!(!is_protocol_scheme_default(&capability, "https"));
        assert_eq!(*calls.lock().unwrap(), vec!["flight".to_string()]);
    }
}

mod is_protocol_scheme_registered {
    use super::*;

    #[test]
    fn validates_before_calling_the_provider() {
        let calls = Arc::new(Mutex::new(0));
        let sink = calls.clone();
        let capability = HostProtocolRegistrationQueryCapability {
            provider: provider_ref(),
            is_registered: Arc::new(move |_scheme: &str| {
                *sink.lock().unwrap() += 1;
                true
            }),
        };
        assert!(is_protocol_scheme_registered(&capability, "flight"));
        assert!(!is_protocol_scheme_registered(&capability, "1flight"));
        assert_eq!(*calls.lock().unwrap(), 1);
    }
}

mod is_valid_protocol_scheme {
    use super::*;

    #[test]
    fn accepts_the_source_grammar_after_unicode_lowercasing() {
        assert!(is_valid_protocol_scheme("flight+desktop"));
        assert!(is_valid_protocol_scheme("FLIGHT.Desktop-2"));
        assert!(is_valid_protocol_scheme("Kustom"));
    }

    #[test]
    fn rejects_reserved_empty_and_malformed_schemes() {
        for scheme in [
            "", "file", "FTP", "ftps", "http", "HTTPS", "mailto", "1flight", "flight_", "fl ight",
            "éclair",
        ] {
            assert!(!is_valid_protocol_scheme(scheme), "accepted {scheme:?}");
        }
    }
}

mod parse_protocol_url {
    use super::*;

    #[test]
    fn decodes_source_query_rules_and_preserves_duplicate_key_order() {
        let parsed = parse_protocol_url(
            "FLIGHT://open/file?name=first&empty&name=a+b&bad=a+%ZZ&snow=%E9%9B%AA",
        )
        .unwrap();
        assert_eq!(parsed.scheme, "flight");
        assert_eq!(parsed.host, "open");
        assert_eq!(parsed.path, "/file");
        assert_eq!(
            get_record_value(&parsed.query, "name"),
            Some(&"a b".to_string())
        );
        assert_eq!(
            get_record_value(&parsed.query, "empty"),
            Some(&String::new())
        );
        assert_eq!(
            get_record_value(&parsed.query, "bad"),
            Some(&"a+%ZZ".to_string())
        );
        assert_eq!(
            get_record_value(&parsed.query, "snow"),
            Some(&"雪".to_string())
        );
        assert_eq!(
            entries(&parsed.query)
                .into_iter()
                .map(|(key, _)| key.to_string())
                .collect::<Vec<String>>(),
            vec![
                "name".to_string(),
                "empty".to_string(),
                "bad".to_string(),
                "snow".to_string()
            ]
        );
    }

    #[test]
    fn keeps_reserved_schemes_parseable_and_treats_fragments_as_plain_text() {
        let parsed = parse_protocol_url("HTTPS://example.test/path#frag?x=1#tail").unwrap();
        assert_eq!(parsed.scheme, "https");
        assert_eq!(parsed.host, "example.test");
        assert_eq!(parsed.path, "/path#frag");
        assert_eq!(
            get_record_value(&parsed.query, "x"),
            Some(&"1#tail".to_string())
        );
    }

    #[test]
    fn preserves_manual_authority_and_path_separation() {
        let authority_query = parse_protocol_url("flight://host?x=1").unwrap();
        assert_eq!(authority_query.host, "host");
        assert_eq!(authority_query.path, "");
        let empty_authority = parse_protocol_url("flight:///open").unwrap();
        assert_eq!(empty_authority.host, "");
        assert_eq!(empty_authority.path, "/open");
        let no_authority = parse_protocol_url("flight:open/file").unwrap();
        assert_eq!(no_authority.host, "");
        assert_eq!(no_authority.path, "open/file");
    }

    #[test]
    fn rejects_only_the_source_malformed_url_sentinels() {
        assert!(parse_protocol_url("").is_none());
        assert!(parse_protocol_url("flight").is_none());
        assert!(parse_protocol_url(":open").is_none());
        assert!(parse_protocol_url("1flight:open").is_none());
        assert!(parse_protocol_url("flight_:open").is_none());
    }

    #[test]
    fn uses_canonical_javascript_property_enumeration_and_ignores_empty_keys() {
        let parsed =
            parse_protocol_url("flight:?10=ten&=ignored&2=old&name=v&2=two&&%32=last").unwrap();
        assert_eq!(
            entries(&parsed.query)
                .into_iter()
                .map(|(key, value)| (key.to_string(), value.clone()))
                .collect::<Vec<(String, String)>>(),
            vec![
                ("2".to_string(), "last".to_string()),
                ("10".to_string(), "ten".to_string()),
                ("name".to_string(), "v".to_string())
            ]
        );
        assert_eq!(get_record_value(&parsed.query, ""), None);
    }
}

mod register_protocol_scheme {
    use super::*;

    #[test]
    fn delegates_only_valid_schemes() {
        let calls = Arc::new(Mutex::new(Vec::<String>::new()));
        let sink = calls.clone();
        let capability = HostProtocolRegistrationCapability {
            provider: provider_ref(),
            get_registered_schemes: Arc::new(Vec::new),
            register: Arc::new(move |scheme: &str| {
                sink.lock().unwrap().push(scheme.to_string());
                scheme != "fail"
            }),
        };
        assert!(register_protocol_scheme(&capability, "flight"));
        assert!(!register_protocol_scheme(&capability, "https"));
        assert!(!register_protocol_scheme(&capability, "fail"));
        assert_eq!(
            *calls.lock().unwrap(),
            vec!["flight".to_string(), "fail".to_string()]
        );
    }
}

mod register_protocol_schemes {
    use super::*;

    #[test]
    fn prevalidates_the_whole_batch_before_any_provider_call() {
        let calls = Arc::new(Mutex::new(Vec::<String>::new()));
        let sink = calls.clone();
        let capability = HostProtocolRegistrationCapability {
            provider: provider_ref(),
            get_registered_schemes: Arc::new(Vec::new),
            register: Arc::new(move |scheme: &str| {
                sink.lock().unwrap().push(scheme.to_string());
                true
            }),
        };
        assert!(!register_protocol_schemes(
            &capability,
            &["flight".to_string(), "https".to_string()]
        ));
        assert!(calls.lock().unwrap().is_empty());
    }

    #[test]
    fn invokes_every_valid_scheme_in_order_even_after_failure() {
        let calls = Arc::new(Mutex::new(Vec::<String>::new()));
        let sink = calls.clone();
        let capability = HostProtocolRegistrationCapability {
            provider: provider_ref(),
            get_registered_schemes: Arc::new(Vec::new),
            register: Arc::new(move |scheme: &str| {
                sink.lock().unwrap().push(scheme.to_string());
                scheme != "fail"
            }),
        };
        assert!(!register_protocol_schemes(
            &capability,
            &["flight".to_string(), "fail".to_string(), "last".to_string()]
        ));
        assert_eq!(
            *calls.lock().unwrap(),
            vec!["flight".to_string(), "fail".to_string(), "last".to_string()]
        );
        assert!(register_protocol_schemes(&capability, &[]));
    }
}

mod remove_protocol_scheme_as_default {
    use super::*;

    #[test]
    fn validates_then_delegates_without_changing_the_provider_result() {
        let calls = Arc::new(Mutex::new(0));
        let sink = calls.clone();
        let capability = HostProtocolDefaultCapability {
            provider: provider_ref(),
            is_default: Arc::new(|_scheme: &str| false),
            remove_as_default: Arc::new(move |_scheme: &str| {
                *sink.lock().unwrap() += 1;
                false
            }),
            set_as_default: Arc::new(|_scheme: &str| true),
        };
        assert!(!remove_protocol_scheme_as_default(&capability, "flight"));
        assert!(!remove_protocol_scheme_as_default(&capability, "file"));
        assert_eq!(*calls.lock().unwrap(), 1);
    }
}

mod set_protocol_scheme_as_default {
    use super::*;

    #[test]
    fn validates_then_delegates_without_changing_the_provider_result() {
        let calls = Arc::new(Mutex::new(0));
        let sink = calls.clone();
        let capability = HostProtocolDefaultCapability {
            provider: provider_ref(),
            is_default: Arc::new(|_scheme: &str| false),
            remove_as_default: Arc::new(|_scheme: &str| true),
            set_as_default: Arc::new(move |_scheme: &str| {
                *sink.lock().unwrap() += 1;
                true
            }),
        };
        assert!(set_protocol_scheme_as_default(&capability, "flight"));
        assert!(!set_protocol_scheme_as_default(&capability, "mailto"));
        assert_eq!(*calls.lock().unwrap(), 1);
    }
}

mod unregister_protocol_scheme {
    use super::*;

    #[test]
    fn delegates_only_valid_schemes() {
        let calls = Arc::new(Mutex::new(Vec::<String>::new()));
        let sink = calls.clone();
        let capability = HostProtocolUnregistrationCapability {
            provider: provider_ref(),
            unregister: Arc::new(move |scheme: &str| {
                sink.lock().unwrap().push(scheme.to_string());
                scheme != "fail"
            }),
        };
        assert!(unregister_protocol_scheme(&capability, "flight"));
        assert!(!unregister_protocol_scheme(&capability, "http"));
        assert!(!unregister_protocol_scheme(&capability, "fail"));
        assert_eq!(
            *calls.lock().unwrap(),
            vec!["flight".to_string(), "fail".to_string()]
        );
    }
}

mod unregister_protocol_schemes {
    use super::*;

    #[test]
    fn prevalidates_then_invokes_all_valid_schemes_in_order() {
        let calls = Arc::new(Mutex::new(Vec::<String>::new()));
        let sink = calls.clone();
        let capability = HostProtocolUnregistrationCapability {
            provider: provider_ref(),
            unregister: Arc::new(move |scheme: &str| {
                sink.lock().unwrap().push(scheme.to_string());
                scheme != "fail"
            }),
        };
        assert!(!unregister_protocol_schemes(
            &capability,
            &["flight".to_string(), "https".to_string()]
        ));
        assert!(calls.lock().unwrap().is_empty());
        assert!(!unregister_protocol_schemes(
            &capability,
            &["flight".to_string(), "fail".to_string(), "last".to_string()]
        ));
        assert_eq!(
            *calls.lock().unwrap(),
            vec!["flight".to_string(), "fail".to_string(), "last".to_string()]
        );
    }
}
