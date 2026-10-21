use flight_useragent::contract::*;

mod parse_user_agent_form_factor {
    use super::*;

    #[test]
    fn returns_car_for_android_auto_ua() {
        assert_eq!(
            parse_user_agent_form_factor("Android Auto", -1),
            DEVICE_FORM_FACTOR_CAR
        );
    }

    #[test]
    fn returns_tv_for_smart_tv_uas() {
        assert_eq!(
            parse_user_agent_form_factor("Mozilla/5.0 (SmartTV; Linux)", -1),
            DEVICE_FORM_FACTOR_TV
        );
        assert_eq!(
            parse_user_agent_form_factor("Mozilla/5.0 (SMART-TV; LINUX)", -1),
            DEVICE_FORM_FACTOR_TV
        );
        assert_eq!(
            parse_user_agent_form_factor("Dalvik/2.1.0 (Linux; Android; GoogleTV)", -1),
            DEVICE_FORM_FACTOR_TV
        );
    }

    #[test]
    fn returns_watch_for_watch_os_ua() {
        assert_eq!(
            parse_user_agent_form_factor("Mozilla/5.0 (Watch OS 10.0)", -1),
            DEVICE_FORM_FACTOR_WATCH
        );
        assert_eq!(
            parse_user_agent_form_factor("wearable/1.0", -1),
            DEVICE_FORM_FACTOR_WATCH
        );
    }

    #[test]
    fn returns_tablet_for_ipad_ua() {
        assert_eq!(
            parse_user_agent_form_factor("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)", 5),
            DEVICE_FORM_FACTOR_TABLET
        );
    }

    #[test]
    fn returns_tablet_for_android_tablet_ua_without_mobile_token() {
        let android_tablet = "Mozilla/5.0 (Linux; Android 13; SM-T870) AppleWebKit/537.36";
        assert_eq!(
            parse_user_agent_form_factor(android_tablet, 5),
            DEVICE_FORM_FACTOR_TABLET
        );
    }

    #[test]
    fn returns_phone_for_iphone_ua() {
        let iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)";
        assert_eq!(
            parse_user_agent_form_factor(iphone, 5),
            DEVICE_FORM_FACTOR_PHONE
        );
    }

    #[test]
    fn returns_phone_for_android_mobile_ua() {
        let android = "Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36";
        assert_eq!(
            parse_user_agent_form_factor(android, 5),
            DEVICE_FORM_FACTOR_PHONE
        );
    }

    #[test]
    fn returns_desktop_for_windows_ua() {
        let win = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
        assert_eq!(
            parse_user_agent_form_factor(win, 0),
            DEVICE_FORM_FACTOR_DESKTOP
        );
    }

    #[test]
    fn returns_desktop_for_macos_ua() {
        let mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36";
        assert_eq!(
            parse_user_agent_form_factor(mac, 0),
            DEVICE_FORM_FACTOR_DESKTOP
        );
    }

    #[test]
    fn returns_desktop_when_max_touch_points_is_0_and_ua_is_inconclusive() {
        assert_eq!(
            parse_user_agent_form_factor("SomeBrowser/1.0", 0),
            DEVICE_FORM_FACTOR_DESKTOP
        );
    }

    #[test]
    fn returns_unknown_for_empty_ua_with_touch_points_unavailable() {
        assert_eq!(
            parse_user_agent_form_factor("", -1),
            DEVICE_FORM_FACTOR_UNKNOWN
        );
    }

    const IPAD_DESKTOP_MODE: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
    const REAL_MAC: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    #[test]
    fn desktop_mode_ipad_classifies_a_touch_capable_macintosh_ua_as_a_tablet() {
        assert_eq!(
            parse_user_agent_form_factor(IPAD_DESKTOP_MODE, 5),
            DEVICE_FORM_FACTOR_TABLET
        );
    }

    #[test]
    fn desktop_mode_ipad_still_classifies_a_real_mac_as_a_desktop() {
        assert_eq!(
            parse_user_agent_form_factor(REAL_MAC, 0),
            DEVICE_FORM_FACTOR_DESKTOP
        );
    }

    #[test]
    fn desktop_mode_ipad_does_not_guess_from_an_unavailable_touch_hint() {
        assert_eq!(
            parse_user_agent_form_factor(IPAD_DESKTOP_MODE, -1),
            DEVICE_FORM_FACTOR_DESKTOP
        );
    }

    #[test]
    fn desktop_mode_ipad_needs_more_than_one_touch_point() {
        assert_eq!(
            parse_user_agent_form_factor(REAL_MAC, 1),
            DEVICE_FORM_FACTOR_DESKTOP
        );
    }

    #[test]
    fn desktop_mode_ipad_leaves_an_iphone_a_phone_even_though_it_says_like_mac_os_x() {
        let iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
        assert_eq!(
            parse_user_agent_form_factor(iphone, 5),
            DEVICE_FORM_FACTOR_PHONE
        );
    }

    #[test]
    fn desktop_mode_ipad_leaves_a_classic_ipad_ua_a_tablet() {
        let ipad = "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
        assert_eq!(
            parse_user_agent_form_factor(ipad, 5),
            DEVICE_FORM_FACTOR_TABLET
        );
    }

    #[test]
    fn keeps_the_source_desktop_token_set_exactly() {
        // The source desktop branch matches `winnt`/`windowsnt` with no space, so a real Windows UA
        // with touch unavailable is Unknown (pinned behavior, not fixed).
        let win = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";
        assert_eq!(
            parse_user_agent_form_factor(win, -1),
            DEVICE_FORM_FACTOR_UNKNOWN
        );
        assert_eq!(
            parse_user_agent_form_factor("Mozilla/5.0 (WinNT)", -1),
            DEVICE_FORM_FACTOR_DESKTOP
        );
    }

    #[test]
    fn follows_js_regex_line_and_lookahead_semantics() {
        // `webos.*tv` and `android.*mobile` do not cross a line terminator.
        assert_eq!(
            parse_user_agent_form_factor("webOS\ntv", -1),
            DEVICE_FORM_FACTOR_UNKNOWN
        );
        assert_eq!(
            parse_user_agent_form_factor("webOS SmartPanel tv", -1),
            DEVICE_FORM_FACTOR_TV
        );
        // `linux(?!.*android)` only looks ahead on the same line (and `android.*mobile` does not
        // cross a line either, so neither of these is a phone).
        assert_eq!(
            parse_user_agent_form_factor("Linux; Android\nMobile", -1),
            DEVICE_FORM_FACTOR_UNKNOWN
        );
        assert_eq!(
            parse_user_agent_form_factor("Linux\nAndroid\nMobile", -1),
            DEVICE_FORM_FACTOR_DESKTOP
        );
        // A non-ASCII lookalike never matches an ASCII pattern letter under JS non-unicode /i.
        assert_eq!(
            parse_user_agent_form_factor("i\u{212A}ad", -1),
            DEVICE_FORM_FACTOR_UNKNOWN
        );
    }
}

mod parse_user_agent_os_name {
    use super::*;

    #[test]
    fn returns_each_canonical_name() {
        assert_eq!(
            parse_user_agent_os_name("Mozilla/5.0 (Linux; Android 14; Pixel 8)"),
            "Android"
        );
        assert_eq!(
            parse_user_agent_os_name("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)"),
            "iPadOS"
        );
        assert_eq!(
            parse_user_agent_os_name("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"),
            "iOS"
        );
        assert_eq!(
            parse_user_agent_os_name("Mozilla/5.0 (iPod touch; CPU iPhone OS 16_0 like Mac OS X)"),
            "iOS"
        );
        assert_eq!(
            parse_user_agent_os_name("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"),
            "Windows"
        );
        assert_eq!(
            parse_user_agent_os_name("Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0)"),
            "macOS"
        );
        assert_eq!(
            parse_user_agent_os_name("Mozilla/5.0 (X11; CrOS x86_64 14541.0.0)"),
            "ChromeOS"
        );
        assert_eq!(
            parse_user_agent_os_name("Mozilla/5.0 (X11; Linux x86_64)"),
            "Linux"
        );
        assert_eq!(
            parse_user_agent_os_name("Mozilla/5.0 (X11; FreeBSD amd64)"),
            "FreeBSD"
        );
        assert_eq!(parse_user_agent_os_name("OpenBSD"), "OpenBSD");
        assert_eq!(parse_user_agent_os_name("NetBSD"), "NetBSD");
    }

    #[test]
    fn returns_empty_string_for_unknown_ua() {
        assert_eq!(parse_user_agent_os_name(""), "");
        assert_eq!(parse_user_agent_os_name("CustomBot/1.0"), "");
    }
}

mod parse_user_agent_os_version {
    use super::*;

    #[test]
    fn parses_android_version() {
        assert_eq!(
            parse_user_agent_os_version("Mozilla/5.0 (Linux; Android 14.0; Pixel)"),
            "14.0"
        );
        assert_eq!(
            parse_user_agent_os_version("Mozilla/5.0 (Linux; Android 9; SM-G950F)"),
            "9"
        );
    }

    #[test]
    fn parses_ios_version_with_underscore_notation() {
        assert_eq!(
            parse_user_agent_os_version("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0_1 like Mac OS X)"),
            "17.0.1"
        );
        assert_eq!(
            parse_user_agent_os_version("Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)"),
            "16.0"
        );
    }

    #[test]
    fn parses_windows_nt_version() {
        assert_eq!(
            parse_user_agent_os_version("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"),
            "10.0"
        );
        assert_eq!(
            parse_user_agent_os_version("Mozilla/5.0 (Windows NT 6.1; WOW64)"),
            "6.1"
        );
    }

    #[test]
    fn parses_macos_version_with_underscore_and_dot_notation() {
        assert_eq!(
            parse_user_agent_os_version("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"),
            "10.15.7"
        );
        assert_eq!(
            parse_user_agent_os_version("Mozilla/5.0 (Macintosh; Intel Mac OS X 13.0)"),
            "13.0"
        );
    }

    #[test]
    fn parses_chromeos_version() {
        assert_eq!(
            parse_user_agent_os_version("Mozilla/5.0 (X11; CrOS x86_64 14541.0.0)"),
            "14541.0.0"
        );
    }

    #[test]
    fn returns_empty_string_for_unknown_ua() {
        assert_eq!(parse_user_agent_os_version(""), "");
        assert_eq!(parse_user_agent_os_version("CustomBot/1.0"), "");
    }

    #[test]
    fn uses_the_js_whitespace_set_and_lazy_ios_scan() {
        // NBSP and U+FEFF are JS `\s`; U+0085 (NEL) is not.
        assert_eq!(parse_user_agent_os_version("Android\u{00A0}12"), "12");
        assert_eq!(parse_user_agent_os_version("Android\u{FEFF}12"), "12");
        assert_eq!(parse_user_agent_os_version("Android\u{0085}12"), "");
        // The lazy `.*?` takes the first `os` after the device token, and never crosses a line terminator.
        assert_eq!(
            parse_user_agent_os_version("iPhone; CPU iPhone OS 16_2 like Mac OS X 10_15"),
            "16.2"
        );
        assert_eq!(parse_user_agent_os_version("iPhone\nOS 16_2"), "");
    }
}
