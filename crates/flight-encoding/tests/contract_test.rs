use flight_encoding::contract::*;

#[test]
fn contract_decode_utf8() {
    assert_eq!(
        decode_utf8(&[0xC2, 0xA2], None, None),
        "\u{00A2}"
    );
}

#[test]
fn contract_encode_utf8() {
    assert_eq!(
        *encode_utf8("\u{00A2}"),
        [0xC2, 0xA2]
    );
}
