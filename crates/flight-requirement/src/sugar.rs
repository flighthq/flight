//! Rust-side sugar for the requirement set: inherent constructor and method forms that delegate to
//! the free-function contract.

#![cfg_attr(not(feature = "object-api"), allow(unused_imports))]
use crate::requirement_set_raw::{RequirementSet, create_requirement_set, diff_requirement_sets};
use crate::types::{Requirement, RequirementFacet};

#[cfg(feature = "object-api")]
impl RequirementSet {
    pub fn new(covers: &[RequirementFacet], requirements: &[Requirement]) -> Self {
        return create_requirement_set(covers, requirements);
    }

    pub fn diff(&self, baseline: &RequirementSet) -> Self {
        return diff_requirement_sets(self, baseline);
    }
}
