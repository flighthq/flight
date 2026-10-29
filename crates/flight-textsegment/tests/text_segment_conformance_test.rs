//! flight-compiler: target-native

use flight_textsegment::*;

struct GraphemeFixture {
    text: &'static str,
    clusters: &'static [&'static str],
}

mod text_segment_conformance_fixtures {
    use super::*;

    #[test]
    fn covers_regional_indicators_zwj_emoji_crlf_and_hangul_jamo() {
        let backend = *WEB_TEXT_SEGMENTER_BACKEND;
        let fixtures: &[GraphemeFixture] = &[
            GraphemeFixture {
                text: "\u{1F1FA}\u{1F1F8}\u{1F1E8}\u{1F1E6}",
                clusters: &["\u{1F1FA}\u{1F1F8}", "\u{1F1E8}\u{1F1E6}"],
            },
            GraphemeFixture {
                text: "\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}",
                clusters: &["\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}"],
            },
            GraphemeFixture {
                text: "\r\n",
                clusters: &["\r\n"],
            },
            GraphemeFixture {
                text: "\u{AC01}",
                clusters: &["\u{AC01}"],
            },
        ];
        for fixture in fixtures {
            let mut segments = Vec::new();
            segment_graphemes(&mut segments, &backend, fixture.text, None);
            let texts: Vec<&str> = segments.iter().map(|s| s.text.as_str()).collect();
            assert_eq!(
                texts, fixture.clusters,
                "Failed for text: {:?}",
                fixture.text
            );
        }
    }
}
