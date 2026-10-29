//! Host capability explanations (TS `types/src/HostExplanation.ts`): plain records that say which
//! capabilities a host carries and, for an absent one, where to get it. Each feature crate explains
//! its own capability groups into them (D26); a host provider composes its groups' explanations.

/// What a host provides (TS `HostExplanation`): every group it carries with its filled slots, and
/// the covered-slot census, present and missing alike. A provider builds it by calling each group's
/// explainer in group order. Plain data.
#[derive(Clone, Debug, PartialEq)]
pub struct HostExplanation {
    pub capabilities: Vec<HostCapabilityCoverage>,
    pub groups: Vec<HostCapabilityGroupExplanation>,
}

/// Where a missing capability can be obtained (TS `HostCapabilityBackend`). `entry_point` is a real
/// exported name, so a reader can grep it.
#[derive(Clone, Debug, PartialEq)]
pub struct HostCapabilityBackend {
    pub entry_point: String,
    pub package_name: String,
    pub platform: String,
}

/// One covered slot's presence (TS `HostCapabilityCoverage`).
#[derive(Clone, Debug, PartialEq)]
pub struct HostCapabilityCoverage {
    pub capability: String,
    pub group: String,
    pub is_present: bool,
    pub slot: String,
}

/// One capability slot's explanation, including where to get it when it is absent (TS
/// `HostCapabilityExplanation`).
#[derive(Clone, Debug, PartialEq)]
pub struct HostCapabilityExplanation {
    pub backends: Vec<HostCapabilityBackend>,
    pub capability: String,
    pub group: String,
    pub is_present: bool,
    pub message: String,
    pub slot: String,
}

/// One group present on a host and its filled slot names (TS `HostCapabilityGroupExplanation`).
#[derive(Clone, Debug, PartialEq)]
pub struct HostCapabilityGroupExplanation {
    pub group: String,
    pub slots: Vec<String>,
}

/// Builds one slot's explanation (TS `hostExplain.ts` `_explainSlot`), so a feature's explainer and
/// its guard say the same thing. The message names the slot's source accessor
/// (`get` + the capability without its `Capability` suffix) and, when the slot is absent, the
/// consequence and the fix. `backends` always travel as data, present or not.
// flight-lint: allow(conform-extra) D26: the shared slot explanation each feature's explainer builds, formerly private to the host aggregate
pub fn explain_host_capability_slot(
    capability: &str,
    group: &str,
    slot: &str,
    is_present: bool,
    consequence: &str,
    fix: &str,
    backends: Vec<HostCapabilityBackend>,
) -> HostCapabilityExplanation {
    let name = if capability.ends_with("Capability") {
        &capability[0..capability.len() - "Capability".len()]
    } else {
        capability
    };
    let accessor = format!("get{}", name);
    let message = if is_present {
        format!("{}: host.{}.{} is present", accessor, group, slot)
    } else {
        format!(
            "{}: host.{}.{} is absent, so {} \u{2014} {}",
            accessor, group, slot, consequence, fix
        )
    };
    return HostCapabilityExplanation {
        backends,
        capability: capability.to_string(),
        group: group.to_string(),
        is_present,
        message,
        slot: slot.to_string(),
    };
}
