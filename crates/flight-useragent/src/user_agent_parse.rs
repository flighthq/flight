//! UA-string parsers for device identity fields (TS `userAgentParse.ts`). All functions are pure:
//! no DOM, globals or state. UA parsing is best-effort; these follow the pinned source patterns
//! exactly, including its known ceilings (frozen Windows 11 / macOS UA values).

use crate::device_form_factor::*;
use crate::js_pattern::*;

/// `bb\d+`
fn bb_digits(t: &[char]) -> bool {
    return positions(t, "bb")
        .into_iter()
        .any(|at| run_len(t, at + 2, |c| c.is_ascii_digit()) > 0);
}

/// `cros\s+\S+\s+([\d.]+)`: the greedy runs are disjoint, so no backtracking alternative exists.
fn cros_version(t: &[char]) -> Option<String> {
    for at in positions(t, "cros") {
        let mut k = at + 4;
        let ws = run_len(t, k, is_js_whitespace);
        if ws == 0 {
            continue;
        }
        k += ws;
        let token = run_len(t, k, |c| !is_js_whitespace(c));
        if token == 0 {
            continue;
        }
        k += token;
        let ws = run_len(t, k, is_js_whitespace);
        if ws == 0 {
            continue;
        }
        k += ws;
        let len = run_len(t, k, is_digit_or_dot);
        if len > 0 {
            return Some(t[k..k + len].iter().collect());
        }
    }
    return None;
}

/// `(?:iphone|ipad|ipod).*?os\s+([\d_]+)`: from each device-token start, the lazy `.*?` extends one
/// char at a time (never across a line terminator) until `os\s+[\d_]+` matches.
fn ios_version(t: &[char]) -> Option<String> {
    let mut starts: Vec<(usize, usize)> = Vec::new();
    for (token, len) in [("iphone", 6), ("ipad", 4), ("ipod", 4)] {
        for at in positions(t, token) {
            starts.push((at, len));
        }
    }
    starts.sort();
    for (at, len) in starts {
        let mut k = at + len;
        loop {
            if matches_at(t, k, "os") {
                let ws = run_len(t, k + 2, is_js_whitespace);
                if ws > 0 {
                    let start = k + 2 + ws;
                    let digits = run_len(t, start, is_digit_or_underscore);
                    if digits > 0 {
                        return Some(t[start..start + digits].iter().collect());
                    }
                }
            }
            if k >= t.len() || is_js_line_terminator(t[k]) {
                break;
            }
            k += 1;
        }
    }
    return None;
}

/// `linux(?!.*android)`: a `linux` with no `android` after it on the same line.
fn linux_without_android(t: &[char]) -> bool {
    return positions(t, "linux").into_iter().any(|at| {
        let mut k = at + 5;
        loop {
            if matches_at(t, k, "android") {
                return false;
            }
            if k >= t.len() || is_js_line_terminator(t[k]) {
                return true;
            }
            k += 1;
        }
    });
}

/// Parses a device form factor from a UA string and a touch-point hint (`max_touch_points`:
/// `navigator.maxTouchPoints`, or -1 when unavailable). Never returns ""; falls back to
/// `DEVICE_FORM_FACTOR_UNKNOWN`. Branch order is the source's: car, TV, watch, tablet, phone, a
/// touch-capable Macintosh UA (desktop-mode iPad), desktop tokens, then the zero-touch desktop hint.
pub fn parse_user_agent_form_factor(ua: &str, max_touch_points: i32) -> DeviceFormFactor {
    let t = chars_of(ua);
    // /android auto|car browser|automotive/i
    if contains_any(&t, &["android auto", "car browser", "automotive"]) {
        return DEVICE_FORM_FACTOR_CAR.to_string();
    }
    // /smart[-_]?tv|smarttv|googletv|appletv|hbbtv|netcast|webos.*tv|tizen.*tv|tv safari/i
    if contains_any(
        &t,
        &[
            "smarttv",
            "smart-tv",
            "smart_tv",
            "googletv",
            "appletv",
            "hbbtv",
            "netcast",
            "tv safari",
        ],
    ) || contains_then_on_line(&t, "webos", "tv")
        || contains_then_on_line(&t, "tizen", "tv")
    {
        return DEVICE_FORM_FACTOR_TV.to_string();
    }
    // /watch\s*os|watch[_ ]?kit|wearable/i
    if watch_then(&t) || contains(&t, "wearable") {
        return DEVICE_FORM_FACTOR_WATCH.to_string();
    }
    if contains(&t, "ipad") {
        return DEVICE_FORM_FACTOR_TABLET.to_string();
    }
    if contains(&t, "android") && !contains(&t, "mobile") {
        return DEVICE_FORM_FACTOR_TABLET.to_string();
    }
    // /tablet\s*pc|silk|kindle fire/i
    if tablet_pc(&t) || contains_any(&t, &["silk", "kindle fire"]) {
        return DEVICE_FORM_FACTOR_TABLET.to_string();
    }
    // /iphone|ipod|android.*mobile|windows phone|blackberry|bb\d+|mobile safari/i
    if contains_any(
        &t,
        &[
            "iphone",
            "ipod",
            "windows phone",
            "blackberry",
            "mobile safari",
        ],
    ) || contains_then_on_line(&t, "android", "mobile")
        || bb_digits(&t)
    {
        return DEVICE_FORM_FACTOR_PHONE.to_string();
    }
    if max_touch_points > 1 && contains_any(&t, &["macintosh", "mac os x"]) {
        return DEVICE_FORM_FACTOR_TABLET.to_string();
    }
    // /win(?:dows)?nt|macintosh|mac os x|linux(?!.*android)|x11/i
    if contains_any(&t, &["winnt", "windowsnt", "macintosh", "mac os x", "x11"])
        || linux_without_android(&t)
    {
        return DEVICE_FORM_FACTOR_DESKTOP.to_string();
    }
    if max_touch_points == 0 {
        return DEVICE_FORM_FACTOR_DESKTOP.to_string();
    }
    return DEVICE_FORM_FACTOR_UNKNOWN.to_string();
}

/// Parses an OS name from a UA string, or "" when unknown. Values: "Android", "iPadOS", "iOS",
/// "ChromeOS", "Windows", "macOS", "FreeBSD", "OpenBSD", "NetBSD", "Linux".
pub fn parse_user_agent_os_name(ua: &str) -> String {
    let t = chars_of(ua);
    let name = if contains(&t, "android") {
        "Android"
    } else if contains(&t, "ipad") {
        "iPadOS"
    } else if contains_any(&t, &["iphone", "ipod"]) {
        "iOS"
    } else if contains(&t, "cros") {
        "ChromeOS"
    } else if contains_any(&t, &["windows nt", "windows phone"]) {
        "Windows"
    } else if contains_any(&t, &["macintosh", "mac os x"]) {
        "macOS"
    } else if contains(&t, "freebsd") {
        "FreeBSD"
    } else if contains(&t, "openbsd") {
        "OpenBSD"
    } else if contains(&t, "netbsd") {
        "NetBSD"
    } else if contains(&t, "linux") {
        "Linux"
    } else {
        ""
    };
    return name.to_string();
}

/// Parses the raw dotted OS version from a UA string, or "" when not found: Android, then
/// iOS/iPadOS (underscores to dots), Windows NT, macOS (underscores to dots), ChromeOS. The single
/// OS-version extractor in this crate. Values are ceilings, not readings: Windows 11 reads "10.0"
/// and macOS since Big Sur reads "10.15.7".
pub fn parse_user_agent_os_version(ua: &str) -> String {
    let t = chars_of(ua);
    // /android\s+([\d.]+)/i
    if let Some(version) = capture_after_whitespace(&t, "android", is_digit_or_dot) {
        return version;
    }
    // /(?:iphone|ipad|ipod).*?os\s+([\d_]+)/i
    if let Some(version) = ios_version(&t) {
        return version.replace('_', ".");
    }
    // /windows nt\s+([\d.]+)/i
    if let Some(version) = capture_after_whitespace(&t, "windows nt", is_digit_or_dot) {
        return version;
    }
    // /mac os x\s+([\d_.]+)/i
    if let Some(version) = capture_after_whitespace(&t, "mac os x", is_digit_underscore_or_dot) {
        return version.replace('_', ".");
    }
    // /cros\s+\S+\s+([\d.]+)/i
    if let Some(version) = cros_version(&t) {
        return version;
    }
    return String::new();
}

/// `tablet\s*pc`
fn tablet_pc(t: &[char]) -> bool {
    return positions(t, "tablet")
        .into_iter()
        .any(|at| matches_at(t, at + 6 + run_len(t, at + 6, is_js_whitespace), "pc"));
}

/// `watch\s*os|watch[_ ]?kit`
fn watch_then(t: &[char]) -> bool {
    return positions(t, "watch").into_iter().any(|at| {
        let after = at + 5;
        if matches_at(t, after + run_len(t, after, is_js_whitespace), "os") {
            return true;
        }
        if matches_at(t, after, "kit") {
            return true;
        }
        return after < t.len()
            && (t[after] == '_' || t[after] == ' ')
            && matches_at(t, after + 1, "kit");
    });
}
