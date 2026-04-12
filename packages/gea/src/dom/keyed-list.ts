import { effect, signal, type Signal } from '../signals/index.js';
import { getActiveEffect, pushEffect, popEffect, setDisposalScope } from '../signals/tracking.js';

// Shared sentinels for extracting raw arrays and dirty hints from wrapArray proxies
const RAW_ARRAY = Symbol.for('gea.rawArray');
const DIRTY_INDICES = Symbol.for('gea.dirty');

interface KeyedItem {
  node: Node | null;
  item: unknown;
  _itemSig: Signal<unknown> | null;  // Direct signal ref — avoids setItem closure
  _idxSig: Signal<number> | null;    // Direct signal ref — avoids setIndex closure
  _disposals: { dispose(): void }[] | null; // Stored on entry — avoids per-item dispose closure
  _oldIdx: number; // Temp field used during general reconciliation (avoids Map alloc)
}

// Shared helpers — avoid per-item closure overhead
function setEntryItem(entry: KeyedItem, v: unknown): void {
  entry._itemSig!.value = v;
  entry.item = v;
}

function setEntryIndex(entry: KeyedItem, v: number): void {
  if (entry._idxSig) entry._idxSig.value = v;
}

function disposeEntry(entry: KeyedItem): void {
  const disposals = entry._disposals;
  if (disposals) {
    for (let i = 0; i < disposals.length; i++) disposals[i].dispose();
    disposals.length = 0;
  }
  entry.node = null;
  entry.item = null;
  entry._itemSig = null;
  entry._idxSig = null;
  entry._disposals = null;
}

export function keyedList(
  parent: Node,
  anchor: Node,
  itemsFn: () => unknown[],
  keyFn: (item: unknown, index: number) => unknown,
  createFn: (getter: () => unknown, index?: () => number) => Node,
  noIndex?: boolean,
): void {
  const keyMap = new Map<unknown, KeyedItem>();
  let currentKeys: unknown[] = [];

  effect(() => {
    const items = itemsFn();
    const newLen = items.length;

    // --- Targeted reconciliation via dirty index hints ---
    // When only a few array indices changed (e.g. swap), skip the O(n) key
    // extraction and comparison entirely. The wrapped array proxy tracks
    // which indices were written and exposes them via DIRTY_INDICES.
    const dirty: number[] | null | undefined = (items as any)[DIRTY_INDICES];
    if (dirty !== undefined && dirty !== null && dirty.length > 0 && dirty.length <= 4 && newLen === currentKeys.length) {
      const rawArr = (items as any)[RAW_ARRAY] || items;
      const outerNode = getActiveEffect();
      if (outerNode) popEffect();

      // Extract keys only at dirty positions
      let allMatch = true;
      for (let d = 0; d < dirty.length; d++) {
        const idx = dirty[d];
        if (idx < 0 || idx >= newLen) { allMatch = false; break; }
        const newKey = keyFn(rawArr[idx], idx);
        if (newKey === currentKeys[idx]) {
          // Key didn't change at this index — item replaced with same key (in-place update)
          continue;
        }
        allMatch = false;
      }

      if (outerNode) pushEffect(outerNode);

      if (allMatch) {
        // Keys unchanged — no DOM reorder needed (e.g. label update on same items)
        return;
      }

      // Check for swap: exactly 2 dirty indices whose keys exchanged positions
      if (dirty.length === 2) {
        const idxA = dirty[0], idxB = dirty[1];
        if (idxA >= 0 && idxA < newLen && idxB >= 0 && idxB < newLen) {
          const oldKeyA = currentKeys[idxA];
          const oldKeyB = currentKeys[idxB];
          // After swap, position A has old B's key and vice versa
          if (oldKeyA === currentKeys[idxB] || oldKeyB === currentKeys[idxA]) {
            // Verify by extracting new keys at those positions
            if (outerNode) popEffect();
            const newKeyA = keyFn(rawArr[idxA], idxA);
            const newKeyB = keyFn(rawArr[idxB], idxB);
            if (outerNode) pushEffect(outerNode);

            if (newKeyA === oldKeyB && newKeyB === oldKeyA) {
              // Confirmed swap — do targeted DOM swap
              const entryA = keyMap.get(oldKeyA)!;
              const entryB = keyMap.get(oldKeyB)!;
              // Update item/index signals: entryA (oldKeyA) moved to idxB, entryB (oldKeyB) moved to idxA
              setEntryItem(entryA, items[idxB]);
              setEntryIndex(entryA, idxB);
              setEntryItem(entryB, items[idxA]);
              setEntryIndex(entryB, idxA);
              const nodeAfterB = entryB.node!.nextSibling;
              parent.insertBefore(entryB.node!, entryA.node!);
              parent.insertBefore(entryA.node!, nodeAfterB);
              // Update currentKeys in-place
              currentKeys[idxA] = newKeyA;
              currentKeys[idxB] = newKeyB;
              return;
            }
          }
        }
      }
      // Dirty hints didn't lead to a targeted fast path — fall through to full reconciliation
    }

    const newKeys: unknown[] = new Array(newLen);

    // Extract keys WITHOUT tracking — reading item.id through item proxies
    // would subscribe this effect to every item's id signal, causing O(n)
    // cleanup/re-subscribe on every reconciliation.
    // Use the raw array (bypassing item proxies) if available, and also
    // pop the active effect to suppress any remaining signal reads.
    const rawArr = (items as any)[RAW_ARRAY] || items;
    const outerNode = getActiveEffect();
    if (outerNode) popEffect();
    for (let i = 0; i < newLen; i++) {
      newKeys[i] = keyFn(rawArr[i], i);
    }
    if (outerNode) pushEffect(outerNode);

    const oldKeys = currentKeys;
    const oldLen = oldKeys.length;

    // Fast path: empty list (clear)
    if (newLen === 0) {
      if (oldLen > 0) {
        // Remove only this list's nodes — don't clear the parent since sibling
        // nodes (e.g. conditional branches sharing the same parent) must survive.
        for (let i = 0; i < oldLen; i++) {
          const entry = keyMap.get(oldKeys[i])!;
          const nodeToRemove = entry.node!;
          disposeEntry(entry);
          if (nodeToRemove.parentNode) parent.removeChild(nodeToRemove);
        }
        keyMap.clear();
      }
      currentKeys = newKeys;
      return;
    }

    // Fast path: first render (nothing to reconcile)
    // Effect stack management moved outside the loop — saves 2×N ops.
    if (oldLen === 0) {
      const outerNode2 = getActiveEffect();
      if (outerNode2) popEffect();
      const frag = document.createDocumentFragment();
      for (let i = 0; i < newLen; i++) {
        const key = newKeys[i];
        const itemSig = signal(items[i]);
        const idxSig = noIndex ? null : signal(i);
        const disposals: { dispose(): void }[] = [];
        setDisposalScope(disposals);
        const node = noIndex
          ? createFn(() => itemSig.value)
          : createFn(() => itemSig.value, () => idxSig!.value);
        setDisposalScope(null);
        const entry: KeyedItem = { node, item: items[i], _itemSig: itemSig as Signal<unknown>, _idxSig: idxSig, _disposals: disposals, _oldIdx: i };
        keyMap.set(key, entry);
        frag.appendChild(node);
      }
      if (outerNode2) pushEffect(outerNode2);
      parent.insertBefore(frag, anchor);
      currentKeys = newKeys;
      return;
    }

    // --- Fast path: pure append (all old keys are prefix of new keys) ---
    if (newLen > oldLen) {
      let isAppend = true;
      for (let i = 0; i < oldLen; i++) {
        if (oldKeys[i] !== newKeys[i]) { isAppend = false; break; }
      }
      if (isAppend) {
        // Create and append only the new items
        const frag = document.createDocumentFragment();
        for (let i = oldLen; i < newLen; i++) {
          const key = newKeys[i];
          const entry = createEntry(items[i], i);
          keyMap.set(key, entry);
          frag.appendChild(entry.node!);
        }
        parent.insertBefore(frag, anchor);
        currentKeys = newKeys;
        return;
      }
    }

    // --- Fast path: single removal ---
    if (oldLen === newLen + 1) {
      // Find the one removed key
      let removedIdx = -1;
      let j = 0;
      for (let i = 0; i < oldLen; i++) {
        if (j < newLen && oldKeys[i] === newKeys[j]) {
          j++;
        } else if (removedIdx === -1) {
          removedIdx = i;
        } else {
          removedIdx = -1; // more than one difference, bail
          break;
        }
      }
      if (removedIdx !== -1 && j === newLen) {
        const removedKey = oldKeys[removedIdx];
        const entry = keyMap.get(removedKey)!;
        const removedNode = entry.node!;
        disposeEntry(entry);
        if (removedNode.parentNode) {
          parent.removeChild(removedNode);
        }
        keyMap.delete(removedKey);
        // Update item/index signals for shifted items
        for (let i = removedIdx; i < newLen; i++) {
          const entry = keyMap.get(newKeys[i])!;
          setEntryItem(entry, items[i]);
          setEntryIndex(entry, i);
        }
        currentKeys = newKeys;
        return;
      }
    }

    // --- Fast path: swap (same length, exactly 2 positions differ) ---
    if (oldLen === newLen) {
      let swapA = -1, swapB = -1, diffCount = 0;
      for (let i = 0; i < oldLen; i++) {
        if (oldKeys[i] !== newKeys[i]) {
          diffCount++;
          if (diffCount === 1) swapA = i;
          else if (diffCount === 2) swapB = i;
          else break;
        }
      }
      if (diffCount === 2 && oldKeys[swapA] === newKeys[swapB] && oldKeys[swapB] === newKeys[swapA]) {
        const entryA = keyMap.get(oldKeys[swapA])!;
        const entryB = keyMap.get(oldKeys[swapB])!;
        // Update item/index signals for swapped entries
        setEntryItem(entryA, items[swapB]);
        setEntryIndex(entryA, swapB);
        setEntryItem(entryB, items[swapA]);
        setEntryIndex(entryB, swapA);
        // Swap DOM nodes: insert A before B's next sibling, then B before A's original position
        const nodeAfterB = entryB.node!.nextSibling;
        parent.insertBefore(entryB.node!, entryA.node!);
        parent.insertBefore(entryA.node!, nodeAfterB);
        currentKeys = newKeys;
        return;
      }
    }

    // Build set of new keys for O(1) lookup — used by full replacement check
    // and general reconciliation below.
    const newKeySet = new Set(newKeys);

    // --- Fast path: full replacement (no overlap between old and new keys) ---
    // Use O(1) Set.has() instead of O(n) indexOf() for detection.
    if (oldLen > 0 && newLen > 0) {
      let isFullReplace = !newKeySet.has(oldKeys[0]);
      if (isFullReplace) {
        const checkCount = Math.min(oldLen, 5);
        for (let i = 1; i < checkCount; i++) {
          if (newKeySet.has(oldKeys[i])) {
            isFullReplace = false;
            break;
          }
        }
      }
      if (isFullReplace) {
        // Bulk dispose all old entries and remove their DOM nodes
        for (let i = 0; i < oldLen; i++) {
          const entry = keyMap.get(oldKeys[i])!;
          const nodeToRemove = entry.node!;
          disposeEntry(entry);
          if (nodeToRemove.parentNode) parent.removeChild(nodeToRemove);
        }
        keyMap.clear();

        // Create all new rows with effect stack management outside the loop
        // (saves 2×N effect stack ops for N rows)
        const outerNode2 = getActiveEffect();
        if (outerNode2) popEffect();
        const frag = document.createDocumentFragment();
        for (let i = 0; i < newLen; i++) {
          const key = newKeys[i];
          const itemSig = signal(items[i]);
          const idxSig = noIndex ? null : signal(i);
          const disposals: { dispose(): void }[] = [];
          setDisposalScope(disposals);
          const node = noIndex
            ? createFn(() => itemSig.value)
            : createFn(() => itemSig.value, () => idxSig!.value);
          setDisposalScope(null);
          const entry: KeyedItem = { node, item: items[i], _itemSig: itemSig as Signal<unknown>, _idxSig: idxSig, _disposals: disposals, _oldIdx: i };
          keyMap.set(key, entry);
          frag.appendChild(node);
        }
        if (outerNode2) pushEffect(outerNode2);
        parent.insertBefore(frag, anchor);
        currentKeys = newKeys;
        return;
      }
    }

    // --- General reconciliation with LIS ---

    // Remove old keys not in new set
    for (let i = 0; i < oldLen; i++) {
      const key = oldKeys[i];
      if (!newKeySet.has(key)) {
        const entry = keyMap.get(key)!;
        const nodeToRemove = entry.node!;
        disposeEntry(entry);
        if (nodeToRemove.parentNode) {
          parent.removeChild(nodeToRemove);
        }
        keyMap.delete(key);
      }
    }

    // Create new entries and update existing
    for (let i = 0; i < newLen; i++) {
      const key = newKeys[i];
      let entry = keyMap.get(key);
      if (entry) {
        setEntryItem(entry, items[i]);
        setEntryIndex(entry, i);
      } else {
        entry = createEntry(items[i], i);
        keyMap.set(key, entry);
      }
    }

    // Now reconcile order using LIS-based approach
    // Store old indices directly on entries (avoids allocating a temporary Map)
    for (let i = 0; i < oldLen; i++) {
      const entry = keyMap.get(oldKeys[i]);
      if (entry) entry._oldIdx = i;
    }

    // For each new key, get its old index (or -1 if new)
    const sources = new Array(newLen);
    for (let i = 0; i < newLen; i++) {
      const entry = keyMap.get(newKeys[i])!;
      sources[i] = entry._oldIdx;
    }

    // Find longest increasing subsequence of old indices
    // These items don't need to move
    const lis = longestIncreasingSubsequence(sources);

    // Walk backwards with a pointer into the sorted LIS array.
    // Eliminates new Set<number>() allocation — O(1) amortized check.
    let nextSibling: Node = anchor;
    let lisPtr = lis.length - 1;
    for (let i = newLen - 1; i >= 0; i--) {
      const key = newKeys[i];
      const entry = keyMap.get(key)!;

      if (lisPtr >= 0 && lis[lisPtr] === i) {
        // Item is in LIS — stays in place
        lisPtr--;
      } else {
        // New item or existing item not in LIS: insert/move
        parent.insertBefore(entry.node!, nextSibling);
      }

      nextSibling = entry.node!;
    }

    currentKeys = newKeys;
  });

  function createEntry(item: unknown, index: number): KeyedItem {
    const itemSig = signal(item);
    const idxSig = noIndex ? null : signal(index);
    // Use disposal scope instead of ownerNode — flat array, no EffectNode overhead
    const disposals: { dispose(): void }[] = [];

    // Detach from outer effect so computations don't become children of the list effect
    const outerNode = getActiveEffect();
    if (outerNode) popEffect();

    // Set disposal scope — computations created inside createFn register here
    setDisposalScope(disposals);
    let node: Node;
    try {
      node = noIndex
        ? createFn(() => itemSig.value)
        : createFn(() => itemSig.value, () => idxSig!.value);
    } finally {
      setDisposalScope(null);
      if (outerNode) pushEffect(outerNode);
    }

    const entry: KeyedItem = { node, item, _itemSig: itemSig as Signal<unknown>, _idxSig: idxSig, _disposals: disposals, _oldIdx: -1 };

    return entry;
  }
}

// Module-level reusable buffers for LIS — avoids 4 allocations per call
let _lisIndices: number[] = [];
let _lisValues: number[] = [];
let _lisTails: number[] = [];
let _lisTailIndices: number[] = [];
let _lisPredecessor: number[] = [];

// Returns indices in the input array that form the longest increasing subsequence
function longestIncreasingSubsequence(arr: number[]): number[] {
  const n = arr.length;
  if (n === 0) return [];

  // Filter out -1 (new items) — reuse buffers
  _lisIndices.length = 0;
  _lisValues.length = 0;
  for (let i = 0; i < n; i++) {
    if (arr[i] !== -1) {
      _lisIndices.push(i);
      _lisValues.push(arr[i]);
    }
  }

  if (_lisIndices.length === 0) return [];

  const m = _lisValues.length;
  // tails[i] = smallest ending value of increasing subsequence of length i+1
  _lisTails.length = 0;
  _lisTailIndices.length = 0;
  // predecessor[i] = index in indices[] of the predecessor of indices[i] in LIS
  if (_lisPredecessor.length < m) _lisPredecessor.length = m;
  for (let i = 0; i < m; i++) _lisPredecessor[i] = -1;

  for (let i = 0; i < m; i++) {
    const val = _lisValues[i];

    // Binary search for the position
    let lo = 0, hi = _lisTails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (_lisTails[mid] < val) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    if (lo === _lisTails.length) {
      _lisTails.push(val);
      _lisTailIndices.push(i);
    } else {
      _lisTails[lo] = val;
      _lisTailIndices[lo] = i;
    }

    if (lo > 0) {
      _lisPredecessor[i] = _lisTailIndices[lo - 1];
    }
  }

  // Reconstruct — this must be a fresh array (returned to caller)
  const result: number[] = new Array(_lisTails.length);
  let k = _lisTailIndices[_lisTails.length - 1];
  for (let i = _lisTails.length - 1; i >= 0; i--) {
    result[i] = _lisIndices[k]; // Map back to original array index
    k = _lisPredecessor[k];
  }

  return result;
}
