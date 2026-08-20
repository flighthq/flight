export type AssertionSensitivityVerdict = 'able' | 'blind' | 'exempt' | 'gap';

export interface AssertionSensitivityRow {
  evidence: string;
  line: number;
  path: string;
  verdict: AssertionSensitivityVerdict;
}

export const ASSERTION_SENSITIVITY_CONTROLS: Readonly<Record<string, AssertionSensitivityVerdict>>;

export function assertSensitivityControls(rows: readonly AssertionSensitivityRow[]): void;
export function classifyAssertionSource(path: string, source: string): AssertionSensitivityRow;
export function formatAssertionSensitivityReport(rows: readonly AssertionSensitivityRow[]): string;
export function maskTypeScript(source: string): string;
export function readAssertionSensitivityRows(root: string): AssertionSensitivityRow[];
export function runAssertionSensitivity(root: string, argv: readonly string[]): number;
