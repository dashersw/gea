import { getActiveEffect, type DepSet } from './tracking.js';
import { _batch, queueEffect } from './batch.js';

export interface Signal<T> {
  get value(): T;
  set value(v: T);
  peek(): T;
  subscribe(fn: () => void): () => void;
  _notify(): void;
  _subs: DepSet | null;
}

// Reusable snapshot buffers — avoids Array.from() allocation per notify.
// Stack handles re-entrant notification (effect triggers another signal write).
let _snapStack: (() => void)[][] = [[]];
let _snapDepth = 0;

/**
 * Class-based signal for minimal allocation.
 * One object per signal instead of three (return obj + depRef + notifySubs closure).
 */
class SignalImpl<T> implements Signal<T>, DepSet {
  _v: T;
  _sub1: (() => void) | null = null;
  _subs: Set<() => void> | null = null;

  constructor(v: T) {
    this._v = v;
  }

  get value(): T {
    const active = getActiveEffect();
    if (active !== undefined) {
      this.add(active.fn);
      active.deps.push(this);
    }
    return this._v;
  }

  set value(v: T) {
    if (Object.is(this._v, v)) return;
    this._v = v;
    this._notify();
  }

  peek(): T {
    return this._v;
  }

  subscribe(fn: () => void): () => void {
    this.add(fn);
    return () => this.delete(fn);
  }

  _notify(): void {
    const subs = this._subs;
    const sub1 = this._sub1;
    if (subs) {
      if (subs.size === 0) return;
      if (_batch.depth > 0) {
        for (const fn of subs) queueEffect(fn);
      } else {
        // Snapshot into reusable buffer before iterating: effects may
        // unsubscribe/re-subscribe during their run, which would cause
        // Set iteration to revisit re-added entries and loop infinitely.
        // Uses a stack of buffers for re-entrant safety.
        if (_snapDepth >= _snapStack.length) _snapStack.push([]);
        const snap = _snapStack[_snapDepth++];
        let k = 0;
        for (const fn of subs) snap[k++] = fn;
        for (let i = 0; i < k; i++) snap[i]();
        snap.length = 0;
        _snapDepth--;
      }
    } else if (sub1 !== null) {
      if (_batch.depth > 0) {
        queueEffect(sub1);
      } else {
        sub1();
      }
    }
  }

  // DepSet interface
  delete(fn: () => void): boolean {
    if (this._subs) return this._subs.delete(fn);
    if (this._sub1 === fn) { this._sub1 = null; return true; }
    return false;
  }

  add(fn: () => void): void {
    if (this._subs) { this._subs.add(fn); return; }
    if (this._sub1 === null) { this._sub1 = fn; return; }
    if (this._sub1 !== fn) {
      const s = new Set<() => void>();
      s.add(this._sub1);
      s.add(fn);
      this._subs = s;
      this._sub1 = null;
    }
  }
}

export function signal<T>(initialValue: T): Signal<T> {
  return new SignalImpl(initialValue);
}
