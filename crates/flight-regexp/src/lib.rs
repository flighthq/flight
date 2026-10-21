mod regexp;
mod sugar;

pub mod contract;

pub use contract::RegExp;
pub use contract::RegExpExecIndices;
pub use contract::RegExpExecResult;
pub use contract::RegExpMatchRange;
pub use contract::RegExpMethods;

pub use contract::create_reg_exp;
pub use contract::exec_reg_exp;
pub use contract::test_reg_exp;
