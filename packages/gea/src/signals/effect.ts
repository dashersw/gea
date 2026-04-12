import { type EffectNode, type DepSet, pushEffect, popEffect, getActiveEffect, getDisposalScope, type Disposable } from './tracking.js';

export function effect(fn: () => void, isComputed?: boolean): () => void {
  const parent = getActiveEffect() || null;

  const node: EffectNode = {
    fn: run,
    deps: [],
    children: [],
    parent,
    disposed: false,
    _parentIdx: -1,
  };

  if (parent) {
    node._parentIdx = parent.children.length;
    parent.children.push(node);
  }

  function run(): void {
    if (node.disposed) return;
    cleanup(node);
    pushEffect(node);
    try {
      fn();
    } finally {
      popEffect();
    }
  }

  if (isComputed) {
    (run as any).__computed = true;
  }

  run();

  return () => dispose(node);
}

function cleanup(node: EffectNode): void {
  const children = node.children;
  for (let i = 0; i < children.length; i++) {
    disposeChild(children[i]);
  }
  children.length = 0;

  const deps = node.deps;
  const fn = node.fn;
  for (let i = 0; i < deps.length; i++) {
    deps[i].delete(fn);
  }
  deps.length = 0;
}

function disposeChild(node: EffectNode): void {
  if (node.disposed) return;
  node.disposed = true;

  const children = node.children;
  for (let i = 0; i < children.length; i++) {
    disposeChild(children[i]);
  }
  children.length = 0;

  const deps = node.deps;
  const fn = node.fn;
  for (let i = 0; i < deps.length; i++) {
    deps[i].delete(fn);
  }
  deps.length = 0;
  node.parent = null;
}

function dispose(node: EffectNode): void {
  if (node.disposed) return;
  node.disposed = true;
  cleanup(node);

  if (node.parent) {
    const children = node.parent.children;
    const idx = node._parentIdx;
    if (idx !== -1 && idx < children.length) {
      const last = children.length - 1;
      if (idx !== last) {
        const moved = children[last];
        children[idx] = moved;
        moved._parentIdx = idx;
      }
      children.pop();
    }
    node.parent = null;
  }
}

// Shared empty array — computations never have child effects, so we avoid
// allocating a new empty array per instance.
const EMPTY_CHILDREN: EffectNode[] = [];

/**
 * Class-based computation that directly implements the EffectNode interface.
 * This avoids a separate _node object allocation per computation.
 * Each instance IS the EffectNode used for dependency tracking.
 */
class Computation<T> implements Disposable, EffectNode {
  // ── EffectNode fields (inline — no separate object) ──
  fn: () => void;         // The run function (stored for dep tracking)
  deps: DepSet[];         // Collected during tracking, reused across runs
  children: EffectNode[]; // Always empty for computations (shared ref)
  parent: EffectNode | null;
  disposed: boolean;
  _parentIdx: number;

  // ── Computation-specific fields ──
  _getter: () => T;
  _apply: (v: T) => void;
  _dep: DepSet | null;      // Fast path: single dependency
  _deps: DepSet[] | null;   // Slow path: multiple dependencies
  _depsBuf: DepSet[];       // Ping-pong buffer to avoid slice() allocation
  _prev: T;
  _initialized: boolean;

  constructor(fn: () => T, apply: (v: T) => void) {
    this._getter = fn;
    this._apply = apply;
    this._dep = null;
    this._deps = null;
    this._depsBuf = null!;
    this._prev = undefined as T;
    this._initialized = false;

    // Inline EffectNode — no separate allocation
    this.fn = this.run.bind(this);
    this.deps = [];
    this.children = EMPTY_CHILDREN;
    this.parent = null;
    this.disposed = false;
    this._parentIdx = -1;
  }

  run(): void {
    if (this.disposed) return;

    // Cleanup old deps
    const r = this.fn;
    if (this._dep) { this._dep.delete(r); this._dep = null; }
    if (this._deps) {
      for (let i = 0; i < this._deps.length; i++) this._deps[i].delete(r);
      this._deps = null;
    }

    // Reuse deps array instead of allocating new one each run
    this.deps.length = 0;

    pushEffect(this);  // this IS the EffectNode
    let val: T;
    try {
      val = this._getter();
    } finally {
      popEffect();
    }

    // Capture deps
    const collected = this.deps.length;
    if (collected === 0) {
      this._prev = val;
      this._apply(val);
      this.disposed = true;
      return;
    } else if (collected === 1) {
      this._dep = this.deps[0];
    } else {
      // Ping-pong: swap deps into _depsBuf, reuse the old _depsBuf as deps
      const buf = this._depsBuf || (this._depsBuf = []);
      buf.length = collected;
      for (let i = 0; i < collected; i++) buf[i] = this.deps[i];
      this._deps = buf;
      this._depsBuf = this.deps;
      this.deps = [];
    }

    if (!this._initialized || !Object.is(val, this._prev)) {
      this._initialized = true;
      this._prev = val;
      this._apply(val);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const r = this.fn;
    if (this._dep) { this._dep.delete(r); this._dep = null; }
    if (this._deps) {
      for (let i = 0; i < this._deps.length; i++) this._deps[i].delete(r);
      this._deps = null;
    }
  }
}

const _noopDispose = () => {};

export function computation<T>(fn: () => T, apply: (v: T) => void): () => void {
  const c = new Computation(fn, apply);
  c.run();

  if (c.disposed) return _noopDispose;

  const scope = getDisposalScope();
  if (scope) scope.push(c);

  return () => c.dispose();
}

/**
 * Merged computation: creates a single EffectNode that tracks N getter/setter
 * pairs. Instead of N separate Computation objects (each with its own
 * EffectNode, deps array, prevValue, etc.), this allocates one shared node.
 *
 * Each pair's getter is evaluated; if any getter has reactive deps, the whole
 * merged computation stays alive. On re-run, only pairs whose values changed
 * (via Object.is) re-invoke their setter.
 *
 * If ALL getters produce 0 deps on first run, the merged computation
 * self-disposes (same as individual Computation behaviour).
 */
class MergedComputation implements Disposable, EffectNode {
  // ── EffectNode fields (inline) ──
  fn: () => void;
  deps: DepSet[];
  children: EffectNode[];
  parent: EffectNode | null;
  disposed: boolean;
  _parentIdx: number;

  // ── MergedComputation-specific ──
  pairs: [() => any, (v: any) => void][];
  prevValues: any[];
  _initialized: boolean;

  constructor(pairs: [() => any, (v: any) => void][]) {
    this.pairs = pairs;
    this.prevValues = new Array(pairs.length);
    this._initialized = false;

    this.fn = this.run.bind(this);
    this.deps = [];
    this.children = EMPTY_CHILDREN;
    this.parent = null;
    this.disposed = false;
    this._parentIdx = -1;
  }

  run(): void {
    if (this.disposed) return;

    // Cleanup old deps
    const r = this.fn;
    const oldDeps = this.deps;
    for (let i = 0; i < oldDeps.length; i++) oldDeps[i].delete(r);

    this.deps.length = 0;

    pushEffect(this);
    try {
      const pairs = this.pairs;
      const prevValues = this.prevValues;
      if (!this._initialized) {
        this._initialized = true;
        for (let i = 0; i < pairs.length; i++) {
          const val = pairs[i][0]();
          prevValues[i] = val;
          pairs[i][1](val);
        }
      } else {
        for (let i = 0; i < pairs.length; i++) {
          const val = pairs[i][0]();
          if (!Object.is(val, prevValues[i])) {
            prevValues[i] = val;
            pairs[i][1](val);
          }
        }
      }
    } finally {
      popEffect();
    }

    // Self-dispose if no deps were collected (all constant)
    if (this.deps.length === 0) {
      this.disposed = true;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const r = this.fn;
    const deps = this.deps;
    for (let i = 0; i < deps.length; i++) deps[i].delete(r);
    this.deps.length = 0;
  }
}

export function mergedComputation(pairs: [() => any, (v: any) => void][]): () => void {
  const mc = new MergedComputation(pairs);
  mc.run();

  if (mc.disposed) return _noopDispose;

  const scope = getDisposalScope();
  if (scope) scope.push(mc);

  return () => mc.dispose();
}

/**
 * Lightweight signal-to-setter binding. No Computation object, no deps tracking,
 * no bind(). Just a direct subscription on the signal that calls the apply function.
 * Use when the getter is a simple `signal.value` read (single dependency, known statically).
 */
export function signalEffect(sig: DepSet & { peek(): any }, apply: (v: any) => void): () => void {
  apply(sig.peek());
  const fn = () => apply(sig.peek());
  sig.add(fn);
  const d = { dispose() { sig.delete(fn); } };
  const scope = getDisposalScope();
  if (scope) scope.push(d);
  return () => d.dispose();
}
