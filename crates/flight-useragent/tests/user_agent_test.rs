//! flight-compiler: target-native

use std::sync::Arc;

use flight_entity::{Record, Unknown, set_record_value};
use flight_platform::{
    PlatformEndianness, PlatformEngine, PlatformKind, PlatformName, PlatformRuntime,
};
use flight_useragent::contract::*;

/// A window-like record built from (key, value) pairs (TS object literal).
fn record(entries: Vec<(&str, Unknown)>) -> Record<Unknown> {
    let make: fn() -> Record<Unknown> = Record::default;
    let mut out = make();
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

const LEGACY_EDGE: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.140 Safari/537.36 Edge/18.17763";
const IOS_PREFIX: &str = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) ";

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

    /// flight-compiler: rust-only — JavaScript has no target_endian cfg value.
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

mod parse_user_agent_arch {
    use super::*;

    #[test]
    fn detects_each_arch_token_in_source_order() {
        assert_eq!(
            parse_user_agent_arch("Mozilla/5.0 (Linux; aarch64) AppleWebKit/537.36", None),
            "arm64"
        );
        assert_eq!(
            parse_user_agent_arch("Mozilla/5.0 (iPhone; CPU arm64)", None),
            "arm64"
        );
        assert_eq!(
            parse_user_agent_arch(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                None
            ),
            "x64"
        );
        assert_eq!(
            parse_user_agent_arch(
                "Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36",
                None
            ),
            "x64"
        );
        assert_eq!(
            parse_user_agent_arch("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36", None),
            "x64"
        );
        assert_eq!(
            parse_user_agent_arch("Mozilla/5.0 (X11; Linux i686; rv:109.0)", None),
            "x86"
        );
        assert_eq!(
            parse_user_agent_arch("Mozilla/5.0 (Linux; armv7l)", None),
            "arm"
        );
        assert_eq!(
            parse_user_agent_arch("Mozilla/5.0 (Linux; riscv64)", None),
            "riscv64"
        );
        assert_eq!(
            parse_user_agent_arch("Mozilla/5.0 (Linux; mips64)", None),
            "mips64"
        );
        assert_eq!(
            parse_user_agent_arch("Mozilla/5.0 (Linux; mips)", None),
            "mips"
        );
    }

    #[test]
    fn prefers_the_ua_ch_platform_hint_over_the_ua_string() {
        assert_eq!(parse_user_agent_arch("", Some("arm")), "arm64");
        assert_eq!(parse_user_agent_arch("", Some("Windows")), "x64");
        assert_eq!(parse_user_agent_arch("", Some("macOS")), "x64");
        assert_eq!(parse_user_agent_arch("", Some("Linux")), "x64");
        assert_eq!(parse_user_agent_arch("", Some("Chrome OS")), "x64");
    }

    #[test]
    fn falls_back_to_the_ua_string_when_the_platform_hint_is_inconclusive() {
        assert_eq!(
            parse_user_agent_arch(
                "Mozilla/5.0 (X11; Linux x86_64)",
                Some("SomeCustomPlatform")
            ),
            "x64"
        );
    }

    #[test]
    fn treats_an_empty_hint_as_absent_as_ts_truthiness_does() {
        assert_eq!(
            parse_user_agent_arch("Mozilla/5.0 (Linux; mips)", Some("")),
            "mips"
        );
    }

    #[test]
    fn returns_empty_string_when_arch_is_undetectable() {
        assert_eq!(
            parse_user_agent_arch("Mozilla/5.0 (X11; Linux) AppleWebKit/537.36", None),
            ""
        );
        assert_eq!(parse_user_agent_arch("SomeCustomBrowser/1.0", None), "");
    }
}

mod parse_user_agent_engine {
    use super::*;

    #[test]
    fn returns_each_engine() {
        assert_eq!(
            parse_user_agent_engine(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0"
            ),
            PlatformEngine::Gecko
        );
        assert_eq!(
            parse_user_agent_engine(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            ),
            PlatformEngine::Blink
        );
        assert_eq!(
            parse_user_agent_engine(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.2210.133"
            ),
            PlatformEngine::Blink
        );
        assert_eq!(
            parse_user_agent_engine(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15"
            ),
            PlatformEngine::Webkit
        );
    }

    #[test]
    fn returns_unknown_for_unrecognized_ua() {
        assert_eq!(parse_user_agent_engine(""), PlatformEngine::Unknown);
        assert_eq!(
            parse_user_agent_engine("CustomBot/1.0"),
            PlatformEngine::Unknown
        );
    }

    #[test]
    fn legacy_edgehtml_is_not_reported_as_blink() {
        assert_eq!(
            parse_user_agent_engine(LEGACY_EDGE),
            PlatformEngine::Unknown
        );
        assert_eq!(
            parse_user_agent_engine(
                "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Edge/18.17763"
            ),
            PlatformEngine::Unknown
        );
        let modern = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0";
        assert_eq!(parse_user_agent_engine(modern), PlatformEngine::Blink);
        assert_eq!(
            parse_user_agent_engine(
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) EdgiOS/120.0"
            ),
            PlatformEngine::Webkit
        );
    }

    #[test]
    fn keeps_opera_on_ios_product_tokens_on_webkit() {
        for ua in [
            format!("{IOS_PREFIX}OPiOS/9.2.0.11256 Mobile/15E148 Safari/9537.53"),
            format!("{IOS_PREFIX}Version/17.0 OPT/3.6.1 Mobile/15E148 Safari/604.1"),
        ] {
            let engine = parse_user_agent_engine(&ua);
            assert_eq!(engine, PlatformEngine::Webkit);
            assert_ne!(parse_user_agent_engine_version(&ua, engine), "");
        }
    }

    #[test]
    fn reports_webkit_for_every_browser_on_ios() {
        let edge = format!("{IOS_PREFIX}EdgiOS/120.0.0.0 Mobile/15E148 Safari/605.1.15");
        assert_eq!(parse_user_agent_engine(&edge), PlatformEngine::Webkit);
        assert_ne!(
            parse_user_agent_engine_version(&edge, PlatformEngine::Webkit),
            ""
        );
        assert_eq!(
            parse_user_agent_engine(&format!(
                "{IOS_PREFIX}CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1"
            )),
            PlatformEngine::Webkit
        );
        assert_eq!(
            parse_user_agent_engine(&format!(
                "{IOS_PREFIX}FxiOS/121.0 Mobile/15E148 Safari/605.1.15"
            )),
            PlatformEngine::Webkit
        );
        let ipad = "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1";
        assert_eq!(parse_user_agent_engine(ipad), PlatformEngine::Webkit);
    }

    #[test]
    fn still_reports_blink_and_gecko_off_ios() {
        let mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
        let win = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0";
        assert_eq!(parse_user_agent_engine(mac), PlatformEngine::Blink);
        assert_eq!(parse_user_agent_engine(win), PlatformEngine::Blink);
        assert_eq!(
            parse_user_agent_engine(
                "Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0"
            ),
            PlatformEngine::Gecko
        );
    }
}

mod parse_user_agent_engine_version {
    use super::*;

    #[test]
    fn extracts_each_engine_version() {
        assert_eq!(
            parse_user_agent_engine_version(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0",
                PlatformEngine::Gecko
            ),
            "120.0"
        );
        assert_eq!(
            parse_user_agent_engine_version(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.109 Safari/537.36",
                PlatformEngine::Blink
            ),
            "120.0.6099.109"
        );
        assert_eq!(
            parse_user_agent_engine_version(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.2210.133",
                PlatformEngine::Blink
            ),
            "120.0.2210.133"
        );
        assert_eq!(
            parse_user_agent_engine_version(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15",
                PlatformEngine::Webkit
            ),
            "16.0"
        );
    }

    #[test]
    fn returns_empty_for_unknown_engine_or_absent_version() {
        assert_eq!(
            parse_user_agent_engine_version("any UA string", PlatformEngine::Unknown),
            ""
        );
        assert_eq!(
            parse_user_agent_engine_version("", PlatformEngine::Gecko),
            ""
        );
    }

    #[test]
    fn does_not_report_the_embedded_chrome_version_for_legacy_edge() {
        let engine = parse_user_agent_engine(LEGACY_EDGE);
        assert_eq!(parse_user_agent_engine_version(LEGACY_EDGE, engine), "");
    }

    #[test]
    fn skips_an_earlier_token_without_digits_as_the_regex_does() {
        assert_eq!(
            parse_user_agent_engine_version("Chrome/x Chrome/99.1", PlatformEngine::Blink),
            "99.1"
        );
        assert_eq!(
            parse_user_agent_engine_version("AppleWebKit/605.1", PlatformEngine::Webkit),
            "605.1"
        );
    }
}

mod parse_user_agent_kind {
    use super::*;

    #[test]
    fn returns_mobile_for_ios_and_android_and_web_otherwise() {
        assert_eq!(
            parse_user_agent_kind(PlatformName::Ios),
            PlatformKind::Mobile
        );
        assert_eq!(
            parse_user_agent_kind(PlatformName::Android),
            PlatformKind::Mobile
        );
        for name in [
            PlatformName::Windows,
            PlatformName::MacOs,
            PlatformName::Linux,
            PlatformName::Unknown,
        ] {
            assert_eq!(parse_user_agent_kind(name), PlatformKind::Web);
        }
    }
}

mod parse_user_agent_name {
    use super::*;

    #[test]
    fn detects_each_name() {
        assert_eq!(
            parse_user_agent_name("Mozilla/5.0 (Linux; Android 14; Pixel 8)"),
            PlatformName::Android
        );
        assert_eq!(
            parse_user_agent_name("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X)"),
            PlatformName::Ios
        );
        assert_eq!(
            parse_user_agent_name("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)"),
            PlatformName::Ios
        );
        assert_eq!(
            parse_user_agent_name("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"),
            PlatformName::Windows
        );
        assert_eq!(
            parse_user_agent_name("Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0)"),
            PlatformName::MacOs
        );
        assert_eq!(
            parse_user_agent_name("Mozilla/5.0 (X11; Linux x86_64)"),
            PlatformName::Linux
        );
    }

    #[test]
    fn returns_web_when_no_os_is_detected() {
        assert_eq!(parse_user_agent_name(""), PlatformName::Web);
        assert_eq!(parse_user_agent_name("CustomBot/1.0"), PlatformName::Web);
    }
}

mod parse_user_agent_pointer_width {
    use super::*;

    #[test]
    fn maps_arch_tokens_to_widths() {
        assert_eq!(parse_user_agent_pointer_width("x64"), 64);
        assert_eq!(parse_user_agent_pointer_width("arm64"), 64);
        assert_eq!(parse_user_agent_pointer_width("x86"), 32);
        assert_eq!(parse_user_agent_pointer_width("arm"), 32);
        assert_eq!(parse_user_agent_pointer_width("wasm"), -1);
        assert_eq!(parse_user_agent_pointer_width(""), -1);
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

mod parse_user_agent_version {
    use super::*;

    #[test]
    fn parses_each_platform_version() {
        assert_eq!(
            parse_user_agent_version(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                PlatformName::Windows
            ),
            "10.0"
        );
        assert_eq!(
            parse_user_agent_version(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
                PlatformName::MacOs
            ),
            "10.15.7"
        );
        assert_eq!(
            parse_user_agent_version(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15.7)",
                PlatformName::MacOs
            ),
            "10.15.7"
        );
        assert_eq!(
            parse_user_agent_version(
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X)",
                PlatformName::Ios
            ),
            "17.4.1"
        );
        assert_eq!(
            parse_user_agent_version(
                "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)",
                PlatformName::Ios
            ),
            "17.0"
        );
        assert_eq!(
            parse_user_agent_version(
                "Mozilla/5.0 (Linux; Android 14; Pixel 8)",
                PlatformName::Android
            ),
            "14"
        );
    }

    #[test]
    fn returns_empty_for_linux_unknown_and_absent_versions() {
        assert_eq!(
            parse_user_agent_version("Mozilla/5.0 (X11; Linux x86_64)", PlatformName::Linux),
            ""
        );
        assert_eq!(
            parse_user_agent_version("any UA", PlatformName::Unknown),
            ""
        );
        assert_eq!(parse_user_agent_version("", PlatformName::Windows), "");
    }

    #[test]
    fn shares_one_extractor_with_parse_user_agent_os_version() {
        let cases = [
            (
                "Mozilla/5.0 (Linux; Android  14; SM-X710) AppleWebKit/537.36",
                PlatformName::Android,
                "14",
            ),
            (
                "Mozilla/5.0 (Windows NT  10.0; Win64; x64)",
                PlatformName::Windows,
                "10.0",
            ),
            (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X  10_15_7)",
                PlatformName::MacOs,
                "10.15.7",
            ),
        ];
        for (ua, name, expected) in cases {
            assert_eq!(parse_user_agent_version(ua, name), expected);
            assert_eq!(
                parse_user_agent_version(ua, name),
                parse_user_agent_os_version(ua)
            );
        }
    }

    #[test]
    fn returns_empty_when_the_requested_platform_is_not_the_one_the_ua_describes() {
        let win = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
        assert_eq!(parse_user_agent_version(win, PlatformName::Ios), "");
        assert_eq!(parse_user_agent_version(win, PlatformName::MacOs), "");
        assert_eq!(parse_user_agent_version(win, PlatformName::Windows), "10.0");
        let ipad = "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15";
        assert_eq!(parse_user_agent_version(ipad, PlatformName::MacOs), "");
        assert_eq!(parse_user_agent_version(ipad, PlatformName::Ios), "17.4");
        assert_eq!(
            parse_user_agent_version(
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
                PlatformName::Linux
            ),
            ""
        );
        assert_eq!(
            parse_user_agent_version("some-native-host/1.0", PlatformName::Web),
            ""
        );
    }
}
