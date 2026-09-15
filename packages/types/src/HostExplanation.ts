// What a Host actually provides, as plain data. `explainHost` answers "what do I have?" after the fact;
// `enableHostGuards` is the active counterpart that warns at the moment a provider is missing. Both read
// the same coverage enumeration, so the warning can never disagree with the explanation.
export interface HostExplanation {
  // One entry per capability group present on the host, enumerated from the object at call time rather
  // than from a table, so this half can never drift from the host it describes.
  readonly groups: readonly HostCapabilityGroupExplanation[];
  // The provider slots @flighthq/host exposes an accessor for, present and missing alike. This is a
  // deliberate subset of every optional slot on every group: the slots a Flight package actually takes
  // as a function parameter. A slot outside it is neither reported present nor reported missing.
  readonly providers: readonly HostProviderCoverage[];
}

export interface HostCapabilityGroupExplanation {
  readonly group: string;
  // True when the group position holds a PROVIDER rather than a group of provider slots. `Host.window`
  // is the only one, and it reports no slots — without this flag that is indistinguishable from a group
  // that is simply empty, which is the opposite conclusion.
  readonly isProvider: boolean;
  // The slot keys actually set on the group, in the order the host object carries them.
  readonly slots: readonly string[];
}

// Where a missing provider can be obtained. `entryPoint` is a real exported name, so a reader can grep it.
export interface HostProviderBackend {
  readonly entryPoint: string;
  readonly packageName: string;
  readonly platform: string;
}

// One provider slot's explanation, including where to get it when it is absent — the breadcrumb that
// makes the host architecture legible from the error rather than from the docs.
export interface HostProviderExplanation {
  readonly backends: readonly HostProviderBackend[];
  readonly group: string;
  readonly isPresent: boolean;
  readonly message: string;
  readonly provider: string;
  readonly slot: string;
}

// The census entry for one covered provider slot. Carries no remedy: the per-provider `explainHost*`
// queries are where a missing slot earns prose and a list of backends.
export interface HostProviderCoverage {
  readonly group: string;
  readonly isPresent: boolean;
  // The provider interface's name, e.g. 'HostVideoProvider' — the type to import when writing the slot.
  readonly provider: string;
  readonly slot: string;
}
