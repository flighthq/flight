//! Rust-side sugar for the requirement set: inherent constructor and method forms that delegate to
//! the free-function contract.

use crate::requirement_set::{RequirementSet, create_requirement_set, diff_requirement_sets};
use crate::types::{Requirement, RequirementFacet};

impl RequirementSet {
    pub fn new(covers: &[RequirementFacet], requirements: &[Requirement]) -> Self {
        return create_requirement_set(covers, requirements);
    }

    pub fn diff(&self, baseline: &RequirementSet) -> Self {
        return diff_requirement_sets(self, baseline);
    }
}
