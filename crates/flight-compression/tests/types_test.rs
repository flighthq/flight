use flight_compression::*;
use flight_compression::contract::get_compression_framing_string;
use flight_compression::contract::parse_compression_framing;

mod get_compression_framing_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        assert_eq!(get_compression_framing_string(CompressionFraming::Raw), "Raw");
        assert_eq!(
            get_compression_framing_string(CompressionFraming::Rfc1950),
            "Rfc1950"
        );
    }
}

mod parse_compression_framing {
    use super::*;

    #[test]
    fn parses_the_exact_ts_strings() {
        assert_eq!(parse_compression_framing("Raw"), Some(CompressionFraming::Raw));
        assert_eq!(
            parse_compression_framing("Rfc1950"),
            Some(CompressionFraming::Rfc1950)
        );
    }

    #[test]
    fn rejects_other_text_and_wrong_casing() {
        assert_eq!(parse_compression_framing("raw"), None);
        assert_eq!(parse_compression_framing("RFC1950"), None);
        assert_eq!(parse_compression_framing(""), None);
    }
}
