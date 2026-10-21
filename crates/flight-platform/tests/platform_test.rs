use std::sync::{Arc, Mutex};

use flight_hostcapability::ProviderRef;
use flight_platform::contract::*;

/// A provider (TS `fakeBackend`) that resets `out` to the zeroed snapshot, then applies `edit`.
fn fake_backend(
    edit: impl Fn(&mut PlatformInfo) + Send + Sync + 'static,
) -> HostPlatformCapability {
    let provider: ProviderRef = Arc::new(());
    return HostPlatformCapability {
        provider,
        get_info: Arc::new(move |out: &mut PlatformInfo| {
            *out = create_platform_info();
            edit(out);
        }),
    };
}

fn with_kind(kind: PlatformKind) -> HostPlatformCapability {
    return fake_backend(move |out| out.kind = kind);
}

fn with_runtime(runtime: PlatformRuntime) -> HostPlatformCapability {
    return fake_backend(move |out| out.runtime = runtime);
}

fn with_version(version: &'static str) -> HostPlatformCapability {
    return fake_backend(move |out| out.version = version.to_string());
}

mod compare_platform_versions {
    use super::*;

    #[test]
    fn returns_0_for_identical_strings() {
        assert_eq!(compare_platform_versions("10.15.7", "10.15.7"), 0);
    }

    #[test]
    fn returns_0_for_two_empty_strings() {
        assert_eq!(compare_platform_versions("", ""), 0);
    }

    #[test]
    fn empty_string_sorts_lower_than_any_version() {
        assert_eq!(compare_platform_versions("", "1.0"), -1);
        assert_eq!(compare_platform_versions("1.0", ""), 1);
    }

    #[test]
    fn returns_minus_1_when_a_is_lower() {
        assert_eq!(compare_platform_versions("10.15.6", "10.15.7"), -1);
        assert_eq!(compare_platform_versions("9", "10"), -1);
        assert_eq!(compare_platform_versions("10.0", "10.0.1"), -1);
    }

    #[test]
    fn returns_1_when_a_is_higher() {
        assert_eq!(compare_platform_versions("10.15.7", "10.15.6"), 1);
        assert_eq!(compare_platform_versions("11", "10"), 1);
        assert_eq!(compare_platform_versions("14", "13.0.1"), 1);
    }

    #[test]
    fn compares_numeric_segments_not_lexicographic() {
        assert_eq!(compare_platform_versions("10", "9"), 1);
        assert_eq!(compare_platform_versions("2.10", "2.9"), 1);
    }

    #[test]
    fn treats_missing_trailing_segments_as_0() {
        assert_eq!(compare_platform_versions("10.0", "10.0.0"), 0);
        assert_eq!(compare_platform_versions("10", "10.0.0"), 0);
    }

    #[test]
    fn reads_segments_as_js_parse_int_does() {
        // Trailing junk after the leading digits is ignored: parseInt('7beta') === 7.
        assert_eq!(compare_platform_versions("10.7beta", "10.7"), 0);
        // A segment with no leading digits is NaN, counted as 0.
        assert_eq!(compare_platform_versions("10.x", "10.0"), 0);
        assert_eq!(compare_platform_versions("10.x", "10.1"), -1);
        // An empty segment between dots is NaN, counted as 0.
        assert_eq!(compare_platform_versions("10..5", "10.0.5"), 0);
        // Leading whitespace is skipped and a sign is honored.
        assert_eq!(compare_platform_versions(" 7", "7"), 0);
        assert_eq!(compare_platform_versions("+3", "3"), 0);
        assert_eq!(compare_platform_versions("-1", "0"), -1);
        // Digits beyond 2^53 round to the same double, exactly as JS compares them.
        assert_eq!(
            compare_platform_versions("9007199254740993", "9007199254740992"),
            0
        );
    }
}

mod create_platform_info {
    use super::*;

    #[test]
    fn allocates_a_zeroed_platform_info_with_all_new_fields() {
        let info = create_platform_info();
        assert_eq!(info.arch, "");
        assert_eq!(info.distro, "");
        assert_eq!(info.distro_version, "");
        assert_eq!(info.endianness, PlatformEndianness::Unknown);
        assert_eq!(info.engine, PlatformEngine::Unknown);
        assert_eq!(info.engine_version, "");
        assert!(!info.is_touch);
        assert_eq!(info.kind, PlatformKind::Unknown);
        assert_eq!(info.locale, "");
        assert_eq!(info.name, PlatformName::Unknown);
        assert_eq!(info.os_build, "");
        assert_eq!(info.pointer_width, -1);
        assert_eq!(info.runtime, PlatformRuntime::Unknown);
        assert_eq!(info.version, "");
        let _: &dyn flight_entity::Entity = &info;
    }
}

mod get_platform_endianness_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        assert_eq!(
            get_platform_endianness_string(PlatformEndianness::Big),
            "big"
        );
        assert_eq!(
            get_platform_endianness_string(PlatformEndianness::Little),
            "little"
        );
        assert_eq!(
            get_platform_endianness_string(PlatformEndianness::Unknown),
            "unknown"
        );
    }
}

mod get_platform_engine {
    use super::*;

    #[test]
    fn returns_the_engine_from_the_host_backend() {
        for engine in [
            PlatformEngine::Blink,
            PlatformEngine::Gecko,
            PlatformEngine::Webkit,
            PlatformEngine::Unknown,
        ] {
            assert_eq!(
                get_platform_engine(&fake_backend(move |out| out.engine = engine)),
                engine
            );
        }
    }
}

mod get_platform_engine_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        assert_eq!(get_platform_engine_string(PlatformEngine::Gecko), "gecko");
        assert_eq!(get_platform_engine_string(PlatformEngine::Blink), "blink");
        assert_eq!(get_platform_engine_string(PlatformEngine::Webkit), "webkit");
        assert_eq!(
            get_platform_engine_string(PlatformEngine::Unknown),
            "unknown"
        );
    }
}

mod get_platform_info {
    use super::*;

    #[test]
    fn fills_the_out_parameter() {
        let host = fake_backend(|out| {
            out.arch = "arm64".to_string();
            out.kind = PlatformKind::Mobile;
            out.name = PlatformName::Ios;
        });
        let mut out = create_platform_info();
        get_platform_info(&mut out, &host);
        assert_eq!(out.name, PlatformName::Ios);
        assert_eq!(out.arch, "arm64");
    }

    #[test]
    fn reads_fresh_from_the_same_provider_on_every_query() {
        let calls = Arc::new(Mutex::new(0));
        let counter = calls.clone();
        let host = fake_backend(move |out| {
            *counter.lock().unwrap() += 1;
            out.kind = PlatformKind::Desktop;
        });
        assert!(is_platform_desktop(&host));
        assert_eq!(get_platform_kind(&host), PlatformKind::Desktop);
        assert_eq!(*calls.lock().unwrap(), 2);
    }
}

mod get_platform_kind {
    use super::*;

    #[test]
    fn returns_the_host_backend_kind() {
        assert_eq!(
            get_platform_kind(&with_kind(PlatformKind::Desktop)),
            PlatformKind::Desktop
        );
    }
}

mod get_platform_kind_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        assert_eq!(get_platform_kind_string(PlatformKind::Desktop), "desktop");
        assert_eq!(get_platform_kind_string(PlatformKind::Mobile), "mobile");
        assert_eq!(get_platform_kind_string(PlatformKind::Web), "web");
        assert_eq!(get_platform_kind_string(PlatformKind::Unknown), "unknown");
    }
}

mod get_platform_name {
    use super::*;

    #[test]
    fn returns_the_host_backend_name() {
        assert_eq!(
            get_platform_name(&fake_backend(|out| out.name = PlatformName::MacOs)),
            PlatformName::MacOs
        );
    }
}

mod get_platform_name_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        assert_eq!(get_platform_name_string(PlatformName::Web), "web");
        assert_eq!(get_platform_name_string(PlatformName::Windows), "windows");
        assert_eq!(get_platform_name_string(PlatformName::MacOs), "macos");
        assert_eq!(get_platform_name_string(PlatformName::Linux), "linux");
        assert_eq!(get_platform_name_string(PlatformName::Ios), "ios");
        assert_eq!(get_platform_name_string(PlatformName::Android), "android");
        assert_eq!(get_platform_name_string(PlatformName::Unknown), "unknown");
    }
}

mod get_platform_runtime {
    use super::*;

    #[test]
    fn returns_each_runtime_the_backend_sets() {
        for runtime in [
            PlatformRuntime::Web,
            PlatformRuntime::Electron,
            PlatformRuntime::Tauri,
            PlatformRuntime::Capacitor,
            PlatformRuntime::Native,
        ] {
            assert_eq!(get_platform_runtime(&with_runtime(runtime)), runtime);
        }
    }
}

mod get_platform_runtime_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        assert_eq!(get_platform_runtime_string(PlatformRuntime::Web), "web");
        assert_eq!(
            get_platform_runtime_string(PlatformRuntime::Electron),
            "electron"
        );
        assert_eq!(get_platform_runtime_string(PlatformRuntime::Tauri), "tauri");
        assert_eq!(
            get_platform_runtime_string(PlatformRuntime::Capacitor),
            "capacitor"
        );
        assert_eq!(
            get_platform_runtime_string(PlatformRuntime::Native),
            "native"
        );
        assert_eq!(
            get_platform_runtime_string(PlatformRuntime::Unknown),
            "unknown"
        );
    }
}

mod initialize_platform_info {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_platform_info() {
        let mut out: PlatformInfo = flight_entity::allocate_entity();
        out.version = "9".to_string();
        out.pointer_width = 64;
        initialize_platform_info(&mut out);
        assert_eq!(out, create_platform_info());
    }
}

mod is_platform_desktop {
    use super::*;

    #[test]
    fn is_true_only_for_desktop_kind() {
        assert!(is_platform_desktop(&with_kind(PlatformKind::Desktop)));
        assert!(!is_platform_desktop(&with_kind(PlatformKind::Web)));
    }
}

mod is_platform_mobile {
    use super::*;

    #[test]
    fn is_true_only_for_mobile_kind() {
        assert!(is_platform_mobile(&with_kind(PlatformKind::Mobile)));
        assert!(!is_platform_mobile(&with_kind(PlatformKind::Desktop)));
    }
}

mod is_platform_native {
    use super::*;

    #[test]
    fn is_true_for_every_host_shell_runtime() {
        for runtime in [
            PlatformRuntime::Electron,
            PlatformRuntime::Tauri,
            PlatformRuntime::Capacitor,
            PlatformRuntime::Native,
        ] {
            assert!(is_platform_native(&with_runtime(runtime)));
        }
    }

    #[test]
    fn is_false_for_web_runtime() {
        assert!(!is_platform_native(&with_runtime(PlatformRuntime::Web)));
    }

    #[test]
    fn is_false_for_unknown_runtime() {
        assert!(!is_platform_native(&with_runtime(PlatformRuntime::Unknown)));
    }
}

mod is_platform_touch {
    use super::*;

    #[test]
    fn reflects_the_backend_is_touch_flag() {
        assert!(is_platform_touch(&fake_backend(|out| out.is_touch = true)));
        assert!(!is_platform_touch(&fake_backend(|_| {})));
    }
}

mod is_platform_version_at_least {
    use super::*;

    #[test]
    fn is_true_when_version_equals_minimum() {
        assert!(is_platform_version_at_least(&with_version("14.0"), "14.0"));
    }

    #[test]
    fn is_true_when_version_exceeds_minimum() {
        assert!(is_platform_version_at_least(&with_version("15.0"), "14.0"));
    }

    #[test]
    fn is_false_when_version_is_below_minimum() {
        assert!(!is_platform_version_at_least(&with_version("13.0"), "14.0"));
    }

    #[test]
    fn is_false_when_version_is_empty_unknown() {
        assert!(!is_platform_version_at_least(&with_version(""), "1.0"));
        assert!(!is_platform_version_at_least(&with_version(""), ""));
    }

    #[test]
    fn handles_patch_level_comparison() {
        assert!(is_platform_version_at_least(
            &with_version("10.15.7"),
            "10.15.6"
        ));
        assert!(is_platform_version_at_least(
            &with_version("10.15.7"),
            "10.15.7"
        ));
        assert!(!is_platform_version_at_least(
            &with_version("10.15.7"),
            "10.15.8"
        ));
    }
}

mod is_platform_web {
    use super::*;

    #[test]
    fn is_true_only_for_web_kind() {
        assert!(is_platform_web(&with_kind(PlatformKind::Web)));
        assert!(!is_platform_web(&with_kind(PlatformKind::Mobile)));
    }
}

mod parse_platform_endianness {
    use super::*;

    #[test]
    fn parses_the_exact_ts_strings() {
        assert_eq!(
            parse_platform_endianness("big"),
            Some(PlatformEndianness::Big)
        );
        assert_eq!(
            parse_platform_endianness("little"),
            Some(PlatformEndianness::Little)
        );
        assert_eq!(
            parse_platform_endianness("unknown"),
            Some(PlatformEndianness::Unknown)
        );
    }

    #[test]
    fn rejects_other_text_and_wrong_casing() {
        assert_eq!(parse_platform_endianness("BIG"), None);
        assert_eq!(parse_platform_endianness(""), None);
    }
}

mod parse_platform_engine {
    use super::*;

    #[test]
    fn parses_the_exact_ts_strings() {
        assert_eq!(parse_platform_engine("gecko"), Some(PlatformEngine::Gecko));
        assert_eq!(parse_platform_engine("blink"), Some(PlatformEngine::Blink));
        assert_eq!(
            parse_platform_engine("webkit"),
            Some(PlatformEngine::Webkit)
        );
        assert_eq!(
            parse_platform_engine("unknown"),
            Some(PlatformEngine::Unknown)
        );
    }

    #[test]
    fn rejects_other_text_and_wrong_casing() {
        assert_eq!(parse_platform_engine("GECKO"), None);
        assert_eq!(parse_platform_engine(""), None);
    }
}

mod parse_platform_kind {
    use super::*;

    #[test]
    fn parses_the_exact_ts_strings() {
        assert_eq!(parse_platform_kind("desktop"), Some(PlatformKind::Desktop));
        assert_eq!(parse_platform_kind("mobile"), Some(PlatformKind::Mobile));
        assert_eq!(parse_platform_kind("web"), Some(PlatformKind::Web));
        assert_eq!(parse_platform_kind("unknown"), Some(PlatformKind::Unknown));
    }

    #[test]
    fn rejects_other_text_and_wrong_casing() {
        assert_eq!(parse_platform_kind("DESKTOP"), None);
        assert_eq!(parse_platform_kind(""), None);
    }
}

mod parse_platform_name {
    use super::*;

    #[test]
    fn parses_the_exact_ts_strings() {
        assert_eq!(parse_platform_name("web"), Some(PlatformName::Web));
        assert_eq!(parse_platform_name("windows"), Some(PlatformName::Windows));
        assert_eq!(parse_platform_name("macos"), Some(PlatformName::MacOs));
        assert_eq!(parse_platform_name("linux"), Some(PlatformName::Linux));
        assert_eq!(parse_platform_name("ios"), Some(PlatformName::Ios));
        assert_eq!(parse_platform_name("android"), Some(PlatformName::Android));
        assert_eq!(parse_platform_name("unknown"), Some(PlatformName::Unknown));
    }

    #[test]
    fn rejects_other_text_and_wrong_casing() {
        assert_eq!(parse_platform_name("WEB"), None);
        assert_eq!(parse_platform_name(""), None);
    }
}

mod parse_platform_runtime {
    use super::*;

    #[test]
    fn parses_the_exact_ts_strings() {
        assert_eq!(parse_platform_runtime("web"), Some(PlatformRuntime::Web));
        assert_eq!(
            parse_platform_runtime("electron"),
            Some(PlatformRuntime::Electron)
        );
        assert_eq!(
            parse_platform_runtime("tauri"),
            Some(PlatformRuntime::Tauri)
        );
        assert_eq!(
            parse_platform_runtime("capacitor"),
            Some(PlatformRuntime::Capacitor)
        );
        assert_eq!(
            parse_platform_runtime("native"),
            Some(PlatformRuntime::Native)
        );
        assert_eq!(
            parse_platform_runtime("unknown"),
            Some(PlatformRuntime::Unknown)
        );
    }

    #[test]
    fn rejects_other_text_and_wrong_casing() {
        assert_eq!(parse_platform_runtime("WEB"), None);
        assert_eq!(parse_platform_runtime(""), None);
    }
}

mod r3_boundary {
    /// TS asserts the module exports no ambient-state API. Rust cannot enumerate exports at runtime,
    /// so the public lanes are checked by source text.
    #[test]
    fn exports_no_ambient_state_api() {
        let sources = [
            include_str!("../src/lib.rs"),
            include_str!("../src/contract.rs"),
            include_str!("../src/platform.rs"),
            include_str!("../src/types.rs"),
        ];
        for symbol in [
            "create_web_platform_backend",
            "explain_platform_backend",
            "get_platform_backend",
            "install_platform_host_backend",
            "observe_platform_host_result",
            "reset_platform_backend_for_test",
            "set_platform_backend",
        ] {
            for source in sources {
                assert!(!source.contains(symbol), "{symbol} must not be exported");
            }
        }
    }
}
