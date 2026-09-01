import { getNodeLocalBoundsRectangle } from '@flighthq/node/contract';

import { registerDefaultShapeBoundsCommands } from './registerDefaultShapeBoundsCommands';
import { createShape } from './shape';
import {
  clearShapeBoundsCommands,
  getShapeBoundsCommand,
  getShapeBoundsCommandRegistryRevision,
  registerShapeBoundsCommand,
  unregisterShapeBoundsCommand,
} from './shapeBoundsRegistry';

describe('clearShapeBoundsCommands', () => {
  it('removes all registered commands and bumps the revision', () => {
    registerDefaultShapeBoundsCommands();
    const revision = getShapeBoundsCommandRegistryRevision();
    expect(getShapeBoundsCommand('moveTo')).not.toBeNull();

    clearShapeBoundsCommands();

    expect(getShapeBoundsCommand('moveTo')).toBeNull();
    expect(getShapeBoundsCommandRegistryRevision()).toBe(revision + 1);
  });
});

describe('getShapeBoundsCommand', () => {
  it('distinguishes an absent key from an explicitly geometry-free command', () => {
    const key = '__test.null-bounds__';
    expect(getShapeBoundsCommand(key)).toBeNull();

    registerShapeBoundsCommand({ fillBounds: null, key: key as never, strokeBounds: null });

    expect(getShapeBoundsCommand(key)).toMatchObject({ fillBounds: null, key, strokeBounds: null });
  });
});

describe('getShapeBoundsCommandRegistryRevision', () => {
  it('invalidates an already-cached Shape when a missing key becomes bound', () => {
    const key = '__test.late-bounds__';
    const shape = createShape({ data: { commands: [key, 2, 10, 20] } });
    const before = getNodeLocalBoundsRectangle(shape);
    expect(before).toMatchObject({ height: 0, width: 0, x: 0, y: 0 });

    registerShapeBoundsCommand({
      fillBounds: (context, command) =>
        context.expandPoint(command.getArgument(0) as number, command.getArgument(1) as number),
      key: key as never,
      strokeBounds: null,
    });

    expect(getNodeLocalBoundsRectangle(shape)).toMatchObject({ height: 0, width: 0, x: 10, y: 20 });
  });

  it('does not bump when the same key is rebound to the same callbacks', () => {
    const key = '__test.stable-bounds__';
    const fillBounds = vi.fn();
    const command = { fillBounds, key: key as never, strokeBounds: null };
    registerShapeBoundsCommand(command);
    const revision = getShapeBoundsCommandRegistryRevision();

    registerShapeBoundsCommand(command);

    expect(getShapeBoundsCommandRegistryRevision()).toBe(revision);
  });
});

describe('registerShapeBoundsCommand', () => {
  it('bumps the revision when the callbacks bound to a key change', () => {
    const key = '__test.replace-bounds__';
    registerShapeBoundsCommand({ fillBounds: vi.fn(), key: key as never, strokeBounds: null });
    const revision = getShapeBoundsCommandRegistryRevision();

    registerShapeBoundsCommand({ fillBounds: vi.fn(), key: key as never, strokeBounds: null });

    expect(getShapeBoundsCommandRegistryRevision()).toBe(revision + 1);
  });
});

describe('unregisterShapeBoundsCommand', () => {
  it('bumps only when a binding was removed', () => {
    const key = '__test.unregister-bounds__';
    registerShapeBoundsCommand({ fillBounds: null, key: key as never, strokeBounds: null });
    const revision = getShapeBoundsCommandRegistryRevision();

    unregisterShapeBoundsCommand(key);
    expect(getShapeBoundsCommandRegistryRevision()).toBe(revision + 1);

    unregisterShapeBoundsCommand(key);
    expect(getShapeBoundsCommandRegistryRevision()).toBe(revision + 1);
  });
});
