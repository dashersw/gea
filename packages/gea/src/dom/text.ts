import { computation } from '../signals/effect.js';

export function createTextNode(value: string): Text {
  return document.createTextNode(value);
}

export function reactiveText(fn: () => unknown): Text {
  const node = document.createTextNode('');
  computation(fn as () => string, (v) => {
    node.data = typeof v === 'string' ? v : String(v);
  });
  return node;
}
