//! Rust-side sugar for the ordinal table: an inherent constructor that delegates to the free-function
//! contract.

use flight_entity::{Kind, NonEntityCreateResult};

use crate::ordinal_table::{OrdinalTable, create_ordinal_table};

#[cfg(test)]
#[path = "sugar_tests.rs"]
mod sugar_tests;

impl<T> OrdinalTable<T> {
    pub fn new(vocabulary: &[Kind]) -> NonEntityCreateResult<Self> {
        return create_ordinal_table(vocabulary);
    }
}
