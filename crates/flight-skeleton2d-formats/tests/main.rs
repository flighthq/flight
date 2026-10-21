use flight_skeleton2d_formats::contract::*;

#[test]
fn binary_reader_starts_at_zero() {
    let reader = create_spine_binary_reader(&[1, 2, 3]);
    assert_eq!(reader.offset, 0);
    assert!(!is_spine_binary_reader_overrun(&reader));
}
