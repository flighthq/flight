import { getNodeAppearanceRevision, getNodeLocalTransformRevision, getNodeRuntime } from '@flighthq/node/contract';
import { createKeyedTable, withRegistryTableEntry } from '@flighthq/registry/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';
import type {
  FlightDocumentInteractiveStates,
  FlightDocumentSchemaRegistry,
  NodeInteractiveStateTransitionRequest,
} from '@flighthq/types/contract';
import { NodeInteractiveStateRefusalReason } from '@flighthq/types/contract';

import {
  applyNodeInteractiveStates,
  createNodeInteractiveStateBinding,
  disposeNodeInteractiveStateBinding,
  explainNodeInteractiveStateBinding,
} from './nodeInteractiveStateBinding';

describe('applyNodeInteractiveStates', () => {
  it('composes hover then pressed by property and treats disabled as exclusive', () => {
    const node = createDisplayObject();
    const states: FlightDocumentInteractiveStates = {
      disabled: { extensions: [], visible: false },
      hover: { alpha: 0.8, extensions: [], scaleX: 0.9 },
      pressed: { alpha: 0.6, extensions: [], x: 5 },
    };
    const binding = createNodeInteractiveStateBinding(node, states, createTestSchemas());
    expect(binding).not.toBeNull();
    const appearanceRevision = getNodeAppearanceRevision(node);
    const transformRevision = getNodeLocalTransformRevision(node);

    expect(applyNodeInteractiveStates(binding!, { disabled: false, hovered: true, pressed: false })).toBe(true);
    expect(node.alpha).toBe(0.8);
    expect(node.scaleX).toBe(0.9);
    expect(getNodeAppearanceRevision(node)).toBeGreaterThan(appearanceRevision);
    expect(getNodeLocalTransformRevision(node)).toBeGreaterThan(transformRevision);

    expect(applyNodeInteractiveStates(binding!, { disabled: false, hovered: true, pressed: true })).toBe(true);
    expect(node.alpha).toBe(0.6);
    expect(node.scaleX).toBe(0.9);
    expect(node.x).toBe(5);

    expect(applyNodeInteractiveStates(binding!, { disabled: true, hovered: true, pressed: true })).toBe(true);
    expect(node.alpha).toBe(1);
    expect(node.scaleX).toBe(1);
    expect(node.x).toBe(0);
    expect(node.visible).toBe(false);
    expect(getNodeRuntime(node).interactionSignals).toBeNull();
  });

  it('is idempotent for unchanged flags and dispose restores the captured base immediately', () => {
    const node = createDisplayObject();
    node.alpha = 0.7;
    const states: FlightDocumentInteractiveStates = {
      disabled: null,
      hover: { alpha: 0.4, extensions: [] },
      pressed: null,
    };
    const binding = createNodeInteractiveStateBinding(node, states, createTestSchemas())!;
    applyNodeInteractiveStates(binding, { disabled: false, hovered: true, pressed: false });
    const revision = getNodeAppearanceRevision(node);

    expect(applyNodeInteractiveStates(binding, { disabled: false, hovered: true, pressed: false })).toBe(true);
    expect(getNodeAppearanceRevision(node)).toBe(revision);

    disposeNodeInteractiveStateBinding(binding);
    expect(node.alpha).toBe(0.7);
    expect(applyNodeInteractiveStates(binding, { disabled: false, hovered: false, pressed: false })).toBe(false);
  });

  it('uses a registered transition and reverses from the current live value', () => {
    const node = createDisplayObject();
    const requests: Array<{ from: boolean | number; value: boolean | number }> = [];
    const schemas = createTestSchemas();
    schemas.interactiveStateTransitionSchemas = withRegistryTableEntry(
      schemas.interactiveStateTransitionSchemas,
      'acme.Transition',
      {
        createTransition: () => ({
          run: (request: Readonly<NodeInteractiveStateTransitionRequest>) => {
            requests.push({ from: request.from, value: request.value });
            request.apply(request.value === 0.5 ? 0.75 : request.value);
          },
        }),
        fields: [],
        kind: 'acme.Transition',
      },
    );
    const states: FlightDocumentInteractiveStates = {
      disabled: null,
      hover: { alpha: 0.5, extensions: [] },
      pressed: null,
    };
    const binding = createNodeInteractiveStateBinding(node, states, schemas, {
      fields: {},
      kind: 'acme.Transition',
    })!;

    applyNodeInteractiveStates(binding, { disabled: false, hovered: true, pressed: false });
    applyNodeInteractiveStates(binding, { disabled: false, hovered: false, pressed: false });

    expect(requests).toEqual([
      { from: 1, value: 0.5 },
      { from: 0.75, value: 1 },
    ]);
    expect(node.alpha).toBe(1);
  });

  it('returns null and explains missing extension and transition handlers', () => {
    const node = createDisplayObject();
    const states: FlightDocumentInteractiveStates = {
      disabled: null,
      hover: { extensions: [{ fields: {}, kind: 'acme.Missing' }] },
      pressed: null,
    };
    const schemas = createTestSchemas();

    expect(createNodeInteractiveStateBinding(node, states, schemas)).toBeNull();
    expect(explainNodeInteractiveStateBinding(node, states, schemas)).toMatchObject({
      kind: 'acme.Missing',
      reason: NodeInteractiveStateRefusalReason.ExtensionKindUnregistered,
    });

    states.hover = { alpha: 0.5, extensions: [] };
    expect(
      explainNodeInteractiveStateBinding(node, states, schemas, { fields: {}, kind: 'acme.MissingTransition' }),
    ).toMatchObject({
      kind: 'acme.MissingTransition',
      reason: NodeInteractiveStateRefusalReason.TransitionKindUnregistered,
    });
  });

  it('applies registered extensions in authored order and restores their captured fields on dispose', () => {
    const node = createDisplayObject();
    const values = { first: 2, second: 3 };
    const calls: string[] = [];
    const schemas = createTestSchemas();
    for (const kind of ['first', 'second'] as const) {
      schemas.interactiveStateExtensionSchemas = withRegistryTableEntry(
        schemas.interactiveStateExtensionSchemas,
        kind,
        {
          createExtension: () => ({
            apply: (fields) => {
              calls.push(kind + ':' + String(fields['value']));
              const value = fields['value'];
              if (typeof value !== 'number') return false;
              values[kind] = value;
              return true;
            },
            capture: (out) => {
              out['value'] = values[kind];
              return true;
            },
            dispose: () => calls.push(kind + ':disposed'),
          }),
          fields: [{ name: 'value', required: true, validate: (value) => typeof value === 'number' }],
          isSupported: () => true,
          kind,
        },
      );
    }
    const states: FlightDocumentInteractiveStates = {
      disabled: null,
      hover: {
        extensions: [
          { fields: { value: 20 }, kind: 'second' },
          { fields: { value: 10 }, kind: 'first' },
        ],
      },
      pressed: null,
    };
    const binding = createNodeInteractiveStateBinding(node, states, schemas)!;

    applyNodeInteractiveStates(binding, { disabled: false, hovered: true, pressed: false });
    expect(calls).toEqual(['second:20', 'first:10']);

    disposeNodeInteractiveStateBinding(binding);
    expect(values).toMatchObject({ first: 2, second: 3 });
    expect(calls.slice(2)).toEqual(['second:3', 'second:disposed', 'first:2', 'first:disposed']);
  });
});

describe('createNodeInteractiveStateBinding', () => {
  it('creates an inert binding without mutating its node', () => {
    const node = createDisplayObject();
    const binding = createNodeInteractiveStateBinding(
      node,
      { disabled: null, hover: { alpha: 0.5, extensions: [] }, pressed: null },
      createTestSchemas(),
    );

    expect(binding).not.toBeNull();
    expect(node.alpha).toBe(1);
    expect(getNodeRuntime(node).interactionSignals).toBeNull();
  });
});

describe('disposeNodeInteractiveStateBinding', () => {
  it('is idempotent', () => {
    const node = createDisplayObject();
    const binding = createNodeInteractiveStateBinding(
      node,
      { disabled: null, hover: { alpha: 0.5, extensions: [] }, pressed: null },
      createTestSchemas(),
    )!;
    applyNodeInteractiveStates(binding, { disabled: false, hovered: true, pressed: false });

    disposeNodeInteractiveStateBinding(binding);
    disposeNodeInteractiveStateBinding(binding);

    expect(node.alpha).toBe(1);
  });
});

describe('explainNodeInteractiveStateBinding', () => {
  it('returns null when every referenced handler is available', () => {
    expect(
      explainNodeInteractiveStateBinding(
        createDisplayObject(),
        { disabled: null, hover: { alpha: 0.5, extensions: [] }, pressed: null },
        createTestSchemas(),
      ),
    ).toBeNull();
  });

  it('names a core property unsupported by the target', () => {
    const node = createDisplayObject();
    Reflect.deleteProperty(node, 'x');

    expect(
      explainNodeInteractiveStateBinding(
        node,
        { disabled: null, hover: { extensions: [], x: 5 }, pressed: null },
        createTestSchemas(),
      ),
    ).toMatchObject({
      kind: node.kind,
      property: 'x',
      reason: NodeInteractiveStateRefusalReason.PropertyTargetUnsupported,
    });
  });
});

function createTestSchemas(): FlightDocumentSchemaRegistry {
  return {
    interactiveStateExtensionSchemas: createKeyedTable('flight-document.interactive-state-extension', 'none'),
    interactiveStateTransitionSchemas: createKeyedTable('flight-document.interactive-state-transition', 'none'),
    nodeSchemas: createKeyedTable('flight-document.node', 'none'),
    resourceSchemas: createKeyedTable('flight-document.resource', 'none'),
    shapeCommandSchemas: createKeyedTable('flight-document.shape-command', 'none'),
  };
}
