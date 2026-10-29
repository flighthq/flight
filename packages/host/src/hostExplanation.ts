// Generated from crates/flight-host/src/host_explanation.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

/**
 * What a host provides (TS `HostExplanation`): every group it carries with its filled slots, and
 * the covered-slot census, present and missing alike. A provider builds it by calling each group's
 * explainer in group order. Plain data.
 */
export interface HostExplanation {
  capabilities: HostCapabilityCoverage[];
  groups: HostCapabilityGroupExplanation[];
}

/**
 * Where a missing capability can be obtained (TS `HostCapabilityBackend`). `entryPoint` is a real
 * exported name, so a reader can grep it.
 */
export interface HostCapabilityBackend {
  entryPoint: string;
  packageName: string;
  platform: string;
}

/**
 * One covered slot's presence (TS `HostCapabilityCoverage`).
 */
export interface HostCapabilityCoverage {
  capability: string;
  group: string;
  isPresent: boolean;
  slot: string;
}

/**
 * One capability slot's explanation, including where to get it when it is absent (TS
 * `HostCapabilityExplanation`).
 */
export interface HostCapabilityExplanation {
  backends: HostCapabilityBackend[];
  capability: string;
  group: string;
  isPresent: boolean;
  message: string;
  slot: string;
}

/**
 * One group present on a host and its filled slot names (TS `HostCapabilityGroupExplanation`).
 */
export interface HostCapabilityGroupExplanation {
  group: string;
  slots: string[];
}

/**
 * Builds one slot's explanation (TS `hostExplain.ts` `_explainSlot`), so a feature's explainer and
 * its guard say the same thing. The message names the slot's source accessor
 * (`get` + the capability without its `Capability` suffix) and, when the slot is absent, the
 * consequence and the fix. `backends` always travel as data, present or not.
 */
export function explainHostCapabilitySlot(
  capability: string,
  group: string,
  slot: string,
  isPresent: boolean,
  consequence: string,
  fix: string,
  backends: HostCapabilityBackend[],
): HostCapabilityExplanation {
  const name = capability.endsWith('Capability')
    ? capability.slice(0, capability.length - 'Capability'.length)
    : capability;
  const accessor = `get${name}`;
  const message = isPresent
    ? `${accessor}: host.${group}.${slot} is present`
    : `${accessor}: host.${group}.${slot} is absent, so ${consequence} — ${fix}`;
  return {
    backends: backends,
    capability: String(capability),
    group: String(group),
    isPresent: isPresent,
    message: message,
    slot: String(slot),
  };
}
