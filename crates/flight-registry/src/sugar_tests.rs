//! flight-compiler: rust-only

use super::*;

#[test]
fn new_matches_create_ordinal_table() {
    let vocabulary = vec!["Tag0".to_string(), "Tag1".to_string()];
    assert_eq!(
        OrdinalTable::<String>::new(&vocabulary),
        create_ordinal_table::<String>(&vocabulary)
    );
}
