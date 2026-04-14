import { effect } from '../signals/index.js';
import { getDisposalScope, setDisposalScope, type Disposable } from '../signals/tracking.js';

/**
 * Reactively render dynamic content (DOM nodes, arrays, or primitives) into a parent.
 * Used when an expression may produce DOM elements (e.g., .map() returning compiled JSX IIFEs).
 *
 * Unlike reactiveText (which only handles strings), this handles:
 * - Single DOM nodes
 * - Arrays of DOM nodes (possibly with nulls)
 * - Primitive values (strings, numbers) — rendered as text nodes
 * - null/undefined/false — skipped
 */
export function reactiveContent(
  parent: Node,
  anchor: Node,
  getter: () => any,
): void {
  let currentNodes: Node[] = [];
  let disposals: Disposable[] | null = null;

  effect(() => {
    // Cleanup previous render
    if (disposals) {
      for (let i = 0; i < disposals.length; i++) disposals[i].dispose();
    }
    for (let i = 0; i < currentNodes.length; i++) {
      const node = currentNodes[i];
      if (node.parentNode) parent.removeChild(node);
    }
    currentNodes.length = 0;

    // Create new content with disposal tracking for inner computations/effects.
    // The getter MUST run with the effect active so signal reads are tracked.
    // Reuse disposals array when possible to avoid allocation.
    if (!disposals) disposals = [];
    const outerScope = getDisposalScope();
    setDisposalScope(disposals);
    let value: any;
    try {
      value = getter();
    } finally {
      setDisposalScope(outerScope);
    }

    // Insert content — handle arrays and single values without wrapping
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        if (item == null || item === false || item === true) continue;
        if (Array.isArray(item)) {
          // Handle nested arrays (e.g., .map() returning arrays)
          for (let j = 0; j < item.length; j++) {
            const inner = item[j];
            if (inner == null || inner === false || inner === true) continue;
            const node = inner instanceof Node ? inner : document.createTextNode(String(inner));
            parent.insertBefore(node, anchor);
            currentNodes.push(node);
          }
        } else {
          const node = item instanceof Node ? item : document.createTextNode(String(item));
          parent.insertBefore(node, anchor);
          currentNodes.push(node);
        }
      }
    } else if (value != null && value !== false && value !== true) {
      const node = value instanceof Node ? value : document.createTextNode(String(value));
      parent.insertBefore(node, anchor);
      currentNodes.push(node);
    }
  });
}
