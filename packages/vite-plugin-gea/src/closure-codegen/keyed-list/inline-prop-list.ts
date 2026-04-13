import { parse } from '@babel/parser'
import type { Expression, Statement } from '@babel/types'

import { t } from '../../utils/babel-interop.ts'

import type { EmitContext } from '../emit/emit-context.ts'
import type { RelationalClassMatch } from './relational-class.ts'

export interface InlinePropKeyedListOptions {
  anchorId: Expression
  containerId?: Expression
  anchorless?: boolean
  listRoot: Expression
  prop: string
  keyFn: Expression
  createEntryArrow: Expression
  patchEntryArrow: Expression
  relMatches: RelationalClassMatch[]
  compact?: boolean
  componentCompact?: boolean
  ctx: EmitContext
}

const INLINE_PROP_LIST_SOURCE = `{
  const __kl_container = __CONTAINER__;
  const __kl_anchor = __ANCHOR__;
  const __kl_root = __ROOT__;
  const __kl_key = __KEY__;
  const __kl_create = __CREATE__;
  const __kl_patch = __PATCH__;
  const __kl_unwrap = (v) => (v && typeof v === "object" && v[GEA_PROXY_RAW]) || v;
  const __kl_resolve = () => {
    const v = __kl_root?.[__PROP__];
    return Array.isArray(v) ? v : [];
  };
  let __kl_entries = [];
  const __kl_byKey = new Map();
  __BYKEY_CREATED__;
  const __kl_remove = (entry) => {
    entry.disposer?.dispose();
    __kl_byKey.delete(entry.key);
    if (entry.element.parentNode) entry.element.parentNode.removeChild(entry.element);
  };
  const __kl_first = __kl_resolve();
  if (__kl_first.length > 0) {
    const frag = __kl_container.ownerDocument.createDocumentFragment();
    for (let i = 0; i < __kl_first.length; i++) {
      const item = __kl_first[i];
      const entry = __kl_create(item, i);
      __kl_entries.push(entry);
      __kl_byKey.set(entry.key, entry);
      frag.appendChild(entry.element);
      if (item && typeof item === "object") {
        item[GEA_DIRTY] = false;
        item[GEA_DIRTY_PROPS]?.clear();
      }
    }
    __kl_container.insertBefore(frag, __kl_anchor);
  }
  let __kl_prev = __kl_first;
  const __kl_reconcile = (arr, changes) => {
    if (arr === __kl_prev && __kl_entries.length === arr.length) {
      let structural = false;
      let aipuOnly = changes && changes.length > 0;
      if (changes && changes.length > 0) {
        for (let i = 0; i < changes.length; i++) {
          const change = changes[i];
          if (change.type === "append" || change.type === "remove" || change.type === "delete" || change.type === "reorder") {
            structural = true;
            aipuOnly = false;
            break;
          }
          if (!change.aipu) aipuOnly = false;
          else structural = true;
        }
      }
      if (aipuOnly && changes.length === 2) {
        const a = changes[0].arix;
        const b = changes[1].arix;
        if (a >= 0 && b >= 0 && a < __kl_entries.length && b < __kl_entries.length && a !== b) {
          const entryA = __kl_entries[a];
          const entryB = __kl_entries[b];
          const newAKey = __kl_key(arr[a], a);
          const newBKey = __kl_key(arr[b], b);
          if (entryA.key === newBKey && entryB.key === newAKey) {
            const refB = entryB.element.nextSibling;
            __kl_container.insertBefore(entryB.element, entryA.element);
            if (refB) __kl_container.insertBefore(entryA.element, refB);
            else __kl_container.appendChild(entryA.element);
            __kl_entries[a] = entryB;
            __kl_entries[b] = entryA;
            if (__kl_unwrap(arr[a]) !== entryB.item) __kl_patch(entryB, arr[a], a);
            if (__kl_unwrap(arr[b]) !== entryA.item) __kl_patch(entryA, arr[b], b);
            __kl_prev = arr;
            return;
          }
        }
      }
      if (!structural) {
        const raw = arr[GEA_PROXY_RAW] || arr;
        for (let i = 0; i < raw.length; i++) {
          const item = raw[i];
          if (item && typeof item === "object" && item[GEA_DIRTY]) {
            __kl_patch(__kl_entries[i], item, i);
            item[GEA_DIRTY] = false;
            item[GEA_DIRTY_PROPS]?.clear();
            __kl_entries[i].item = item;
          }
        }
        return;
      }
    }

    if (changes && changes.length > 0 && __kl_entries.length < arr.length) {
      let onlyAppends = true;
      let appendCount = 0;
      for (let i = 0; i < changes.length; i++) {
        if (changes[i].type !== "append") {
          onlyAppends = false;
          break;
        }
        appendCount += changes[i].count || 0;
      }
      if (onlyAppends && appendCount === arr.length - __kl_entries.length) {
        const start = __kl_entries.length;
        const frag = __kl_container.ownerDocument.createDocumentFragment();
        for (let i = start; i < arr.length; i++) {
          const entry = __kl_create(arr[i], i);
          __kl_entries.push(entry);
          __kl_byKey.set(entry.key, entry);
          frag.appendChild(entry.element);
        }
        __kl_container.insertBefore(frag, __kl_anchor);
        __kl_prev = arr;
        return;
      }
    }

    if (changes && changes.length > 0 && __kl_entries.length > arr.length) {
      let onlyRemoves = true;
      let totalRemoved = 0;
      for (let i = 0; i < changes.length; i++) {
        const change = changes[i];
        if (change.type !== "remove") {
          onlyRemoves = false;
          break;
        }
        totalRemoved += change.count || 0;
      }
      if (onlyRemoves && __kl_entries.length - arr.length === totalRemoved) {
        if (changes.length === 1 && changes[0].count === 1) {
          const idx = changes[0].start;
          if (idx >= 0 && idx < __kl_entries.length) {
            __kl_remove(__kl_entries[idx]);
            __kl_entries.splice(idx, 1);
          }
          __kl_prev = arr;
          return;
        }
        const removed = [];
        for (let i = 0; i < changes.length; i++) {
          const start = changes[i].start;
          const count = changes[i].count;
          for (let j = 0; j < count; j++) removed.push(start + j);
        }
        removed.sort((a, b) => b - a);
        for (let i = 0; i < removed.length; i++) {
          const idx = removed[i];
          if (idx >= 0 && idx < __kl_entries.length) {
            __kl_remove(__kl_entries[idx]);
            __kl_entries.splice(idx, 1);
          }
        }
        __kl_prev = arr;
        return;
      }
    }

    const newLen = arr.length;
    const oldLen = __kl_entries.length;

    if (oldLen === 0 && newLen > 0) {
      const nextEntries = new Array(newLen);
      const frag = __kl_container.ownerDocument.createDocumentFragment();
      for (let i = 0; i < newLen; i++) {
        const entry = __kl_create(arr[i], i);
        nextEntries[i] = entry;
        __kl_byKey.set(entry.key, entry);
        frag.appendChild(entry.element);
      }
      __kl_container.insertBefore(frag, __kl_anchor);
      __kl_entries = nextEntries;
      __kl_prev = arr;
      return;
    }

    const newKeys = new Array(newLen);
    for (let i = 0; i < newLen; i++) newKeys[i] = __kl_key(arr[i], i);

    if (newLen === 0) {
      if (__kl_container.childNodes.length === oldLen + (__kl_anchor ? 1 : 0)) {
        for (let i = 0; i < oldLen; i++) __kl_entries[i].disposer?.dispose();
        __kl_container.textContent = "";
        if (__kl_anchor) __kl_container.appendChild(__kl_anchor);
      } else {
        for (let i = oldLen - 1; i >= 0; i--) __kl_remove(__kl_entries[i]);
      }
      __kl_entries = [];
      __kl_byKey.clear();
      __kl_prev = arr;
      return;
    }

    if (newLen === oldLen) {
      let diffA = -1;
      let diffB = -1;
      let diffCount = 0;
      for (let i = 0; i < newLen; i++) {
        if (__kl_entries[i].key !== newKeys[i]) {
          if (diffCount === 0) diffA = i;
          else if (diffCount === 1) diffB = i;
          diffCount++;
          if (diffCount > 2) break;
        }
      }
      if (diffCount === 2 && __kl_entries[diffA].key === newKeys[diffB] && __kl_entries[diffB].key === newKeys[diffA]) {
        const entryA = __kl_entries[diffA];
        const entryB = __kl_entries[diffB];
        const refB = entryB.element.nextSibling;
        __kl_container.insertBefore(entryB.element, entryA.element);
        if (refB) __kl_container.insertBefore(entryA.element, refB);
        else __kl_container.appendChild(entryA.element);
        __kl_entries[diffA] = entryB;
        __kl_entries[diffB] = entryA;
        if (__kl_unwrap(arr[diffA]) !== entryB.item) __kl_patch(entryB, arr[diffA], diffA);
        if (__kl_unwrap(arr[diffB]) !== entryA.item) __kl_patch(entryA, arr[diffB], diffB);
        __kl_prev = arr;
        return;
      }
    }

    if (oldLen > 0 && newLen > 0 && __kl_container.childNodes.length === oldLen + (__kl_anchor ? 1 : 0)) {
      let disjoint = true;
      for (let i = 0; i < newLen; i++) {
        if (__kl_byKey.has(newKeys[i])) {
          disjoint = false;
          break;
        }
      }
      if (disjoint) {
        for (let i = 0; i < oldLen; i++) __kl_entries[i].disposer?.dispose();
        __kl_byKey.clear();
        const nextEntries = new Array(newLen);
        const nextNodes = new Array(newLen + (__kl_anchor ? 1 : 0));
        for (let i = 0; i < newLen; i++) {
          const entry = __kl_create(arr[i], i);
          nextEntries[i] = entry;
          nextNodes[i] = entry.element;
          __kl_byKey.set(entry.key, entry);
        }
        if (__kl_anchor) nextNodes[newLen] = __kl_anchor;
        __kl_container.replaceChildren(...nextNodes);
        __kl_entries = nextEntries;
        __kl_prev = arr;
        return;
      }
    }

    for (let i = 0; i < oldLen; i++) __kl_entries[i]._i = i;
    const seenOld = new Array(oldLen).fill(false);
    const nextEntries = new Array(newLen);
    for (let i = 0; i < newLen; i++) {
      const entry = __kl_byKey.get(newKeys[i]);
      if (entry) {
        const oldIdx = entry._i;
        seenOld[oldIdx] = true;
        nextEntries[i] = entry;
      }
    }
    for (let i = oldLen - 1; i >= 0; i--) {
      if (!seenOld[i]) __kl_remove(__kl_entries[i]);
    }
    let nextRef = __kl_anchor;
    for (let i = newLen - 1; i >= 0; i--) {
      let entry = nextEntries[i];
      if (!entry) {
        entry = __kl_create(arr[i], i);
        __kl_byKey.set(entry.key, entry);
      } else if (entry.item !== __kl_unwrap(arr[i])) {
        __kl_patch(entry, arr[i], i);
      }
      if (entry.element.parentNode !== __kl_container || entry.element.nextSibling !== nextRef) __kl_container.insertBefore(entry.element, nextRef);
      nextEntries[i] = entry;
      nextRef = entry.element;
    }
    __kl_entries = nextEntries;
    __kl_prev = arr;
  };

  if (__kl_root && typeof __kl_root.observe === "function") {
    const off = __kl_root.observe(__PROP__, (_value, changes) => {
      __kl_reconcile(__kl_resolve(), changes);
    });
    d.add(off);
  }
}`

const INLINE_PROP_LIST_BLOCK = parse(INLINE_PROP_LIST_SOURCE, {
  sourceType: 'module',
  plugins: ['optionalChaining'],
}).program.body[0] as Statement

const INLINE_PROP_LIST_ANCHORLESS_SOURCE = INLINE_PROP_LIST_SOURCE.replace('  const __kl_anchor = __ANCHOR__;\n', '')
  .replaceAll('__kl_container.insertBefore(frag, __kl_anchor);', '__kl_container.appendChild(frag);')
  .replaceAll('oldLen + (__kl_anchor ? 1 : 0)', 'oldLen')
  .replace('        if (__kl_anchor) __kl_container.appendChild(__kl_anchor);\n', '')
  .replaceAll('newLen + (__kl_anchor ? 1 : 0)', 'newLen')
  .replace('        if (__kl_anchor) nextNodes[newLen] = __kl_anchor;\n', '')
  .replace('    let nextRef = __kl_anchor;', '    let nextRef = null;')

const INLINE_PROP_LIST_ANCHORLESS_BLOCK = parse(INLINE_PROP_LIST_ANCHORLESS_SOURCE, {
  sourceType: 'module',
  plugins: ['optionalChaining'],
}).program.body[0] as Statement

const INLINE_PROP_LIST_COMPACT_ANCHORLESS_SOURCE = `{
  const __kl_container = __CONTAINER__;
  const __kl_root = __ROOT__;
  const __kl_create = __CREATE__;
  const __kl_patch = __PATCH__;
  const __kl_raw = (v) => (v && v[GEA_PROXY_RAW]) || v;
  const __kl_resolve = () => {
    const v = __kl_root[__PROP__];
    return Array.isArray(v) ? v : [];
  };
  let __kl_prev = __kl_resolve();
  let __kl_reconcile = (arr, changes) => {
    if (arr.length === 0) {
      __kl_prev = arr;
      return;
    }
    __kl_init(arr, changes);
  };
  const __kl_init = (firstArr, firstChanges) => {
    let __kl_entries = [];
    const __kl_byKey = new Map();
    __BYKEY_CREATED__;
    const __kl_remove = (entry) => {
      entry.disposer?.dispose();
      __kl_byKey.delete(entry.key);
      if (entry.element.parentNode) entry.element.parentNode.removeChild(entry.element);
    };
    const __kl_make = (arr, start, end) => {
      const raw = __kl_raw(arr);
      const frag = document.createDocumentFragment();
      for (let i = start; i < end; i++) {
        const item = raw[i];
        const entry = __kl_create(item, i);
        __kl_entries.push(entry);
        __kl_byKey.set(entry.key, entry);
        frag.appendChild(entry.element);
        if (item && typeof item === "object") {
          item[GEA_DIRTY] = false;
          item[GEA_DIRTY_PROPS]?.clear();
        }
      }
      __kl_container.appendChild(frag);
    };
    const __kl_replaceAll = (raw, newLen) => {
      for (let i = 0; i < __kl_entries.length; i++) __kl_entries[i].disposer?.dispose();
      __kl_byKey.clear();
      const nextEntries = new Array(newLen);
      const nextNodes = new Array(newLen);
      for (let i = 0; i < newLen; i++) {
        const entry = __kl_create(raw[i], i);
        nextEntries[i] = entry;
        nextNodes[i] = entry.element;
        __kl_byKey.set(entry.key, entry);
      }
      __kl_container.replaceChildren(...nextNodes);
      __kl_entries = nextEntries;
    };
    const __kl_real_reconcile = (arr, changes) => {
      const raw = __kl_raw(arr);
      if (arr === __kl_prev && __kl_entries.length === arr.length) {
        let structural = false;
        let aipuOnly = changes && changes.length > 0;
        if (changes && changes.length > 0) {
          for (let i = 0; i < changes.length; i++) {
            const change = changes[i];
            if (change.type === "append" || change.type === "remove" || change.type === "reorder") {
              structural = true;
              aipuOnly = false;
              break;
            }
            if (!change.aipu) aipuOnly = false;
            else structural = true;
          }
        }
        if (aipuOnly && changes.length === 2) {
          const a = changes[0].arix;
          const b = changes[1].arix;
          const entryA = __kl_entries[a];
          const entryB = __kl_entries[b];
          if (entryA && entryB && entryA.key === raw[b].id && entryB.key === raw[a].id) {
            const refB = entryB.element.nextSibling;
            __kl_container.insertBefore(entryB.element, entryA.element);
            if (refB) __kl_container.insertBefore(entryA.element, refB);
            else __kl_container.appendChild(entryA.element);
            __kl_entries[a] = entryB;
            __kl_entries[b] = entryA;
            if (__kl_raw(raw[a]) !== entryB.item) __kl_patch(entryB, raw[a], a);
            if (__kl_raw(raw[b]) !== entryA.item) __kl_patch(entryA, raw[b], b);
            __kl_prev = arr;
            return;
          }
        }
        if (!structural) {
          for (let i = 0; i < raw.length; i++) {
            const item = raw[i];
            if (item && typeof item === "object" && item[GEA_DIRTY]) {
              __kl_patch(__kl_entries[i], item, i);
              item[GEA_DIRTY] = false;
              item[GEA_DIRTY_PROPS]?.clear();
              __kl_entries[i].item = item;
            }
          }
          return;
        }
      }

      if (changes && changes.length > 0 && __kl_entries.length < arr.length) {
        let appendCount = 0;
        for (let i = 0; i < changes.length; i++) {
          if (changes[i].type !== "append") {
            appendCount = -1;
            break;
          }
          appendCount += changes[i].count || 0;
        }
        if (appendCount === arr.length - __kl_entries.length) {
          __kl_make(arr, __kl_entries.length, arr.length);
          __kl_prev = arr;
          return;
        }
      }

      if (changes && changes.length === 1 && changes[0].type === "remove" && __kl_entries.length - arr.length === 1) {
        const idx = changes[0].start;
        if (idx >= 0 && idx < __kl_entries.length) {
          __kl_remove(__kl_entries[idx]);
          __kl_entries.splice(idx, 1);
        }
        __kl_prev = arr;
        return;
      }

      const newLen = arr.length;
      const oldLen = __kl_entries.length;
      if (newLen === 0) {
        if (__kl_container.childNodes.length === oldLen) {
          for (let i = 0; i < oldLen; i++) __kl_entries[i].disposer?.dispose();
          __kl_container.textContent = "";
        } else for (let i = oldLen - 1; i >= 0; i--) __kl_remove(__kl_entries[i]);
        __kl_entries = [];
        __kl_byKey.clear();
        __kl_prev = arr;
        return;
      }
      if (oldLen === 0) {
        __kl_make(arr, 0, newLen);
        __kl_prev = arr;
        return;
      }

      __kl_replaceAll(raw, newLen);
      __kl_prev = arr;
    };
    __kl_reconcile = __kl_real_reconcile;
    __kl_real_reconcile(firstArr, firstChanges);
  };
  if (__kl_prev.length > 0) __kl_init(__kl_prev);

  if (__kl_root && typeof __kl_root.observe === "function") {
    const off = __kl_root.observe(__PROP__, (_value, changes) => {
      __kl_reconcile(__kl_resolve(), changes);
    });
    d.add(off);
  }
}`

const INLINE_PROP_LIST_COMPACT_ANCHORLESS_BLOCK = parse(INLINE_PROP_LIST_COMPACT_ANCHORLESS_SOURCE, {
  sourceType: 'module',
  plugins: ['optionalChaining'],
}).program.body[0] as Statement

const INLINE_PROP_LIST_COMPONENT_SOURCE = `{
  const __kl_container = __CONTAINER__;
  const __kl_anchor = __ANCHOR__;
  const __kl_root = __ROOT__;
  const __kl_key = __KEY__;
  const __kl_create = __CREATE__;
  const __kl_patch = __PATCH__;
  const __kl_raw = (v) => (v && typeof v === "object" && v[GEA_PROXY_RAW]) || v;
  const __kl_resolve = () => {
    const v = __kl_root?.[__PROP__];
    return Array.isArray(v) ? v : [];
  };
  let __kl_entries = [];
  const __kl_byKey = new Map();
  const __kl_remove = (entry) => {
    entry.disposer?.dispose();
    __kl_byKey.delete(entry.key);
    if (entry.element.parentNode) entry.element.parentNode.removeChild(entry.element);
  };
  const __kl_make = (item, idx) => {
    const entry = __kl_create(item, idx);
    __kl_byKey.set(entry.key, entry);
    if (item && typeof item === "object") {
      item[GEA_DIRTY] = false;
      item[GEA_DIRTY_PROPS]?.clear();
    }
    return entry;
  };
  const __kl_first = __kl_resolve();
  if (__kl_first.length > 0) {
    const frag = __kl_container.ownerDocument.createDocumentFragment();
    for (let i = 0; i < __kl_first.length; i++) {
      const entry = __kl_make(__kl_first[i], i);
      __kl_entries.push(entry);
      frag.appendChild(entry.element);
    }
    __kl_container.insertBefore(frag, __kl_anchor);
  }
  let __kl_prev = __kl_first;
  const __kl_reconcile = (arr, changes) => {
    const raw = __kl_raw(arr);
    if (arr === __kl_prev && __kl_entries.length === arr.length) {
      let structural = false;
      if (changes && changes.length > 0) {
        for (let i = 0; i < changes.length; i++) {
          const change = changes[i];
          if (change.aipu || change.type === "append" || change.type === "remove" || change.type === "delete" || change.type === "reorder") {
            structural = true;
            break;
          }
        }
      }
      if (!structural) {
        for (let i = 0; i < raw.length; i++) {
          const item = raw[i];
          if (item && typeof item === "object" && item[GEA_DIRTY]) {
            __kl_patch(__kl_entries[i], item, i);
            item[GEA_DIRTY] = false;
            item[GEA_DIRTY_PROPS]?.clear();
            __kl_entries[i].item = item;
          }
        }
        return;
      }
    }
    const newLen = arr.length;
    const oldLen = __kl_entries.length;
    if (newLen === 0) {
      for (let i = oldLen - 1; i >= 0; i--) __kl_remove(__kl_entries[i]);
      __kl_entries = [];
      __kl_byKey.clear();
      __kl_prev = arr;
      return;
    }
    const nextEntries = new Array(newLen);
    const seenOld = new Array(oldLen).fill(false);
    for (let i = 0; i < oldLen; i++) __kl_entries[i]._i = i;
    for (let i = 0; i < newLen; i++) {
      const entry = __kl_byKey.get(__kl_key(arr[i], i));
      if (entry) {
        seenOld[entry._i] = true;
        nextEntries[i] = entry;
      }
    }
    for (let i = oldLen - 1; i >= 0; i--) {
      if (!seenOld[i]) __kl_remove(__kl_entries[i]);
    }
    let nextRef = __kl_anchor;
    for (let i = newLen - 1; i >= 0; i--) {
      let entry = nextEntries[i];
      if (!entry) {
        entry = __kl_make(arr[i], i);
      } else if (entry.item !== __kl_raw(arr[i])) {
        __kl_patch(entry, arr[i], i);
      }
      if (entry.element.parentNode !== __kl_container || entry.element.nextSibling !== nextRef) __kl_container.insertBefore(entry.element, nextRef);
      nextEntries[i] = entry;
      nextRef = entry.element;
    }
    __kl_entries = nextEntries;
    __kl_prev = arr;
  };
  if (__kl_root && typeof __kl_root.observe === "function") {
    const off = __kl_root.observe(__PROP__, (_value, changes) => {
      __kl_reconcile(__kl_resolve(), changes);
    });
    d.add(off);
  }
}`

const INLINE_PROP_LIST_COMPONENT_BLOCK = parse(INLINE_PROP_LIST_COMPONENT_SOURCE, {
  sourceType: 'module',
  plugins: ['optionalChaining'],
}).program.body[0] as Statement

const INLINE_PROP_LIST_COMPONENT_ANCHORLESS_SOURCE = INLINE_PROP_LIST_COMPONENT_SOURCE.replace(
  '  const __kl_anchor = __ANCHOR__;\n',
  '',
)
  .replaceAll('__kl_container.insertBefore(frag, __kl_anchor);', '__kl_container.appendChild(frag);')
  .replace('    let nextRef = __kl_anchor;', '    let nextRef = null;')

const INLINE_PROP_LIST_COMPONENT_ANCHORLESS_BLOCK = parse(INLINE_PROP_LIST_COMPONENT_ANCHORLESS_SOURCE, {
  sourceType: 'module',
  plugins: ['optionalChaining'],
}).program.body[0] as Statement

const INLINE_PROP_LIST_COMPONENT_ID_SOURCE = INLINE_PROP_LIST_COMPONENT_SOURCE.replace(
  '  const __kl_key = __KEY__;\n',
  '',
).replace('__kl_byKey.get(__kl_key(arr[i], i))', '__kl_byKey.get(arr[i].id)')

const INLINE_PROP_LIST_COMPONENT_ID_BLOCK = parse(INLINE_PROP_LIST_COMPONENT_ID_SOURCE, {
  sourceType: 'module',
  plugins: ['optionalChaining'],
}).program.body[0] as Statement

const INLINE_PROP_LIST_COMPONENT_ID_ANCHORLESS_SOURCE = INLINE_PROP_LIST_COMPONENT_ANCHORLESS_SOURCE.replace(
  '  const __kl_key = __KEY__;\n',
  '',
).replace('__kl_byKey.get(__kl_key(arr[i], i))', '__kl_byKey.get(arr[i].id)')

const INLINE_PROP_LIST_COMPONENT_ID_ANCHORLESS_BLOCK = parse(INLINE_PROP_LIST_COMPONENT_ID_ANCHORLESS_SOURCE, {
  sourceType: 'module',
  plugins: ['optionalChaining'],
}).program.body[0] as Statement

export function buildInlinePropKeyedListBlock(options: InlinePropKeyedListOptions): Statement {
  options.ctx.importsNeeded.add('GEA_DIRTY')
  options.ctx.importsNeeded.add('GEA_DIRTY_PROPS')

  const directIdKey = isDirectIdKey(options.keyFn)
  let sourceBlock: Statement
  if (options.componentCompact && options.anchorless && directIdKey) {
    sourceBlock = INLINE_PROP_LIST_COMPONENT_ID_ANCHORLESS_BLOCK
  } else if (options.componentCompact && options.anchorless) {
    sourceBlock = INLINE_PROP_LIST_COMPONENT_ANCHORLESS_BLOCK
  } else if (options.componentCompact && directIdKey) {
    sourceBlock = INLINE_PROP_LIST_COMPONENT_ID_BLOCK
  } else if (options.componentCompact) {
    sourceBlock = INLINE_PROP_LIST_COMPONENT_BLOCK
  } else if (options.compact && options.anchorless) {
    sourceBlock = INLINE_PROP_LIST_COMPACT_ANCHORLESS_BLOCK
  } else if (options.anchorless) {
    sourceBlock = INLINE_PROP_LIST_ANCHORLESS_BLOCK
  } else {
    sourceBlock = INLINE_PROP_LIST_BLOCK
  }
  const block = t.cloneNode(sourceBlock, true)
  const anchorExpr = options.anchorless ? t.nullLiteral() : options.anchorId
  replacePlaceholders(block, {
    __ANCHOR__: anchorExpr,
    __CONTAINER__: options.containerId ?? t.memberExpression(options.anchorId, t.identifier('parentNode')),
    __ROOT__: options.listRoot,
    __PROP__: t.stringLiteral(options.prop),
    __KEY__: options.keyFn,
    __CREATE__: options.createEntryArrow,
    __PATCH__: options.patchEntryArrow,
  })
  replaceByKeyMarker(block, options.relMatches)
  return block
}

function isDirectIdKey(expr: Expression): boolean {
  if (!t.isArrowFunctionExpression(expr) || expr.params.length === 0) return false
  const firstParam = expr.params[0]
  if (!t.isIdentifier(firstParam)) return false
  return (
    t.isMemberExpression(expr.body) &&
    !expr.body.computed &&
    t.isIdentifier(expr.body.object, { name: firstParam.name }) &&
    t.isIdentifier(expr.body.property, { name: 'id' })
  )
}

function replaceByKeyMarker(node: any, relMatches: RelationalClassMatch[]): void {
  const createByKeyAssignments = () =>
    relMatches
      .filter((m) => (m as any).useByKey)
      .map((m) =>
        t.expressionStatement(t.assignmentExpression('=', t.identifier('__byKey_' + m.id), t.identifier('__kl_byKey'))),
      )

  const replaceInBody = (body: Statement[]) => {
    for (let i = 0; i < body.length; i++) {
      const stmt = body[i]
      if (t.isExpressionStatement(stmt) && t.isIdentifier(stmt.expression, { name: '__BYKEY_CREATED__' })) {
        body.splice(i, 1, ...createByKeyAssignments())
        return true
      }
      if (visit(stmt)) return true
    }
    return false
  }

  const visit = (value: any): boolean => {
    if (!value || typeof value !== 'object') return false
    if (Array.isArray(value)) {
      for (const item of value) {
        if (visit(item)) return true
      }
      return false
    }
    if (t.isBlockStatement(value) || t.isProgram(value)) return replaceInBody(value.body as Statement[])
    for (const key of Object.keys(value)) {
      if (key === 'loc' || key === 'start' || key === 'end' || key === 'type') continue
      if (visit(value[key])) return true
    }
    return false
  }

  visit(node)
}

function replacePlaceholders(node: any, replacements: Record<string, Expression>): void {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      const value = node[i]
      if (isReplacementIdentifier(value, replacements)) node[i] = t.cloneNode(replacements[value.name], true)
      else replacePlaceholders(value, replacements)
    }
    return
  }
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'type') continue
    const value = node[key]
    if (isReplacementIdentifier(value, replacements)) node[key] = t.cloneNode(replacements[value.name], true)
    else replacePlaceholders(value, replacements)
  }
}

function isReplacementIdentifier(node: any, replacements: Record<string, Expression>): node is { name: string } {
  return t.isIdentifier(node) && Object.prototype.hasOwnProperty.call(replacements, node.name)
}
