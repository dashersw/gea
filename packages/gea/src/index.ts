export { Component } from './component/index.js';
export { Store } from './store/index.js';
export { signal, effect, computed, batch } from './signals/index.js';
export { geaEscapeHtml as geaEscapeHtml, geaSanitizeAttr as geaSanitizeAttr } from './dom/xss.js';
export { default as getUid, resetUidCounter, setUidProvider, clearUidProvider } from './component/uid.js';

// TODO: These are Gea v1 APIs — stub for compatibility, implement as needed
export const ComponentManager = {} as any
export function applyListChanges() {}

import { Component } from './component/index.js';
import { Store } from './store/index.js';
const gea = { Store, Component, applyListChanges }
export default gea
export {
  GEA_PROXY_RAW,
  GEA_ELEMENT,
  GEA_PARENT_COMPONENT,
  GEA_CHILD_COMPONENTS,
  GEA_DOM_COMPONENT,
  GEA_DOM_COMPILED_CHILD_ROOT,
  GEA_PROXY_GET_RAW_TARGET,
  GEA_MAPS,
  GEA_SYNC_MAP,
  GEA_UPDATE_PROPS,
  GEA_ON_PROP_CHANGE,
  GEA_IS_ROUTER_OUTLET,
  GEA_ROUTER_DEPTH,
  GEA_ROUTER_REF,
  GEA_REQUEST_RENDER,
  GEA_RENDERED,
  GEA_DOM_ITEM,
  GEA_DOM_KEY,
  geaListItemsSymbol,
  toRaw,
  engineThis,
  stashComponentForTransfer,
} from './symbols.js';
