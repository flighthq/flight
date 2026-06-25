//! flighthq-useragent — user-agent parsing value-leaf.
//!
//! Port of @flighthq/useragent (the merge of the former device-formats +
//! platform-formats). Modules mirror TS filenames 1:1: userAgent.ts ->
//! user_agent.rs, userAgentParse.ts -> user_agent_parse.rs.

mod user_agent;
mod user_agent_parse;

pub use user_agent::{
    UserAgentRuntimeProbe, parse_user_agent_arch, parse_user_agent_engine,
    parse_user_agent_engine_version, parse_user_agent_kind, parse_user_agent_name,
    parse_user_agent_pointer_width, parse_user_agent_runtime, parse_user_agent_version,
    probe_endianness,
};
pub use user_agent_parse::{
    parse_user_agent_form_factor, parse_user_agent_os_name, parse_user_agent_os_version,
};
