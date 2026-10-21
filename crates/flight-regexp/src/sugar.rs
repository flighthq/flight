use flight_entity::Ref;

use crate::regexp::{RegExp, RegExpExecResult, create_reg_exp, exec_reg_exp, test_reg_exp};

#[cfg(test)]
#[path = "sugar_tests.rs"]
mod sugar_tests;

pub trait RegExpMethods {
    fn exec(&self, input: &str) -> Option<RegExpExecResult>;
    fn test(&self, input: &str) -> bool;
}

impl RegExpMethods for Ref<RegExp> {
    fn exec(&self, input: &str) -> Option<RegExpExecResult> {
        return exec_reg_exp(self, input);
    }

    fn test(&self, input: &str) -> bool {
        return test_reg_exp(self, input);
    }
}

impl RegExp {
    pub fn new(source: &str, flags: &str) -> Ref<RegExp> {
        return create_reg_exp(source, flags);
    }
}
