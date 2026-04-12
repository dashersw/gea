/**
 * O(1) selector attribute: instead of N computations checking `signal === id`,
 * maintains a reverse map and only updates 2 elements per signal change.
 *
 * Usage: selectorAttr(el, "className", selectedSignal, rowId, "danger", "")
 */
import type { Signal } from '../signals/signal.js';
import { getDisposalScope } from '../signals/tracking.js';

interface SelectorEntry {
  el: HTMLElement;
  attr: string;
  trueVal: any;
  falseVal: any;
  // Inline disposal — avoids allocating a separate closure per entry
  _map: Map<any, SelectorEntry> | null;
  _key: any;
  dispose(): void;
}

// Per-signal reverse map: matchValue → entry
const selectorMaps = new WeakMap<Signal<any>, Map<any, SelectorEntry>>();

// Previous value stored directly on signal via expando — faster than WeakMap lookup
const PREV_KEY = '__selPrev';

// Per-signal subscription tracking (only subscribe once per signal)
const subscribed = new WeakSet<Signal<any>>();

function applyAttr(el: HTMLElement, attr: string, value: any): void {
  if (attr === 'className') {
    el.className = value;
  } else {
    (el as any)[attr] = value;
  }
}

export function selectorAttr(
  el: HTMLElement,
  attr: string,
  sig: Signal<any>,
  matchValue: any,
  trueVal: any,
  falseVal: any,
): void {
  // Get or create the reverse map for this signal
  let map = selectorMaps.get(sig);
  if (!map) {
    map = new Map();
    selectorMaps.set(sig, map);
  }

  // Register this element — entry doubles as disposable (no extra closure)
  const entry: SelectorEntry = {
    el, attr, trueVal, falseVal,
    _map: map, _key: matchValue,
    dispose() { if (this._map) { this._map.delete(this._key); this._map = null; } },
  };
  map.set(matchValue, entry);

  // Auto-cleanup when the owning scope (e.g. keyed-list row) is disposed
  const scope = getDisposalScope();
  if (scope) {
    scope.push(entry);  // Entry itself is the disposable — no extra allocation
  }

  // Set initial value — skip writing falseVal when it's falsy (empty string, null, etc.)
  // since freshly-cloned template elements already have that as their default state.
  // This saves 1 redundant DOM write per non-matching row on creation
  // (e.g. 999 out of 1000 rows for a selected-row pattern).
  const current = sig.peek();
  if (current === matchValue) {
    applyAttr(el, attr, trueVal);
  } else if (falseVal) {
    applyAttr(el, attr, falseVal);
  }

  // Subscribe to signal (once per signal)
  if (!subscribed.has(sig)) {
    subscribed.add(sig);
    (sig as any)[PREV_KEY] = current;

    sig.subscribe(() => {
      const m = selectorMaps.get(sig);
      if (!m) return;

      const oldVal = (sig as any)[PREV_KEY];
      const newVal = sig.peek();
      (sig as any)[PREV_KEY] = newVal;

      // Update old selection → falseVal
      if (oldVal !== undefined && oldVal !== null) {
        const oldEntry = m.get(oldVal);
        if (oldEntry) applyAttr(oldEntry.el, oldEntry.attr, oldEntry.falseVal);
      }

      // Update new selection → trueVal
      if (newVal !== undefined && newVal !== null) {
        const newEntry = m.get(newVal);
        if (newEntry) applyAttr(newEntry.el, newEntry.attr, newEntry.trueVal);
      }
    });
  }
}

/**
 * Cleanup: remove an entry from the selector map (called when a row is disposed)
 */
export function selectorRemove(sig: Signal<any>, matchValue: any): void {
  const map = selectorMaps.get(sig);
  if (map) map.delete(matchValue);
}
