export interface WalkOptions {
  emitEventDataAttr?: boolean
  directFnComponents?: Set<string>
  bindings?: Map<string, any>
}

/** A reactive slot discovered during template walk. */
export interface Slot {
  /** Unique marker index. DOM walk to reach the `<!--${index}-->` comment in the cloned root. */
  index: number
  /** DOM walk path: sequence of `childNodes[i]` indices from the root. */
  walk: number[]
  /**
   * Per-step element-aware walk: each entry is either `{ elem: N }` (N-th
   * element child among siblings — emit as firstElementChild + N×
   * nextElementSibling) or `{ child: N }` (N-th child of any type — emit as
   * childNodes[N], used for comment markers or text-among-siblings). Parallel
   * to `walk`, same length. Enables firstElementChild / nextElementSibling
   * element chains that are ~20-30% faster than childNodes[n] in V8 — direct element-only
   * traversal, no NodeList iteration or index bounds checks.
   */
  walkKinds?: Array<{ elem: number } | { child: number }>
  /** What reactive helper to call. */
  kind:
    | 'text'
    | 'attr'
    | 'bool'
    | 'class'
    | 'style'
    | 'value'
    | 'event'
    | 'ref'
    | 'mount'
    | 'direct-fn'
    | 'conditional'
    | 'keyed-list'
    | 'html'
  /** Kind-specific payload (e.g., attribute name, event type). */
  payload?: any
  /** The JSX expression tree for the reactive value (for dependency analysis). */
  expr?: any
  /**
   * True for text slots emitted as a direct text-node placeholder (e.g. `0`)
   * in the template HTML rather than a `<!--N-->` comment — the walk points
   * straight at the text node, so the emitter skips `createTextNode` +
   * `replaceWith` for this slot. Applied only to text slots whose parent
   * element has exactly one reactive child (safe — no sibling text merging).
   * Drops 2 DOM ops + 1 allocation per slot per row on 1000-row keyed lists.
   */
  directText?: boolean
}

/** Result of walking a JSX tree. */
export interface TemplateSpec {
  /** The HTML string to stuff into the `<template>` element. */
  html: string
  /** Reactive slots with DOM-walk paths. */
  slots: Slot[]
}
