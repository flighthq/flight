/* tslint:disable */
/* eslint-disable */

export function abi_capabilities(): number;

export function abi_version(): number;

export function create_abi(): number;

export function create_world(abi: number): number;

export function destroy_abi(abi: number): boolean;

export function destroy_world(abi: number, world: number): boolean;

export function execute(
  abi: number,
  world: number,
  commands: Uint8Array,
  byte_length: number,
  command_count: number,
  result: Uint32Array,
): boolean;

export function query(abi: number, world: number, counts: Uint32Array): boolean;

export function read_bodies(
  abi: number,
  world: number,
  selection: Uint32Array,
  has_selection: boolean,
  ids: Uint32Array,
  flags: Uint32Array,
  values: Float64Array,
  counts: Uint32Array,
): boolean;

export function read_contacts(abi: number, world: number, counts: Uint32Array): boolean;

export function read_joints(
  abi: number,
  world: number,
  ids: Uint32Array,
  flags: Uint32Array,
  values: Float64Array,
  counts: Uint32Array,
): boolean;

export function step(abi: number, world: number, dt: number, has_hooks: boolean): number;

export function world_status(abi: number, world: number): number;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

export default function __wbg_init(
  module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>,
): Promise<InitOutput>;
