/**
 * Well-known symbols for engine-only Component / Router / Store internals.
 * User-visible state stays on string keys; these never participate in observe() paths.
 *
 */
export const GEA_SELF_PROXY = /*#__PURE__*/ Symbol.for('gea.selfProxy')

/** Store engine — `GEA_STORE_ROOT` replaces the `__store` getter. */
export const GEA_STORE_ROOT = /*#__PURE__*/ Symbol.for('gea.store.rootProxy')
/** Test/profiler hook: returns the browser root `ProxyHandler` (same object the store constructor uses). */
export const GEA_STORE_GET_BROWSER_ROOT_PROXY_HANDLER_FOR_TESTS = /*#__PURE__*/ Symbol.for(
  'gea.store.getBrowserRootProxyHandlerForTests',
)

/** Store proxy introspection (root + nested). */
export const GEA_PROXY_IS_PROXY = /*#__PURE__*/ Symbol.for('gea.proxy.isProxy')
export const GEA_PROXY_RAW = /*#__PURE__*/ Symbol.for('gea.proxy.raw')
export const GEA_PROXY_GET_RAW_TARGET = /*#__PURE__*/ Symbol.for('gea.proxy.getRawTarget')
export const GEA_PROXY_GET_TARGET = /*#__PURE__*/ Symbol.for('gea.proxy.getTarget')
export const GEA_PROXY_GET_PATH = /*#__PURE__*/ Symbol.for('gea.proxy.getPath')

/** Router: Outlet / RouterView marker (avoid string keys on component instances). */
export const GEA_IS_ROUTER_OUTLET = /*#__PURE__*/ Symbol.for('gea.router.isOutlet')
/** Router internals shared between RouterView and Outlet (cross-instance). */
export const GEA_ROUTER_DEPTH = /*#__PURE__*/ Symbol.for('gea.router.depth')
export const GEA_ROUTER_REF = /*#__PURE__*/ Symbol.for('gea.router.ref')

/**
 * Serialized `data-prop-*` attribute values that reference `GEA_PROP_BINDINGS` map keys.
 * DOM cannot store symbols; this prefix marks engine-owned binding tokens (not user strings).
 */
export const GEA_PROP_BINDING_ATTR_PREFIX = 'gea:p:'

/** Cached parent component id chain on DOM nodes (delegated events / bubbling). */
export const GEA_DOM_PARENT_CHAIN = /*#__PURE__*/ Symbol.for('gea.dom.parentChain')

export const GEA_ID = /*#__PURE__*/ Symbol.for('gea.id')
export const GEA_ELEMENT = /*#__PURE__*/ Symbol.for('gea.element')
/** Parent component link for compiled children / router / DnD (engine-only). */
export const GEA_PARENT_COMPONENT = /*#__PURE__*/ Symbol.for('gea.component.parentComponent')
export const GEA_RENDERED = /*#__PURE__*/ Symbol.for('gea.rendered')
export const GEA_RAW_PROPS = /*#__PURE__*/ Symbol.for('gea.rawProps')
export const GEA_BINDINGS = /*#__PURE__*/ Symbol.for('gea.bindings')
export const GEA_SELF_LISTENERS = /*#__PURE__*/ Symbol.for('gea.selfListeners')
export const GEA_CHILD_COMPONENTS = /*#__PURE__*/ Symbol.for('gea.childComponents')
export const GEA_DEPENDENCIES = /*#__PURE__*/ Symbol.for('gea.dependencies')
export const GEA_EVENT_BINDINGS = /*#__PURE__*/ Symbol.for('gea.eventBindings')
export const GEA_PROP_BINDINGS = /*#__PURE__*/ Symbol.for('gea.propBindings')
export const GEA_ATTR_BINDINGS = /*#__PURE__*/ Symbol.for('gea.attrBindings')
export const GEA_OBSERVER_REMOVERS = /*#__PURE__*/ Symbol.for('gea.observerRemovers')
export const GEA_COMPILED_CHILD = /*#__PURE__*/ Symbol.for('gea.compiledChild')
export const GEA_ITEM_KEY = /*#__PURE__*/ Symbol.for('gea.itemKey')
export const GEA_MAPS = /*#__PURE__*/ Symbol.for('gea.maps')
export const GEA_CONDS = /*#__PURE__*/ Symbol.for('gea.conds')
export const GEA_RESET_ELS = /*#__PURE__*/ Symbol.for('gea.resetEls')
export const GEA_LIST_CONFIGS = /*#__PURE__*/ Symbol.for('gea.listConfigs')

/**
 * Stable symbol key for a component-array backing store (same reference for a given
 * `arrayPropName` in every module/realm via the global symbol registry).
 */
export function geaListItemsSymbol(arrayPropName: string): symbol {
  return /*#__PURE__*/ Symbol.for(`gea.listItems.${arrayPropName}`)
}

/** Per-slot flag for conditional patch microtask reset (compiler-generated). */
export function geaCondPatchedSymbol(idx: number): symbol {
  return /*#__PURE__*/ Symbol.for(`gea.condPatched.${idx}`)
}

/** Cached boolean result of `getCond()` for conditional slots (compiler + runtime). */
export function geaCondValueSymbol(idx: number): symbol {
  return /*#__PURE__*/ Symbol.for(`gea.condValue.${idx}`)
}

/** Compiler: truthiness-only guard for early-return observer methods. */
export function geaPrevGuardSymbol(methodName: string): symbol {
  return /*#__PURE__*/ Symbol.for(`gea.prevGuard.${methodName}`)
}

/** Component engine methods — `this[GEA_*]()` only; never user string keys. */
export const GEA_APPLY_LIST_CHANGES = /*#__PURE__*/ Symbol.for('gea.component.applyListChanges')
export const GEA_CREATE_PROPS_PROXY = /*#__PURE__*/ Symbol.for('gea.component.createPropsProxy')
export const GEA_REACTIVE_PROPS = /*#__PURE__*/ Symbol.for('gea.component.reactiveProps')
export const GEA_UPDATE_PROPS = /*#__PURE__*/ Symbol.for('gea.component.updateProps')
export const GEA_REQUEST_RENDER = /*#__PURE__*/ Symbol.for('gea.component.requestRender')
export const GEA_RESET_CHILD_TREE = /*#__PURE__*/ Symbol.for('gea.component.resetChildTree')
export const GEA_CHILD = /*#__PURE__*/ Symbol.for('gea.component.child')
export const GEA_EL_CACHE = /*#__PURE__*/ Symbol.for('gea.component.elCache')
export const GEA_EL = /*#__PURE__*/ Symbol.for('gea.component.el')
export const GEA_UPDATE_TEXT = /*#__PURE__*/ Symbol.for('gea.component.updateText')
export const GEA_OBSERVE = /*#__PURE__*/ Symbol.for('gea.component.observe')
export const GEA_REORDER_CHILDREN = /*#__PURE__*/ Symbol.for('gea.component.reorderChildren')
export const GEA_RECONCILE_LIST = /*#__PURE__*/ Symbol.for('gea.component.reconcileList')
export const GEA_OBSERVE_LIST = /*#__PURE__*/ Symbol.for('gea.component.observeList')
export const GEA_REFRESH_LIST = /*#__PURE__*/ Symbol.for('gea.component.refreshList')
export const GEA_SWAP_CHILD = /*#__PURE__*/ Symbol.for('gea.component.swapChild')
export const GEA_REGISTER_MAP = /*#__PURE__*/ Symbol.for('gea.component.registerMap')
export const GEA_SYNC_MAP = /*#__PURE__*/ Symbol.for('gea.component.syncMap')
export const GEA_SYNC_ITEMS = /*#__PURE__*/ Symbol.for('gea.component.syncItems')
export const GEA_CLONE_ITEM = /*#__PURE__*/ Symbol.for('gea.component.cloneItem')
export const GEA_REGISTER_COND = /*#__PURE__*/ Symbol.for('gea.component.registerCond')
export const GEA_PATCH_COND = /*#__PURE__*/ Symbol.for('gea.component.patchCond')
export const GEA_SYNC_DOM_REFS = /*#__PURE__*/ Symbol.for('gea.component.syncDomRefs')
export const GEA_ENSURE_ARRAY_CONFIGS = /*#__PURE__*/ Symbol.for('gea.component.ensureArrayConfigs')
export const GEA_SWAP_STATE_CHILDREN = /*#__PURE__*/ Symbol.for('gea.component.swapStateChildren')

export const GEA_COMPONENT_CLASSES = /*#__PURE__*/ Symbol.for('gea.component.componentClasses')
export const GEA_STATIC_ESCAPE_HTML = /*#__PURE__*/ Symbol.for('gea.component.staticEscapeHtml')
export const GEA_STATIC_SANITIZE_ATTR = /*#__PURE__*/ Symbol.for('gea.component.staticSanitizeAttr')
export const GEA_SYNC_VALUE_PROPS = /*#__PURE__*/ Symbol.for('gea.component.syncValueProps')
export const GEA_SYNC_AUTOFOCUS = /*#__PURE__*/ Symbol.for('gea.component.syncAutofocus')
export const GEA_PATCH_NODE = /*#__PURE__*/ Symbol.for('gea.component.patchNode')
export const GEA_SETUP_LOCAL_STATE_OBSERVERS = /*#__PURE__*/ Symbol.for('gea.component.setupLocalStateObservers')
/** Compiler: `template()` clone for SSR/hydration; optional on subclasses. */
export const GEA_CLONE_TEMPLATE = /*#__PURE__*/ Symbol.for('gea.component.cloneTemplate')
/** Compiler: refresh `ref={}` targets after DOM updates. */
export const GEA_SETUP_REFS = /*#__PURE__*/ Symbol.for('gea.component.setupRefs')
/** Compiler: incremental prop-driven DOM patches after `props` updates. */
export const GEA_ON_PROP_CHANGE = /*#__PURE__*/ Symbol.for('gea.component.onPropChange')
/** Re-render helper: sync list rows not yet mounted (getter-backed lists). */
export const GEA_SYNC_UNRENDERED_LIST_ITEMS = /*#__PURE__*/ Symbol.for('gea.component.syncUnrenderedListItems')

/** Internal lifecycle / DOM helpers — override via `this[GEA_*]()`. */
export const GEA_ATTACH_BINDINGS = /*#__PURE__*/ Symbol.for('gea.component.attachBindings')
export const GEA_CLEANUP_BINDINGS = /*#__PURE__*/ Symbol.for('gea.component.cleanupBindings')
export const GEA_MOUNT_COMPILED_CHILD_COMPONENTS = /*#__PURE__*/ Symbol.for(
  'gea.component.mountCompiledChildComponents',
)
export const GEA_INSTANTIATE_CHILD_COMPONENTS = /*#__PURE__*/ Symbol.for('gea.component.instantiateChildComponents')
export const GEA_SETUP_EVENT_DIRECTIVES = /*#__PURE__*/ Symbol.for('gea.component.setupEventDirectives')
export const GEA_TEARDOWN_SELF_LISTENERS = /*#__PURE__*/ Symbol.for('gea.component.teardownSelfListeners')
export const GEA_EXTRACT_COMPONENT_PROPS = /*#__PURE__*/ Symbol.for('gea.component.extractComponentProps')
export const GEA_COERCE_STATIC_PROP_VALUE = /*#__PURE__*/ Symbol.for('gea.component.coerceStaticPropValue')
export const GEA_NORMALIZE_PROP_NAME = /*#__PURE__*/ Symbol.for('gea.component.normalizePropName')

export const GEA_CTOR_AUTO_REGISTERED = /*#__PURE__*/ Symbol.for('gea.ctor.autoRegistered')
export const GEA_CTOR_TAG_NAME = /*#__PURE__*/ Symbol.for('gea.ctor.tagName')

/** ComponentManager.callEventsGetterHandler: skip callItemHandler (delegated handler ran on an ancestor). */
export const GEA_SKIP_ITEM_HANDLER = /*#__PURE__*/ Symbol.for('gea.componentManager.skipItemHandler')

/** DOM expandos on nodes (engine-only). */
export const GEA_DOM_COMPONENT = /*#__PURE__*/ Symbol.for('gea.dom.component')
export const GEA_DOM_KEY = /*#__PURE__*/ Symbol.for('gea.dom.key')
export const GEA_DOM_ITEM = /*#__PURE__*/ Symbol.for('gea.dom.item')
export const GEA_DOM_PROPS = /*#__PURE__*/ Symbol.for('gea.dom.props')
export const GEA_DOM_COMPILED_CHILD_ROOT = /*#__PURE__*/ Symbol.for('gea.dom.compiledChildRoot')
/** Cached delegated event token (mirrors `data-ge` without attribute read). */
export const GEA_DOM_EVENT_HINT = /*#__PURE__*/ Symbol.for('gea.dom.eventHint')

/** Delegated `.map()` row clicks — `this[GEA_HANDLE_ITEM_HANDLER](itemId, e)`. */
export const GEA_HANDLE_ITEM_HANDLER = /*#__PURE__*/ Symbol.for('gea.component.handleItemHandler')

/** Map sync state on internal config objects. */
export const GEA_MAP_CONFIG_PREV = /*#__PURE__*/ Symbol.for('gea.mapConfig.prev')
export const GEA_MAP_CONFIG_COUNT = /*#__PURE__*/ Symbol.for('gea.mapConfig.count')
export const GEA_MAP_CONFIG_TPL = /*#__PURE__*/ Symbol.for('gea.mapConfig.tpl')

/** __observeList config bag */
export const GEA_LIST_CONFIG_REFRESHING = /*#__PURE__*/ Symbol.for('gea.listConfig.refreshing')
