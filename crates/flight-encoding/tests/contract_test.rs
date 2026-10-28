//! flight-compiler: rust-only

// The generated TypeScript test would name `decodeUtf8`/`encodeUtf8`; the shipped names are
// `decodeUTF8`/`encodeUTF8`, which the compiler cannot yet derive from `decode_utf8`. TS coverage of
// the contract lane lives in the target-native utf8.test.ts until generic acronym naming lands.

use flight_encoding::contract::*;

#[test]
fn contract_decode_utf8() {
    assert_eq!(decode_utf8(&[0xC2, 0xA2], None, None), "\u{00A2}");
}

#[test]
fn contract_encode_utf8() {
    assert_eq!(*encode_utf8("\u{00A2}"), [0xC2, 0xA2]);
}
