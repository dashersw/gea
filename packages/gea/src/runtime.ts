// Signal primitives
export { signal, effect, computed, batch } from './signals/index.js';
export { computation, mergedComputation, signalEffect } from './signals/effect.js';

// Compiler-internal Symbols
export { GEA_PROPS, GEA_PROP_THUNKS, GEA_SET_PROPS, GEA_CREATE_TEMPLATE, GEA_COMPILED } from './symbols.js';

// Reactive helpers
export { wrapArray, itemSignal, wrapObject, wrapSignalValue } from './reactive/index.js';

// Component helpers
export { createPropsProxy } from './component/index.js';

// DOM helpers
export {
  createElement,
  createTextNode,
  reactiveText,
  reactiveAttr,
  staticAttr,
  delegateEvent,
  ensureDelegation,
  conditional,
  keyedList,
  mountComponent,
  mountFunctionComponent,
  mount,
  template,
  selectorAttr,
  selectorRemove,
  reactiveContent,
} from './dom/index.js';

