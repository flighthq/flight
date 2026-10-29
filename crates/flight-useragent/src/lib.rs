mod device_form_factor;
mod js_pattern;
mod user_agent;
mod user_agent_native;
mod user_agent_parse;

pub mod contract;

// Public lane: TS `index.ts` mirrors the full contract, including the owned DeviceFormFactor type
// and constants.
pub use contract::*;
