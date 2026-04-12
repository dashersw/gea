import { effect } from '../signals/index.js';
import { getActiveEffect, pushEffect, popEffect, setDisposalScope, getDisposalScope, type Disposable } from '../signals/tracking.js';

export function conditional(
  parent: Node,
  anchor: Node,
  conditionFn: () => boolean,
  createFn: () => Node,
  elseFn?: () => Node,
): void {
  // For fragment returns, we track an array of child nodes since DocumentFragment
  // children are moved to the parent on insertBefore and the fragment becomes empty.
  let currentNodes: Node[] | null = null;
  let elseNodes: Node[] | null = null;
  let disposals: Disposable[] | null = null;
  let elseDisposals: Disposable[] | null = null;

  // Closure-scoped result vars — avoids tuple array allocation per branch toggle
  // while remaining safe for nested/recursive conditionals (each instance has its own)
  let _rNode: Node | null = null;
  let _rDisposals: Disposable[] | null = null;

  const isFragment = typeof DocumentFragment !== 'undefined'
    ? (n: Node): n is DocumentFragment => n instanceof DocumentFragment
    : (_n: Node): _n is DocumentFragment => false;

  function createDetached(fn: () => Node): void {
    const d: Disposable[] = [];
    const outerNode = getActiveEffect();
    if (outerNode) popEffect();
    const outerScope = getDisposalScope();
    setDisposalScope(d);
    try {
      _rNode = fn();
    } finally {
      setDisposalScope(outerScope);
      if (outerNode) pushEffect(outerNode);
    }
    _rDisposals = d;
  }

  function cleanupNodes(nodes: Node[]) {
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].parentNode) parent.removeChild(nodes[i]);
    }
  }

  function cleanupTrue() {
    if (currentNodes) {
      cleanupNodes(currentNodes);
      currentNodes = null;
      if (disposals) {
        for (let i = 0; i < disposals.length; i++) disposals[i].dispose();
        disposals = null;
      }
    }
  }

  function cleanupFalse() {
    if (elseNodes) {
      cleanupNodes(elseNodes);
      elseNodes = null;
      if (elseDisposals) {
        for (let i = 0; i < elseDisposals.length; i++) elseDisposals[i].dispose();
        elseDisposals = null;
      }
    }
  }

  function collectAndInsert(node: Node): Node[] {
    // If the node is a DocumentFragment, collect its children before inserting
    // because insertBefore moves them out of the fragment.
    if (isFragment(node)) {
      const children = Array.from(node.childNodes);
      parent.insertBefore(node, anchor);
      return children;
    }
    parent.insertBefore(node, anchor);
    return [node];
  }

  const dispose = effect(() => {
    const show = !!conditionFn();
    if (show) {
      if (elseFn) cleanupFalse();
      if (!currentNodes) {
        createDetached(createFn);
        const node = _rNode;
        const d = _rDisposals;
        _rNode = null;
        _rDisposals = null;
        if (node) {
          disposals = d;
          currentNodes = collectAndInsert(node);
        } else {
          // createFn returned null (e.g., dependent computed not yet updated).
          // Dispose anything created and leave currentNodes null so the next
          // run of this effect will retry.
          if (d) for (let i = 0; i < d.length; i++) d[i].dispose();
        }
      }
    } else {
      cleanupTrue();
      if (elseFn && !elseNodes) {
        createDetached(elseFn);
        const node = _rNode;
        const d = _rDisposals;
        _rNode = null;
        _rDisposals = null;
        if (node) {
          elseDisposals = d;
          elseNodes = collectAndInsert(node);
        } else {
          if (d) for (let i = 0; i < d.length; i++) d[i].dispose();
        }
      }
    }
  });

  // Register with disposal scope so parent conditionals can clean up nested ones.
  // Must also clean up branches (which hold their own disposal scopes).
  const scope = getDisposalScope();
  if (scope) scope.push({
    dispose() {
      cleanupTrue();
      cleanupFalse();
      dispose();
    },
  });
}
