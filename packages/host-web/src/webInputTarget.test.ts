import { EntityRuntimeKey } from '@flighthq/types/contract';

import { webHost } from './webHost';
import { createWebInputTargetHandle, resetWebInputTargetBackendForTest, webInputTargetBackend } from './webInputTarget';

afterEach(() => resetWebInputTargetBackendForTest());

describe('createWebInputTargetHandle', () => {
  it('constructs an opaque Entity bound to the provider', () => {
    const element = document.createElement('div');
    const target = createWebInputTargetHandle(element);

    expect(EntityRuntimeKey in target).toBe(true);
    webInputTargetBackend.prepare(target);
    expect(element.style.touchAction).toBe('none');
  });
});

describe('resetWebInputTargetBackendForTest', () => {
  it('forgets existing target bindings', () => {
    const element = document.createElement('div');
    const target = createWebInputTargetHandle(element);

    resetWebInputTargetBackendForTest();
    webInputTargetBackend.prepare(target);

    expect(element.style.touchAction).not.toBe('none');
  });
});

describe('webInputTargetBackend', () => {
  it('prepares the bound element without exposing DOM through the neutral contract', () => {
    const element = document.createElement('div');

    webInputTargetBackend.prepare(createWebInputTargetHandle(element));

    expect(element.style.touchAction).toBe('none');
    expect(element.style.userSelect).toBe('none');
    expect(element.style.webkitUserSelect).toBe('none');
    expect((element.style as CSSStyleDeclaration & { webkitTapHighlightColor: string }).webkitTapHighlightColor).toBe(
      'transparent',
    );
  });

  it('applies the canvas-only compositing preparation behind the provider boundary', () => {
    const canvas = document.createElement('canvas');
    const div = document.createElement('div');

    webInputTargetBackend.prepare(createWebInputTargetHandle(canvas));
    webInputTargetBackend.prepare(createWebInputTargetHandle(div));

    expect(canvas.style.transform).toBe('translateZ(0)');
    expect(div.style.transform).toBe('');
  });

  it('is an Entity provider value', () => {
    expect(EntityRuntimeKey in webInputTargetBackend).toBe(true);
    expect(webHost.input.target).toBe(webInputTargetBackend);
  });
});
