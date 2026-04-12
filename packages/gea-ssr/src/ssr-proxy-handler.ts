// ---------------------------------------------------------------------------
// v2 signal-based SSR — proxy handler is no longer needed.
//
// In v1, SSR used a Proxy with 7 traps to intercept Store reads/writes and
// redirect them to per-request overlays. In v2, Store fields are compiled to
// signals (Symbol.for('gea.field.xxx')), and SSR isolation works by
// snapshotting/restoring signal values directly (see ssr-context.ts).
//
// This file is kept only for the SSR_DELETED sentinel (used by the overlay
// system for plain-object stores that still need tombstone semantics).
// ---------------------------------------------------------------------------

/** Sentinel for SSR overlay deletes on plain-object stores. */
export const SSR_DELETED: symbol = Symbol('ssrDeleted')
