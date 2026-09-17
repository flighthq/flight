// What a Host actually provides, as plain data. `explainHost` answers "what do I have?" after the fact;
// `enableHostGuards` is the active counterpart that warns at the moment a capability is missing. Both read
// the same coverage enumeration, so the warning can never disagree with the explanation.
export interface HostExplanation {
  // One entry per capability group present on the host, enumerated from the object at call time rather
  // than from a table, so this half can never drift from the host it describes.
  readonly groups: readonly HostCapabilityGroupExplanation[];
  // The capability slots @flighthq/host exposes an accessor for, present and missing alike. This is a
  // deliberate subset of every optional slot on every group: the slots a Flight package actually takes
  // as a function parameter. A slot outside it is neither reported present nor reported missing.
  readonly capabilities: readonly HostCapabilityCoverage[];
}

export interface HostCapabilityGroupExplanation {
  readonly group: string;
  readonly slots: readonly string[];
}

// Where a missing capability can be obtained. `entryPoint` is a real exported name, so a reader can grep it.
export interface HostCapabilityBackend {
  readonly entryPoint: string;
  readonly packageName: string;
  readonly platform: string;
}

// One capability slot's explanation, including where to get it when it is absent — the breadcrumb that
// makes the host architecture legible from the error rather than from the docs.
export interface HostCapabilityExplanation {
  readonly backends: readonly HostCapabilityBackend[];
  readonly capability: string;
  readonly group: string;
  readonly isPresent: boolean;
  readonly message: string;
  readonly slot: string;
}

// The census entry for one covered capability slot. Carries no remedy: the per-capability `explainHost*`
// queries are where a missing slot earns prose and a list of backends.
export interface HostCapabilityCoverage {
  readonly capability: string;
  readonly group: string;
  readonly isPresent: boolean;
  readonly slot: string;
}
