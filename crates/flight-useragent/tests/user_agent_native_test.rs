//! flight-compiler: target-native
//! Native byte-order and window-global boundary cases for `userAgentNative.test.ts`.

use std::sync::Arc;

use flight_entity::{Record, Unknown, set_record_value};
use flight_platform::{PlatformEndianness, PlatformRuntime};
use flight_useragent::contract::*;

fn record(entries: Vec<(&str, Unknown)>) -> Record<Unknown> {
    let mut out = Record::default();
    for (key, value) in entries {
        set_record_value(&mut out, key.to_string(), value);
    }
    return out;
}

fn object(entries: Vec<(&str, Unknown)>) -> Unknown {
    return Some(Arc::new(record(entries)));
}

fn text(value: &str) -> Unknown {
    return Some(Arc::new(value.to_string()));
}

mod detect_endianness {
    use super::*;

    #[test]
    fn returns_a_known_canonical_value() {
        let value = detect_endianness();
        assert!(
            value == PlatformEndianness::Little
                || value == PlatformEndianness::Big
                || value == PlatformEndianness::Unknown
        );
    }

    #[test]
    fn matches_the_target_byte_order() {
        let expected = if cfg!(target_endian = "little") {
            PlatformEndianness::Little
        } else {
            PlatformEndianness::Big
        };
        assert_eq!(detect_endianness(), expected);
    }
}

mod parse_user_agent_runtime {
    use super::*;

    #[test]
    fn returns_unknown_when_window_is_absent() {
        assert_eq!(parse_user_agent_runtime(None), PlatformRuntime::Unknown);
    }

    #[test]
    fn returns_web_when_no_host_shell_globals_are_present() {
        assert_eq!(
            parse_user_agent_runtime(Some(&record(vec![]))),
            PlatformRuntime::Web
        );
    }

    #[test]
    fn detects_each_host_shell() {
        let electron = record(vec![(
            "process",
            object(vec![(
                "versions",
                object(vec![("electron", text("28.0.0"))]),
            )]),
        )]);
        assert_eq!(
            parse_user_agent_runtime(Some(&electron)),
            PlatformRuntime::Electron
        );
        assert_eq!(
            parse_user_agent_runtime(Some(&record(vec![("__TAURI__", object(vec![]))]))),
            PlatformRuntime::Tauri
        );
        assert_eq!(
            parse_user_agent_runtime(Some(&record(vec![("Capacitor", object(vec![]))]))),
            PlatformRuntime::Capacitor
        );
    }

    #[test]
    fn prioritizes_electron_over_tauri_when_both_globals_are_present() {
        let both = record(vec![
            ("__TAURI__", object(vec![])),
            (
                "process",
                object(vec![(
                    "versions",
                    object(vec![("electron", text("28.0.0"))]),
                )]),
            ),
        ]);
        assert_eq!(
            parse_user_agent_runtime(Some(&both)),
            PlatformRuntime::Electron
        );
    }

    #[test]
    fn follows_js_truthiness_for_probed_values() {
        // null, "", false and 0 are falsy; a non-object `versions` has no `electron` property.
        assert_eq!(
            parse_user_agent_runtime(Some(&record(vec![("__TAURI__", None)]))),
            PlatformRuntime::Web
        );
        assert_eq!(
            parse_user_agent_runtime(Some(&record(vec![("Capacitor", text(""))]))),
            PlatformRuntime::Web
        );
        assert_eq!(
            parse_user_agent_runtime(Some(&record(vec![("Capacitor", Some(Arc::new(false)))]))),
            PlatformRuntime::Web
        );
        assert_eq!(
            parse_user_agent_runtime(Some(&record(vec![("Capacitor", Some(Arc::new(0.0_f64)))]))),
            PlatformRuntime::Web
        );
        assert_eq!(
            parse_user_agent_runtime(Some(&record(vec![("Capacitor", Some(Arc::new(1_i32)))]))),
            PlatformRuntime::Capacitor
        );
        let string_versions = record(vec![("process", object(vec![("versions", text("x"))]))]);
        assert_eq!(
            parse_user_agent_runtime(Some(&string_versions)),
            PlatformRuntime::Web
        );
        let empty_electron = record(vec![(
            "process",
            object(vec![("versions", object(vec![("electron", text(""))]))]),
        )]);
        assert_eq!(
            parse_user_agent_runtime(Some(&empty_electron)),
            PlatformRuntime::Web
        );
    }
}
