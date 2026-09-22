export { createDisposer, NOOP_DISPOSER } from './runtime/disposer'
export { scheduleAfterRenderAsync } from './runtime/after-render-async'
export { CompiledComponent } from './runtime/compiled-component'
export { CompiledLeanReactiveComponent } from './runtime/compiled-lean-reactive-component'
// The compiler-runtime facade is also the checker-visible authentication
// surface for the sealed tracked-proxy protocol. Keep protocol participants
// on the same per-runtime-module export line so the Vite module-graph adapter
// preserves their canonical symbol identities whenever this runtime module is
// live; no physical checkout path is part of that authority.
export {
  CompiledLeanStore,
  createLeanProxy,
  leanObserve,
  leanObserveDirect,
  _plain,
} from './runtime/compiled-lean-store'
export { trackRead } from './runtime/with-tracking'
// Checker-visible authority for the disposer-contained apply callback
// protocol consumed by the native compiler backend. Runtime helpers already
// reach `bind` through their ordinary imports; this export gives that shared
// semantic boundary a stable logical coordinate without naming a checkout.
export { bind } from './runtime/bind'
export { CompiledReactiveComponent } from './runtime/compiled-reactive-component'
export { CompiledTinyReactiveComponent } from './runtime/compiled-tiny-reactive-component'
export { CompiledStaticElementComponent } from './runtime/compiled-static-element-component'
export { CompiledStaticComponent } from './runtime/compiled-static-component'
export { CompiledStore } from './runtime/compiled-store'
export { reactiveText, reactiveTextValue } from './runtime/reactive-text'
export { reactiveAttr } from './runtime/reactive-attr'
export { reactiveHtml } from './runtime/reactive-html'
export { reactiveBool, reactiveBoolAttr } from './runtime/reactive-bool'
export { reactiveClass } from './runtime/reactive-class'
export { reactiveClassName } from './runtime/reactive-class-name'
export { relationalClass } from './runtime/relational-class'
export { relationalClassProp } from './runtime/relational-class-prop'
export { reactiveStyle, reactiveStyleProp } from './runtime/reactive-style'
export { reactiveValue, reactiveValueRead } from './runtime/reactive-value'
export { delegateEvent } from './runtime/delegate-event'
export { delegateEventFast } from './runtime/delegate-event-fast'
export { delegateClick, ensureClickDelegate } from './runtime/delegate-click'
export { mount } from './runtime/mount'
export { conditional } from './runtime/conditional'
export { conditionalTruthy } from './runtime/conditional-truthy'
export { keyedList } from './runtime/keyed-list'
export { GEA_DOM_ITEM, GEA_DOM_KEY } from './runtime/keyed-list-symbols'
export { keyedListSimple } from './runtime/keyed-list-simple'
export { keyedListProp } from './runtime/keyed-list-prop'
export { createItemObservable, createItemProxy, readItem } from './runtime/keyed-list/item-obs'
export { _rescue } from './runtime/keyed-list/rescue'
export { GEA_CREATE_TEMPLATE } from './runtime/symbols'
export { GEA_PARENT_COMPONENT } from './runtime/symbols'
export { GEA_STATIC_TEMPLATE } from './runtime/compiled-static-symbols'
export { GEA_OBSERVE_DIRECT, GEA_SET_PROPS } from './runtime/internal-symbols'
export { GEA_PROXY_RAW } from './runtime/symbols'
export { GEA_DIRTY, GEA_DIRTY_PROPS } from './runtime/dirty-symbols'
