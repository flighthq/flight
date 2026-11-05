//! flight-compiler: test-cfg cfg(target_endian = "little") => crate::is_little_endian()
//! Detailed byte-order and window-global boundary cases for `userAgentNative.test.ts`.

use std::sync::Arc;

use flight_platform::{PlatformEndianness, PlatformRuntime};
use flight_useragent::contract::*;

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
            parse_user_agent_runtime(Some(&crate::record(vec![]))),
            PlatformRuntime::Web
        );
    }

    #[test]
    fn detects_each_host_shell() {
        let electron = crate::record(vec![(
            "process",
            crate::object(vec![(
                "versions",
                crate::object(vec![("electron", crate::text("28.0.0"))]),
            )]),
        )]);
        assert_eq!(
            parse_user_agent_runtime(Some(&electron)),
            PlatformRuntime::Electron
        );
        assert_eq!(
            parse_user_agent_runtime(Some(&crate::record(vec![(
                "__TAURI__",
                crate::object(vec![]),
            )]))),
            PlatformRuntime::Tauri
        );
        assert_eq!(
            parse_user_agent_runtime(Some(&crate::record(vec![(
                "Capacitor",
                crate::object(vec![]),
            )]))),
            PlatformRuntime::Capacitor
        );
    }

    #[test]
    fn prioritizes_electron_over_tauri_when_both_globals_are_present() {
        let both = crate::record(vec![
            ("__TAURI__", crate::object(vec![])),
            (
                "process",
                crate::object(vec![(
                    "versions",
                    crate::object(vec![("electron", crate::text("28.0.0"))]),
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
            parse_user_agent_runtime(Some(&crate::record(vec![("__TAURI__", None)]))),
            PlatformRuntime::Web
        );
        assert_eq!(
            parse_user_agent_runtime(Some(&crate::record(vec![(
                "Capacitor",
                crate::text(""),
            )]))),
            PlatformRuntime::Web
        );
        assert_eq!(
            parse_user_agent_runtime(Some(&crate::record(vec![(
                "Capacitor",
                Some(Arc::new(false)),
            )]))),
            PlatformRuntime::Web
        );
        assert_eq!(
            parse_user_agent_runtime(Some(&crate::record(vec![(
                "Capacitor",
                Some(Arc::new(0.0_f64)),
            )]))),
            PlatformRuntime::Web
        );
        assert_eq!(
            parse_user_agent_runtime(Some(&crate::record(vec![(
                "Capacitor",
                Some(Arc::new(1_i32)),
            )]))),
            PlatformRuntime::Capacitor
        );
        let string_versions = crate::record(vec![(
            "process",
            crate::object(vec![("versions", crate::text("x"))]),
        )]);
        assert_eq!(
            parse_user_agent_runtime(Some(&string_versions)),
            PlatformRuntime::Web
        );
        let empty_electron = crate::record(vec![(
            "process",
            crate::object(vec![(
                "versions",
                crate::object(vec![("electron", crate::text(""))]),
            )]),
        )]);
        assert_eq!(
            parse_user_agent_runtime(Some(&empty_electron)),
            PlatformRuntime::Web
        );
    }
}
