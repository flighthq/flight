use flight_useragent::contract::*;

fn ios_prefix() -> &'static str {
    return "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) ";
}

fn legacy_edge() -> &'static str {
    return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.140 Safari/537.36 Edge/18.17763";
}

mod detect_endianness {
    use super::*;

    #[test]
    fn returns_a_stable_value() {
        assert_eq!(detect_endianness(), detect_endianness());
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
        let gecko = parse_user_agent_engine(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0",
        );
        let blink = parse_user_agent_engine(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        );
        assert_eq!(
            parse_user_agent_engine(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.2210.133"
            ),
            blink
        );
        let webkit = parse_user_agent_engine(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15",
        );
        assert_ne!(gecko, blink);
        assert_ne!(gecko, webkit);
        assert_ne!(blink, webkit);
    }

    #[test]
    fn returns_unknown_for_unrecognized_ua() {
        let unknown = parse_user_agent_engine("");
        assert_eq!(parse_user_agent_engine("CustomBot/1.0"), unknown);
        assert_ne!(parse_user_agent_engine("Chrome/120.0"), unknown);
    }

    #[test]
    fn legacy_edgehtml_is_not_reported_as_blink() {
        let unknown = parse_user_agent_engine("");
        assert_eq!(parse_user_agent_engine(legacy_edge()), unknown);
        assert_eq!(
            parse_user_agent_engine(
                "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Edge/18.17763"
            ),
            unknown
        );
        let modern = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0";
        let blink = parse_user_agent_engine("Chrome/120.0");
        assert_eq!(parse_user_agent_engine(modern), blink);
        let ios_edge = parse_user_agent_engine(
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) EdgiOS/120.0",
        );
        assert_ne!(ios_edge, blink);
        assert_ne!(ios_edge, unknown);
    }

    #[test]
    fn keeps_opera_on_ios_product_tokens_on_webkit() {
        let webkit = parse_user_agent_engine(
            "Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
        );
        for ua in [
            format!(
                "{}OPiOS/9.2.0.11256 Mobile/15E148 Safari/9537.53",
                ios_prefix()
            ),
            format!(
                "{}Version/17.0 OPT/3.6.1 Mobile/15E148 Safari/604.1",
                ios_prefix()
            ),
        ] {
            let engine = parse_user_agent_engine(&ua);
            assert_eq!(engine, webkit);
            assert_ne!(parse_user_agent_engine_version(&ua, engine), "");
        }
    }

    #[test]
    fn reports_webkit_for_every_browser_on_ios() {
        let webkit = parse_user_agent_engine(
            "Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
        );
        let edge = format!(
            "{}EdgiOS/120.0.0.0 Mobile/15E148 Safari/605.1.15",
            ios_prefix()
        );
        assert_eq!(parse_user_agent_engine(&edge), webkit);
        assert_ne!(parse_user_agent_engine_version(&edge, webkit), "");
        assert_eq!(
            parse_user_agent_engine(&format!(
                "{}CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1",
                ios_prefix()
            )),
            webkit
        );
        assert_eq!(
            parse_user_agent_engine(&format!(
                "{}FxiOS/121.0 Mobile/15E148 Safari/605.1.15",
                ios_prefix()
            )),
            webkit
        );
        let ipad = "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1";
        assert_eq!(parse_user_agent_engine(ipad), webkit);
    }

    #[test]
    fn still_reports_blink_and_gecko_off_ios() {
        let mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
        let win = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0";
        let blink = parse_user_agent_engine("Chrome/120.0");
        let gecko = parse_user_agent_engine("Firefox/120.0");
        assert_eq!(parse_user_agent_engine(mac), blink);
        assert_eq!(parse_user_agent_engine(win), blink);
        assert_eq!(
            parse_user_agent_engine(
                "Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0"
            ),
            gecko
        );
    }
}

mod parse_user_agent_engine_version {
    use super::*;

    #[test]
    fn extracts_each_engine_version() {
        let gecko_ua =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0";
        assert_eq!(
            parse_user_agent_engine_version(gecko_ua, parse_user_agent_engine(gecko_ua)),
            "120.0"
        );
        let chrome_ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.109 Safari/537.36";
        assert_eq!(
            parse_user_agent_engine_version(chrome_ua, parse_user_agent_engine(chrome_ua)),
            "120.0.6099.109"
        );
        let edge_ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.2210.133";
        assert_eq!(
            parse_user_agent_engine_version(edge_ua, parse_user_agent_engine(edge_ua)),
            "120.0.2210.133"
        );
        let safari_ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15";
        assert_eq!(
            parse_user_agent_engine_version(safari_ua, parse_user_agent_engine(safari_ua)),
            "16.0"
        );
    }

    #[test]
    fn returns_empty_for_unknown_engine_or_absent_version() {
        let unknown = parse_user_agent_engine("");
        assert_eq!(
            parse_user_agent_engine_version("any UA string", unknown),
            ""
        );
        let gecko = parse_user_agent_engine("Firefox/120.0");
        assert_eq!(parse_user_agent_engine_version("", gecko), "");
    }

    #[test]
    fn does_not_report_the_embedded_chrome_version_for_legacy_edge() {
        let engine = parse_user_agent_engine(legacy_edge());
        assert_eq!(parse_user_agent_engine_version(legacy_edge(), engine), "");
    }

    #[test]
    fn skips_an_earlier_token_without_digits_as_the_regex_does() {
        let blink = parse_user_agent_engine("Chrome/120.0");
        assert_eq!(
            parse_user_agent_engine_version("Chrome/x Chrome/99.1", blink),
            "99.1"
        );
        let webkit = parse_user_agent_engine("AppleWebKit/605.1");
        assert_eq!(
            parse_user_agent_engine_version("AppleWebKit/605.1", webkit),
            "605.1"
        );
    }
}

mod parse_user_agent_kind {
    use super::*;

    #[test]
    fn returns_mobile_for_ios_and_android_and_web_otherwise() {
        let ios = parse_user_agent_name("Mozilla/5.0 (iPhone)");
        let android = parse_user_agent_name("Mozilla/5.0 (Linux; Android 14)");
        let mobile = parse_user_agent_kind(ios);
        assert_eq!(parse_user_agent_kind(android), mobile);

        for ua in [
            "Mozilla/5.0 (Windows NT 10.0)",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0)",
            "Mozilla/5.0 (X11; Linux x86_64)",
            "CustomBot/1.0",
        ] {
            assert_ne!(parse_user_agent_kind(parse_user_agent_name(ua)), mobile);
        }
    }
}

mod parse_user_agent_name {
    use super::*;

    #[test]
    fn detects_each_name() {
        let android = parse_user_agent_name("Mozilla/5.0 (Linux; Android 14; Pixel 8)");
        let ios = parse_user_agent_name("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X)");
        assert_eq!(
            parse_user_agent_name("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)"),
            ios
        );
        let windows = parse_user_agent_name("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
        let mac = parse_user_agent_name("Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0)");
        let linux = parse_user_agent_name("Mozilla/5.0 (X11; Linux x86_64)");
        let web = parse_user_agent_name("");
        assert_ne!(android, ios);
        assert_ne!(android, linux);
        assert_ne!(ios, mac);
        assert_ne!(windows, mac);
        assert_ne!(windows, linux);
        assert_ne!(mac, linux);
        assert_ne!(web, android);
        assert_ne!(web, ios);
        assert_ne!(web, windows);
        assert_ne!(web, mac);
        assert_ne!(web, linux);
    }

    #[test]
    fn returns_web_when_no_os_is_detected() {
        let web = parse_user_agent_name("");
        assert_eq!(parse_user_agent_name("CustomBot/1.0"), web);
    }
}

mod parse_user_agent_pointer_width {
    use super::*;

    #[test]
    fn maps_arch_tokens_to_widths() {
        assert_eq!(
            parse_user_agent_pointer_width("x64"),
            UserAgentPointerWidth::Bits64
        );
        assert_eq!(
            parse_user_agent_pointer_width("arm64"),
            UserAgentPointerWidth::Bits64
        );
        assert_eq!(
            parse_user_agent_pointer_width("x86"),
            UserAgentPointerWidth::Bits32
        );
        assert_eq!(
            parse_user_agent_pointer_width("arm"),
            UserAgentPointerWidth::Bits32
        );
        assert_eq!(
            parse_user_agent_pointer_width("wasm"),
            UserAgentPointerWidth::Unknown
        );
        assert_eq!(
            parse_user_agent_pointer_width(""),
            UserAgentPointerWidth::Unknown
        );
    }
}

mod parse_user_agent_runtime {
    use super::*;

    #[test]
    fn returns_a_stable_value_when_window_is_absent() {
        assert_eq!(
            parse_user_agent_runtime(None),
            parse_user_agent_runtime(None)
        );
    }
}

mod parse_user_agent_version {
    use super::*;

    #[test]
    fn parses_each_platform_version() {
        let windows = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";
        assert_eq!(
            parse_user_agent_version(windows, parse_user_agent_name(windows)),
            "10.0"
        );
        let mac_underscores = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)";
        assert_eq!(
            parse_user_agent_version(mac_underscores, parse_user_agent_name(mac_underscores)),
            "10.15.7"
        );
        let mac_dots = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15.7)";
        assert_eq!(
            parse_user_agent_version(mac_dots, parse_user_agent_name(mac_dots)),
            "10.15.7"
        );
        let iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X)";
        assert_eq!(
            parse_user_agent_version(iphone, parse_user_agent_name(iphone)),
            "17.4.1"
        );
        let ipad = "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)";
        assert_eq!(
            parse_user_agent_version(ipad, parse_user_agent_name(ipad)),
            "17.0"
        );
        let android = "Mozilla/5.0 (Linux; Android 14; Pixel 8)";
        assert_eq!(
            parse_user_agent_version(android, parse_user_agent_name(android)),
            "14"
        );
    }

    #[test]
    fn returns_empty_for_linux_unknown_and_absent_versions() {
        let linux = "Mozilla/5.0 (X11; Linux x86_64)";
        assert_eq!(
            parse_user_agent_version(linux, parse_user_agent_name(linux)),
            ""
        );
        let windows = parse_user_agent_name("Mozilla/5.0 (Windows NT 10.0)");
        assert_eq!(parse_user_agent_version("", windows), "");
    }

    #[test]
    fn shares_one_extractor_with_parse_user_agent_os_version() {
        let cases = [
            (
                "Mozilla/5.0 (Linux; Android  14; SM-X710) AppleWebKit/537.36",
                "14",
            ),
            ("Mozilla/5.0 (Windows NT  10.0; Win64; x64)", "10.0"),
            (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X  10_15_7)",
                "10.15.7",
            ),
        ];
        for (ua, expected) in cases {
            let name = parse_user_agent_name(ua);
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
        let ios_name = parse_user_agent_name("Mozilla/5.0 (iPhone)");
        let mac_name = parse_user_agent_name("Mozilla/5.0 (Macintosh)");
        let windows_name = parse_user_agent_name(win);
        assert_eq!(parse_user_agent_version(win, ios_name), "");
        assert_eq!(parse_user_agent_version(win, mac_name), "");
        assert_eq!(parse_user_agent_version(win, windows_name), "10.0");
        let ipad = "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15";
        assert_eq!(parse_user_agent_version(ipad, mac_name), "");
        assert_eq!(parse_user_agent_version(ipad, ios_name), "17.4");
        let linux = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36";
        assert_eq!(
            parse_user_agent_version(linux, parse_user_agent_name(linux)),
            ""
        );
        let web_name = parse_user_agent_name("");
        assert_eq!(
            parse_user_agent_version("some-native-host/1.0", web_name),
            ""
        );
    }
}
