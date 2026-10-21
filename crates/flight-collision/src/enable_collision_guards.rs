// In the TS source, collision guards are runtime-toggled globals.
// In the Rust IR these are no-ops since guard state is not transpiled.

pub fn are_collision_guards_enabled() -> bool {
    return false;
}

pub fn disable_collision_guards() {
    // No-op: guard state is runtime-only.
}

pub fn enable_collision_guards() {
    // No-op: guard state is runtime-only.
}
