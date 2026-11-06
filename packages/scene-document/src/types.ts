import type { Camera3D } from '@flighthq/camera/contract';
import type { EntityRaw, EntityRuntime, EntityRuntimeKey, Kind } from '@flighthq/entity/contract';
import type { LayoutNode, LayoutTree } from '@flighthq/layout/contract';
import type { Scene3DLights } from '@flighthq/lighting/contract';
import type { NodeAny } from '@flighthq/node/contract';
import type { Node2D, Scene2D } from '@flighthq/scene2d/contract';
import type { Scene3D, Scene3DDocumentCamera, Scene3DDocumentLight } from '@flighthq/scene3d/contract';
import type { ShapeCommandSchema } from '@flighthq/shape-formats/contract';
import type {
  NodeInteractiveStateExtensionRuntime,
  NodeInteractiveStateProperty,
  NodeInteractiveStateTransition,
} from '@flighthq/types/contract';

interface SceneDocumentEntity extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
}

type Node3D = Scene3D['root'];

export type FlightDocumentScalar = boolean | number | string | null;
export type FlightDocumentValue = FlightDocumentScalar | FlightDocumentValue[] | FlightDocumentFields;

export interface FlightDocumentFields {
  [name: string]: FlightDocumentValue;
}

export type FlightDocumentFieldValidator = (value: FlightDocumentValue) => boolean;

export interface FlightDocumentFieldSchema {
  defaultValue?: FlightDocumentValue;
  name: string;
  required: boolean;
  validate: FlightDocumentFieldValidator;
}

export type FlightDocumentInteractiveStateProperty = NodeInteractiveStateProperty;
export type FlightDocumentInteractiveStateValue = boolean | number;

export interface FlightDocumentInteractiveStateExtensionDescriptor {
  fields: FlightDocumentFields;
  kind: Kind;
}

export interface FlightDocumentInteractiveState {
  alpha?: number;
  extensions: FlightDocumentInteractiveStateExtensionDescriptor[];
  scaleX?: number;
  scaleY?: number;
  visible?: boolean;
  x?: number;
  y?: number;
}

export interface FlightDocumentInteractiveStates {
  disabled: FlightDocumentInteractiveState | null;
  hover: FlightDocumentInteractiveState | null;
  pressed: FlightDocumentInteractiveState | null;
}

export interface FlightDocumentInteractiveStateTransitionDescriptor {
  fields: FlightDocumentFields;
  kind: Kind;
}

export interface FlightDocumentInteractiveStateBinding<N extends NodeAny = NodeAny> {
  interactiveStates: FlightDocumentInteractiveStates;
  node: N;
  transition: FlightDocumentInteractiveStateTransitionDescriptor | null;
}

export interface FlightDocumentInteractiveStateExtensionSchema {
  createExtension: (node: NodeAny, fieldNames: readonly string[]) => NodeInteractiveStateExtensionRuntime | null;
  fields: readonly Readonly<FlightDocumentFieldSchema>[];
  isSupported: (node: Readonly<NodeAny>) => boolean;
  kind: Kind;
}

export interface FlightDocumentInteractiveStateTransitionSchema {
  createTransition: (fields: Readonly<FlightDocumentFields>) => NodeInteractiveStateTransition | null;
  fields: readonly Readonly<FlightDocumentFieldSchema>[];
  kind: Kind;
}

export type FlightDocumentLayoutNode = LayoutNode<FlightDocumentFields, FlightDocumentFields>;

export interface FlightDocumentLayoutTree extends LayoutTree {
  nodes: FlightDocumentLayoutNode[];
}

export interface FlightDocumentLayoutDescriptor {
  targets: string[];
  tree: FlightDocumentLayoutTree;
}

export interface FlightDocumentLayoutBinding<N extends NodeAny = NodeAny> {
  targets: N[];
  tree: FlightDocumentLayoutTree;
}

export type FlightDocumentResourceLookup = Readonly<Record<string, unknown>>;

export type FlightDocumentNodeFactory = (
  fields: Readonly<FlightDocumentFields>,
  resources: FlightDocumentResourceLookup,
) => NodeAny | null;

export type FlightDocumentNodeFieldWriter = (
  out: FlightDocumentFields,
  source: Readonly<NodeAny>,
  resources: FlightDocumentResourceLookup,
) => boolean;

export interface FlightDocumentNodeSchema {
  createNode: FlightDocumentNodeFactory;
  fields: readonly Readonly<FlightDocumentFieldSchema>[];
  kind: Kind;
  writeNodeFields: FlightDocumentNodeFieldWriter;
}

export interface FlightDocumentResourceDescriptor {
  fields: FlightDocumentFields;
  key: string;
  kind: Kind;
}

export type FlightDocumentResourceResolver = (
  key: string,
  descriptor: Readonly<FlightDocumentResourceDescriptor>,
) => unknown | null;

export interface FlightDocumentResourceResolverRegistry {
  resolvers: ReadonlyMap<Kind, FlightDocumentResourceResolver>;
}

export interface FlightDocumentResourceSchema {
  fields: readonly Readonly<FlightDocumentFieldSchema>[];
  kind: Kind;
}

export interface FlightDocumentSchemaRegistry {
  interactiveStateExtensionSchemas: ReadonlyMap<Kind, FlightDocumentInteractiveStateExtensionSchema>;
  interactiveStateTransitionSchemas: ReadonlyMap<Kind, FlightDocumentInteractiveStateTransitionSchema>;
  nodeSchemas: ReadonlyMap<Kind, FlightDocumentNodeSchema>;
  resourceSchemas: ReadonlyMap<Kind, FlightDocumentResourceSchema>;
  shapeCommandSchemas: ReadonlyMap<Kind, ShapeCommandSchema>;
}

export interface FlightDocumentToken {
  key: string;
  kind: Kind;
  values: FlightDocumentTokenValues;
}

export interface FlightDocumentTokenValues {
  [mode: string]: FlightDocumentValue;
}

export interface FlightDocumentTokenResolution {
  mode: string;
  values: Readonly<Record<string, FlightDocumentValue>>;
}

export type FlightDocumentTokenResolver = (
  value: FlightDocumentValue,
  token: Readonly<FlightDocumentToken>,
) => FlightDocumentValue | null;

export interface FlightDocumentTokenResolverRegistry extends SceneDocumentEntity {
  resolvers: ReadonlyMap<Kind, FlightDocumentTokenResolver>;
}

export interface FlightDocumentNode {
  children: FlightDocumentNode[];
  fields: FlightDocumentFields;
  interactiveStates?: FlightDocumentInteractiveStates | null;
  kind: Kind;
  transition?: FlightDocumentInteractiveStateTransitionDescriptor | null;
}

export interface FlightDocument {
  defaultScene: number;
  resources: FlightDocumentResourceDescriptor[];
  scenes: [FlightDocumentScene, ...FlightDocumentScene[]];
  version: 1;
}

export type FlightDocumentScene = FlightDocumentScene2D | FlightDocumentScene3D;

export interface FlightDocumentScene2D {
  backgroundColor: number | null;
  kind: 'Scene2D';
  layouts: FlightDocumentLayoutDescriptor[];
  scene: FlightDocumentNode;
  tokens: FlightDocumentToken[];
}

export interface FlightDocumentScene3D {
  cameras: Scene3DDocumentCamera[];
  kind: 'Scene3D';
  layouts: FlightDocumentLayoutDescriptor[];
  lights: Scene3DDocumentLight[];
  scene: FlightDocumentNode;
  tokens: FlightDocumentToken[];
}

export interface FlightDocumentScene2DMaterialization extends SceneDocumentEntity {
  interactiveStateBindings: FlightDocumentInteractiveStateBinding<Node2D>[];
  layoutBindings: FlightDocumentLayoutBinding<Node2D>[];
  scene: Scene2D;
}

export interface FlightDocumentScene3DMaterialization extends SceneDocumentEntity {
  cameras: Camera3D[];
  interactiveStateBindings: FlightDocumentInteractiveStateBinding<Node3D>[];
  layoutBindings: FlightDocumentLayoutBinding<Node3D>[];
  lights: Scene3DLights;
  scene: Scene3D;
}

export type FlightDocumentText = string;

export const FlightDocumentRefusalReason = {
  AliasUnsupported: 'flight-document.unsupported.alias',
  AnchorUnsupported: 'flight-document.unsupported.anchor',
  BlockScalarUnsupported: 'flight-document.unsupported.block-scalar',
  CollectionEntriesLimitExceeded: 'flight-document.limit.collection-entries',
  DefaultSceneOutOfRange: 'flight-document.structure.default-scene-out-of-range',
  DocumentCodeUnitsLimitExceeded: 'flight-document.limit.document-code-units',
  DocumentSeparatorUnsupported: 'flight-document.unsupported.document-separator',
  DuplicateAmbientLight: 'flight-document.structure.duplicate-ambient-light',
  DuplicateDirectionalLight: 'flight-document.structure.duplicate-directional-light',
  DuplicateKey: 'flight-document.syntax.duplicate-key',
  ExpectedFlowDelimiter: 'flight-document.syntax.expected-flow-delimiter',
  ExpectedMappingEntry: 'flight-document.syntax.expected-mapping-entry',
  ExpectedMappingKey: 'flight-document.syntax.expected-mapping-key',
  ExpectedScalar: 'flight-document.syntax.expected-scalar',
  ExpectedValue: 'flight-document.syntax.expected-value',
  FieldInvalid: 'flight-document.field.invalid',
  FlowSequenceUnsupported: 'flight-document.unsupported.flow-sequence',
  InvalidDocument: 'flight-document.syntax.invalid-document',
  InvalidEscape: 'flight-document.syntax.invalid-escape',
  InteractiveStateExtensionKindDuplicate: 'flight-document.interactive-state.extension-kind.duplicate',
  InteractiveStateExtensionKindUnregistered: 'flight-document.interactive-state.extension-kind.unregistered',
  InteractiveStateTargetUnsupported: 'flight-document.interactive-state.target.unsupported',
  InteractiveStateTransitionKindUnregistered: 'flight-document.interactive-state.transition-kind.unregistered',
  KeyCodeUnitsLimitExceeded: 'flight-document.limit.key-code-units',
  LayoutTargetAmbiguous: 'flight-document.layout-target.ambiguous',
  LayoutTargetUnresolved: 'flight-document.layout-target.unresolved',
  MixedCollection: 'flight-document.syntax.mixed-collection',
  MultipleRootValues: 'flight-document.syntax.multiple-root-values',
  NestingDepthLimitExceeded: 'flight-document.limit.nesting-depth',
  NodeKindUnregistered: 'flight-document.node-kind.unregistered',
  NumberOutOfRange: 'flight-document.scalar.number-out-of-range',
  ResourceKindUnregistered: 'flight-document.resource-kind.unregistered',
  ResourceResolverUnregistered: 'flight-document.resource-resolver.unregistered',
  ResourceUnresolved: 'flight-document.resource.unresolved',
  RootIndentation: 'flight-document.syntax.root-indentation',
  RootKindMismatch: 'flight-document.structure.root-kind-mismatch',
  ScalarCodeUnitsLimitExceeded: 'flight-document.limit.scalar-code-units',
  ScalarInvalid: 'flight-document.scalar.invalid',
  ShapeCommandUnregistered: 'flight-document.shape-command.unregistered',
  ScenesEmpty: 'flight-document.structure.scenes-empty',
  StructureInvalid: 'flight-document.structure.invalid',
  TabCharacter: 'flight-document.syntax.tab-character',
  TagUnsupported: 'flight-document.unsupported.tag',
  TokenKeyDuplicate: 'flight-document.token.key-duplicate',
  TokenKeyInvalid: 'flight-document.token.key-invalid',
  TokenKindMismatch: 'flight-document.token.kind-mismatch',
  TokenModeInvalid: 'flight-document.token.mode-invalid',
  TokenModeUnresolved: 'flight-document.token.mode-unresolved',
  TokenReferenceCycle: 'flight-document.token.reference-cycle',
  TokenReferenceInvalid: 'flight-document.token.reference-invalid',
  TokenResolverUnregistered: 'flight-document.token-resolver.unregistered',
  TokenUnresolved: 'flight-document.token.unresolved',
  TokenValueInvalid: 'flight-document.token.value-invalid',
  TotalNodesLimitExceeded: 'flight-document.limit.total-nodes',
  TrailingFlowComma: 'flight-document.syntax.trailing-flow-comma',
  TrailingFlowContent: 'flight-document.syntax.trailing-flow-content',
  UnexpectedIndentation: 'flight-document.syntax.unexpected-indentation',
  UnexpectedToken: 'flight-document.syntax.unexpected-token',
  UnterminatedFlowMapping: 'flight-document.syntax.unterminated-flow-mapping',
  UnterminatedQuotedScalar: 'flight-document.syntax.unterminated-quoted-scalar',
  VersionUnsupported: 'flight-document.version.unsupported',
} as const;

export type FlightDocumentRefusalReason =
  (typeof FlightDocumentRefusalReason)[keyof typeof FlightDocumentRefusalReason];

export interface FlightDocumentRefusalExplanation extends SceneDocumentEntity {
  actual: number | null;
  column: number | null;
  kind: Kind | null;
  limit: number | null;
  line: number | null;
  mode: string | null;
  offset: number | null;
  path: string;
  reason: FlightDocumentRefusalReason;
  resourceKey: string | null;
  tokenKey: string | null;
  version: number | null;
}
