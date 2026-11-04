//! flight-compiler: rust-only

//! Rust-side sugar for the ordinal table: an inherent constructor that delegates to the free-function
//! contract.

#![cfg_attr(not(feature = "object-api"), allow(unused_imports))]
use flight_entity::{Kind, NonEntityCreateResult};

use crate::ordinal_table::{OrdinalTable, create_ordinal_table};

#[cfg(all(test, feature = "object-api"))]
#[path = "sugar_tests.rs"]
mod sugar_tests;

#[cfg(feature = "object-api")]
impl<T> OrdinalTable<T> {
    pub fn new(vocabulary: &[Kind]) -> NonEntityCreateResult<Self> {
        return create_ordinal_table(vocabulary);
    }
}
