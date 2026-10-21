use flight_entity::allocate_entity;

use crate::types::*;

pub fn create_environment(options: Option<&EnvironmentOptions>) -> Environment {
    let mut out: Environment = allocate_entity();
    initialize_environment(&mut out, options);
    return out;
}

pub fn initialize_environment(out: &mut Environment, options: Option<&EnvironmentOptions>) {
    out.enabled = options.and_then(|value| value.enabled).unwrap_or(true);
    out.environment = options.and_then(|value| value.environment.clone());
    out.intensity = options.and_then(|value| value.intensity).unwrap_or(1.0);
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
