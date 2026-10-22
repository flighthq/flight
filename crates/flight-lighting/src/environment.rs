use flight_entity::allocate_entity;

use crate::types::*;

// flight-lint: allow(conform-params) Principalc0f9227c D23 (B): callers assign authored environment fields after construction
pub fn create_environment() -> Environment {
    let mut out: Environment = allocate_entity();
    initialize_environment(&mut out);
    return out;
}

// flight-lint: allow(conform-params) Principalc0f9227c D23 (B): initialization restores canonical defaults before authored assignment
pub fn initialize_environment(out: &mut Environment) {
    out.enabled = true;
    out.environment = None;
    out.intensity = 1.0;
    out.kind = ENVIRONMENT_KIND.to_string();
}

pub fn clone_environment(source: &Environment) -> Environment {
    let mut out: Environment = allocate_entity();
    out.enabled = source.enabled;
    out.environment = source.environment.clone();
    out.intensity = source.intensity;
    out.kind = ENVIRONMENT_KIND.to_string();
    return out;
}
