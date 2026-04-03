//#region src/lib/base/uid.ts
let counter = Math.floor(Math.random() * 2147483648);
/** Optional provider for context-scoped UID generation (injected by SSR). */
let uidProvider = null;
/** Optional provider for context-scoped UID reset (injected by SSR). */
let resetProvider = null;
const getUid = () => {
	if (uidProvider) {
		const id = uidProvider();
		if (id !== null) return id;
	}
	return (counter++).toString(36);
};
/** Reset the UID counter to a deterministic seed. Used by SSR to ensure
*  server and client produce matching component IDs. */
function resetUidCounter(seed = 0) {
	if (resetProvider && resetProvider(seed)) return;
	counter = seed;
}
/** Register a context-scoped UID provider (called by SSR package).
*  Provider returns next UID string, or null to fall back to global counter.
*  Reset returns true if it handled the reset, false to fall through. */
function setUidProvider(provider, reset) {
	uidProvider = provider;
	resetProvider = reset;
}
/** Clear the context-scoped UID provider. */
function clearUidProvider() {
	uidProvider = null;
	resetProvider = null;
}
function tryComponentRootBridgeGet(t, prop) {
	return null;
}
function tryComponentRootBridgeSet(t, prop, value) {
	return false;
}
//#endregion
//#region src/lib/symbols.ts
/**
* Well-known symbols for engine-only Component / Router / Store internals.
* User-visible state stays on string keys; these never participate in observe() paths.
*/
const GEA_SELF_PROXY = Symbol.for("gea.selfProxy");
/** Store engine — `this[GEA_STORE_*]()`; `GEA_STORE_ROOT` replaces the `__store` getter. */
const GEA_STORE_ROOT = Symbol.for("gea.store.rootProxy");
const GEA_STORE_CREATE_PROXY = Symbol.for("gea.store.createProxy");
const GEA_STORE_FLUSH_CHANGES = Symbol.for("gea.store.flushChanges");
const GEA_STORE_EMIT_CHANGES = Symbol.for("gea.store.emitChanges");
const GEA_STORE_ADD_OBSERVER = Symbol.for("gea.store.addObserver");
const GEA_STORE_COLLECT_MATCHING_OBSERVER_NODES = Symbol.for("gea.store.collectMatchingObserverNodes");
const GEA_STORE_COLLECT_DESCENDANT_OBSERVER_NODES = Symbol.for("gea.store.collectDescendantObserverNodes");
const GEA_STORE_ADD_DESCENDANTS_FOR_OBJECT_REPLACEMENT = Symbol.for("gea.store.addDescendantsForObjectReplacement");
const GEA_STORE_GET_OBSERVER_NODE = Symbol.for("gea.store.getObserverNode");
const GEA_STORE_COLLECT_MATCHING_OBSERVER_NODES_FROM_NODE = Symbol.for("gea.store.collectMatchingObserverNodesFromNode");
const GEA_STORE_NOTIFY_HANDLERS = Symbol.for("gea.store.notifyHandlers");
const GEA_STORE_NOTIFY_HANDLERS_WITH_VALUE = Symbol.for("gea.store.notifyHandlersWithValue");
const GEA_STORE_GET_DIRECT_TOP_LEVEL_OBSERVED_VALUE = Symbol.for("gea.store.getDirectTopLevelObservedValue");
const GEA_STORE_GET_TOP_LEVEL_OBSERVED_VALUE = Symbol.for("gea.store.getTopLevelObservedValue");
const GEA_STORE_CLEAR_ARRAY_INDEX_CACHE = Symbol.for("gea.store.clearArrayIndexCache");
const GEA_STORE_NORMALIZE_BATCH = Symbol.for("gea.store.normalizeBatch");
const GEA_STORE_DELIVER_ARRAY_ITEM_PROP_BATCH = Symbol.for("gea.store.deliverArrayItemPropBatch");
const GEA_STORE_DELIVER_KNOWN_ARRAY_ITEM_PROP_BATCH = Symbol.for("gea.store.deliverKnownArrayItemPropBatch");
const GEA_STORE_DELIVER_TOP_LEVEL_BATCH = Symbol.for("gea.store.deliverTopLevelBatch");
const GEA_STORE_QUEUE_CHANGE = Symbol.for("gea.store.queueChange");
const GEA_STORE_TRACK_PENDING_CHANGE = Symbol.for("gea.store.trackPendingChange");
const GEA_STORE_SCHEDULE_FLUSH = Symbol.for("gea.store.scheduleFlush");
const GEA_STORE_QUEUE_DIRECT_ARRAY_ITEM_PRIMITIVE_CHANGE = Symbol.for("gea.store.queueDirectArrayItemPrimitiveChange");
const GEA_STORE_INTERCEPT_ARRAY_METHOD = Symbol.for("gea.store.interceptArrayMethod");
const GEA_STORE_INTERCEPT_ARRAY_ITERATOR = Symbol.for("gea.store.interceptArrayIterator");
const GEA_STORE_GET_CACHED_ARRAY_META = Symbol.for("gea.store.getCachedArrayMeta");
/** Test/profiler hook: returns the browser root `ProxyHandler` (same object the store constructor uses). */
const GEA_STORE_GET_BROWSER_ROOT_PROXY_HANDLER_FOR_TESTS = Symbol.for("gea.store.getBrowserRootProxyHandlerForTests");
/** Store proxy introspection (root + nested). */
const GEA_PROXY_IS_PROXY = Symbol.for("gea.proxy.isProxy");
const GEA_PROXY_RAW = Symbol.for("gea.proxy.raw");
const GEA_PROXY_GET_RAW_TARGET = Symbol.for("gea.proxy.getRawTarget");
const GEA_PROXY_GET_TARGET = Symbol.for("gea.proxy.getTarget");
const GEA_PROXY_GET_PATH = Symbol.for("gea.proxy.getPath");
/** Router: Outlet / RouterView marker (avoid string keys on component instances). */
const GEA_IS_ROUTER_OUTLET = Symbol.for("gea.router.isOutlet");
/**
* Serialized `data-prop-*` attribute values that reference `GEA_PROP_BINDINGS` map keys.
* DOM cannot store symbols; this prefix marks engine-owned binding tokens (not user strings).
*/
const GEA_PROP_BINDING_ATTR_PREFIX = "gea:p:";
/** Cached parent component id chain on DOM nodes (delegated events / bubbling). */
const GEA_DOM_PARENT_CHAIN = Symbol.for("gea.dom.parentChain");
const GEA_ID = Symbol.for("gea.id");
const GEA_ELEMENT = Symbol.for("gea.element");
/** Parent component link for compiled children / router / DnD (engine-only). */
const GEA_PARENT_COMPONENT = Symbol.for("gea.component.parentComponent");
const GEA_RENDERED = Symbol.for("gea.rendered");
const GEA_RAW_PROPS = Symbol("gea.rawProps");
const GEA_BINDINGS = Symbol("gea.bindings");
const GEA_SELF_LISTENERS = Symbol("gea.selfListeners");
const GEA_CHILD_COMPONENTS = Symbol("gea.childComponents");
const GEA_DEPENDENCIES = Symbol("gea.dependencies");
const GEA_EVENT_BINDINGS = Symbol("gea.eventBindings");
const GEA_PROP_BINDINGS = Symbol("gea.propBindings");
const GEA_ATTR_BINDINGS = Symbol("gea.attrBindings");
const GEA_OBSERVER_REMOVERS = Symbol("gea.observerRemovers");
const GEA_COMPILED_CHILD = Symbol("gea.compiledChild");
const GEA_ITEM_KEY = Symbol("gea.itemKey");
const GEA_MAPS = Symbol("gea.maps");
const GEA_CONDS = Symbol("gea.conds");
const GEA_RESET_ELS = Symbol("gea.resetEls");
const GEA_LIST_CONFIGS = Symbol("gea.listConfigs");
/** Router / Outlet / RouterView internals */
const GEA_ROUTER_DEPTH = Symbol("gea.routerDepth");
const GEA_ROUTER = Symbol("gea.router");
const GEA_ROUTES_APPLIED = Symbol("gea.routesApplied");
const GEA_CURRENT_COMP_CLASS = Symbol("gea.currentCompClass");
const GEA_LAYOUTS = Symbol("gea.layouts");
/**
* Stable symbol key for a component-array backing store (same reference for a given
* `arrayPropName` in every module/realm via the global symbol registry).
*/
function geaListItemsSymbol(arrayPropName) {
	return Symbol.for(`gea.listItems.${arrayPropName}`);
}
/** Per-slot flag for conditional patch microtask reset (compiler-generated). */
function geaCondPatchedSymbol(idx) {
	return Symbol.for(`gea.condPatched.${idx}`);
}
/** Cached boolean result of `getCond()` for conditional slots (compiler + runtime). */
function geaCondValueSymbol(idx) {
	return Symbol.for(`gea.condValue.${idx}`);
}
/** Compiler: last value seen by `__observe_*` rerender guard (reference equality / truthiness). */
function geaObservePrevSymbol(methodName) {
	return Symbol.for(`gea.observePrev.${methodName}`);
}
/** Compiler: truthiness-only guard for early-return observer methods. */
function geaPrevGuardSymbol(methodName) {
	return Symbol.for(`gea.prevGuard.${methodName}`);
}
/** Component engine methods — `this[GEA_*]()` only; never user string keys. */
const GEA_APPLY_LIST_CHANGES = Symbol.for("gea.component.applyListChanges");
const GEA_CREATE_PROPS_PROXY = Symbol.for("gea.component.createPropsProxy");
const GEA_REACTIVE_PROPS = Symbol.for("gea.component.reactiveProps");
const GEA_UPDATE_PROPS = Symbol.for("gea.component.updateProps");
const GEA_REQUEST_RENDER = Symbol.for("gea.component.requestRender");
const GEA_RESET_CHILD_TREE = Symbol.for("gea.component.resetChildTree");
const GEA_CHILD = Symbol.for("gea.component.child");
const GEA_EL_CACHE = Symbol.for("gea.component.elCache");
const GEA_EL = Symbol.for("gea.component.el");
const GEA_UPDATE_TEXT = Symbol.for("gea.component.updateText");
const GEA_OBSERVE = Symbol.for("gea.component.observe");
const GEA_REORDER_CHILDREN = Symbol.for("gea.component.reorderChildren");
const GEA_RECONCILE_LIST = Symbol.for("gea.component.reconcileList");
const GEA_OBSERVE_LIST = Symbol.for("gea.component.observeList");
const GEA_REFRESH_LIST = Symbol.for("gea.component.refreshList");
const GEA_SWAP_CHILD = Symbol.for("gea.component.swapChild");
const GEA_REGISTER_MAP = Symbol.for("gea.component.registerMap");
const GEA_SYNC_MAP = Symbol.for("gea.component.syncMap");
const GEA_SYNC_ITEMS = Symbol.for("gea.component.syncItems");
const GEA_CLONE_ITEM = Symbol.for("gea.component.cloneItem");
const GEA_REGISTER_COND = Symbol.for("gea.component.registerCond");
const GEA_PATCH_COND = Symbol.for("gea.component.patchCond");
const GEA_SYNC_DOM_REFS = Symbol.for("gea.component.syncDomRefs");
const GEA_ENSURE_ARRAY_CONFIGS = Symbol.for("gea.component.ensureArrayConfigs");
const GEA_SWAP_STATE_CHILDREN = Symbol.for("gea.component.swapStateChildren");
const GEA_COMPONENT_CLASSES = Symbol.for("gea.component.componentClasses");
const GEA_STATIC_ESCAPE_HTML = Symbol.for("gea.component.staticEscapeHtml");
const GEA_STATIC_SANITIZE_ATTR = Symbol.for("gea.component.staticSanitizeAttr");
const GEA_SYNC_VALUE_PROPS = Symbol.for("gea.component.syncValueProps");
const GEA_SYNC_AUTOFOCUS = Symbol.for("gea.component.syncAutofocus");
const GEA_PATCH_NODE = Symbol.for("gea.component.patchNode");
const GEA_SETUP_LOCAL_STATE_OBSERVERS = Symbol.for("gea.component.setupLocalStateObservers");
/** Compiler: `template()` clone for SSR/hydration; optional on subclasses. */
const GEA_CLONE_TEMPLATE = Symbol.for("gea.component.cloneTemplate");
/** Compiler: refresh `ref={}` targets after DOM updates. */
const GEA_SETUP_REFS = Symbol.for("gea.component.setupRefs");
/** Compiler: incremental prop-driven DOM patches after `props` updates. */
const GEA_ON_PROP_CHANGE = Symbol.for("gea.component.onPropChange");
/** Re-render helper: sync list rows not yet mounted (getter-backed lists). */
const GEA_SYNC_UNRENDERED_LIST_ITEMS = Symbol.for("gea.component.syncUnrenderedListItems");
/** Internal lifecycle / DOM helpers — override via `this[GEA_*]()`. */
const GEA_ATTACH_BINDINGS = Symbol.for("gea.component.attachBindings");
const GEA_CLEANUP_BINDINGS = Symbol.for("gea.component.cleanupBindings");
const GEA_MOUNT_COMPILED_CHILD_COMPONENTS = Symbol.for("gea.component.mountCompiledChildComponents");
const GEA_INSTANTIATE_CHILD_COMPONENTS = Symbol.for("gea.component.instantiateChildComponents");
const GEA_SETUP_EVENT_DIRECTIVES = Symbol.for("gea.component.setupEventDirectives");
const GEA_TEARDOWN_SELF_LISTENERS = Symbol.for("gea.component.teardownSelfListeners");
const GEA_EXTRACT_COMPONENT_PROPS = Symbol.for("gea.component.extractComponentProps");
const GEA_COERCE_STATIC_PROP_VALUE = Symbol.for("gea.component.coerceStaticPropValue");
const GEA_NORMALIZE_PROP_NAME = Symbol.for("gea.component.normalizePropName");
const GEA_CTOR_AUTO_REGISTERED = Symbol.for("gea.ctor.autoRegistered");
const GEA_CTOR_TAG_NAME = Symbol.for("gea.ctor.tagName");
/** ComponentManager.callEventsGetterHandler: skip callItemHandler (delegated handler ran on an ancestor). */
const GEA_SKIP_ITEM_HANDLER = Symbol.for("gea.componentManager.skipItemHandler");
/** DOM expandos on nodes (engine-only). */
const GEA_DOM_COMPONENT = Symbol.for("gea.dom.component");
const GEA_DOM_KEY = Symbol.for("gea.dom.key");
const GEA_DOM_ITEM = Symbol.for("gea.dom.item");
const GEA_DOM_PROPS = Symbol.for("gea.dom.props");
const GEA_DOM_COMPILED_CHILD_ROOT = Symbol.for("gea.dom.compiledChildRoot");
/** Cached delegated event token (mirrors `data-gea-event` without attribute read). */
const GEA_DOM_EVENT_HINT = Symbol.for("gea.dom.eventHint");
/** Delegated `.map()` row clicks — `this[GEA_HANDLE_ITEM_HANDLER](itemId, e)`. */
const GEA_HANDLE_ITEM_HANDLER = Symbol.for("gea.component.handleItemHandler");
/** Map sync state on internal config objects. */
const GEA_MAP_CONFIG_PREV = Symbol.for("gea.mapConfig.prev");
const GEA_MAP_CONFIG_COUNT = Symbol.for("gea.mapConfig.count");
const GEA_MAP_CONFIG_TPL = Symbol.for("gea.mapConfig.tpl");
/** __observeList config bag */
const GEA_LIST_CONFIG_REFRESHING = Symbol.for("gea.listConfig.refreshing");
//#endregion
//#region src/lib/store.ts
function createObserverNode(pathParts) {
	return {
		pathParts,
		handlers: /* @__PURE__ */ new Set(),
		children: /* @__PURE__ */ new Map()
	};
}
const storeInstancePrivate = /* @__PURE__ */ new WeakMap();
function storeRaw(st) {
	return st[GEA_PROXY_GET_RAW_TARGET] ?? st[GEA_PROXY_RAW] ?? st;
}
function unwrapNestedProxyValue(value) {
	if (value && typeof value === "object" && value[GEA_PROXY_IS_PROXY]) {
		const raw = value[GEA_PROXY_GET_TARGET];
		if (raw !== void 0) return raw;
	}
	return value;
}
function getPriv(st) {
	return storeInstancePrivate.get(storeRaw(st));
}
function splitPath(path) {
	if (Array.isArray(path)) return path;
	return path ? path.split(".") : [];
}
function appendPathParts(pathParts, propStr) {
	return pathParts.length > 0 ? [...pathParts, propStr] : [propStr];
}
/** Same rule as rootGetValue: only plain objects and arrays get nested reactive proxies. */
function shouldWrapNestedReactiveValue(value) {
	if (value == null || typeof value !== "object") return false;
	if (Array.isArray(value)) return true;
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}
function getByPathParts(obj, pathParts) {
	let current = obj;
	for (let i = 0; i < pathParts.length; i++) {
		if (current == null) return void 0;
		current = current[pathParts[i]];
	}
	return current;
}
function proxyIterate(arr, basePath, baseParts, mkProxy, method, cb, thisArg) {
	const isMap = method === "map";
	const result = isMap ? new Array(arr.length) : method === "filter" ? [] : void 0;
	for (let i = 0; i < arr.length; i++) {
		const nextPath = basePath ? `${basePath}.${i}` : String(i);
		const raw = arr[i];
		const p = shouldWrapNestedReactiveValue(raw) ? mkProxy(raw, nextPath, appendPathParts(baseParts, String(i))) : raw;
		const v = cb.call(thisArg, p, i, arr);
		if (isMap) result[i] = v;
		else if (v) {
			if (method === "filter") result.push(p);
			else if (method === "some") return true;
			else if (method === "find") return p;
			else if (method === "findIndex") return i;
		} else if (method === "every") return false;
	}
	if (method === "some") return false;
	if (method === "every") return true;
	if (method === "findIndex") return -1;
	return result;
}
function isNumericIndex(value) {
	const len = value.length;
	if (len === 0) return false;
	for (let i = 0; i < len; i++) {
		const c = value.charCodeAt(i);
		if (c < 48 || c > 57) return false;
	}
	return true;
}
function samePathParts$1(a, b) {
	if (!a || !b || a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
	return true;
}
/** `class C {}` values must not be `.bind()`'d on the root proxy — breaks `===` with route components. */
function isClassConstructorValue(fn) {
	if (typeof fn !== "function") return false;
	const proto = fn.prototype;
	if (proto && typeof proto === "object") {
		const ctor = proto.constructor;
		if (typeof ctor === "function" && ctor !== fn) try {
			const d = Object.getOwnPropertyDescriptor(ctor, "prototype");
			if (d && d.writable === false) return true;
		} catch {}
	}
	if (!proto || proto.constructor !== fn) return false;
	try {
		const desc = Object.getOwnPropertyDescriptor(fn, "prototype");
		if (desc && desc.writable === false) return true;
	} catch {}
	return /^\s*class\s/.test(Function.prototype.toString.call(fn));
}
function isArrayIndexUpdate(change) {
	return change && change.type === "update" && Array.isArray(change.target) && isNumericIndex(change.property);
}
function isReciprocalSwap(a, b) {
	if (!isArrayIndexUpdate(a) || !isArrayIndexUpdate(b)) return false;
	if (a.target !== b.target || a.property === b.property) return false;
	if (!samePathParts$1(a.pathParts.slice(0, -1), b.pathParts.slice(0, -1))) return false;
	return a.previousValue === b.newValue && b.previousValue === a.newValue;
}
/**
* Walk the prototype chain for `prop` (same as Reflect.get semantics for accessors).
* Used by the root proxy and SSR so `set`/`delete` on accessors do not go through
* reactive `rootSetValue`/`rootDeleteProperty` (no change notifications for framework
* getters/setters; user data fields remain plain data properties).
*/
function findPropertyDescriptor(obj, prop) {
	let o = obj;
	while (o) {
		const d = Object.getOwnPropertyDescriptor(o, prop);
		if (d) return d;
		o = Object.getPrototypeOf(o);
	}
}
/**
* Top-level string keys that must not be wrapped in reactive proxies at the store root.
* Engine state for components lives in WeakMaps / symbol keys; symbol keys are never wrapped.
*/
const SKIP_REACTIVE_WRAP_AT_ROOT = new Set([
	"props",
	"events",
	"compiledItems",
	"_routerDepth",
	"_router",
	"_routesApplied",
	"_currentComponentClass",
	"_layouts",
	"_items"
]);
function topPathSegment(path) {
	const dot = path.indexOf(".");
	return dot === -1 ? path : path.slice(0, dot);
}
/**
* Nested paths that must not be wrapped in reactive proxies (delegated event maps,
* compiler-generated plain objects, etc.).
*/
function shouldSkipReactiveWrapForPath(basePath) {
	if (basePath === "events" || basePath.startsWith("events.")) return true;
	const head = topPathSegment(basePath);
	if (SKIP_REACTIVE_WRAP_AT_ROOT.has(head)) return true;
	if (/^_[a-zA-Z][a-zA-Z0-9]*Items$/.test(head)) return true;
	return false;
}
/**
* Reactive store: class fields become reactive properties automatically.
* Methods and getters on the prototype are not reactive.
*
* @example
* class CounterStore extends Store {
*   count = 0
*   increment() { this.count++ }
*   decrement() { this.count-- }
* }
*/
var Store = class Store {
	/**
	* Engine-room state lives in a `WeakMap` keyed by the raw instance (never on the public proxy).
	* Root proxy `get` binds methods to the **receiver** (proxy) so `this.todos` etc. go through
	* reactive `rootGetValue`; internals use `getPriv(this)` / `storeRaw(this)`.
	*/
	static #noDirectTopLevelValue = Symbol("noDirectTopLevelValue");
	static {
		this.rootProxyHandlerFactory = null;
	}
	static #pendingStores = /* @__PURE__ */ new Set();
	static #flushing = false;
	static flushAll() {
		if (Store.#flushing) return;
		Store.#flushing = true;
		try {
			for (const store of Store.#pendingStores) store.flushSync();
			Store.#pendingStores.clear();
		} finally {
			Store.#flushing = false;
		}
	}
	static rootGetValue(t, prop, receiver) {
		if (!Object.prototype.hasOwnProperty.call(t, prop)) return Reflect.get(t, prop, receiver);
		const value = t[prop];
		if (typeof value === "function") return value;
		if (value !== null && value !== void 0 && typeof value === "object") {
			if (Object.getPrototypeOf(value) !== Object.prototype && !Array.isArray(value)) return value;
			if (shouldSkipReactiveWrapForPath(prop)) return value;
			const entry = getPriv(t).topLevelProxies.get(prop);
			if (entry && entry[0] === value) return entry[1];
			const p = t[GEA_STORE_CREATE_PROXY](value, prop, [prop]);
			getPriv(t).topLevelProxies.set(prop, [value, p]);
			return p;
		}
		return value;
	}
	static rootSetValue(t, prop, value) {
		if (typeof value === "function") {
			t[prop] = value;
			return true;
		}
		const pathParts = Store.#rootPathPartsCache(t, prop);
		if (value === null || value === void 0 || typeof value !== "object") {
			const oldValue = t[prop];
			if (oldValue === value && prop in t) return true;
			const hadProp = prop in t;
			if (oldValue && typeof oldValue === "object") {
				getPriv(t).proxyCache.delete(oldValue);
				getPriv(t).arrayIndexProxyCache.delete(oldValue);
				getPriv(t).topLevelProxies.delete(prop);
			}
			t[prop] = value;
			getPriv(t).pendingChanges.push({
				type: hadProp ? "update" : "add",
				property: prop,
				target: t,
				pathParts,
				newValue: value,
				previousValue: oldValue
			});
			if (getPriv(t).pendingBatchKind !== 2) {
				getPriv(t).pendingBatchKind = 2;
				getPriv(t).pendingBatchArrayPathParts = null;
			}
			if (!getPriv(t).flushScheduled) {
				getPriv(t).flushScheduled = true;
				Store.#pendingStores.add(t);
				queueMicrotask(() => t[GEA_STORE_FLUSH_CHANGES]());
			}
			return true;
		}
		value = unwrapNestedProxyValue(value);
		const hadProp = Object.prototype.hasOwnProperty.call(t, prop);
		const oldValue = hadProp ? t[prop] : void 0;
		if (hadProp && oldValue === value) return true;
		if (oldValue && typeof oldValue === "object") {
			getPriv(t).proxyCache.delete(oldValue);
			getPriv(t).arrayIndexProxyCache.delete(oldValue);
		}
		getPriv(t).topLevelProxies.delete(prop);
		t[prop] = value;
		if (Array.isArray(oldValue) && oldValue.length > 0 && Array.isArray(value) && value.length > oldValue.length) {
			let isAppend = true;
			for (let i = 0; i < oldValue.length; i++) if (oldValue[i] !== value[i]) {
				isAppend = false;
				break;
			}
			if (isAppend) {
				const start = oldValue.length;
				t[GEA_STORE_EMIT_CHANGES]([{
					type: "append",
					property: prop,
					target: t,
					pathParts,
					start,
					count: value.length - start,
					newValue: value.slice(start)
				}]);
				return true;
			}
		}
		getPriv(t).pendingChanges.push({
			type: hadProp ? "update" : "add",
			property: prop,
			target: t,
			pathParts,
			newValue: value,
			previousValue: oldValue
		});
		if (getPriv(t).pendingBatchKind !== 2) {
			getPriv(t).pendingBatchKind = 2;
			getPriv(t).pendingBatchArrayPathParts = null;
		}
		if (!getPriv(t).flushScheduled) {
			getPriv(t).flushScheduled = true;
			Store.#pendingStores.add(t);
			queueMicrotask(() => t[GEA_STORE_FLUSH_CHANGES]());
		}
		return true;
	}
	static rootDeleteProperty(t, prop) {
		if (!Object.prototype.hasOwnProperty.call(t, prop)) return true;
		const oldValue = t[prop];
		if (oldValue && typeof oldValue === "object") {
			getPriv(t).proxyCache.delete(oldValue);
			getPriv(t).arrayIndexProxyCache.delete(oldValue);
		}
		getPriv(t).topLevelProxies.delete(prop);
		delete t[prop];
		t[GEA_STORE_EMIT_CHANGES]([{
			type: "delete",
			property: prop,
			target: t,
			pathParts: Store.#rootPathPartsCache(t, prop),
			previousValue: oldValue
		}]);
		return true;
	}
	static #rootPathPartsCache(t, prop) {
		let parts = getPriv(t).pathPartsCache.get(prop);
		if (parts === void 0) {
			parts = [prop];
			getPriv(t).pathPartsCache.set(prop, parts);
		}
		return parts;
	}
	/**
	* Browser root proxy: **4 traps only** (get/set/deleteProperty/defineProperty).
	* No `has`/`ownKeys`/`getOwnPropertyDescriptor` — V8 optimizes this shape better for hot paths.
	*
	* SSR overlay handler lives in `@geajs/ssr` and is wired via `Store.rootProxyHandlerFactory`.
	*/
	static #browserRootProxyHandler;
	static #getBrowserRootProxyHandler() {
		if (!Store.#browserRootProxyHandler) Store.#browserRootProxyHandler = {
			get(t, prop, receiver) {
				if (typeof prop === "symbol") {
					if (prop === GEA_PROXY_IS_PROXY) return true;
					if (prop === GEA_PROXY_RAW || prop === GEA_PROXY_GET_RAW_TARGET) return t;
					return Reflect.get(t, prop, receiver);
				}
				if (typeof prop === "string") {
					const bridged = tryComponentRootBridgeGet(t, prop);
					if (bridged?.ok) {
						const v = bridged.value;
						if (typeof v !== "function") return v;
						return isClassConstructorValue(v) ? v : v.bind(receiver);
					}
				}
				const v = Store.rootGetValue(t, prop, receiver);
				if (typeof v !== "function") return v;
				return isClassConstructorValue(v) ? v : v.bind(receiver);
			},
			set(t, prop, value, receiver) {
				if (typeof prop === "symbol") {
					t[prop] = value;
					return true;
				}
				if (findPropertyDescriptor(t, prop)?.set) return Reflect.set(t, prop, value, receiver);
				if (typeof prop === "string" && tryComponentRootBridgeSet(t, prop, value)) return true;
				return Store.rootSetValue(t, prop, value);
			},
			deleteProperty(t, prop) {
				if (typeof prop === "symbol") {
					delete t[prop];
					return true;
				}
				const desc = findPropertyDescriptor(t, prop);
				if (desc && (desc.get || desc.set)) return Reflect.deleteProperty(t, prop);
				return Store.rootDeleteProperty(t, prop);
			},
			defineProperty(t, prop, descriptor) {
				return Reflect.defineProperty(t, prop, descriptor);
			}
		};
		return Store.#browserRootProxyHandler;
	}
	static [GEA_STORE_GET_BROWSER_ROOT_PROXY_HANDLER_FOR_TESTS]() {
		return Store.#getBrowserRootProxyHandler();
	}
	constructor(initialData) {
		const priv = {
			selfProxy: void 0,
			pendingChanges: [],
			pendingChangesPool: [],
			flushScheduled: false,
			nextArrayOpId: 0,
			observerRoot: createObserverNode([]),
			proxyCache: /* @__PURE__ */ new WeakMap(),
			arrayIndexProxyCache: /* @__PURE__ */ new WeakMap(),
			internedArrayPaths: /* @__PURE__ */ new Map(),
			topLevelProxies: /* @__PURE__ */ new Map(),
			pathPartsCache: /* @__PURE__ */ new Map(),
			pendingBatchKind: 0,
			pendingBatchArrayPathParts: null
		};
		storeInstancePrivate.set(this, priv);
		const handler = Store.rootProxyHandlerFactory ? Store.rootProxyHandlerFactory() : Store.#getBrowserRootProxyHandler();
		const proxy = new Proxy(this, handler);
		priv.selfProxy = proxy;
		this[GEA_SELF_PROXY] = proxy;
		if (initialData) for (const key of Object.keys(initialData)) Object.defineProperty(this, key, {
			value: initialData[key],
			writable: true,
			enumerable: true,
			configurable: true
		});
		return proxy;
	}
	/** Used by vite plugin when passing store to components. Same as `this`. */
	get [GEA_STORE_ROOT]() {
		return this;
	}
	flushSync() {
		if (getPriv(this).pendingChanges.length > 0) this[GEA_STORE_FLUSH_CHANGES]();
	}
	silent(fn) {
		try {
			fn();
		} finally {
			const p = getPriv(this);
			p.pendingChanges = [];
			p.flushScheduled = false;
			p.pendingBatchKind = 0;
			p.pendingBatchArrayPathParts = null;
		}
	}
	observe(path, handler) {
		const pathParts = splitPath(path);
		return this[GEA_STORE_ADD_OBSERVER](pathParts, handler);
	}
	[GEA_STORE_ADD_OBSERVER](pathParts, handler) {
		const p = getPriv(this);
		const nodes = [p.observerRoot];
		let node = p.observerRoot;
		for (let i = 0; i < pathParts.length; i++) {
			const part = pathParts[i];
			let child = node.children.get(part);
			if (!child) {
				child = createObserverNode(appendPathParts(node.pathParts, part));
				node.children.set(part, child);
			}
			node = child;
			nodes.push(node);
		}
		node.handlers.add(handler);
		return () => {
			node.handlers.delete(handler);
			for (let i = nodes.length - 1; i > 0; i--) {
				const current = nodes[i];
				if (current.handlers.size > 0 || current.children.size > 0) break;
				nodes[i - 1].children.delete(pathParts[i - 1]);
			}
		};
	}
	[GEA_STORE_COLLECT_MATCHING_OBSERVER_NODES](pathParts) {
		const matches = [];
		let node = getPriv(this).observerRoot;
		if (node.handlers.size > 0) matches.push(node);
		for (let i = 0; i < pathParts.length; i++) {
			node = node.children.get(pathParts[i]);
			if (!node) break;
			if (node.handlers.size > 0) matches.push(node);
		}
		return matches;
	}
	[GEA_STORE_COLLECT_DESCENDANT_OBSERVER_NODES](node, matches) {
		for (const child of node.children.values()) {
			if (child.handlers.size > 0) matches.push(child);
			if (child.children.size > 0) this[GEA_STORE_COLLECT_DESCENDANT_OBSERVER_NODES](child, matches);
		}
	}
	/** When a property is replaced with a new object, descendant observers
	*  must be notified because their nested values may have changed. */
	[GEA_STORE_ADD_DESCENDANTS_FOR_OBJECT_REPLACEMENT](change, matches) {
		if ((change.type === "update" || change.type === "add") && change.newValue && typeof change.newValue === "object") {
			const node = this[GEA_STORE_GET_OBSERVER_NODE](change.pathParts);
			if (node && node.children.size > 0) this[GEA_STORE_COLLECT_DESCENDANT_OBSERVER_NODES](node, matches);
		}
	}
	[GEA_STORE_GET_OBSERVER_NODE](pathParts) {
		let node = getPriv(this).observerRoot;
		for (let i = 0; i < pathParts.length; i++) {
			node = node.children.get(pathParts[i]);
			if (!node) return null;
		}
		return node;
	}
	[GEA_STORE_COLLECT_MATCHING_OBSERVER_NODES_FROM_NODE](startNode, pathParts, offset) {
		const matches = [];
		let node = startNode;
		for (let i = offset; i < pathParts.length; i++) {
			node = node.children.get(pathParts[i]);
			if (!node) break;
			if (node.handlers.size > 0) matches.push(node);
		}
		return matches;
	}
	[GEA_STORE_NOTIFY_HANDLERS](node, relevant) {
		const value = getByPathParts(storeRaw(this), node.pathParts);
		for (const handler of node.handlers) handler(value, relevant);
	}
	[GEA_STORE_NOTIFY_HANDLERS_WITH_VALUE](node, value, relevant) {
		const handlers = node.handlers;
		if (handlers.size === 1) {
			handlers.values().next().value(value, relevant);
			return;
		}
		for (const handler of handlers) handler(value, relevant);
	}
	[GEA_STORE_GET_DIRECT_TOP_LEVEL_OBSERVED_VALUE](change) {
		const nextValue = change.newValue;
		if (Array.isArray(nextValue) && nextValue.length === 0) return nextValue;
		return Store.#noDirectTopLevelValue;
	}
	[GEA_STORE_GET_TOP_LEVEL_OBSERVED_VALUE](change) {
		if (change.type === "delete") return void 0;
		const value = this[change.property];
		if (value === null || value === void 0 || typeof value !== "object") return value;
		if (Object.getPrototypeOf(value) !== Object.prototype && !Array.isArray(value)) return value;
		const p = getPriv(this);
		const entry = p.topLevelProxies.get(change.property);
		if (entry && entry[0] === value) return entry[1];
		const proxy = this[GEA_STORE_CREATE_PROXY](value, change.property, [change.property]);
		p.topLevelProxies.set(change.property, [value, proxy]);
		return proxy;
	}
	[GEA_STORE_CLEAR_ARRAY_INDEX_CACHE](arr) {
		if (arr && typeof arr === "object") getPriv(this).arrayIndexProxyCache.delete(arr);
	}
	[GEA_STORE_NORMALIZE_BATCH](batch) {
		if (batch.length < 2) return batch;
		let allLeafArrayPropUpdates = true;
		for (let i = 0; i < batch.length; i++) {
			const change = batch[i];
			if (!change?.isArrayItemPropUpdate || !change.leafPathParts || change.leafPathParts.length === 0) {
				allLeafArrayPropUpdates = false;
				break;
			}
		}
		if (allLeafArrayPropUpdates) return batch;
		let used;
		for (let i = 0; i < batch.length; i++) {
			if (used?.has(i)) continue;
			const change = batch[i];
			if (!isArrayIndexUpdate(change)) continue;
			for (let j = i + 1; j < batch.length; j++) {
				if (used?.has(j)) continue;
				const candidate = batch[j];
				if (!isReciprocalSwap(change, candidate)) continue;
				if (!used) used = /* @__PURE__ */ new Set();
				const opId = `swap:${getPriv(this).nextArrayOpId++}`;
				const arrayPathParts = change.pathParts.slice(0, -1);
				const changeIndex = Number(change.property);
				const candidateIndex = Number(candidate.property);
				change.arrayPathParts = arrayPathParts;
				candidate.arrayPathParts = arrayPathParts;
				change.arrayOp = "swap";
				candidate.arrayOp = "swap";
				change.otherIndex = candidateIndex;
				candidate.otherIndex = changeIndex;
				change.opId = opId;
				candidate.opId = opId;
				used.add(i);
				used.add(j);
				break;
			}
		}
		return batch;
	}
	[GEA_STORE_DELIVER_ARRAY_ITEM_PROP_BATCH](batch) {
		if (!batch[0]?.isArrayItemPropUpdate) return false;
		const arrayPathParts = batch[0].arrayPathParts;
		let allSameArray = true;
		for (let i = 1; i < batch.length; i++) {
			const change = batch[i];
			if (!change.isArrayItemPropUpdate || change.arrayPathParts !== arrayPathParts && !samePathParts$1(change.arrayPathParts, arrayPathParts)) {
				allSameArray = false;
				break;
			}
		}
		if (!allSameArray) return false;
		return this[GEA_STORE_DELIVER_KNOWN_ARRAY_ITEM_PROP_BATCH](batch, arrayPathParts);
	}
	[GEA_STORE_DELIVER_KNOWN_ARRAY_ITEM_PROP_BATCH](batch, arrayPathParts) {
		const arrayNode = this[GEA_STORE_GET_OBSERVER_NODE](arrayPathParts);
		if (getPriv(this).observerRoot.handlers.size === 0 && arrayNode && arrayNode.children.size === 0 && arrayNode.handlers.size > 0) {
			this[GEA_STORE_NOTIFY_HANDLERS](arrayNode, batch);
			return true;
		}
		const commonMatches = this[GEA_STORE_COLLECT_MATCHING_OBSERVER_NODES](arrayPathParts);
		for (let i = 0; i < commonMatches.length; i++) this[GEA_STORE_NOTIFY_HANDLERS](commonMatches[i], batch);
		if (!arrayNode || arrayNode.children.size === 0) return true;
		const deliveries = /* @__PURE__ */ new Map();
		const suffixOffset = arrayPathParts.length;
		for (let i = 0; i < batch.length; i++) {
			const change = batch[i];
			const matches = this[GEA_STORE_COLLECT_MATCHING_OBSERVER_NODES_FROM_NODE](arrayNode, change.pathParts, suffixOffset);
			for (let j = 0; j < matches.length; j++) {
				const node = matches[j];
				let relevant = deliveries.get(node);
				if (!relevant) {
					relevant = [];
					deliveries.set(node, relevant);
				}
				relevant.push(change);
			}
		}
		for (const [node, relevant] of deliveries) this[GEA_STORE_NOTIFY_HANDLERS](node, relevant);
		return true;
	}
	[GEA_STORE_DELIVER_TOP_LEVEL_BATCH](batch) {
		const raw = storeRaw(this);
		const root = getPriv(this).observerRoot;
		if (root.handlers.size > 0) return false;
		if (batch.length === 1) {
			const change = batch[0];
			if (change.target !== raw || change.pathParts.length !== 1) return false;
			const node = root.children.get(change.property);
			if (!node) return true;
			if (node.children.size > 0) return false;
			if (node.handlers.size === 0) return true;
			let value;
			if (change.type === "delete") value = void 0;
			else {
				const nv = change.newValue;
				if (nv === null || nv === void 0 || typeof nv !== "object") value = nv;
				else {
					const directValue = this[GEA_STORE_GET_DIRECT_TOP_LEVEL_OBSERVED_VALUE](change);
					value = directValue !== Store.#noDirectTopLevelValue ? directValue : this[GEA_STORE_GET_TOP_LEVEL_OBSERVED_VALUE](change);
				}
			}
			this[GEA_STORE_NOTIFY_HANDLERS_WITH_VALUE](node, value, batch);
			return true;
		}
		const deliveries = /* @__PURE__ */ new Map();
		for (let i = 0; i < batch.length; i++) {
			const change = batch[i];
			if (change.target !== raw || change.pathParts.length !== 1) return false;
			const node = root.children.get(change.property);
			if (!node) continue;
			if (node.children.size > 0) return false;
			if (node.handlers.size === 0) continue;
			let delivery = deliveries.get(node);
			if (!delivery) {
				const directValue = this[GEA_STORE_GET_DIRECT_TOP_LEVEL_OBSERVED_VALUE](change);
				delivery = {
					value: directValue !== Store.#noDirectTopLevelValue ? directValue : this[GEA_STORE_GET_TOP_LEVEL_OBSERVED_VALUE](change),
					relevant: []
				};
				deliveries.set(node, delivery);
			}
			delivery.relevant.push(change);
		}
		for (const [node, delivery] of deliveries) this[GEA_STORE_NOTIFY_HANDLERS_WITH_VALUE](node, delivery.value, delivery.relevant);
		return true;
	}
	[GEA_STORE_FLUSH_CHANGES]() {
		const raw = storeRaw(this);
		const p = getPriv(this);
		p.flushScheduled = false;
		Store.#pendingStores.delete(raw);
		const pendingBatch = p.pendingChanges;
		const pendingBatchKind = p.pendingBatchKind;
		const pendingBatchArrayPathParts = p.pendingBatchArrayPathParts;
		p.pendingChangesPool.length = 0;
		p.pendingChanges = p.pendingChangesPool;
		p.pendingChangesPool = pendingBatch;
		p.pendingBatchKind = 0;
		p.pendingBatchArrayPathParts = null;
		if (pendingBatch.length === 0) return;
		if (pendingBatchKind === 1 && pendingBatchArrayPathParts && this[GEA_STORE_DELIVER_KNOWN_ARRAY_ITEM_PROP_BATCH](pendingBatch, pendingBatchArrayPathParts)) return;
		if (pendingBatch.length === 1) {
			const change = pendingBatch[0];
			if (change.target === raw && change.pathParts.length === 1 && p.observerRoot.handlers.size === 0) {
				const node = p.observerRoot.children.get(change.property);
				if (node && node.handlers.size > 0) {
					if (node.children.size === 0) {
						let value;
						if (change.type === "delete") value = void 0;
						else {
							const nv = change.newValue;
							if (nv === null || nv === void 0 || typeof nv !== "object") value = nv;
							else if (Array.isArray(nv) && nv.length === 0) value = nv;
							else value = this[GEA_STORE_GET_TOP_LEVEL_OBSERVED_VALUE](change);
						}
						const handlers = node.handlers;
						if (handlers.size === 1) handlers.values().next().value(value, pendingBatch);
						else for (const handler of handlers) handler(value, pendingBatch);
						return;
					}
				} else if (node) return;
			}
		}
		if (pendingBatch.length === 2 && p.observerRoot.handlers.size === 0) {
			const c0 = pendingBatch[0];
			const c1 = pendingBatch[1];
			if (c0.target === c1.target && Array.isArray(c0.target) && c0.type === "update" && c1.type === "update" && isNumericIndex(c0.property) && isNumericIndex(c1.property) && c0.previousValue === c1.newValue && c0.newValue === c1.previousValue) {
				const opId = `swap:${p.nextArrayOpId++}`;
				const arrayPathParts = c0.pathParts.length > 1 ? c0.pathParts.slice(0, -1) : c0.pathParts;
				c0.arrayOp = "swap";
				c1.arrayOp = "swap";
				c0.opId = opId;
				c1.opId = opId;
				c0.otherIndex = Number(c1.property);
				c1.otherIndex = Number(c0.property);
				c0.arrayPathParts = arrayPathParts;
				c1.arrayPathParts = arrayPathParts;
				let node = p.observerRoot;
				for (let i = 0; i < arrayPathParts.length; i++) {
					node = node.children.get(arrayPathParts[i]);
					if (!node) break;
				}
				if (node && node.handlers.size > 0) {
					const value = getByPathParts(raw, node.pathParts);
					for (const handler of node.handlers) handler(value, pendingBatch);
				}
				return;
			}
		}
		if (this[GEA_STORE_DELIVER_TOP_LEVEL_BATCH](pendingBatch)) return;
		const batch = this[GEA_STORE_NORMALIZE_BATCH](pendingBatch);
		if (this[GEA_STORE_DELIVER_ARRAY_ITEM_PROP_BATCH](batch)) return;
		if (batch.length === 1) {
			const change = batch[0];
			const matches = this[GEA_STORE_COLLECT_MATCHING_OBSERVER_NODES](change.pathParts);
			this[GEA_STORE_ADD_DESCENDANTS_FOR_OBJECT_REPLACEMENT](change, matches);
			for (let i = 0; i < matches.length; i++) this[GEA_STORE_NOTIFY_HANDLERS](matches[i], batch);
			return;
		}
		const deliveries = /* @__PURE__ */ new Map();
		for (let i = 0; i < batch.length; i++) {
			const change = batch[i];
			const matches = this[GEA_STORE_COLLECT_MATCHING_OBSERVER_NODES](change.pathParts);
			this[GEA_STORE_ADD_DESCENDANTS_FOR_OBJECT_REPLACEMENT](change, matches);
			for (let j = 0; j < matches.length; j++) {
				const node = matches[j];
				let relevant = deliveries.get(node);
				if (!relevant) {
					relevant = [];
					deliveries.set(node, relevant);
				}
				relevant.push(change);
			}
		}
		for (const [node, relevant] of deliveries) this[GEA_STORE_NOTIFY_HANDLERS](node, relevant);
	}
	[GEA_STORE_EMIT_CHANGES](changes) {
		const raw = storeRaw(this);
		const p = getPriv(this);
		for (let i = 0; i < changes.length; i++) {
			const change = changes[i];
			p.pendingChanges.push(change);
			this[GEA_STORE_TRACK_PENDING_CHANGE](change);
		}
		if (!p.flushScheduled) {
			p.flushScheduled = true;
			Store.#pendingStores.add(raw);
			queueMicrotask(() => this[GEA_STORE_FLUSH_CHANGES]());
		}
	}
	[GEA_STORE_QUEUE_CHANGE](change) {
		getPriv(this).pendingChanges.push(change);
		this[GEA_STORE_TRACK_PENDING_CHANGE](change);
	}
	[GEA_STORE_TRACK_PENDING_CHANGE](change) {
		const p = getPriv(this);
		if (p.pendingBatchKind === 2) return;
		if (!change.isArrayItemPropUpdate || !change.arrayPathParts) {
			p.pendingBatchKind = 2;
			p.pendingBatchArrayPathParts = null;
			return;
		}
		if (p.pendingBatchKind === 0) {
			p.pendingBatchKind = 1;
			p.pendingBatchArrayPathParts = change.arrayPathParts;
			return;
		}
		const pendingArrayPathParts = p.pendingBatchArrayPathParts;
		if (pendingArrayPathParts !== change.arrayPathParts && !samePathParts$1(pendingArrayPathParts, change.arrayPathParts)) {
			p.pendingBatchKind = 2;
			p.pendingBatchArrayPathParts = null;
		}
	}
	[GEA_STORE_SCHEDULE_FLUSH]() {
		const raw = storeRaw(this);
		const p = getPriv(this);
		if (!p.flushScheduled) {
			p.flushScheduled = true;
			Store.#pendingStores.add(raw);
			queueMicrotask(() => this[GEA_STORE_FLUSH_CHANGES]());
		}
	}
	[GEA_STORE_QUEUE_DIRECT_ARRAY_ITEM_PRIMITIVE_CHANGE](target, property, value, previousValue, isNew, arrayMeta, getPathParts, getLeafPathParts) {
		const change = {
			type: isNew ? "add" : "update",
			property,
			target,
			pathParts: getPathParts(property),
			newValue: value,
			previousValue,
			arrayPathParts: arrayMeta.arrayPathParts,
			arrayIndex: arrayMeta.arrayIndex,
			leafPathParts: getLeafPathParts(property),
			isArrayItemPropUpdate: true
		};
		const raw = storeRaw(this);
		const p = getPriv(this);
		p.pendingChanges.push(change);
		if (p.pendingBatchKind === 0) {
			p.pendingBatchKind = 1;
			p.pendingBatchArrayPathParts = change.arrayPathParts;
		} else if (p.pendingBatchKind === 1) {
			const pp = p.pendingBatchArrayPathParts;
			if (pp !== change.arrayPathParts && !samePathParts$1(pp, change.arrayPathParts)) {
				p.pendingBatchKind = 2;
				p.pendingBatchArrayPathParts = null;
			}
		}
		if (!p.flushScheduled) {
			p.flushScheduled = true;
			Store.#pendingStores.add(raw);
			queueMicrotask(() => this[GEA_STORE_FLUSH_CHANGES]());
		}
	}
	[GEA_STORE_INTERCEPT_ARRAY_METHOD](arr, method, _basePath, baseParts) {
		const store = this;
		switch (method) {
			case "splice": return function(...args) {
				store[GEA_STORE_CLEAR_ARRAY_INDEX_CACHE](arr);
				const len = arr.length;
				const rawStart = args[0] ?? 0;
				const start = rawStart < 0 ? Math.max(len + rawStart, 0) : Math.min(rawStart, len);
				const deleteCount = args.length < 2 ? len - start : Math.min(Math.max(args[1] ?? 0, 0), len - start);
				const items = args.slice(2).map((v) => unwrapNestedProxyValue(v));
				const removed = arr.slice(start, start + deleteCount);
				Array.prototype.splice.call(arr, start, deleteCount, ...items);
				if (deleteCount === 0 && items.length > 0 && start === len) {
					store[GEA_STORE_EMIT_CHANGES]([{
						type: "append",
						property: String(start),
						target: arr,
						pathParts: baseParts,
						start,
						count: items.length,
						newValue: items
					}]);
					return removed;
				}
				const changes = [];
				for (let i = 0; i < removed.length; i++) changes.push({
					type: "delete",
					property: String(start + i),
					target: arr,
					pathParts: appendPathParts(baseParts, String(start + i)),
					previousValue: removed[i]
				});
				for (let i = 0; i < items.length; i++) changes.push({
					type: "add",
					property: String(start + i),
					target: arr,
					pathParts: appendPathParts(baseParts, String(start + i)),
					newValue: items[i]
				});
				if (changes.length > 0) store[GEA_STORE_EMIT_CHANGES](changes);
				return removed;
			};
			case "push": return function(...items) {
				store[GEA_STORE_CLEAR_ARRAY_INDEX_CACHE](arr);
				const rawItems = items.map((v) => unwrapNestedProxyValue(v));
				const startIndex = arr.length;
				Array.prototype.push.apply(arr, rawItems);
				if (rawItems.length > 0) store[GEA_STORE_EMIT_CHANGES]([{
					type: "append",
					property: String(startIndex),
					target: arr,
					pathParts: baseParts,
					start: startIndex,
					count: rawItems.length,
					newValue: rawItems
				}]);
				return arr.length;
			};
			case "pop":
			case "shift": return function() {
				if (arr.length === 0) return void 0;
				store[GEA_STORE_CLEAR_ARRAY_INDEX_CACHE](arr);
				const idx = method === "pop" ? arr.length - 1 : 0;
				const removed = arr[idx];
				if (method === "pop") Array.prototype.pop.call(arr);
				else Array.prototype.shift.call(arr);
				store[GEA_STORE_EMIT_CHANGES]([{
					type: "delete",
					property: String(idx),
					target: arr,
					pathParts: appendPathParts(baseParts, String(idx)),
					previousValue: removed
				}]);
				return removed;
			};
			case "unshift": return function(...items) {
				store[GEA_STORE_CLEAR_ARRAY_INDEX_CACHE](arr);
				const rawItems = items.map((v) => unwrapNestedProxyValue(v));
				Array.prototype.unshift.apply(arr, rawItems);
				const changes = [];
				for (let i = 0; i < rawItems.length; i++) changes.push({
					type: "add",
					property: String(i),
					target: arr,
					pathParts: appendPathParts(baseParts, String(i)),
					newValue: rawItems[i]
				});
				if (changes.length > 0) store[GEA_STORE_EMIT_CHANGES](changes);
				return arr.length;
			};
			case "sort":
			case "reverse": return function(...args) {
				store[GEA_STORE_CLEAR_ARRAY_INDEX_CACHE](arr);
				const previousOrder = arr.slice();
				Array.prototype[method].apply(arr, args);
				const used = new Array(previousOrder.length).fill(false);
				const permutation = new Array(arr.length);
				for (let i = 0; i < arr.length; i++) {
					let previousIndex = -1;
					for (let j = 0; j < previousOrder.length; j++) {
						if (used[j]) continue;
						if (previousOrder[j] !== arr[i]) continue;
						previousIndex = j;
						used[j] = true;
						break;
					}
					permutation[i] = previousIndex === -1 ? i : previousIndex;
				}
				store[GEA_STORE_EMIT_CHANGES]([{
					type: "reorder",
					property: baseParts[baseParts.length - 1] || "",
					target: arr,
					pathParts: baseParts,
					permutation,
					newValue: arr
				}]);
				return arr;
			};
			default: return null;
		}
	}
	[GEA_STORE_INTERCEPT_ARRAY_ITERATOR](arr, method, basePath, baseParts, mkProxy) {
		switch (method) {
			case "indexOf":
			case "includes": {
				const native = method === "indexOf" ? Array.prototype.indexOf : Array.prototype.includes;
				return function(searchElement, fromIndex) {
					const raw = unwrapNestedProxyValue(searchElement);
					return native.call(arr, raw, fromIndex);
				};
			}
			case "findIndex": return (cb, thisArg) => {
				for (let i = 0; i < arr.length; i++) if (cb.call(thisArg, arr[i], i, arr)) return i;
				return -1;
			};
			case "some": return (cb, thisArg) => {
				for (let i = 0; i < arr.length; i++) if (cb.call(thisArg, arr[i], i, arr)) return true;
				return false;
			};
			case "every": return (cb, thisArg) => {
				for (let i = 0; i < arr.length; i++) if (!cb.call(thisArg, arr[i], i, arr)) return false;
				return true;
			};
			case "forEach":
			case "map":
			case "filter":
			case "find": return (cb, thisArg) => proxyIterate(arr, basePath, baseParts, mkProxy, method, cb, thisArg);
			case "reduce": return function(cb, init) {
				let acc = arguments.length >= 2 ? init : arr[0];
				const start = arguments.length >= 2 ? 0 : 1;
				for (let i = start; i < arr.length; i++) {
					const nextPath = basePath ? `${basePath}.${i}` : String(i);
					const raw = arr[i];
					const p = shouldWrapNestedReactiveValue(raw) ? mkProxy(raw, nextPath, appendPathParts(baseParts, String(i))) : raw;
					acc = cb(acc, p, i, arr);
				}
				return acc;
			};
			default: return null;
		}
	}
	[GEA_STORE_GET_CACHED_ARRAY_META](baseParts) {
		const map = getPriv(this).internedArrayPaths;
		for (let i = baseParts.length - 1; i >= 0; i--) {
			if (!isNumericIndex(baseParts[i])) continue;
			let internKey;
			let interned;
			if (i === 1) {
				internKey = baseParts[0];
				interned = map.get(internKey);
				if (!interned) {
					interned = [baseParts[0]];
					map.set(internKey, interned);
				}
			} else {
				internKey = baseParts.slice(0, i).join("\0");
				interned = map.get(internKey);
				if (!interned) {
					interned = baseParts.slice(0, i);
					map.set(internKey, interned);
				}
			}
			return {
				arrayPathParts: interned,
				arrayIndex: Number(baseParts[i]),
				baseTail: i + 1 < baseParts.length ? baseParts.slice(i + 1) : []
			};
		}
		return null;
	}
	[GEA_STORE_CREATE_PROXY](target, basePath, baseParts = [], arrayMeta) {
		if (!target || typeof target !== "object") return target;
		if (!Array.isArray(target)) {
			const cached = getPriv(this).proxyCache.get(target);
			if (cached) return cached;
		}
		const store = this;
		const cachedArrayMeta = arrayMeta ?? store[GEA_STORE_GET_CACHED_ARRAY_META](baseParts);
		let pathCache;
		let leafCache;
		let methodCache;
		let lastPathProp;
		let lastPathParts;
		let lastLeafProp;
		let lastLeafParts;
		function getCachedPathParts(propStr) {
			if (lastPathProp === propStr && lastPathParts) return lastPathParts;
			if (pathCache) {
				const cached = pathCache.get(propStr);
				if (cached) return cached;
			}
			const parts = baseParts.length > 0 ? [...baseParts, propStr] : [propStr];
			if (lastPathProp === void 0) {
				lastPathProp = propStr;
				lastPathParts = parts;
				return parts;
			}
			if (!pathCache) {
				pathCache = /* @__PURE__ */ new Map();
				pathCache.set(lastPathProp, lastPathParts);
			}
			pathCache.set(propStr, parts);
			return parts;
		}
		function getCachedLeafPathParts(propStr) {
			if (lastLeafProp === propStr && lastLeafParts) return lastLeafParts;
			if (leafCache) {
				const cached = leafCache.get(propStr);
				if (cached) return cached;
			}
			const parts = cachedArrayMeta && cachedArrayMeta.baseTail.length > 0 ? [...cachedArrayMeta.baseTail, propStr] : [propStr];
			if (lastLeafProp === void 0) {
				lastLeafProp = propStr;
				lastLeafParts = parts;
				return parts;
			}
			if (!leafCache) {
				leafCache = /* @__PURE__ */ new Map();
				leafCache.set(lastLeafProp, lastLeafParts);
			}
			leafCache.set(propStr, parts);
			return parts;
		}
		const createProxy = store[GEA_STORE_CREATE_PROXY].bind(store);
		const proxy = new Proxy(target, {
			get(obj, prop) {
				if (prop === GEA_STORE_ROOT) return getPriv(store).selfProxy || store;
				if (prop === GEA_PROXY_IS_PROXY) return true;
				if (prop === GEA_PROXY_RAW || prop === GEA_PROXY_GET_TARGET) return obj;
				if (prop === GEA_PROXY_GET_PATH) return basePath;
				if (typeof prop === "symbol") return obj[prop];
				const value = obj[prop];
				if (value === null || value === void 0) return value;
				const valType = typeof value;
				if (valType !== "object" && valType !== "function") return value;
				if (Array.isArray(obj) && valType === "function") {
					if (prop === "constructor") return value;
					if (!methodCache) methodCache = /* @__PURE__ */ new Map();
					let cached = methodCache.get(prop);
					if (cached !== void 0) return cached;
					cached = store[GEA_STORE_INTERCEPT_ARRAY_METHOD](obj, prop, basePath, baseParts) || store[GEA_STORE_INTERCEPT_ARRAY_ITERATOR](obj, prop, basePath, baseParts, createProxy) || value.bind(obj);
					methodCache.set(prop, cached);
					return cached;
				}
				if (valType === "object") {
					if (shouldSkipReactiveWrapForPath(basePath)) return value;
					if (Array.isArray(obj) && isNumericIndex(prop)) {
						const indexCache = getPriv(store).arrayIndexProxyCache.get(obj);
						if (indexCache) {
							const cached = indexCache.get(prop);
							if (cached) return cached;
						}
					} else {
						const cached = getPriv(store).proxyCache.get(value);
						if (cached) return cached;
					}
					if (Object.getPrototypeOf(value) !== Object.prototype && !Array.isArray(value)) return value;
					if (Array.isArray(obj) && isNumericIndex(prop)) {
						let indexCache = getPriv(store).arrayIndexProxyCache.get(obj);
						if (!indexCache) {
							indexCache = /* @__PURE__ */ new Map();
							getPriv(store).arrayIndexProxyCache.set(obj, indexCache);
						}
						const propStr = prop;
						const created = createProxy(value, basePath ? `${basePath}.${propStr}` : propStr, getCachedPathParts(propStr), {
							arrayPathParts: baseParts,
							arrayIndex: Number(propStr),
							baseTail: []
						});
						indexCache.set(prop, created);
						return created;
					}
					const created = createProxy(value, basePath ? `${basePath}.${prop}` : prop, getCachedPathParts(prop));
					getPriv(store).proxyCache.set(value, created);
					return created;
				}
				if (prop === "constructor") return value;
				if (basePath.startsWith("_routes") || basePath.startsWith("routeConfig")) return value;
				return value.bind(obj);
			},
			set(obj, prop, value) {
				if (typeof prop === "symbol") {
					obj[prop] = value;
					return true;
				}
				const oldValue = obj[prop];
				if (oldValue === value) return true;
				if (typeof value !== "object" || value === null) {
					const isNew = !(prop in obj);
					if (!isNew && oldValue && typeof oldValue === "object") {
						getPriv(store).proxyCache.delete(oldValue);
						getPriv(store).arrayIndexProxyCache.delete(oldValue);
					}
					obj[prop] = value;
					if (cachedArrayMeta && cachedArrayMeta.baseTail.length === 0) {
						store[GEA_STORE_QUEUE_DIRECT_ARRAY_ITEM_PRIMITIVE_CHANGE](obj, prop, value, oldValue, isNew, cachedArrayMeta, getCachedPathParts, getCachedLeafPathParts);
						return true;
					}
					const change = {
						type: isNew ? "add" : "update",
						property: prop,
						target: obj,
						pathParts: getCachedPathParts(prop),
						newValue: value,
						previousValue: oldValue
					};
					if (cachedArrayMeta) {
						change.arrayPathParts = cachedArrayMeta.arrayPathParts;
						change.arrayIndex = cachedArrayMeta.arrayIndex;
						change.leafPathParts = getCachedLeafPathParts(prop);
						change.isArrayItemPropUpdate = true;
					}
					store[GEA_STORE_QUEUE_CHANGE](change);
					store[GEA_STORE_SCHEDULE_FLUSH]();
					return true;
				}
				value = unwrapNestedProxyValue(value);
				if (prop === "length" && Array.isArray(obj)) {
					getPriv(store).arrayIndexProxyCache.delete(obj);
					obj[prop] = value;
					return true;
				}
				const isNew = !Object.prototype.hasOwnProperty.call(obj, prop);
				if (Array.isArray(obj) && isNumericIndex(prop)) getPriv(store).arrayIndexProxyCache.delete(obj);
				if (oldValue && typeof oldValue === "object") {
					getPriv(store).proxyCache.delete(oldValue);
					getPriv(store).arrayIndexProxyCache.delete(oldValue);
				}
				obj[prop] = value;
				if (Array.isArray(oldValue) && Array.isArray(value) && value.length > oldValue.length) {
					let isAppend = true;
					for (let i = 0; i < oldValue.length; i++) {
						let o = oldValue[i];
						let v = value[i];
						if (o) o = unwrapNestedProxyValue(o);
						if (v) v = unwrapNestedProxyValue(v);
						if (o !== v) {
							isAppend = false;
							break;
						}
					}
					if (isAppend) {
						const start = oldValue.length;
						const count = value.length - start;
						const change = {
							type: "append",
							property: prop,
							target: obj,
							pathParts: getCachedPathParts(prop),
							start,
							count,
							newValue: value.slice(start)
						};
						if (cachedArrayMeta) {
							change.arrayPathParts = cachedArrayMeta.arrayPathParts;
							change.arrayIndex = cachedArrayMeta.arrayIndex;
							change.leafPathParts = getCachedLeafPathParts(prop);
							change.isArrayItemPropUpdate = true;
						}
						getPriv(store).pendingChanges.push(change);
						if (getPriv(store).pendingBatchKind !== 2) {
							getPriv(store).pendingBatchKind = 2;
							getPriv(store).pendingBatchArrayPathParts = null;
						}
						if (!getPriv(store).flushScheduled) {
							getPriv(store).flushScheduled = true;
							Store.#pendingStores.add(storeRaw(store));
							queueMicrotask(() => store[GEA_STORE_FLUSH_CHANGES]());
						}
						return true;
					}
				}
				const change = {
					type: isNew ? "add" : "update",
					property: prop,
					target: obj,
					pathParts: getCachedPathParts(prop),
					newValue: value,
					previousValue: oldValue
				};
				if (cachedArrayMeta) {
					change.arrayPathParts = cachedArrayMeta.arrayPathParts;
					change.arrayIndex = cachedArrayMeta.arrayIndex;
					change.leafPathParts = getCachedLeafPathParts(prop);
					change.isArrayItemPropUpdate = true;
				}
				getPriv(store).pendingChanges.push(change);
				if (getPriv(store).pendingBatchKind !== 2) {
					getPriv(store).pendingBatchKind = 2;
					getPriv(store).pendingBatchArrayPathParts = null;
				}
				if (!getPriv(store).flushScheduled) {
					getPriv(store).flushScheduled = true;
					Store.#pendingStores.add(storeRaw(store));
					queueMicrotask(() => store[GEA_STORE_FLUSH_CHANGES]());
				}
				return true;
			},
			deleteProperty(obj, prop) {
				if (typeof prop === "symbol") {
					delete obj[prop];
					return true;
				}
				const oldValue = obj[prop];
				if (Array.isArray(obj) && isNumericIndex(prop)) getPriv(store).arrayIndexProxyCache.delete(obj);
				if (oldValue && typeof oldValue === "object") {
					getPriv(store).proxyCache.delete(oldValue);
					getPriv(store).arrayIndexProxyCache.delete(oldValue);
				}
				delete obj[prop];
				const change = {
					type: "delete",
					property: prop,
					target: obj,
					pathParts: getCachedPathParts(prop),
					previousValue: oldValue
				};
				if (cachedArrayMeta) {
					change.arrayPathParts = cachedArrayMeta.arrayPathParts;
					change.arrayIndex = cachedArrayMeta.arrayIndex;
					change.leafPathParts = getCachedLeafPathParts(prop);
					change.isArrayItemPropUpdate = true;
				}
				store[GEA_STORE_QUEUE_CHANGE](change);
				store[GEA_STORE_SCHEDULE_FLUSH]();
				return true;
			}
		});
		if (!Array.isArray(target)) getPriv(this).proxyCache.set(target, proxy);
		return proxy;
	}
};
function rootGetValue(t, prop, receiver) {
	return Store.rootGetValue(t, prop, receiver);
}
function rootSetValue(t, prop, value) {
	return Store.rootSetValue(t, prop, value);
}
function rootDeleteProperty(t, prop) {
	return Store.rootDeleteProperty(t, prop);
}
//#endregion
//#region src/lib/base/component-manager.ts
function engineThis$3(c) {
	return c[GEA_PROXY_GET_RAW_TARGET] ?? c;
}
const RESERVED_HTML_TAG_NAMES = new Set([
	"a",
	"abbr",
	"address",
	"area",
	"article",
	"aside",
	"audio",
	"b",
	"base",
	"bdi",
	"bdo",
	"blockquote",
	"body",
	"br",
	"button",
	"canvas",
	"caption",
	"cite",
	"code",
	"col",
	"colgroup",
	"data",
	"datalist",
	"dd",
	"del",
	"details",
	"dfn",
	"dialog",
	"div",
	"dl",
	"dt",
	"em",
	"embed",
	"fieldset",
	"figcaption",
	"figure",
	"footer",
	"form",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"head",
	"header",
	"hgroup",
	"hr",
	"html",
	"i",
	"iframe",
	"img",
	"input",
	"ins",
	"kbd",
	"label",
	"legend",
	"li",
	"link",
	"main",
	"map",
	"mark",
	"menu",
	"meta",
	"meter",
	"nav",
	"noscript",
	"object",
	"ol",
	"optgroup",
	"option",
	"output",
	"p",
	"picture",
	"pre",
	"progress",
	"q",
	"rp",
	"rt",
	"ruby",
	"s",
	"samp",
	"script",
	"search",
	"section",
	"select",
	"slot",
	"small",
	"source",
	"span",
	"strong",
	"style",
	"sub",
	"summary",
	"sup",
	"table",
	"tbody",
	"td",
	"template",
	"textarea",
	"tfoot",
	"th",
	"thead",
	"time",
	"title",
	"tr",
	"track",
	"u",
	"ul",
	"var",
	"video",
	"wbr"
]);
const createElement = (() => {
	let template = null;
	return (htmlString) => {
		if (!template) template = document.createElement("template");
		template.innerHTML = htmlString.trim();
		return template.content.firstElementChild;
	};
})();
var ComponentManager = class ComponentManager {
	static {
		this.instance = void 0;
	}
	static {
		this.customEventTypes_ = [];
	}
	static {
		this.eventPlugins_ = [];
	}
	constructor() {
		this.componentRegistry = {};
		this.componentsToRender = {};
		this.eventPlugins_ = [];
		this.registeredDocumentEvents_ = /* @__PURE__ */ new Set();
		this.loaded_ = false;
		this.componentClassRegistry = {};
		this.componentSelectorsCache_ = null;
		this.boundHandleEvent_ = this.handleEvent.bind(this);
		if (typeof document !== "undefined") if (document.body) this.onLoad();
		else document.addEventListener("DOMContentLoaded", () => this.onLoad());
		this.getUid = getUid;
		this.createElement = createElement;
	}
	handleEvent(e) {
		e.targetEl = e.target;
		const comps = this.getParentComps(e.target);
		const target = e.target;
		const bubbleStepMap = /* @__PURE__ */ new Map();
		let si = 0;
		for (let n = target; n && n !== document.body; n = n.parentNode) bubbleStepMap.set(n, si++);
		const compCount = comps.length;
		const eventsByComp = new Array(compCount);
		const rootSteps = new Array(compCount);
		for (let i = 0; i < compCount; i++) {
			const c = comps[i];
			eventsByComp[i] = c?.events;
			if (!c) {
				rootSteps[i] = void 0;
				continue;
			}
			const root = engineThis$3(c)[GEA_ELEMENT] ?? (typeof document !== "undefined" ? document.getElementById(c.id) : null);
			rootSteps[i] = root ? bubbleStepMap.get(root) : void 0;
		}
		let broken = false;
		let step = 0;
		e.targetEl = e.target;
		do {
			if (broken || e.cancelBubble) break;
			broken = this.callHandlers(comps, eventsByComp, e, rootSteps, step);
			step++;
		} while ((e.targetEl = e.targetEl.parentNode) && e.targetEl != document.body);
		Store.flushAll();
	}
	onLoad() {
		this.loaded_ = true;
		this.addDocumentEventListeners_(this.getActiveDocumentEventTypes_());
		this.installConfiguredPlugins_();
		new MutationObserver((_mutations) => {
			for (const cmpId in this.componentsToRender) {
				const comp = this.componentsToRender[cmpId];
				if (comp[GEA_COMPILED_CHILD]) {
					delete this.componentsToRender[cmpId];
					continue;
				}
				if (comp.render()) delete this.componentsToRender[cmpId];
			}
		}).observe(document.body, {
			childList: true,
			subtree: true
		});
	}
	static {
		this.NON_BUBBLING_EVENTS_ = new Set([
			"blur",
			"focus",
			"scroll",
			"mouseenter",
			"mouseleave"
		]);
	}
	addDocumentEventListeners_(eventTypes) {
		if (!document.body) return;
		eventTypes.forEach((type) => {
			if (this.registeredDocumentEvents_.has(type)) return;
			const useCapture = ComponentManager.NON_BUBBLING_EVENTS_.has(type);
			document.body.addEventListener(type, this.boundHandleEvent_, useCapture);
			this.registeredDocumentEvents_.add(type);
		});
	}
	installConfiguredPlugins_() {
		ComponentManager.eventPlugins_.forEach((plugin) => this.installEventPlugin_(plugin));
	}
	installEventPlugin_(plugin) {
		if (this.eventPlugins_.includes(plugin)) return;
		this.eventPlugins_.push(plugin);
		plugin(this);
	}
	getParentComps(child) {
		let node = child, comp, ids;
		const parentComps = [];
		if (ids = node[GEA_DOM_PARENT_CHAIN]) {
			const parts = ids.split(",");
			let stale = false;
			for (let i = 0; i < parts.length; i++) {
				const c = this.componentRegistry[parts[i]];
				if (!c) {
					stale = true;
					break;
				}
				parentComps.push(c);
			}
			if (!stale) return parentComps;
			parentComps.length = 0;
			delete child[GEA_DOM_PARENT_CHAIN];
		}
		ids = [];
		node = child;
		do
			if (comp = this.componentRegistry[node.id]) {
				parentComps.push(comp);
				ids.push(node.id);
			} else if (node.id && node.nodeType === 1) {
				const cid = node.getAttribute("data-gea-cid");
				if (cid && (comp = this.componentRegistry[cid])) {
					parentComps.push(comp);
					ids.push(cid);
				}
			}
		while (node = node.parentNode);
		child[GEA_DOM_PARENT_CHAIN] = ids.join(",");
		return parentComps;
	}
	callHandlers(comps, eventsByComp, e, rootSteps, step) {
		let broken = false;
		for (let i = 0; i < comps.length; i++) {
			const comp = comps[i];
			if (!comp) continue;
			const rootStep = rootSteps[i];
			if (rootStep !== void 0 && step > rootStep) continue;
			const evResult = this.callEventsGetterHandler(comp, e, eventsByComp[i]);
			if (evResult === false) {
				broken = true;
				break;
			}
			if (evResult !== GEA_SKIP_ITEM_HANDLER && this.callItemHandler(comp, e) === false) {
				broken = true;
				break;
			}
		}
		return broken;
	}
	callEventsGetterHandler(comp, e, events) {
		const ev = events !== void 0 ? events : comp.events;
		if (!comp || !ev) return true;
		const targetEl = e.targetEl;
		if (!targetEl || typeof targetEl.matches !== "function") return true;
		const handlers = ev[e.type];
		if (!handlers) return true;
		const geaEvt = targetEl[GEA_DOM_EVENT_HINT] ?? targetEl.getAttribute?.("data-gea-event");
		if (geaEvt) {
			const handler = handlers[`[data-gea-event="${geaEvt}"]`];
			if (typeof handler === "function") {
				Object.defineProperty(e, "currentTarget", {
					value: targetEl,
					configurable: true
				});
				if (handler.call(comp, e) === false) return false;
			}
			return true;
		}
		for (const selector in handlers) {
			let matchedEl = null;
			if (selector.charAt(0) === "#") {
				if (targetEl.id === selector.slice(1)) matchedEl = targetEl;
			} else if (selector.includes("data-gea-event") && typeof targetEl.closest === "function") matchedEl = targetEl.closest(selector);
			else if (targetEl.matches(selector)) matchedEl = targetEl;
			if (matchedEl) {
				const handler = handlers[selector];
				if (typeof handler === "function") {
					const targetComponent = this.getOwningComponent(targetEl);
					Object.defineProperty(e, "currentTarget", {
						value: matchedEl,
						configurable: true
					});
					if (handler.call(comp, e, targetComponent !== comp ? targetComponent : void 0) === false) return false;
					if ((targetEl[GEA_DOM_KEY] != null || targetEl.getAttribute?.("data-gea-item-id") != null) && matchedEl !== targetEl) return GEA_SKIP_ITEM_HANDLER;
					return true;
				}
			}
		}
		return true;
	}
	callItemHandler(comp, e) {
		const handleItem = comp?.[GEA_HANDLE_ITEM_HANDLER];
		if (!comp || typeof handleItem !== "function") return true;
		const targetEl = e.targetEl;
		if (!targetEl) return true;
		let itemEl = targetEl;
		const root = engineThis$3(comp)[GEA_ELEMENT] ?? comp.el;
		while (itemEl && itemEl !== root) {
			if (itemEl[GEA_DOM_KEY] != null || itemEl.getAttribute?.("data-gea-item-id")) break;
			itemEl = itemEl.parentElement;
		}
		if (itemEl && itemEl !== root) {
			const itemId = itemEl[GEA_DOM_KEY] ?? itemEl.getAttribute?.("data-gea-item-id");
			if (itemId != null) return handleItem.call(comp, itemId, e);
		}
		return true;
	}
	getOwningComponent(node) {
		let current = node;
		while (current) {
			if (current.id) {
				const comp = this.getComponent(current.id);
				if (comp) return comp;
				if (current.nodeType === 1) {
					const cid = current.getAttribute("data-gea-cid");
					if (cid) {
						const comp2 = this.getComponent(cid);
						if (comp2) return comp2;
					}
				}
			}
			current = current.parentNode;
		}
	}
	getComponent(id) {
		return this.componentRegistry[id];
	}
	setComponent(comp) {
		this.componentRegistry[comp.id] = comp;
		if (!comp.rendered) this.componentsToRender[comp.id] = comp;
		if (this.loaded_) {
			if (comp.events) this.addDocumentEventListeners_(Object.keys(comp.events));
		}
	}
	removeComponent(comp) {
		delete this.componentRegistry[comp.id];
		delete this.componentsToRender[comp.id];
	}
	registerComponentClass(ctor, tagName) {
		if (!ctor || !ctor.name) return;
		const existingTag = ctor[GEA_CTOR_TAG_NAME];
		if (existingTag && this.componentClassRegistry[existingTag]) return;
		const normalized = tagName || existingTag || this.generateTagName_(ctor);
		ctor[GEA_CTOR_TAG_NAME] = normalized;
		if (!this.componentClassRegistry[normalized]) {
			this.componentClassRegistry[normalized] = ctor;
			this.componentSelectorsCache_ = null;
		}
	}
	generateTagName_(ctor) {
		const tagName = (ctor.displayName || ctor.name || "component").replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/[\s_]+/g, "-").toLowerCase();
		return RESERVED_HTML_TAG_NAMES.has(tagName) ? `gea-${tagName}` : tagName;
	}
	getComponentSelectors() {
		if (!this.componentSelectorsCache_) this.componentSelectorsCache_ = Object.keys(this.componentClassRegistry).map((name) => `${name}`);
		return this.componentSelectorsCache_;
	}
	getComponentConstructor(tagName) {
		return this.componentClassRegistry[tagName];
	}
	markComponentRendered(comp) {
		delete this.componentsToRender[comp.id];
	}
	getActiveDocumentEventTypes_() {
		const eventTypes = new Set(ComponentManager.customEventTypes_);
		Object.values(this.componentRegistry).forEach((comp) => {
			if (comp.events) Object.keys(comp.events).forEach((type) => eventTypes.add(type));
		});
		return [...eventTypes];
	}
	static getInstance() {
		if (!ComponentManager.instance) ComponentManager.instance = new ComponentManager();
		return ComponentManager.instance;
	}
	static registerEventTypes(eventTypes) {
		let changed = false;
		eventTypes.forEach((type) => {
			if (ComponentManager.customEventTypes_.includes(type)) return;
			ComponentManager.customEventTypes_.push(type);
			changed = true;
		});
		if (!changed || !ComponentManager.instance) return;
		ComponentManager.instance.addDocumentEventListeners_(eventTypes);
	}
	static installEventPlugin(plugin) {
		if (ComponentManager.eventPlugins_.includes(plugin)) return;
		ComponentManager.eventPlugins_.push(plugin);
		if (ComponentManager.instance && ComponentManager.instance.loaded_) ComponentManager.instance.installEventPlugin_(plugin);
	}
};
//#endregion
//#region src/lib/base/component-internal.ts
function createEngineState() {
	return {
		bindings: [],
		selfListeners: [],
		childComponents: [],
		geaDependencies: [],
		geaEventBindings: /* @__PURE__ */ new Map(),
		geaPropBindings: /* @__PURE__ */ new Map(),
		geaAttrBindings: /* @__PURE__ */ new Map(),
		observerRemovers: [],
		rawProps: {},
		elCache: /* @__PURE__ */ new Map(),
		listConfigs: []
	};
}
const engineStateByRawInstance = /* @__PURE__ */ new WeakMap();
function rawInstanceKey(component) {
	return component[GEA_PROXY_GET_RAW_TARGET] ?? component;
}
/**
* Returns per-component engine state (WeakMap, not on `this`).
* Safe to call after `super()` in Component constructors.
*/
function getComponentInternals(component) {
	const key = rawInstanceKey(component);
	let s = engineStateByRawInstance.get(key);
	if (!s) {
		s = createEngineState();
		engineStateByRawInstance.set(key, s);
	}
	return s;
}
//#endregion
//#region src/lib/base/list.ts
function samePathParts(a, b) {
	if (!a || !b || a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
	return true;
}
function rebuildList(container, array, config) {
	if (array.length === 0) {
		container.textContent = "";
		return;
	}
	const fragment = document.createDocumentFragment();
	for (let i = 0; i < array.length; i++) fragment.appendChild(config.create(array[i], i));
	container.textContent = "";
	container.appendChild(fragment);
}
function rerenderListInPlace(container, array, create) {
	const currentLength = container.children.length;
	const nextLength = array.length;
	const sharedLength = currentLength < nextLength ? currentLength : nextLength;
	for (let i = 0; i < sharedLength; i++) {
		const row = container.children[i];
		const nextRow = create(array[i], i);
		if (row) row.replaceWith(nextRow);
		else container.appendChild(nextRow);
	}
	if (nextLength > currentLength) {
		const fragment = document.createDocumentFragment();
		for (let i = currentLength; i < nextLength; i++) fragment.appendChild(create(array[i], i));
		container.appendChild(fragment);
		return;
	}
	for (let i = currentLength - 1; i >= nextLength; i--) {
		const row = container.children[i];
		if (row) row.remove();
	}
}
function applyReorder(container, permutation) {
	const rows = Array.from(container.children);
	for (let i = 0; i < permutation.length; i++) {
		const row = rows[permutation[i]];
		if (!row) continue;
		const currentRow = container.children[i];
		if (currentRow !== row) container.insertBefore(row, currentRow || null);
	}
}
function applySwap(container, firstIndex, secondIndex) {
	if (firstIndex === secondIndex) return;
	const lowIndex = firstIndex < secondIndex ? firstIndex : secondIndex;
	const highIndex = firstIndex < secondIndex ? secondIndex : firstIndex;
	const lowRow = container.children[lowIndex];
	const highRow = container.children[highIndex];
	if (!(lowRow && highRow)) return;
	const highNext = highRow.nextElementSibling;
	container.insertBefore(highRow, lowRow);
	container.insertBefore(lowRow, highNext);
}
function applyPropChanges(container, items, changes, config) {
	if (!config.propPatchers) return false;
	const rawItems = items && items[GEA_PROXY_GET_TARGET] ? items[GEA_PROXY_GET_TARGET] : items;
	let handledAny = false;
	for (let i = 0; i < changes.length; i++) {
		const change = changes[i];
		if (!change?.isArrayItemPropUpdate) continue;
		if (!samePathParts(change.arrayPathParts, config.arrayPathParts)) continue;
		if (change.arrayIndex == null) continue;
		const lp = change.leafPathParts;
		const key = lp && lp.length > 0 ? lp.length === 1 ? lp[0] : lp.join(".") : change.property;
		const patchers = config.propPatchers[key] || config.propPatchers[change.property];
		if (!patchers || patchers.length === 0) continue;
		const row = container.children[change.arrayIndex];
		if (!row) continue;
		handledAny = true;
		const item = rawItems[change.arrayIndex];
		for (let j = 0; j < patchers.length; j++) patchers[j](row, change.newValue, item);
	}
	return handledAny;
}
function applyRootReplacementPatch(container, items, change, config) {
	if (!config.patchRow || !config.getKey || !Array.isArray(change.previousValue)) return false;
	const prevItems = change.previousValue;
	if (prevItems.length !== items.length || container.children.length !== items.length) return false;
	for (let index = 0; index < items.length; index++) {
		const prevKey = config.getKey(prevItems[index], index);
		if (prevKey !== config.getKey(items[index], index)) return false;
		const row = container.children[index];
		if (!row) return false;
		const domKey = row[GEA_DOM_KEY] ?? row.getAttribute("data-gea-item-id");
		if (domKey == null || domKey !== prevKey) return false;
	}
	for (let index = 0; index < items.length; index++) {
		const row = container.children[index];
		config.patchRow(row, items[index], prevItems[index], index);
	}
	return true;
}
function applyListChanges(container, array, changes, config) {
	const proxiedItems = Array.isArray(array) ? array : [];
	const items = proxiedItems && proxiedItems[GEA_PROXY_GET_TARGET] ? proxiedItems[GEA_PROXY_GET_TARGET] : proxiedItems;
	if (!changes || changes.length === 0) {
		rerenderListInPlace(container, items, config.create);
		return;
	}
	const firstChange = changes[0];
	if (firstChange?.type === "reorder" && samePathParts(firstChange.pathParts, config.arrayPathParts) && Array.isArray(firstChange.permutation)) {
		applyReorder(container, firstChange.permutation);
		return;
	}
	if (changes.every((change) => change?.type === "update" && change.arrayOp === "swap")) {
		const seen = /* @__PURE__ */ new Set();
		for (let i = 0; i < changes.length; i++) {
			const change = changes[i];
			const opId = change.opId || `${change.property}:${change.otherIndex}`;
			if (seen.has(opId)) continue;
			seen.add(opId);
			const firstIndex = Number(change.property);
			const secondIndex = Number(change.otherIndex);
			if (!Number.isInteger(firstIndex) || !Number.isInteger(secondIndex)) continue;
			applySwap(container, firstIndex, secondIndex);
		}
		return;
	}
	if (applyPropChanges(container, items, changes, config)) return;
	if ((firstChange?.type === "update" || firstChange?.type === "add") && samePathParts(firstChange.pathParts, config.arrayPathParts)) {
		if (applyRootReplacementPatch(container, items, firstChange, config)) return;
		rebuildList(container, items, config);
		return;
	}
	let handledMutation = false;
	const deleteIndexes = [];
	const addIndexes = [];
	for (let i = 0; i < changes.length; i++) {
		const change = changes[i];
		if (!change) continue;
		if (change.type === "delete") {
			const idx = Number(change.property);
			if (Number.isInteger(idx) && idx >= 0) {
				deleteIndexes.push(idx);
				handledMutation = true;
			}
			continue;
		}
		if (change.type === "add") {
			const idx = Number(change.property);
			if (Number.isInteger(idx) && idx >= 0) {
				addIndexes.push(idx);
				handledMutation = true;
			}
			continue;
		}
		if (change.type === "append") {
			const start = change.start ?? 0;
			const count = change.count ?? 0;
			if (count > 0) {
				const fragment = document.createDocumentFragment();
				for (let j = 0; j < count; j++) fragment.appendChild(config.create(items[start + j], start + j));
				container.appendChild(fragment);
			}
			handledMutation = true;
		}
	}
	if (!handledMutation) {
		rebuildList(container, items, config);
		return;
	}
	if (addIndexes.length > 0 && addIndexes.includes(0)) {
		const firstChild = container.children[0];
		if (firstChild && firstChild[GEA_DOM_KEY] == null && !firstChild.hasAttribute("data-gea-item-id")) {
			if (container.children.length !== items.length) {
				rebuildList(container, items, config);
				return;
			}
			if (container.children.length === 1) firstChild.remove();
			else return;
		}
	}
	if (deleteIndexes.length > 1) deleteIndexes.sort((a, b) => b - a);
	for (let i = 0; i < deleteIndexes.length; i++) {
		const row = container.children[deleteIndexes[i]];
		if (row) row.remove();
	}
	if (addIndexes.length > 1) addIndexes.sort((a, b) => a - b);
	for (let i = 0; i < addIndexes.length; i++) {
		const index = addIndexes[i];
		const row = config.create(items[index], index);
		container.insertBefore(row, container.children[index] || null);
	}
}
//#endregion
//#region src/lib/base/component.tsx
/** Raw component instance (bypasses Store root proxy) for symbol-backed engine fields. */
function engineThis$2(c) {
	return c[GEA_PROXY_GET_RAW_TARGET] ?? c;
}
const _componentClassesMap = /* @__PURE__ */ new Map();
const _URL_ATTRS = new Set([
	"href",
	"src",
	"action",
	"formaction",
	"data",
	"cite",
	"poster",
	"background"
]);
/** Compare component refs whether held as the Store proxy or the raw instance (methods are bound to target). */
function sameComponentIdentity(a, b) {
	return (a && typeof a === "object" ? a[GEA_PROXY_GET_RAW_TARGET] ?? a : a) === (b && typeof b === "object" ? b[GEA_PROXY_GET_RAW_TARGET] ?? b : b);
}
const _transferByKey = /* @__PURE__ */ new Map();
const _inTransfer = /* @__PURE__ */ new WeakSet();
/**
* Find the conditional-slot comment marker at a specific slot index.
* The compiler tells each list which slot index immediately follows it in JSX
* source order via `afterCondSlotIndex`.  We look for `<!--{id}-c{N}-->`.
* Returns null when no such marker exists (map is last, or no conditionals follow).
*/
function _findCondMarkerByIndex(container, componentId, slotIndex) {
	if (slotIndex == null) return null;
	const target = `${componentId}-c${slotIndex}`;
	for (let node = container.firstChild; node; node = node.nextSibling) if (node.nodeType === 8 && node.data === target) return node;
	return null;
}
/**
* Mark a keyed list-item component for cross-list transfer.
* Call this *before* firing the store update that triggers reconciliation.
* Unclaimed entries are auto-disposed after the current task (setTimeout 0),
* which guarantees all render microtasks have already run.
*/
function stashComponentForTransfer(comp) {
	const key = comp[GEA_ITEM_KEY];
	if (key == null) return;
	const raw = engineThis$2(comp);
	_inTransfer.add(raw);
	_transferByKey.set(key, comp);
	setTimeout(() => {
		if (_transferByKey.get(key) === comp) {
			_transferByKey.delete(key);
			_inTransfer.delete(raw);
			comp.dispose?.();
		}
	}, 0);
}
function _claimTransfer(key) {
	const comp = _transferByKey.get(key);
	if (!comp) return void 0;
	_transferByKey.delete(key);
	return comp;
}
function _isInTransfer(comp) {
	return _inTransfer.has(engineThis$2(comp));
}
function __escapeHtml(str) {
	return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
/** Ensures static template HTML from list `items.join('')` survives GEA_PATCH_COND empty reinjection. */
function injectDataGeaItemIdOnFirstOpenTag(html, key) {
	const m = html.match(/^<([A-Za-z][\w:-]*)([^>]*)>/);
	if (!m) return html;
	const full = m[0];
	if (/\sdata-gea-item-id\s*=/.test(full)) return html;
	const esc = __escapeHtml(key);
	return `<${m[1]}${m[2]} data-gea-item-id="${esc}">` + html.slice(full.length);
}
function __sanitizeAttr(name, value) {
	if (_URL_ATTRS.has(name)) {
		const stripped = value.replace(/[\s\u0000-\u001F]+/g, "").toLowerCase();
		if (/^(javascript|vbscript|data):/.test(stripped) && !stripped.startsWith("data:image/")) return "";
	}
	return value;
}
if (typeof globalThis !== "undefined") {
	globalThis.__escapeHtml ??= __escapeHtml;
	globalThis.__sanitizeAttr ??= __sanitizeAttr;
}
/**
* Declared React `Component` surface + `render(): ReactNode` overload so Gea classes are valid JSX class
* tags while `JSX.IntrinsicElements` is sourced from `@types/react`. Runtime is still Gea-only.
*/
var Component = class Component extends Store {
	constructor(props = {}, _unusedReactContext) {
		super();
		getComponentInternals(this);
		const eng = engineThis$2(this);
		eng[GEA_ID] = ComponentManager.getInstance().getUid();
		eng[GEA_ELEMENT] = null;
		eng[GEA_PARENT_COMPONENT] = void 0;
		const Ctor = this.constructor;
		ComponentManager.getInstance().registerComponentClass(Ctor);
		_componentClassesMap.set(Ctor.name, Ctor);
		this[GEA_RENDERED] = false;
		let _rawProps = props || {};
		let _propsProxy = this[GEA_CREATE_PROPS_PROXY](_rawProps);
		getComponentInternals(this).rawProps = _rawProps;
		Object.defineProperty(this, "props", {
			get: () => _propsProxy,
			set: (newProps) => {
				_rawProps = newProps || {};
				_propsProxy = this[GEA_CREATE_PROPS_PROXY](_rawProps);
				getComponentInternals(this).rawProps = _rawProps;
			},
			configurable: true,
			enumerable: true
		});
		ComponentManager.getInstance().setComponent(this);
		this.created(this.props);
		this.createdHooks(this.props);
		if (typeof this[GEA_SETUP_LOCAL_STATE_OBSERVERS] === "function") this[GEA_SETUP_LOCAL_STATE_OBSERVERS]();
	}
	created(_props) {}
	createdHooks(_props) {}
	get id() {
		return engineThis$2(this)[GEA_ID];
	}
	get el() {
		const eng = engineThis$2(this);
		if (!eng[GEA_ELEMENT]) {
			const cloneFn = this[GEA_CLONE_TEMPLATE];
			if (typeof cloneFn === "function") eng[GEA_ELEMENT] = cloneFn.call(this);
			else {
				let existing = document.getElementById(eng[GEA_ID]);
				if (existing && existing.id === "app" && !existing.classList.contains("store-layout")) existing = null;
				if (existing) eng[GEA_ELEMENT] = existing;
				else eng[GEA_ELEMENT] = ComponentManager.getInstance().createElement(String(this.template(this.props)).trim());
			}
			if (eng[GEA_ELEMENT]) Component[GEA_SYNC_VALUE_PROPS](eng[GEA_ELEMENT]);
		}
		if (eng[GEA_ELEMENT]) eng[GEA_ELEMENT][GEA_DOM_COMPONENT] = this;
		return eng[GEA_ELEMENT];
	}
	$$(selector) {
		let rv = [];
		const el = this.el;
		if (el) if (selector == void 0 || selector === ":scope") rv = [el];
		else rv = [...el.querySelectorAll(selector)];
		return rv;
	}
	$(selector) {
		let rv = null;
		const el = engineThis$2(this)[GEA_ELEMENT];
		if (el) rv = selector == void 0 || selector === ":scope" ? el : el.querySelector(selector);
		return rv;
	}
	[GEA_APPLY_LIST_CHANGES](container, array, changes, config) {
		if (changes && changes.length > 0 && changes[0].isArrayItemPropUpdate && !config.hasComponentItems) {
			applyListChanges(container, array, changes, config);
			return;
		}
		const prevCount = container.childElementCount;
		applyListChanges(container, array, changes, config);
		if (container.childElementCount !== prevCount || config.hasComponentItems) this[GEA_INSTANTIATE_CHILD_COMPONENTS]();
	}
	render(rootEl, opt_index = Infinity) {
		if (this[GEA_RENDERED]) return true;
		const eng = engineThis$2(this);
		eng[GEA_ELEMENT] = this.el;
		if (rootEl) {
			if (opt_index < 0) opt_index = Infinity;
			if (rootEl != eng[GEA_ELEMENT].parentElement) {
				if (!rootEl.contains(eng[GEA_ELEMENT])) rootEl.insertBefore(eng[GEA_ELEMENT], rootEl.children[opt_index]);
			} else {
				let newIndex = opt_index;
				let elementIndex = 0;
				let t = eng[GEA_ELEMENT];
				while (t = t.previousElementSibling) elementIndex++;
				if (elementIndex < newIndex) newIndex++;
				if (!(elementIndex == newIndex || newIndex >= rootEl.childElementCount && eng[GEA_ELEMENT] == rootEl.lastElementChild)) rootEl.insertBefore(eng[GEA_ELEMENT], rootEl.children[newIndex]);
			}
		}
		this[GEA_RENDERED] = true;
		if (eng[GEA_ELEMENT]) eng[GEA_ELEMENT][GEA_DOM_COMPONENT] = this;
		ComponentManager.getInstance().markComponentRendered(this);
		this[GEA_SYNC_UNRENDERED_LIST_ITEMS]();
		this[GEA_ATTACH_BINDINGS]();
		this[GEA_MOUNT_COMPILED_CHILD_COMPONENTS]();
		this[GEA_INSTANTIATE_CHILD_COMPONENTS]();
		this[GEA_SETUP_EVENT_DIRECTIVES]();
		const setupRefs = this[GEA_SETUP_REFS];
		if (typeof setupRefs === "function") setupRefs.call(this);
		this.onAfterRender();
		this.onAfterRenderHooks();
		this[GEA_SYNC_UNRENDERED_LIST_ITEMS]();
		requestAnimationFrame(() => this.onAfterRenderAsync());
		return true;
	}
	get rendered() {
		return this[GEA_RENDERED];
	}
	onAfterRender() {}
	onAfterRenderAsync() {}
	onAfterRenderHooks() {}
	/** Render pre-created list items that weren't mounted during construction
	*  (e.g. component was a lazy child inside a conditional slot). */
	[GEA_SYNC_UNRENDERED_LIST_ITEMS]() {
		const configs = getComponentInternals(this).listConfigs;
		if (!configs?.length) return;
		for (const { config: c } of configs) {
			if (!c.items && c.itemsKey) c.items = this[c.itemsKey];
			if (!c.items?.length) continue;
			const container = c.container();
			if (!container) continue;
			const condRef = _findCondMarkerByIndex(container, engineThis$2(this)[GEA_ID], c.afterCondSlotIndex);
			for (const item of c.items) {
				if (!item) continue;
				if (!item[GEA_RENDERED]) {
					item.render(container);
					if (condRef) {
						const el = engineThis$2(item)[GEA_ELEMENT];
						if (el && el.parentNode === container) container.insertBefore(el, condRef);
					}
				}
			}
		}
	}
	[GEA_CREATE_PROPS_PROXY](raw) {
		const component = this;
		return new Proxy(raw, {
			get(target, prop) {
				return target[prop];
			},
			set(target, prop, value) {
				if (typeof prop === "symbol") {
					target[prop] = value;
					return true;
				}
				const prev = target[prop];
				target[prop] = value;
				const onProp = component[GEA_ON_PROP_CHANGE];
				if (typeof onProp === "function") {
					if (value !== prev || typeof prev === "object" && prev !== null) onProp.call(component, prop, value);
				}
				return true;
			}
		});
	}
	[GEA_REACTIVE_PROPS](obj) {
		return obj;
	}
	[GEA_UPDATE_PROPS](nextProps) {
		const eng = engineThis$2(this);
		if (!this[GEA_RENDERED]) {
			const el = document.getElementById(eng[GEA_ID]);
			if (el) {
				eng[GEA_ELEMENT] = el;
				el[GEA_DOM_COMPONENT] = this;
				this[GEA_RENDERED] = true;
				ComponentManager.getInstance().markComponentRendered(this);
				this[GEA_SYNC_UNRENDERED_LIST_ITEMS]();
				this[GEA_ATTACH_BINDINGS]();
				this[GEA_MOUNT_COMPILED_CHILD_COMPONENTS]();
				this[GEA_INSTANTIATE_CHILD_COMPONENTS]();
				this[GEA_SETUP_EVENT_DIRECTIVES]();
				const setupRefs = this[GEA_SETUP_REFS];
				if (typeof setupRefs === "function") setupRefs.call(this);
				this.onAfterRender();
				this.onAfterRenderHooks();
				this[GEA_SYNC_UNRENDERED_LIST_ITEMS]();
			}
		}
		const onProp = this[GEA_ON_PROP_CHANGE];
		if (typeof onProp === "function") {
			const raw = getComponentInternals(this).rawProps;
			for (const key in nextProps) {
				const prev = raw[key];
				const next = nextProps[key];
				raw[key] = next;
				if (next !== prev || typeof prev === "object" && prev !== null) onProp.call(this, key, next);
			}
		} else {
			for (const key in nextProps) this.props[key] = nextProps[key];
			this[GEA_REQUEST_RENDER]();
		}
	}
	toString() {
		let html = String(this.template(this.props)).trim();
		const key = this[GEA_ITEM_KEY];
		if (key != null && html.length > 0) html = injectDataGeaItemIdOnFirstOpenTag(html, key);
		return html;
	}
	/**
	* Prefer `template({ a, b } = this.props)` so TypeScript infers bindings from `declare props`
	* without `: this['props']`. Runtime still receives props from `template(this.props)` call sites.
	*/
	template(_props = this.props) {
		return "<div></div>";
	}
	dispose() {
		ComponentManager.getInstance().removeComponent(this);
		const eng = engineThis$2(this);
		if (!eng[GEA_ELEMENT]) {
			const orphan = document.getElementById(eng[GEA_ID]);
			if (orphan) {
				orphan[GEA_DOM_COMPONENT] = void 0;
				orphan.parentNode?.removeChild(orphan);
			}
		} else {
			eng[GEA_ELEMENT][GEA_DOM_COMPONENT] = void 0;
			if (eng[GEA_ELEMENT].parentNode) eng[GEA_ELEMENT].parentNode.removeChild(eng[GEA_ELEMENT]);
		}
		eng[GEA_ELEMENT] = null;
		if (getComponentInternals(this).observerRemovers) {
			getComponentInternals(this).observerRemovers.forEach((fn) => fn());
			getComponentInternals(this).observerRemovers = [];
		}
		this[GEA_CLEANUP_BINDINGS]();
		this[GEA_TEARDOWN_SELF_LISTENERS]();
		getComponentInternals(this).childComponents.forEach((child) => child && child.dispose && child.dispose());
		getComponentInternals(this).childComponents = [];
	}
	[GEA_REQUEST_RENDER]() {
		const eng = engineThis$2(this);
		if (!eng[GEA_ELEMENT] || !eng[GEA_ELEMENT].parentNode) return;
		const parent = eng[GEA_ELEMENT].parentNode;
		const activeElement = document.activeElement;
		const shouldRestoreFocus = Boolean(activeElement && eng[GEA_ELEMENT].contains(activeElement));
		const focusedId = shouldRestoreFocus ? activeElement?.id || null : null;
		const restoreRootFocus = Boolean(shouldRestoreFocus && activeElement === eng[GEA_ELEMENT]);
		const selectionStart = shouldRestoreFocus && activeElement && "selectionStart" in activeElement ? activeElement.selectionStart ?? null : null;
		const selectionEnd = shouldRestoreFocus && activeElement && "selectionEnd" in activeElement ? activeElement.selectionEnd ?? null : null;
		const focusedValue = shouldRestoreFocus && activeElement && "value" in activeElement ? String(activeElement.value ?? "") : null;
		this[GEA_CLEANUP_BINDINGS]();
		this[GEA_TEARDOWN_SELF_LISTENERS]();
		if (getComponentInternals(this).childComponents && getComponentInternals(this).childComponents.length) {
			getComponentInternals(this).childComponents.forEach((child) => {
				if (!child) return;
				if (child[GEA_COMPILED_CHILD]) {
					child[GEA_RENDERED] = false;
					engineThis$2(child)[GEA_ELEMENT] = null;
					this[GEA_RESET_CHILD_TREE](child);
					return;
				}
				if (typeof child.dispose == "function") child.dispose();
			});
			getComponentInternals(this).childComponents = [];
		}
		getComponentInternals(this).elCache.clear();
		this[GEA_RESET_ELS]?.();
		const placeholder = document.createComment("");
		try {
			if (eng[GEA_ELEMENT].parentNode === parent) eng[GEA_ELEMENT].replaceWith(placeholder);
			else parent.appendChild(placeholder);
		} catch {
			if (!placeholder.parentNode) parent.appendChild(placeholder);
		}
		const manager = ComponentManager.getInstance();
		const cloneFn = this[GEA_CLONE_TEMPLATE];
		const newElement = typeof cloneFn === "function" ? cloneFn.call(this) : manager.createElement(String(this.template(this.props)).trim());
		if (!newElement) {
			eng[GEA_ELEMENT] = placeholder;
			this[GEA_RENDERED] = true;
			return;
		}
		Component[GEA_SYNC_VALUE_PROPS](newElement);
		parent.replaceChild(newElement, placeholder);
		eng[GEA_ELEMENT] = newElement;
		this[GEA_RENDERED] = true;
		manager.markComponentRendered(this);
		this[GEA_ATTACH_BINDINGS]();
		this[GEA_MOUNT_COMPILED_CHILD_COMPONENTS]();
		this[GEA_INSTANTIATE_CHILD_COMPONENTS]();
		this[GEA_SETUP_EVENT_DIRECTIVES]();
		const setupRefsAfter = this[GEA_SETUP_REFS];
		if (typeof setupRefsAfter === "function") setupRefsAfter.call(this);
		if (getComponentInternals(this).listConfigs.length) for (const { store: s, path: p, config: c } of getComponentInternals(this).listConfigs) {
			if (!c.items && c.itemsKey) c.items = this[c.itemsKey];
			if (!c.items) continue;
			const arr = p.reduce((obj, key) => obj?.[key], s[GEA_STORE_ROOT]) ?? [];
			if (arr.length === c.items.length) continue;
			const oldByKey = /* @__PURE__ */ new Map();
			for (const item of c.items) {
				if (!item) continue;
				if (item[GEA_ITEM_KEY] != null) oldByKey.set(item[GEA_ITEM_KEY], item);
			}
			const next = arr.map((data) => {
				const key = String(c.key(data));
				const existing = oldByKey.get(key);
				if (existing) {
					existing[GEA_UPDATE_PROPS](c.props(data));
					oldByKey.delete(key);
					return existing;
				}
				return this[GEA_CHILD](c.Ctor, c.props(data), key);
			});
			c.items.length = 0;
			c.items.push(...next);
			const container = c.container();
			if (container) {
				const condRef = _findCondMarkerByIndex(container, engineThis$2(this)[GEA_ID], c.afterCondSlotIndex);
				for (const item of next) if (!item[GEA_RENDERED]) {
					item.render(container);
					if (condRef) {
						const el = engineThis$2(item)[GEA_ELEMENT];
						if (el && el.parentNode === container) container.insertBefore(el, condRef);
					}
				}
			}
		}
		if (shouldRestoreFocus) {
			const focusTarget = (focusedId ? document.getElementById(focusedId) || null : null) || (restoreRootFocus ? eng[GEA_ELEMENT] : null);
			if (focusTarget && eng[GEA_ELEMENT].contains(focusTarget) && typeof focusTarget.focus === "function") {
				focusTarget.focus();
				if (selectionStart !== null && selectionEnd !== null && "setSelectionRange" in focusTarget && typeof focusTarget.setSelectionRange === "function") {
					const textTarget = focusTarget;
					const nextValue = "value" in textTarget ? String(textTarget.value ?? "") : "";
					const delta = focusedValue !== null && selectionStart === selectionEnd ? nextValue.length - focusedValue.length : 0;
					const nextStart = Math.max(0, Math.min(nextValue.length, selectionStart + delta));
					const nextEnd = Math.max(0, Math.min(nextValue.length, selectionEnd + delta));
					textTarget.setSelectionRange(nextStart, nextEnd);
				}
			}
		}
		this.onAfterRender();
		this.onAfterRenderHooks();
		setTimeout(() => requestAnimationFrame(() => this.onAfterRenderAsync()));
	}
	[GEA_RESET_CHILD_TREE](comp) {
		if (!getComponentInternals(comp).childComponents?.length) return;
		getComponentInternals(comp).childComponents.forEach((c) => {
			if (!c) return;
			c[GEA_RENDERED] = false;
			engineThis$2(c)[GEA_ELEMENT] = null;
			this[GEA_RESET_CHILD_TREE](c);
		});
	}
	[GEA_ATTACH_BINDINGS]() {
		this[GEA_CLEANUP_BINDINGS]();
	}
	static _register(ctor, compiledTagName) {
		if (!ctor || !ctor.name || ctor[GEA_CTOR_AUTO_REGISTERED]) return;
		if (Object.getPrototypeOf(ctor.prototype) === Component.prototype) {
			ctor[GEA_CTOR_AUTO_REGISTERED] = true;
			_componentClassesMap.set(ctor.name, ctor);
			const manager = ComponentManager.getInstance();
			const tagName = compiledTagName || manager.generateTagName_(ctor);
			manager.registerComponentClass(ctor, tagName);
		}
	}
	[GEA_INSTANTIATE_CHILD_COMPONENTS]() {
		const eng = engineThis$2(this);
		if (!eng[GEA_ELEMENT]) return;
		const manager = ComponentManager.getInstance();
		const selectors = manager.getComponentSelectors();
		let elements = [];
		if (selectors.length > 0) elements = Array.from(eng[GEA_ELEMENT].querySelectorAll(selectors.join(",")));
		elements.forEach((el) => {
			if (el.getAttribute("data-gea-component-mounted")) return;
			if (el[GEA_DOM_COMPILED_CHILD_ROOT]) return;
			const ctorName = el.constructor.name;
			if (ctorName !== "HTMLUnknownElement" && ctorName !== "HTMLElement") return;
			const tagName = el.tagName.toLowerCase();
			let Ctor = manager.getComponentConstructor(tagName);
			if (!Ctor && _componentClassesMap) {
				const pascalCase = tagName.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
				Ctor = _componentClassesMap.get(pascalCase);
				if (Ctor) manager.registerComponentClass(Ctor, tagName);
			}
			if (!Ctor) return;
			const props = this[GEA_EXTRACT_COMPONENT_PROPS](el);
			const itemId = el.getAttribute("data-prop-item-id");
			const child = new Ctor(props);
			engineThis$2(child)[GEA_PARENT_COMPONENT] = this[GEA_SELF_PROXY] ?? this;
			getComponentInternals(this).childComponents.push(child);
			const parent = el.parentElement;
			if (!parent) return;
			const index = Array.prototype.slice.call(parent.children).indexOf(el);
			child.render(parent, index);
			if (itemId != null && child.el) {
				const wrapper = document.createElement("div");
				wrapper[GEA_DOM_KEY] = itemId;
				parent.replaceChild(wrapper, child.el);
				wrapper.appendChild(child.el);
			}
			child.el && child.el.setAttribute("data-gea-component-root", child.id);
			parent.removeChild(el);
		});
	}
	[GEA_MOUNT_COMPILED_CHILD_COMPONENTS]() {
		const manager = ComponentManager.getInstance();
		const seen = /* @__PURE__ */ new Set();
		const collect = (value) => {
			if (!value) return;
			if (Array.isArray(value)) {
				value.forEach(collect);
				return;
			}
			if (value && typeof value === "object" && value[GEA_COMPILED_CHILD] && sameComponentIdentity(engineThis$2(value)[GEA_PARENT_COMPONENT], this)) {
				if (!seen.has(value)) {
					seen.add(value);
					if (!getComponentInternals(this).childComponents.includes(value)) getComponentInternals(this).childComponents.push(value);
				}
			}
		};
		for (const key of Reflect.ownKeys(this)) collect(this[key]);
		seen.forEach((child) => {
			const existing = document.getElementById(child.id);
			if (!existing) return;
			if (child[GEA_RENDERED] && engineThis$2(child)[GEA_ELEMENT] === existing) return;
			existing[GEA_DOM_COMPILED_CHILD_ROOT] = true;
			engineThis$2(child)[GEA_ELEMENT] = existing;
			existing[GEA_DOM_COMPONENT] = child;
			child[GEA_RENDERED] = true;
			manager.markComponentRendered(child);
			child[GEA_ATTACH_BINDINGS]();
			child[GEA_MOUNT_COMPILED_CHILD_COMPONENTS]();
			child[GEA_INSTANTIATE_CHILD_COMPONENTS]();
			child[GEA_SETUP_EVENT_DIRECTIVES]();
			const childSetupRefs = child[GEA_SETUP_REFS];
			if (typeof childSetupRefs === "function") childSetupRefs.call(child);
			child.onAfterRender();
			child.onAfterRenderHooks();
			child[GEA_SYNC_UNRENDERED_LIST_ITEMS]();
			requestAnimationFrame(() => child.onAfterRenderAsync());
		});
	}
	[GEA_CHILD](Ctor, props, key) {
		const child = new Ctor(props);
		engineThis$2(child)[GEA_PARENT_COMPONENT] = this[GEA_SELF_PROXY] ?? this;
		child[GEA_COMPILED_CHILD] = true;
		if (key !== void 0) child[GEA_ITEM_KEY] = String(key);
		if (!getComponentInternals(this).childComponents.includes(child)) getComponentInternals(this).childComponents.push(child);
		return child;
	}
	[GEA_EL](suffix) {
		const eng = engineThis$2(this);
		let el = getComponentInternals(this).elCache.get(suffix) ?? null;
		if (!el || !el.isConnected) {
			const id = eng[GEA_ID] + "-" + suffix;
			const root = eng[GEA_ELEMENT];
			const bySelector = (r) => r.querySelector(`#${CSS.escape(id)}`);
			if (root) el = root.isConnected ? document.getElementById(id) ?? bySelector(root) : bySelector(root);
			else el = document.getElementById(id);
			if (el) getComponentInternals(this).elCache.set(suffix, el);
			else getComponentInternals(this).elCache.delete(suffix);
		}
		return el;
	}
	[GEA_UPDATE_TEXT](suffix, text) {
		const el = this[GEA_EL](suffix);
		if (el) el.textContent = text;
	}
	static [GEA_STATIC_ESCAPE_HTML](str) {
		return __escapeHtml(str);
	}
	static [GEA_STATIC_SANITIZE_ATTR](name, value) {
		return __sanitizeAttr(name, value);
	}
	[GEA_OBSERVE](store, path, handler) {
		const remover = store[GEA_STORE_ROOT].observe(path, handler.bind(this));
		getComponentInternals(this).observerRemovers.push(remover);
	}
	[GEA_REORDER_CHILDREN](container, items, afterCondSlotIndex) {
		if (!container || !this[GEA_RENDERED]) return;
		for (const item of items) if (!item[GEA_RENDERED]) {
			if (!getComponentInternals(this).childComponents.includes(item)) getComponentInternals(this).childComponents.push(item);
			item.render(container);
		}
		const ordered = [];
		for (const item of items) {
			let el = engineThis$2(item)[GEA_ELEMENT];
			if (!el) continue;
			while (el.parentElement && el.parentElement !== container) el = el.parentElement;
			ordered.push(el);
		}
		if (ordered.length === 0) return;
		const condRef = _findCondMarkerByIndex(container, engineThis$2(this)[GEA_ID], afterCondSlotIndex);
		if (condRef) for (const el of ordered) container.insertBefore(el, condRef);
		else {
			const itemSet = new Set(ordered);
			let cursor = container.firstChild;
			while (cursor && !itemSet.has(cursor)) cursor = cursor.nextSibling;
			for (const el of ordered) if (el !== cursor) container.insertBefore(el, cursor || null);
			else {
				cursor = cursor.nextSibling;
				while (cursor && !itemSet.has(cursor)) cursor = cursor.nextSibling;
			}
		}
	}
	[GEA_RECONCILE_LIST](oldItems, newData, container, Ctor, propsFactory, keyExtractor, afterCondSlotIndex) {
		const oldByKey = /* @__PURE__ */ new Map();
		for (const item of oldItems) {
			if (!item) continue;
			if (item[GEA_ITEM_KEY] != null) oldByKey.set(item[GEA_ITEM_KEY], item);
		}
		if (oldByKey.size === 0 && container) for (let ch = container.firstElementChild; ch; ch = ch.nextElementSibling) {
			const comp = ch[GEA_DOM_COMPONENT];
			if (!comp) continue;
			let c = comp;
			while (c) {
				if (c[GEA_ITEM_KEY] != null) {
					oldByKey.set(c[GEA_ITEM_KEY], c);
					break;
				}
				c = engineThis$2(c)[GEA_PARENT_COMPONENT];
			}
		}
		if (oldItems.length === 0 && newData.length > 0 && container && oldByKey.size === 0) while (container.firstElementChild) container.removeChild(container.firstElementChild);
		const next = newData.map((data, idx) => {
			const key = String(keyExtractor(data, idx));
			const existing = oldByKey.get(key);
			if (existing) {
				existing[GEA_UPDATE_PROPS](propsFactory(data, idx));
				oldByKey.delete(key);
				return existing;
			}
			const transferred = _claimTransfer(key);
			if (transferred) {
				transferred[GEA_UPDATE_PROPS](propsFactory(data, idx));
				engineThis$2(transferred)[GEA_PARENT_COMPONENT] = this;
				if (!getComponentInternals(this).childComponents.includes(transferred)) getComponentInternals(this).childComponents.push(transferred);
				return transferred;
			}
			return this[GEA_CHILD](Ctor, propsFactory(data, idx), key);
		});
		for (const removed of oldByKey.values()) {
			if (_isInTransfer(removed)) continue;
			removed.dispose?.();
		}
		this[GEA_REORDER_CHILDREN](container, next, afterCondSlotIndex);
		if (container && next.length > 0) {
			const rootSet = /* @__PURE__ */ new Set();
			for (const item of next) {
				if (!engineThis$2(item)?.[GEA_ELEMENT]) continue;
				let el = engineThis$2(item)[GEA_ELEMENT];
				while (el.parentElement && el.parentElement !== container) el = el.parentElement;
				if (el && el.parentElement === container) rootSet.add(el);
			}
			if (rootSet.size === next.length && container.childElementCount > next.length) for (let ch = container.firstChild; ch;) {
				const nx = ch.nextSibling;
				if (ch.nodeType === 1 && !rootSet.has(ch)) {
					let c = ch[GEA_DOM_COMPONENT];
					let keyedAncestor;
					while (c) {
						if (c[GEA_ITEM_KEY] != null) {
							keyedAncestor = c;
							break;
						}
						c = engineThis$2(c)[GEA_PARENT_COMPONENT];
					}
					if (keyedAncestor) {
						keyedAncestor.dispose?.();
						ch.remove();
					}
				}
				ch = nx;
			}
		}
		getComponentInternals(this).childComponents = getComponentInternals(this).childComponents.filter((child) => !oldItems.includes(child) || next.includes(child));
		return next;
	}
	[GEA_OBSERVE_LIST](store, path, config) {
		getComponentInternals(this).listConfigs.push({
			store,
			path,
			config
		});
		this[GEA_OBSERVE](store, path, (_value, changes) => {
			if ((!config.items || config.items.length === 0) && config.itemsKey) config.items = this[config.itemsKey];
			if (!config.items) return;
			if (config[GEA_LIST_CONFIG_REFRESHING]) return;
			config[GEA_LIST_CONFIG_REFRESHING] = true;
			try {
				const storeData = store[GEA_STORE_ROOT];
				const arr = path.reduce((obj, key) => obj?.[key], storeData) ?? [];
				if (changes.every((c) => c.isArrayItemPropUpdate)) for (const c of changes) {
					const item = config.items[c.arrayIndex];
					if (item) item[GEA_UPDATE_PROPS](config.props(arr[c.arrayIndex], c.arrayIndex));
				}
				else if (changes.length === 1 && changes[0].type === "append" && changes[0].pathParts.length === path.length && changes[0].pathParts.every((p, i) => p === path[i])) {
					const { start, count } = changes[0];
					const container = config.container();
					const condRef = container ? _findCondMarkerByIndex(container, engineThis$2(this)[GEA_ID], config.afterCondSlotIndex) : null;
					for (let i = 0; i < count; i++) {
						const data = arr[start + i];
						const item = this[GEA_CHILD](config.Ctor, config.props(data, start + i), config.key(data, start + i));
						config.items.push(item);
						if (this[GEA_RENDERED] && container) {
							item.render(container);
							if (condRef) {
								const el = engineThis$2(item)[GEA_ELEMENT];
								if (el && el.parentNode === container) container.insertBefore(el, condRef);
							}
						}
					}
				} else {
					const newItems = this[GEA_RECONCILE_LIST](config.items, arr, config.container(), config.Ctor, config.props, config.key, config.afterCondSlotIndex);
					config.items.length = 0;
					config.items.push(...newItems);
				}
				config.onchange?.();
			} finally {
				config[GEA_LIST_CONFIG_REFRESHING] = false;
			}
		});
	}
	/**
	* Force-reconcile a list config by re-reading the getter value through the
	* store proxy.  Used by compiler-generated delegates when a getter-backed
	* array map's underlying dependency changes (e.g. activePlaylistId changes
	* causing filteredTracks to return different items).
	*/
	[GEA_REFRESH_LIST](pathKey) {
		const configs = getComponentInternals(this).listConfigs;
		if (!configs?.length) return;
		for (const { store: s, path: p, config: c } of configs) {
			if (p.join(".") !== pathKey) continue;
			if ((!c.items || c.items.length === 0) && c.itemsKey) c.items = this[c.itemsKey];
			if (!c.items) continue;
			if (c[GEA_LIST_CONFIG_REFRESHING]) return;
			c[GEA_LIST_CONFIG_REFRESHING] = true;
			try {
				const arr = p.reduce((obj, key) => obj?.[key], s) ?? [];
				const newItems = this[GEA_RECONCILE_LIST](c.items, arr, c.container(), c.Ctor, c.props, c.key, c.afterCondSlotIndex);
				c.items.length = 0;
				c.items.push(...newItems);
				c.onchange?.();
			} finally {
				c[GEA_LIST_CONFIG_REFRESHING] = false;
			}
		}
	}
	[GEA_SWAP_CHILD](markerId, newChild) {
		const eng = engineThis$2(this);
		const marker = document.getElementById(eng[GEA_ID] + "-" + markerId);
		if (!marker) return;
		const oldEl = marker.nextElementSibling;
		if (newChild && newChild[GEA_RENDERED] && engineThis$2(newChild)[GEA_ELEMENT] === oldEl) return;
		if (oldEl && oldEl.tagName !== "TEMPLATE") {
			const oldChild = getComponentInternals(this).childComponents.find((c) => engineThis$2(c)[GEA_ELEMENT] === oldEl);
			if (oldChild) {
				oldChild[GEA_RENDERED] = false;
				engineThis$2(oldChild)[GEA_ELEMENT] = null;
			}
			oldEl.remove();
		}
		if (!newChild) return;
		const html = String(newChild.template(newChild.props)).trim();
		marker.insertAdjacentHTML("afterend", html);
		const newEl = marker.nextElementSibling;
		if (!newEl) return;
		engineThis$2(newChild)[GEA_ELEMENT] = newEl;
		newChild[GEA_RENDERED] = true;
		if (!getComponentInternals(this).childComponents.includes(newChild)) getComponentInternals(this).childComponents.push(newChild);
		ComponentManager.getInstance().markComponentRendered(newChild);
		newChild[GEA_ATTACH_BINDINGS]();
		newChild[GEA_MOUNT_COMPILED_CHILD_COMPONENTS]();
		newChild[GEA_INSTANTIATE_CHILD_COMPONENTS]();
		newChild[GEA_SETUP_EVENT_DIRECTIVES]();
		newChild.onAfterRender();
		newChild.onAfterRenderHooks();
	}
	[GEA_CLEANUP_BINDINGS]() {
		getComponentInternals(this).bindings = [];
	}
	[GEA_SETUP_EVENT_DIRECTIVES]() {}
	[GEA_TEARDOWN_SELF_LISTENERS]() {
		getComponentInternals(this).selfListeners.forEach((remove) => {
			if (typeof remove == "function") remove();
		});
		getComponentInternals(this).selfListeners = [];
	}
	[GEA_EXTRACT_COMPONENT_PROPS](el) {
		if (el[GEA_DOM_PROPS]) {
			const jsProps = el[GEA_DOM_PROPS];
			delete el[GEA_DOM_PROPS];
			return jsProps;
		}
		const props = {};
		if (!el.getAttributeNames) return props;
		el.getAttributeNames().filter((name) => name.startsWith("data-prop-")).forEach((name) => {
			const value = el.getAttribute(name);
			const propName = this[GEA_NORMALIZE_PROP_NAME](name.slice(10));
			if (getComponentInternals(this).geaPropBindings && value && value.startsWith("gea:p:")) {
				const propValue = getComponentInternals(this).geaPropBindings.get(value);
				if (propValue === void 0) console.warn(`[gea] Prop binding not found for ${value} on component ${this.constructor.name}`);
				props[propName] = propValue;
			} else props[propName] = this[GEA_COERCE_STATIC_PROP_VALUE](value);
			el.removeAttribute(name);
		});
		if (!("children" in props)) {
			const inner = el.innerHTML;
			if (inner) props["children"] = inner;
		}
		return props;
	}
	[GEA_COERCE_STATIC_PROP_VALUE](value) {
		if (value == null) return void 0;
		if (value === "true") return true;
		if (value === "false") return false;
		if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
		return value;
	}
	[GEA_NORMALIZE_PROP_NAME](name) {
		return name.replace(/-([a-z])/g, (_, chr) => chr.toUpperCase());
	}
	[GEA_REGISTER_MAP](idx, containerProp, getContainer, getItems, createItem, keyProp) {
		if (!getComponentInternals(this).geaMaps) getComponentInternals(this).geaMaps = {};
		getComponentInternals(this).geaMaps[idx] = {
			containerProp,
			getContainer,
			getItems,
			createItem,
			container: null,
			keyProp
		};
	}
	[GEA_SYNC_MAP](idx) {
		if (!this[GEA_RENDERED]) return;
		const map = getComponentInternals(this).geaMaps?.[idx];
		if (!map) return;
		let container = map.getContainer();
		if (!container) return;
		if (container.id) {
			let hasDirectItems = false;
			for (let n = container.firstChild; n; n = n.nextSibling) {
				if (n.nodeType === 1 && (n[GEA_DOM_KEY] != null || n.hasAttribute("data-gea-item-id"))) {
					hasDirectItems = true;
					break;
				}
				if (n.nodeType === 8 && !n.data) break;
			}
			if (!hasDirectItems) {
				let nested = null;
				const prefix = container.id + "-";
				const walk = (el) => {
					for (let c = el.firstChild; c; c = c.nextSibling) {
						if (c.nodeType !== 1) continue;
						const child = c;
						if ((child[GEA_DOM_KEY] != null || child.hasAttribute("data-gea-item-id")) && child.id && child.id.startsWith(prefix)) {
							nested = child;
							return;
						}
						walk(child);
						if (nested) return;
					}
				};
				walk(container);
				if (nested?.parentElement && nested.parentElement !== container) container = nested.parentElement;
				else if (!nested) {
					let insideCondSlot = false;
					for (let s = container.firstChild; s; s = s.nextSibling) {
						if (s.nodeType === 8 && !s.data) break;
						if (s.nodeType === 8 && s.data && /-c\d+$/.test(s.data)) {
							insideCondSlot = true;
							break;
						}
					}
					if (insideCondSlot) return;
				}
			}
		}
		map.container = container;
		this[map.containerProp] = container;
		const items = map.getItems();
		const normalizedItems = Array.isArray(items) ? items : [];
		this[GEA_SYNC_ITEMS](container, normalizedItems, map.createItem, map.keyProp);
	}
	[GEA_SYNC_ITEMS](container, items, createItemFn, keyProp) {
		const itemKey = typeof keyProp === "function" ? (item, index) => keyProp(item, index) : (item, _index) => {
			if (item != null && typeof item === "object") {
				if (keyProp && keyProp in item) return String(item[keyProp]);
				if ("id" in item) return String(item.id);
			}
			return String(item);
		};
		const c = container;
		let prev = c[GEA_MAP_CONFIG_PREV];
		if (!prev) {
			prev = [];
			for (let n = container.firstChild; n; n = n.nextSibling) if (n.nodeType === 1) {
				const aid = n[GEA_DOM_KEY] ?? n.getAttribute("data-gea-item-id");
				if (aid != null) prev.push(aid);
			} else if (n.nodeType === 8 && !n.data) break;
			c[GEA_MAP_CONFIG_COUNT] = prev.length;
		}
		if (prev.length === items.length) {
			let same = true;
			for (let j = 0; j < prev.length; j++) if (itemKey(prev[j], j) !== itemKey(items[j], j)) {
				same = false;
				break;
			}
			if (same) {
				let child = container.firstChild;
				for (let j = 0; j < items.length; j++) {
					while (child && (child.nodeType !== 1 || child[GEA_DOM_KEY] == null && !child.hasAttribute?.("data-gea-item-id"))) {
						if (child.nodeType === 8 && !child.data) break;
						child = child.nextSibling;
					}
					if (!child || child.nodeType !== 1) break;
					const oldEl = child;
					child = child.nextSibling;
					const newEl = createItemFn(items[j], j);
					if (oldEl.innerHTML !== newEl.innerHTML) {
						oldEl.innerHTML = newEl.innerHTML;
						Component[GEA_SYNC_VALUE_PROPS](oldEl);
					}
					for (let ai = 0; ai < newEl.attributes.length; ai++) {
						const a = newEl.attributes[ai];
						if (oldEl.getAttribute(a.name) !== a.value) {
							oldEl.setAttribute(a.name, a.value);
							if (a.name === "value" && "value" in oldEl) oldEl.value = a.value;
						}
					}
					if (newEl[GEA_DOM_ITEM] !== void 0) oldEl[GEA_DOM_ITEM] = newEl[GEA_DOM_ITEM];
					if (newEl[GEA_DOM_KEY] !== void 0) oldEl[GEA_DOM_KEY] = newEl[GEA_DOM_KEY];
				}
				c[GEA_MAP_CONFIG_PREV] = items.slice();
				return;
			}
		}
		if (items.length > prev.length && prev.length > 0) {
			let appendOk = true;
			for (let j = 0; j < prev.length; j++) if (itemKey(prev[j], j) !== itemKey(items[j], j)) {
				appendOk = false;
				break;
			}
			if (appendOk) {
				const frag = document.createDocumentFragment();
				for (let j = prev.length; j < items.length; j++) frag.appendChild(createItemFn(items[j], j));
				Component[GEA_SYNC_VALUE_PROPS](frag);
				let marker = null;
				for (let sc = container.firstChild; sc; sc = sc.nextSibling) if (sc.nodeType === 8 && !sc.data) {
					marker = sc;
					break;
				}
				container.insertBefore(frag, marker);
				c[GEA_MAP_CONFIG_PREV] = items.slice();
				c[GEA_MAP_CONFIG_COUNT] = items.length;
				return;
			}
		}
		if (items.length < prev.length) {
			const newSet = /* @__PURE__ */ new Set();
			for (let j = 0; j < items.length; j++) newSet.add(itemKey(items[j], j));
			const removals = [];
			for (let sc = container.firstChild; sc; sc = sc.nextSibling) if (sc.nodeType === 1) {
				const aid = sc[GEA_DOM_KEY] ?? sc.getAttribute("data-gea-item-id");
				if (aid != null && !newSet.has(aid)) removals.push(sc);
			} else if (sc.nodeType === 8 && !sc.data) break;
			if (removals.length === prev.length - items.length) {
				for (let j = 0; j < removals.length; j++) container.removeChild(removals[j]);
				c[GEA_MAP_CONFIG_PREV] = items.slice();
				c[GEA_MAP_CONFIG_COUNT] = items.length;
				return;
			}
		}
		c[GEA_MAP_CONFIG_PREV] = items.slice();
		let oldCount = c[GEA_MAP_CONFIG_COUNT];
		if (oldCount == null || oldCount === 0 && container.firstChild) {
			oldCount = 0;
			for (let n = container.firstChild; n; n = n.nextSibling) if (n.nodeType === 1) oldCount++;
			else if (n.nodeType === 8 && !n.data) break;
		}
		let toRemove = oldCount;
		while (toRemove > 0 && container.firstChild) {
			const rm = container.firstChild;
			if (rm.nodeType === 1) toRemove--;
			container.removeChild(rm);
		}
		const fragment = document.createDocumentFragment();
		for (let i = 0; i < items.length; i++) fragment.appendChild(createItemFn(items[i], i));
		Component[GEA_SYNC_VALUE_PROPS](fragment);
		container.insertBefore(fragment, container.firstChild);
		c[GEA_MAP_CONFIG_PREV] = items.slice();
		c[GEA_MAP_CONFIG_COUNT] = items.length;
	}
	[GEA_CLONE_ITEM](container, item, renderFn, bindingId, itemIdProp, patches) {
		const c = container;
		const idProp = itemIdProp || "id";
		if (!c[GEA_MAP_CONFIG_TPL]) try {
			const tw = container.cloneNode(false);
			tw.innerHTML = renderFn({
				[idProp]: 0,
				label: ""
			});
			c[GEA_MAP_CONFIG_TPL] = tw.firstElementChild;
		} catch {}
		let el;
		if (c[GEA_MAP_CONFIG_TPL]) el = c[GEA_MAP_CONFIG_TPL].cloneNode(true);
		else {
			const tw = container.cloneNode(false);
			tw.innerHTML = renderFn(item);
			el = tw.firstElementChild;
		}
		const raw = item != null && typeof item === "object" ? item[idProp] : void 0;
		el[GEA_DOM_KEY] = String(raw != null ? raw : item);
		el[GEA_DOM_ITEM] = item;
		if (patches) for (let i = 0; i < patches.length; i++) {
			const p = patches[i];
			const path = p[0];
			const type = p[1];
			const val = p[2];
			let target = el;
			for (let j = 0; j < path.length; j++) target = target.children[path[j]];
			if (type === "c") target.className = String(val).trim();
			else if (type === "t") target.textContent = String(val);
			else if (val == null || val === false) target.removeAttribute(type);
			else {
				target.setAttribute(type, String(val));
				if (type === "value" && "value" in target) target.value = String(val);
			}
		}
		Component[GEA_SYNC_VALUE_PROPS](el);
		return el;
	}
	[GEA_REGISTER_COND](idx, slotId, getCond, getTruthyHtml, getFalsyHtml) {
		if (!getComponentInternals(this).geaConds) getComponentInternals(this).geaConds = {};
		getComponentInternals(this).geaConds[idx] = {
			slotId,
			getCond,
			getTruthyHtml,
			getFalsyHtml
		};
		if (!this[GEA_RENDERED]) {
			if (!getComponentInternals(this).condPatchPrev) getComponentInternals(this).condPatchPrev = {};
			try {
				getComponentInternals(this).condPatchPrev[idx] = !!getCond();
			} catch {}
		}
	}
	/**
	* Re-run compiler-generated setup after incremental DOM updates (e.g. conditional slots) so
	* `ref={this.x}` targets stay in sync; `querySelector` returns `null` when a marked node is
	* absent, clearing stale references.
	*/
	[GEA_SYNC_DOM_REFS]() {
		const fn = this[GEA_SETUP_REFS];
		if (typeof fn === "function") fn.call(this);
	}
	[GEA_PATCH_COND](idx) {
		const conf = getComponentInternals(this).geaConds?.[idx];
		if (!conf) return false;
		let cond;
		try {
			cond = !!conf.getCond();
		} catch {
			return false;
		}
		let condPatchPrev = getComponentInternals(this).condPatchPrev;
		if (!condPatchPrev) getComponentInternals(this).condPatchPrev = condPatchPrev = {};
		const prev = condPatchPrev[idx];
		const needsPatch = cond !== prev;
		const eng = engineThis$2(this);
		const root = eng[GEA_ELEMENT] || document.getElementById(eng[GEA_ID]);
		if (!root) return false;
		const markerText = eng[GEA_ID] + "-" + conf.slotId;
		const endMarkerText = markerText + "-end";
		const findMarker = (value) => {
			const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
			let current = walker.nextNode();
			while (current) {
				if (current.nodeValue === value) return current;
				current = walker.nextNode();
			}
			return null;
		};
		const marker = findMarker(markerText);
		const endMarker = findMarker(endMarkerText);
		const parent = endMarker && endMarker.parentNode;
		if (!marker || !endMarker || !parent) {
			condPatchPrev[idx] = void 0;
			return false;
		}
		const stripTrailingKeyedRowsAfterSlot = () => {
			let node = endMarker.nextSibling;
			while (node && node.nodeType === 1) {
				const el = node;
				const next = node.nextSibling;
				if (el.hasAttribute("data-email-id")) {
					for (const child of getComponentInternals(this).childComponents) if (child[GEA_COMPILED_CHILD] && engineThis$2(child)[GEA_ELEMENT] && (engineThis$2(child)[GEA_ELEMENT] === el || el.contains(engineThis$2(child)[GEA_ELEMENT]))) {
						child.dispose();
						getComponentInternals(this).childComponents = getComponentInternals(this).childComponents.filter((c) => c !== child);
						break;
					}
					try {
						if (el.parentNode) el.remove();
					} catch {}
					node = next;
					continue;
				}
				break;
			}
		};
		const replaceSlotContent = (htmlFn) => {
			if (!htmlFn) {
				let node = marker.nextSibling;
				while (node && node !== endMarker) {
					const next = node.nextSibling;
					if (!node.parentNode) break;
					try {
						node.remove();
					} catch {}
					node = next;
				}
				return;
			}
			const html = htmlFn();
			if (html === "") {
				if (!cond && prev === true) {
					let node = marker.nextSibling;
					while (node && node !== endMarker) {
						const next = node.nextSibling;
						if (!node.parentNode) break;
						try {
							node.remove();
						} catch {}
						node = next;
					}
					return;
				}
				let node = marker.nextSibling;
				while (node && node !== endMarker) {
					const next = node.nextSibling;
					if (!node.parentNode) break;
					try {
						if (node.nodeType !== 1) node.remove();
						else {
							const el = node;
							if (el.hasAttribute("data-email-id")) node.remove();
							else if (node[GEA_DOM_KEY] == null && !el.hasAttribute?.("data-gea-item-id")) node.remove();
						}
					} catch {}
					node = next;
				}
				return;
			}
			let node = marker.nextSibling;
			while (node && node !== endMarker) {
				const next = node.nextSibling;
				if (!node.parentNode) break;
				try {
					node.remove();
				} catch {}
				node = next;
			}
			if ("namespaceURI" in parent && parent.namespaceURI === "http://www.w3.org/2000/svg") {
				const wrap = document.createElementNS("http://www.w3.org/2000/svg", "svg");
				wrap.innerHTML = html;
				while (wrap.firstChild) parent.insertBefore(wrap.firstChild, endMarker);
			} else {
				const tpl = document.createElement("template");
				tpl.innerHTML = html;
				Component[GEA_SYNC_VALUE_PROPS](tpl.content);
				parent.insertBefore(tpl.content, endMarker);
			}
		};
		if (needsPatch) {
			if (!cond) {
				if (prev === true) {
					const disposed = /* @__PURE__ */ new Set();
					let node = marker.nextSibling;
					while (node && node !== endMarker) {
						if (node.nodeType === 1) {
							const el = node;
							for (const child of getComponentInternals(this).childComponents) if (child[GEA_COMPILED_CHILD] && engineThis$2(child)[GEA_ELEMENT] && (engineThis$2(child)[GEA_ELEMENT] === el || el.contains(engineThis$2(child)[GEA_ELEMENT]))) disposed.add(child);
						}
						node = node.nextSibling;
					}
					for (const child of disposed) {
						child.dispose();
						for (const key of Object.keys(this)) if (this[key] === child) {
							this[key] = null;
							break;
						}
					}
					if (disposed.size > 0) getComponentInternals(this).childComponents = getComponentInternals(this).childComponents.filter((c) => !disposed.has(c));
				}
			} else if (prev === false) {
				const disposedTruthy = /* @__PURE__ */ new Set();
				let n = marker.nextSibling;
				while (n && n !== endMarker) {
					if (n.nodeType === 1) {
						const el = n;
						for (const child of getComponentInternals(this).childComponents) if (child[GEA_COMPILED_CHILD] && engineThis$2(child)[GEA_ELEMENT] && (engineThis$2(child)[GEA_ELEMENT] === el || el.contains(engineThis$2(child)[GEA_ELEMENT]))) disposedTruthy.add(child);
					}
					n = n.nextSibling;
				}
				for (const child of disposedTruthy) {
					child.dispose();
					for (const key of Object.keys(this)) if (this[key] === child) {
						this[key] = null;
						break;
					}
				}
				if (disposedTruthy.size > 0) getComponentInternals(this).childComponents = getComponentInternals(this).childComponents.filter((c) => !disposedTruthy.has(c));
			}
			replaceSlotContent(cond ? conf.getTruthyHtml : conf.getFalsyHtml);
			stripTrailingKeyedRowsAfterSlot();
			if (cond) {
				this[GEA_MOUNT_COMPILED_CHILD_COMPONENTS]();
				this[GEA_INSTANTIATE_CHILD_COMPONENTS]();
				this[GEA_SETUP_EVENT_DIRECTIVES]();
				Component[GEA_SYNC_AUTOFOCUS](marker, endMarker);
			}
			condPatchPrev[idx] = cond;
		} else if (cond && conf.getTruthyHtml) {
			const existingNode = marker.nextSibling;
			if (existingNode && existingNode !== endMarker && existingNode.nodeType === 1) {
				if (existingNode[GEA_DOM_COMPILED_CHILD_ROOT]) return needsPatch;
				for (const child of getComponentInternals(this).childComponents) if (child[GEA_COMPILED_CHILD] && engineThis$2(child)[GEA_ELEMENT] && (engineThis$2(child)[GEA_ELEMENT] === existingNode || existingNode.contains(engineThis$2(child)[GEA_ELEMENT]))) return needsPatch;
				const newHtml = conf.getTruthyHtml();
				const tpl = document.createElement("template");
				tpl.innerHTML = newHtml;
				const newEl = tpl.content.firstElementChild;
				if (newEl) Component[GEA_PATCH_NODE](existingNode, newEl);
			}
		} else if (!cond && conf.getFalsyHtml) {
			const newHtml = conf.getFalsyHtml();
			const tpl = document.createElement("template");
			tpl.innerHTML = newHtml;
			const newChildren = Array.from(tpl.content.childNodes);
			let existing = marker.nextSibling;
			let idx = 0;
			while (existing && existing !== endMarker && idx < newChildren.length) {
				const desired = newChildren[idx];
				if (existing.nodeType === 1 && desired.nodeType === 1) {
					if (!existing[GEA_DOM_COMPILED_CHILD_ROOT]) Component[GEA_PATCH_NODE](existing, desired);
				} else if (existing.nodeType === 3 && desired.nodeType === 3) {
					if (existing.textContent !== desired.textContent) existing.textContent = desired.textContent;
				}
				existing = existing.nextSibling;
				idx++;
			}
		}
		this[GEA_SYNC_DOM_REFS]();
		return needsPatch;
	}
	static [GEA_SYNC_VALUE_PROPS](root) {
		const els = root.querySelectorAll?.("textarea[value], input[value], select[value]");
		if (!els) return;
		for (let i = 0; i < els.length; i++) {
			const el = els[i];
			el.value = el.getAttribute("value") || "";
		}
	}
	static [GEA_SYNC_AUTOFOCUS](startMarker, endMarker) {
		let node = startMarker.nextSibling;
		while (node && node !== endMarker) {
			if (node.nodeType === 1) {
				const el = node;
				const target = el.hasAttribute("autofocus") ? el : el.querySelector("[autofocus]");
				if (target) {
					target.focus();
					return;
				}
			}
			node = node.nextSibling;
		}
	}
	static [GEA_PATCH_NODE](existing, desired, preserveExtraAttrs) {
		if (existing[GEA_DOM_COMPILED_CHILD_ROOT]) return;
		if (existing.tagName !== desired.tagName) {
			existing.replaceWith(desired.cloneNode(true));
			return;
		}
		const oldAttrs = existing.attributes;
		const newAttrs = desired.attributes;
		if (!preserveExtraAttrs) for (let i = oldAttrs.length - 1; i >= 0; i--) {
			const name = oldAttrs[i].name;
			if (!desired.hasAttribute(name)) existing.removeAttribute(name);
		}
		for (let i = 0; i < newAttrs.length; i++) {
			const { name, value } = newAttrs[i];
			if (existing.getAttribute(name) !== value) existing.setAttribute(name, value);
			if (name === "value" && "value" in existing) existing.value = value;
		}
		const oldChildren = existing.childNodes;
		const newChildren = desired.childNodes;
		const max = Math.max(oldChildren.length, newChildren.length);
		for (let i = 0; i < max; i++) {
			const oldChild = oldChildren[i];
			const newChild = newChildren[i];
			if (!oldChild && newChild) existing.appendChild(newChild.cloneNode(true));
			else if (oldChild && !newChild) {
				oldChild.remove();
				i--;
			} else if (oldChild && newChild) {
				if (oldChild.nodeType !== newChild.nodeType) oldChild.replaceWith(newChild.cloneNode(true));
				else if (oldChild.nodeType === 3) {
					if (oldChild.textContent !== newChild.textContent) oldChild.textContent = newChild.textContent;
				} else if (oldChild.nodeType === 1) Component[GEA_PATCH_NODE](oldChild, newChild, preserveExtraAttrs);
			}
		}
	}
	static register(tagName) {
		ComponentManager.getInstance().registerComponentClass(this, tagName);
		if (_componentClassesMap) _componentClassesMap.set(this.name, this);
	}
};
Object.defineProperty(Component, GEA_COMPONENT_CLASSES, {
	get() {
		return _componentClassesMap;
	},
	configurable: true,
	enumerable: false
});
Object.defineProperty(Component.prototype, GEA_MAPS, {
	get() {
		return getComponentInternals(this).geaMaps;
	},
	set(v) {
		getComponentInternals(this).geaMaps = v;
	},
	configurable: true,
	enumerable: false
});
Object.defineProperty(Component.prototype, GEA_CONDS, {
	get() {
		return getComponentInternals(this).geaConds;
	},
	set(v) {
		getComponentInternals(this).geaConds = v;
	},
	configurable: true,
	enumerable: false
});
Object.defineProperty(Component.prototype, GEA_EL_CACHE, {
	get() {
		return getComponentInternals(this).elCache;
	},
	set(v) {
		getComponentInternals(this).elCache = v;
	},
	configurable: true,
	enumerable: false
});
Object.defineProperty(Component.prototype, GEA_CHILD_COMPONENTS, {
	get() {
		return getComponentInternals(this).childComponents;
	},
	set(v) {
		getComponentInternals(this).childComponents = v;
	},
	configurable: true,
	enumerable: false
});
Object.defineProperty(Component.prototype, GEA_OBSERVER_REMOVERS, {
	get() {
		return getComponentInternals(this).observerRemovers;
	},
	set(v) {
		getComponentInternals(this).observerRemovers = v;
	},
	configurable: true,
	enumerable: false
});
Object.defineProperty(Component.prototype, GEA_COMPILED_CHILD, {
	get() {
		return getComponentInternals(this).geaCompiledChild;
	},
	set(v) {
		getComponentInternals(this).geaCompiledChild = v;
	},
	configurable: true,
	enumerable: false
});
Object.defineProperty(Component.prototype, GEA_ITEM_KEY, {
	get() {
		return getComponentInternals(this).geaItemKey;
	},
	set(v) {
		getComponentInternals(this).geaItemKey = v;
	},
	configurable: true,
	enumerable: false
});
Object.defineProperty(Component.prototype, GEA_SELF_LISTENERS, {
	get() {
		return getComponentInternals(this).selfListeners;
	},
	set(v) {
		getComponentInternals(this).selfListeners = v;
	},
	configurable: true,
	enumerable: false
});
Object.defineProperty(Component.prototype, GEA_PROP_BINDINGS, {
	get() {
		return getComponentInternals(this).geaPropBindings;
	},
	set(v) {
		getComponentInternals(this).geaPropBindings = v;
	},
	configurable: true,
	enumerable: false
});
Object.defineProperty(Component.prototype, GEA_RESET_ELS, {
	get() {
		return getComponentInternals(this).resetEls;
	},
	set(v) {
		getComponentInternals(this).resetEls = v;
	},
	configurable: true,
	enumerable: false
});
//#endregion
//#region src/lib/h.ts
function h(tag, props, ...children) {
	const flat = children.flat(Infinity).filter((c) => c != null && c !== false && c !== true);
	let attrs = "";
	for (const [k, v] of Object.entries(props || {})) if (v === true) attrs += ` ${k}`;
	else if (v !== false && v != null) attrs += ` ${k}="${v}"`;
	return `<${tag}${attrs}>${flat.join("")}</${tag}>`;
}
//#endregion
//#region src/lib/router/match.ts
function matchRoute(pattern, path) {
	const patternParts = pattern.split("/").filter(Boolean);
	const pathParts = path.split("/").filter(Boolean);
	const hasWildcard = patternParts.length > 0 && patternParts[patternParts.length - 1] === "*";
	if (hasWildcard) patternParts.pop();
	if (!hasWildcard && patternParts.length !== pathParts.length) return null;
	if (hasWildcard && pathParts.length < patternParts.length) return null;
	const params = {};
	for (let i = 0; i < patternParts.length; i++) {
		const pp = patternParts[i];
		const pathPart = pathParts[i];
		if (pp.startsWith(":")) params[pp.slice(1)] = decodeURIComponent(pathPart);
		else if (pp !== pathPart) return null;
	}
	if (hasWildcard) params["*"] = pathParts.slice(patternParts.length).map(decodeURIComponent).join("/");
	return {
		pattern,
		params
	};
}
//#endregion
//#region src/lib/router/redirect.ts
function resolveRedirect(entry, params, currentPath) {
	if (typeof entry === "string") return {
		target: entry,
		method: "replace"
	};
	return {
		target: typeof entry.redirect === "function" ? entry.redirect(params, currentPath) : entry.redirect,
		method: entry.method ?? "replace",
		status: entry.status
	};
}
//#endregion
//#region src/lib/router/resolve.ts
function isRouteGroupConfig(entry) {
	return typeof entry === "object" && entry !== null && "children" in entry;
}
function isRedirectConfig(entry) {
	return typeof entry === "object" && entry !== null && "redirect" in entry;
}
function isLazyComponent(entry) {
	return typeof entry === "function" && !entry.prototype;
}
/** Match a pattern as a prefix of the path. Returns the matched params and the remaining path. */
function matchPrefix(pattern, path) {
	if (pattern === "/") return {
		params: {},
		rest: path
	};
	const patternParts = pattern.split("/").filter(Boolean);
	const pathParts = path.split("/").filter(Boolean);
	if (pathParts.length < patternParts.length) return null;
	const params = {};
	for (let i = 0; i < patternParts.length; i++) {
		const pp = patternParts[i];
		const pathPart = pathParts[i];
		if (pp.startsWith(":")) params[pp.slice(1)] = decodeURIComponent(pathPart);
		else if (pp !== pathPart) return null;
	}
	return {
		params,
		rest: "/" + pathParts.slice(patternParts.length).join("/")
	};
}
function createEmptyResult() {
	return {
		component: null,
		guardComponent: null,
		layouts: [],
		guards: [],
		pattern: "",
		params: {},
		matches: [],
		queryModes: /* @__PURE__ */ new Map()
	};
}
function resolveRoute(routes, path, search) {
	const result = createEmptyResult();
	return resolveRecursive(routes, path, search || "", result);
}
function resolveRecursive(routes, path, search, result) {
	const keys = Object.keys(routes);
	const regularKeys = keys.filter((k) => k !== "*");
	const hasWildcard = keys.includes("*");
	for (const key of regularKeys) {
		const entry = routes[key];
		const resolved = tryResolveEntry(key, entry, path, search, result);
		if (resolved) return resolved;
	}
	if (hasWildcard) {
		const entry = routes["*"];
		const resolved = tryResolveEntry("*", entry, path, search, result);
		if (resolved) return resolved;
	}
	return result;
}
function tryResolveEntry(pattern, entry, path, search, result) {
	if (typeof entry === "string") {
		const match = matchRoute(pattern, path);
		if (!match) return null;
		const redirectResult = resolveRedirect(entry, match.params, path);
		return {
			...result,
			pattern,
			params: {
				...result.params,
				...match.params
			},
			matches: [...result.matches, pattern],
			redirect: redirectResult.target,
			redirectMethod: redirectResult.method
		};
	}
	if (isRedirectConfig(entry)) {
		const match = matchRoute(pattern, path);
		if (!match) return null;
		const redirectResult = resolveRedirect(entry, match.params, path);
		return {
			...result,
			pattern,
			params: {
				...result.params,
				...match.params
			},
			matches: [...result.matches, pattern],
			redirect: redirectResult.target,
			redirectMethod: redirectResult.method,
			redirectStatus: redirectResult.status
		};
	}
	if (isRouteGroupConfig(entry)) {
		const prefixMatch = matchPrefix(pattern, path);
		if (!prefixMatch) return null;
		const nextResult = {
			...result,
			params: {
				...result.params,
				...prefixMatch.params
			},
			matches: [...result.matches, pattern],
			layouts: [...result.layouts],
			guards: [...result.guards],
			queryModes: new Map(result.queryModes)
		};
		if (entry.layout) nextResult.layouts.push(entry.layout);
		if (entry.guard) nextResult.guards.push(entry.guard);
		if (entry.mode && entry.mode.type === "query") {
			const childKeys = Object.keys(entry.children);
			let activeKey = new URLSearchParams(search).get(entry.mode.param) || childKeys[0];
			if (!childKeys.includes(activeKey)) activeKey = childKeys[0];
			if (entry.layout) nextResult.queryModes.set(nextResult.layouts.length - 1, {
				activeKey,
				keys: childKeys,
				param: entry.mode.param
			});
			const childEntry = entry.children[activeKey];
			if (childEntry !== void 0) return resolveRecursive({ [prefixMatch.rest]: childEntry }, prefixMatch.rest, search, nextResult);
			return nextResult;
		}
		const childResult = resolveRecursive(entry.children, prefixMatch.rest, search, nextResult);
		if (!childResult.component && !childResult.redirect && !childResult.isLazy) {
			result.guards = nextResult.guards;
			result.layouts = nextResult.layouts;
			return null;
		}
		return childResult;
	}
	const match = matchRoute(pattern, path);
	if (!match) return null;
	const mergedParams = {
		...result.params,
		...match.params
	};
	const mergedMatches = [...result.matches, pattern];
	if (isLazyComponent(entry)) return {
		...result,
		component: null,
		pattern,
		params: mergedParams,
		matches: mergedMatches,
		isLazy: true,
		lazyLoader: entry
	};
	return {
		...result,
		component: entry,
		pattern,
		params: mergedParams,
		matches: mergedMatches
	};
}
//#endregion
//#region src/lib/router/guard.ts
function runGuards(guards) {
	for (const guard of guards) {
		const result = guard();
		if (result !== true) return result;
	}
	return true;
}
//#endregion
//#region src/lib/router/lazy.ts
async function resolveLazy(loader, retries = 3, delay = 1e3) {
	let lastError;
	for (let attempt = 0; attempt <= retries; attempt++) try {
		const mod = await loader();
		return mod && typeof mod === "object" && "default" in mod ? mod.default : mod;
	} catch (err) {
		lastError = err;
		if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, delay * 2 ** attempt));
	}
	throw lastError;
}
//#endregion
//#region src/lib/router/query.ts
/**
* Parse a URL search string into a key-value record.
*
* - Accepts strings with or without a leading `?`
* - Single values stay as strings; repeated keys become arrays
* - Missing values (`?key` or `?key=`) produce empty strings
* - Values are URI-decoded
*/
function parseQuery(search) {
	const result = {};
	const raw = search.startsWith("?") ? search.slice(1) : search;
	if (!raw) return result;
	const pairs = raw.split("&");
	for (const pair of pairs) {
		if (!pair) continue;
		const eqIndex = pair.indexOf("=");
		const key = eqIndex === -1 ? decodeURIComponent(pair) : decodeURIComponent(pair.slice(0, eqIndex));
		const value = eqIndex === -1 ? "" : decodeURIComponent(pair.slice(eqIndex + 1));
		const existing = result[key];
		if (existing === void 0) result[key] = value;
		else if (Array.isArray(existing)) existing.push(value);
		else result[key] = [existing, value];
	}
	return result;
}
//#endregion
//#region src/lib/router/link.ts
function escapeAttr(value) {
	return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
var Link = class Link extends Component {
	constructor(..._args) {
		super(..._args);
		this._clickHandler = null;
		this._observerRemover = null;
	}
	static {
		this._router = null;
	}
	template(props) {
		const cls = props.class ? ` class="${escapeAttr(props.class)}"` : "";
		const target = props.target ? ` target="${escapeAttr(props.target)}"` : "";
		const rel = props.rel ? ` rel="${escapeAttr(props.rel)}"` : "";
		const content = props.children ?? props.label ?? "";
		return `<a id="${this.id}" href="${escapeAttr(props.to)}"${cls}${target}${rel}>${content}</a>`;
	}
	onAfterRender() {
		const el = this.el;
		if (!el) return;
		this._clickHandler = (e) => {
			const to = this.props.to;
			if (!to) return;
			if (to.startsWith("http://") || to.startsWith("https://")) return;
			if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
			e.preventDefault();
			this.props.onNavigate?.(e);
			const router = Link._router;
			if (router) this.props.replace ? router.replace(to) : router.push(to);
		};
		el.addEventListener("click", this._clickHandler);
		const router = Link._router;
		if (router) {
			this._updateActive(router);
			this._observerRemover = router.observe("path", () => this._updateActive(router));
		}
	}
	_updateActive(router) {
		const el = this.el;
		if (!el) return;
		const to = this.props.to;
		const active = this.props.exact ? router.isExact(to) : router.isActive(to);
		if (active) el.setAttribute("data-active", "");
		else el.removeAttribute("data-active");
		const base = (el.getAttribute("class") ?? "").replace(/\bactive\b/g, "").replace(/\s+/g, " ").trim();
		const nextClass = active ? base ? `${base} active` : "active" : base;
		if (nextClass) el.setAttribute("class", nextClass);
		else el.removeAttribute("class");
	}
	dispose() {
		if (this._clickHandler && this.el) {
			this.el.removeEventListener("click", this._clickHandler);
			this._clickHandler = null;
		}
		if (this._observerRemover) {
			this._observerRemover();
			this._observerRemover = null;
		}
		super.dispose();
	}
};
//#endregion
//#region src/lib/router/outlet.ts
function engineThis$1(c) {
	return c[GEA_PROXY_GET_RAW_TARGET] ?? c;
}
var Outlet = class Outlet extends Component {
	constructor(..._args) {
		super(..._args);
		this._routerDepth = -1;
		this._router = null;
		this._currentChild = null;
		this._currentComponentClass = null;
		this._lastCacheKey = null;
		this._observerRemovers = [];
	}
	static {
		this._router = null;
	}
	template() {
		return `<div id="${this.id}"></div>`;
	}
	_computeDepthAndRouter() {
		let depth = 0;
		let router = null;
		let parent = engineThis$1(this)[GEA_PARENT_COMPONENT];
		while (parent) {
			if (parent[GEA_IS_ROUTER_OUTLET]) {
				depth = parent._routerDepth + 1;
				router = parent._router ?? parent.props?.router ?? null;
				break;
			}
			parent = engineThis$1(parent)[GEA_PARENT_COMPONENT];
		}
		if (!router) router = Outlet._router;
		return {
			depth,
			router
		};
	}
	onAfterRender() {
		const { depth, router } = this._computeDepthAndRouter();
		this._routerDepth = depth;
		if (router && router !== this._router) {
			for (const remove of this._observerRemovers) remove();
			this._observerRemovers = [];
			this._router = router;
		}
		if (this._observerRemovers.length === 0 && this._router) {
			const r = this._router;
			const removePath = r.observe("path", () => this._updateView());
			const removeError = r.observe("error", () => this._updateView());
			const removeQuery = r.observe("query", () => this._updateView());
			this._observerRemovers.push(removePath, removeError, removeQuery);
		}
		this._updateView();
	}
	_getRouter() {
		return this._router ?? this.props?.router ?? Outlet._router;
	}
	_clearCurrent() {
		if (this._currentChild) {
			this._currentChild.dispose();
			this._currentChild = null;
			this[GEA_CHILD_COMPONENTS] = [];
		}
		this._currentComponentClass = null;
		this._lastCacheKey = null;
	}
	_isClassComponent(comp) {
		if (!comp || typeof comp !== "function") return false;
		let proto = comp.prototype;
		while (proto) {
			if (proto === Component.prototype) return true;
			proto = Object.getPrototypeOf(proto);
		}
		return false;
	}
	_updateView() {
		if (!this.el) return;
		const router = this._getRouter();
		if (!router) return;
		if (this._currentChild && (!engineThis$1(this._currentChild)[GEA_ELEMENT] || !this.el.contains(engineThis$1(this._currentChild)[GEA_ELEMENT]))) this._clearCurrent();
		const depth = this._routerDepth;
		const item = router.getComponentAtDepth(depth);
		if (!item) {
			this._clearCurrent();
			return;
		}
		const isLeaf = depth >= router.layoutCount;
		const isSameComponent = this._currentComponentClass === item.component;
		if (isSameComponent && !isLeaf) {
			if (item.cacheKey === null || item.cacheKey === this._lastCacheKey) return;
		}
		if (isSameComponent && isLeaf) {
			this._lastCacheKey = item.cacheKey;
			this._lastPath = router.path;
			return;
		}
		this._clearCurrent();
		if (this._isClassComponent(item.component)) {
			const child = new item.component(item.props);
			engineThis$1(child)[GEA_PARENT_COMPONENT] = this;
			child.render(this.el);
			if (engineThis$1(child)[GEA_ELEMENT]) engineThis$1(child)[GEA_ELEMENT][GEA_DOM_COMPILED_CHILD_ROOT] = true;
			this._currentChild = child;
			this._currentComponentClass = item.component;
			this[GEA_CHILD_COMPONENTS] = [child];
		}
		this._lastCacheKey = item.cacheKey;
		this._lastPath = router.path;
	}
	dispose() {
		for (const remove of this._observerRemovers) remove();
		this._observerRemovers = [];
		this._clearCurrent();
		super.dispose();
	}
};
Object.defineProperty(Outlet.prototype, GEA_IS_ROUTER_OUTLET, {
	value: true,
	enumerable: false,
	configurable: true
});
//#endregion
//#region src/lib/router/router.ts
function stripQueryHash(path) {
	const q = path.indexOf("?");
	if (q !== -1) path = path.slice(0, q);
	const h = path.indexOf("#");
	if (h !== -1) path = path.slice(0, h);
	return path;
}
function buildUrl(target) {
	if (typeof target === "string") {
		let path = target;
		let search = "";
		let hash = "";
		const hashIdx = path.indexOf("#");
		if (hashIdx !== -1) {
			hash = path.slice(hashIdx);
			path = path.slice(0, hashIdx);
		}
		const qIdx = path.indexOf("?");
		if (qIdx !== -1) {
			search = path.slice(qIdx);
			path = path.slice(0, qIdx);
		}
		return {
			path,
			search,
			hash
		};
	}
	let search = "";
	if (target.query) {
		const parts = [];
		for (const [key, val] of Object.entries(target.query)) if (Array.isArray(val)) for (const v of val) parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
		else parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(val)}`);
		if (parts.length > 0) search = "?" + parts.join("&");
	}
	const hash = target.hash ? target.hash.startsWith("#") ? target.hash : "#" + target.hash : "";
	return {
		path: target.path,
		search,
		hash
	};
}
var Router = class extends Store {
	static {
		this._ssrRouterResolver = null;
	}
	constructor(routes, options) {
		super();
		this.path = "";
		this.route = "";
		this.params = {};
		this.query = {};
		this.hash = "";
		this.matches = [];
		this.error = null;
		this._currentComponent = null;
		this._guardComponent = null;
		this._guardProceed = null;
		this._popstateHandler = null;
		this._clickHandler = null;
		this._scrollPositions = /* @__PURE__ */ new Map();
		this._historyIndex = 0;
		this._queryModes = /* @__PURE__ */ new Map();
		this._layouts = [];
		this.routeConfig = routes ?? {};
		this._routes = routes ?? {};
		this._options = {
			base: options?.base ?? "",
			scroll: options?.scroll ?? false
		};
		Link._router = this;
		Outlet._router = this;
		this._popstateHandler = (_e) => {
			this._resolve();
		};
		window.addEventListener("popstate", this._popstateHandler);
		this._clickHandler = (e) => {
			if (e.defaultPrevented) return;
			const anchor = e.target?.closest?.("a[href]");
			if (!anchor) return;
			const href = anchor.getAttribute("href");
			if (!href) return;
			if (href.startsWith("http://") || href.startsWith("https://") || href.startsWith("//")) return;
			if (anchor.hasAttribute("download") || anchor.getAttribute("target") === "_blank") return;
			if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
			e.preventDefault();
			this.push(href);
		};
		document.addEventListener("click", this._clickHandler);
		this._resolve();
	}
	setRoutes(routes) {
		this._routes = routes;
		this.routeConfig = routes;
		if (typeof window !== "undefined") this._resolve();
	}
	get page() {
		return this._guardComponent ?? this._currentComponent;
	}
	push(target) {
		this._navigate(target, "push");
	}
	navigate(target) {
		this.push(target);
	}
	replace(target) {
		this._navigate(target, "replace");
	}
	back() {
		if (typeof window !== "undefined") window.history.back();
	}
	forward() {
		if (typeof window !== "undefined") window.history.forward();
	}
	go(delta) {
		if (typeof window !== "undefined") window.history.go(delta);
	}
	get layoutCount() {
		return this._layouts.length;
	}
	getComponentAtDepth(depth) {
		if (depth < this._layouts.length) {
			const layout = this._layouts[depth];
			const props = { ...this.params };
			props.route = this.route;
			const nextDepth = depth + 1;
			if (nextDepth < this._layouts.length) props.page = this._layouts[nextDepth];
			else props.page = this._guardComponent ?? this._currentComponent;
			let cacheKey = null;
			const modeInfo = this._queryModes.get(depth);
			if (modeInfo) {
				props.activeKey = modeInfo.activeKey;
				props.keys = modeInfo.keys;
				props.navigate = (key) => {
					const sp = new URLSearchParams(window.location.search);
					sp.set(modeInfo.param, key);
					this.replace({
						path: this.path,
						query: Object.fromEntries(sp)
					});
				};
				cacheKey = modeInfo.activeKey;
			}
			return {
				component: layout,
				props,
				cacheKey
			};
		}
		if (depth === this._layouts.length) {
			const comp = this._guardComponent ?? this._currentComponent;
			return comp ? {
				component: comp,
				props: { ...this.params },
				cacheKey: null
			} : null;
		}
		return null;
	}
	isActive(path) {
		const p = stripQueryHash(path);
		if (p === "/") return this.path === "/";
		return this.path === p || this.path.startsWith(p + "/");
	}
	isExact(path) {
		return this.path === stripQueryHash(path);
	}
	dispose() {
		if (typeof window !== "undefined") {
			if (this._popstateHandler) {
				window.removeEventListener("popstate", this._popstateHandler);
				this._popstateHandler = null;
			}
			if (this._clickHandler) {
				document.removeEventListener("click", this._clickHandler);
				this._clickHandler = null;
			}
		}
	}
	_navigate(target, method) {
		if (typeof window === "undefined") return;
		const { path, search, hash } = buildUrl(target);
		const fullPath = this._options.base + path + search + hash;
		if (this._options.scroll && method === "push") this._scrollPositions.set(this._historyIndex, {
			x: window.scrollX ?? 0,
			y: window.scrollY ?? 0
		});
		if (method === "push") {
			this._historyIndex++;
			window.history.pushState({ index: this._historyIndex }, "", fullPath);
		} else window.history.replaceState({ index: this._historyIndex }, "", fullPath);
		this._resolve();
		if (this._options.scroll && method === "push") window.scrollTo(0, 0);
	}
	_resolve() {
		if (typeof window === "undefined") return;
		const base = this._options.base;
		let currentPath = window.location.pathname;
		const currentSearch = window.location.search;
		const currentHash = window.location.hash;
		if (base && currentPath.startsWith(base)) currentPath = currentPath.slice(base.length) || "/";
		const resolved = resolveRoute(this._routes, currentPath, currentSearch);
		if (resolved.redirect) {
			const redirectMethod = resolved.redirectMethod ?? "replace";
			this._navigate(resolved.redirect, redirectMethod);
			return;
		}
		if (resolved.guards.length > 0) {
			const guardResult = runGuards(resolved.guards);
			if (guardResult !== true) {
				if (typeof guardResult === "string") {
					this._navigate(guardResult, "replace");
					return;
				}
				this._guardComponent = guardResult;
				this._guardProceed = () => {
					this._guardComponent = null;
					this._guardProceed = null;
					this._applyResolved(resolved, currentPath, currentSearch, currentHash);
				};
				this.path = currentPath;
				this.route = resolved.pattern;
				this.params = resolved.params;
				this.query = parseQuery(currentSearch);
				this.hash = currentHash;
				this.matches = resolved.matches;
				return;
			}
		}
		if (resolved.isLazy && resolved.lazyLoader) {
			const loader = resolved.lazyLoader;
			resolveLazy(loader).then((component) => {
				resolved.component = component;
				this._applyResolved(resolved, currentPath, currentSearch, currentHash);
			}).catch((err) => {
				this.error = err?.message ?? "Failed to load route component";
				this._currentComponent = null;
				this._guardComponent = null;
				this.path = currentPath;
				this.route = resolved.pattern;
				this.params = resolved.params;
				this.query = parseQuery(currentSearch);
				this.hash = currentHash;
				this.matches = resolved.matches;
			});
			this.path = currentPath;
			this.route = resolved.pattern;
			this.params = resolved.params;
			this.query = parseQuery(currentSearch);
			this.hash = currentHash;
			this.matches = resolved.matches;
			return;
		}
		this._applyResolved(resolved, currentPath, currentSearch, currentHash);
	}
	_applyResolved(resolved, currentPath, currentSearch, currentHash) {
		this._guardComponent = null;
		this._currentComponent = resolved.component;
		this._layouts = resolved.layouts;
		this._queryModes = resolved.queryModes;
		this.error = null;
		this.path = currentPath;
		this.route = resolved.pattern;
		this.params = resolved.params;
		this.query = parseQuery(currentSearch);
		this.hash = currentHash;
		this.matches = resolved.matches;
	}
};
//#endregion
//#region src/lib/router/router-view.ts
function engineThis(c) {
	return c[GEA_PROXY_GET_RAW_TARGET] ?? c;
}
var RouterView = class extends Component {
	constructor(..._args) {
		super(..._args);
		this._routerDepth = 0;
		this._router = null;
		this._currentChild = null;
		this._currentComponentClass = null;
		this._lastCacheKey = null;
		this._observerRemovers = [];
		this._routesApplied = false;
	}
	template() {
		return `<div id="${this.id}"></div>`;
	}
	_getRouter() {
		return this.props?.router ?? this._router ?? Outlet._router;
	}
	_rebindRouter(router) {
		for (const remove of this._observerRemovers) remove();
		this._observerRemovers = [];
		this._router = router;
		const removePath = router.observe("path", () => this._updateView());
		const removeError = router.observe("error", () => this._updateView());
		const removeQuery = router.observe("query", () => this._updateView());
		this._observerRemovers.push(removePath, removeError, removeQuery);
	}
	onAfterRender() {
		const router = this._getRouter();
		if (!router) return;
		if (this.props?.routes && !this._routesApplied) {
			router.setRoutes(this.props.routes);
			this._routesApplied = true;
		}
		if (router !== this._router) this._rebindRouter(router);
		else if (this._observerRemovers.length === 0) this._rebindRouter(router);
		this._updateView();
	}
	_clearCurrent() {
		if (this._currentChild) {
			this._currentChild.dispose();
			this._currentChild = null;
			this[GEA_CHILD_COMPONENTS] = [];
		}
		this._currentComponentClass = null;
		this._lastCacheKey = null;
	}
	_isClassComponent(comp) {
		if (!comp || typeof comp !== "function") return false;
		let proto = comp.prototype;
		while (proto) {
			if (proto === Component.prototype) return true;
			proto = Object.getPrototypeOf(proto);
		}
		return false;
	}
	_updateView() {
		if (!this.el) return;
		const router = this._getRouter();
		if (!router) return;
		if (this._currentChild && (!engineThis(this._currentChild)[GEA_ELEMENT] || !this.el.contains(engineThis(this._currentChild)[GEA_ELEMENT]))) this._clearCurrent();
		const item = router.getComponentAtDepth(0);
		if (!item) {
			this._clearCurrent();
			return;
		}
		const isLeaf = 0 >= router.layoutCount;
		const isSameComponent = this._currentComponentClass === item.component;
		if (isSameComponent && !isLeaf) {
			if (item.cacheKey === null || item.cacheKey === this._lastCacheKey) return;
		}
		if (isSameComponent && isLeaf && router.path === this._lastPath) return;
		this._clearCurrent();
		while (this.el.firstChild) this.el.removeChild(this.el.firstChild);
		if (this._isClassComponent(item.component)) {
			const child = new item.component(item.props);
			engineThis(child)[GEA_PARENT_COMPONENT] = this;
			child.render(this.el);
			this._currentChild = child;
			this._currentComponentClass = item.component;
			this[GEA_CHILD_COMPONENTS] = [child];
		}
		this._lastCacheKey = item.cacheKey;
		this._lastPath = router.path;
	}
	dispose() {
		for (const remove of this._observerRemovers) remove();
		this._observerRemovers = [];
		this._clearCurrent();
		this._router = null;
		super.dispose();
	}
};
Object.defineProperty(RouterView.prototype, GEA_IS_ROUTER_OUTLET, {
	value: true,
	enumerable: false,
	configurable: true
});
//#endregion
//#region src/lib/router/index.ts
function createRouter(routes, options) {
	return new Router(routes, options);
}
let _router = null;
/** Lazily-created singleton router — only instantiated on first access so
*  projects that don't use the router pay zero cost. */
const router = new Proxy({}, {
	get(_target, prop, receiver) {
		const ssrRouter = Router._ssrRouterResolver?.();
		if (ssrRouter) return Reflect.get(ssrRouter, prop, receiver);
		if (!_router) _router = new Router();
		return Reflect.get(_router, prop, receiver);
	},
	set(_target, prop, value) {
		const ssrRouter = Router._ssrRouterResolver?.();
		if (ssrRouter) return Reflect.set(ssrRouter, prop, value);
		if (!_router) _router = new Router();
		return Reflect.set(_router, prop, value);
	}
});
//#endregion
//#region src/index.ts
const gea = {
	Store,
	Component,
	applyListChanges,
	h
};
//#endregion
export { Component, ComponentManager, GEA_APPLY_LIST_CHANGES, GEA_ATTACH_BINDINGS, GEA_ATTR_BINDINGS, GEA_BINDINGS, GEA_CHILD, GEA_CHILD_COMPONENTS, GEA_CLEANUP_BINDINGS, GEA_CLONE_ITEM, GEA_CLONE_TEMPLATE, GEA_COERCE_STATIC_PROP_VALUE, GEA_COMPILED_CHILD, GEA_COMPONENT_CLASSES, GEA_CONDS, GEA_CREATE_PROPS_PROXY, GEA_CTOR_AUTO_REGISTERED, GEA_CTOR_TAG_NAME, GEA_CURRENT_COMP_CLASS, GEA_DEPENDENCIES, GEA_DOM_COMPILED_CHILD_ROOT, GEA_DOM_COMPONENT, GEA_DOM_EVENT_HINT, GEA_DOM_ITEM, GEA_DOM_KEY, GEA_DOM_PARENT_CHAIN, GEA_DOM_PROPS, GEA_EL, GEA_ELEMENT, GEA_EL_CACHE, GEA_ENSURE_ARRAY_CONFIGS, GEA_EVENT_BINDINGS, GEA_EXTRACT_COMPONENT_PROPS, GEA_HANDLE_ITEM_HANDLER, GEA_ID, GEA_INSTANTIATE_CHILD_COMPONENTS, GEA_IS_ROUTER_OUTLET, GEA_ITEM_KEY, GEA_LAYOUTS, GEA_LIST_CONFIGS, GEA_LIST_CONFIG_REFRESHING, GEA_MAPS, GEA_MAP_CONFIG_COUNT, GEA_MAP_CONFIG_PREV, GEA_MAP_CONFIG_TPL, GEA_MOUNT_COMPILED_CHILD_COMPONENTS, GEA_NORMALIZE_PROP_NAME, GEA_OBSERVE, GEA_OBSERVER_REMOVERS, GEA_OBSERVE_LIST, GEA_ON_PROP_CHANGE, GEA_PARENT_COMPONENT, GEA_PATCH_COND, GEA_PATCH_NODE, GEA_PROP_BINDINGS, GEA_PROP_BINDING_ATTR_PREFIX, GEA_PROXY_GET_PATH, GEA_PROXY_GET_RAW_TARGET, GEA_PROXY_GET_TARGET, GEA_PROXY_IS_PROXY, GEA_PROXY_RAW, GEA_RAW_PROPS, GEA_REACTIVE_PROPS, GEA_RECONCILE_LIST, GEA_REFRESH_LIST, GEA_REGISTER_COND, GEA_REGISTER_MAP, GEA_RENDERED, GEA_REORDER_CHILDREN, GEA_REQUEST_RENDER, GEA_RESET_CHILD_TREE, GEA_RESET_ELS, GEA_ROUTER, GEA_ROUTER_DEPTH, GEA_ROUTES_APPLIED, GEA_SELF_LISTENERS, GEA_SELF_PROXY, GEA_SETUP_EVENT_DIRECTIVES, GEA_SETUP_LOCAL_STATE_OBSERVERS, GEA_SETUP_REFS, GEA_SKIP_ITEM_HANDLER, GEA_STATIC_ESCAPE_HTML, GEA_STATIC_SANITIZE_ATTR, GEA_STORE_ADD_DESCENDANTS_FOR_OBJECT_REPLACEMENT, GEA_STORE_ADD_OBSERVER, GEA_STORE_CLEAR_ARRAY_INDEX_CACHE, GEA_STORE_COLLECT_DESCENDANT_OBSERVER_NODES, GEA_STORE_COLLECT_MATCHING_OBSERVER_NODES, GEA_STORE_COLLECT_MATCHING_OBSERVER_NODES_FROM_NODE, GEA_STORE_CREATE_PROXY, GEA_STORE_DELIVER_ARRAY_ITEM_PROP_BATCH, GEA_STORE_DELIVER_KNOWN_ARRAY_ITEM_PROP_BATCH, GEA_STORE_DELIVER_TOP_LEVEL_BATCH, GEA_STORE_EMIT_CHANGES, GEA_STORE_FLUSH_CHANGES, GEA_STORE_GET_BROWSER_ROOT_PROXY_HANDLER_FOR_TESTS, GEA_STORE_GET_CACHED_ARRAY_META, GEA_STORE_GET_DIRECT_TOP_LEVEL_OBSERVED_VALUE, GEA_STORE_GET_OBSERVER_NODE, GEA_STORE_GET_TOP_LEVEL_OBSERVED_VALUE, GEA_STORE_INTERCEPT_ARRAY_ITERATOR, GEA_STORE_INTERCEPT_ARRAY_METHOD, GEA_STORE_NORMALIZE_BATCH, GEA_STORE_NOTIFY_HANDLERS, GEA_STORE_NOTIFY_HANDLERS_WITH_VALUE, GEA_STORE_QUEUE_CHANGE, GEA_STORE_QUEUE_DIRECT_ARRAY_ITEM_PRIMITIVE_CHANGE, GEA_STORE_ROOT, GEA_STORE_SCHEDULE_FLUSH, GEA_STORE_TRACK_PENDING_CHANGE, GEA_SWAP_CHILD, GEA_SWAP_STATE_CHILDREN, GEA_SYNC_AUTOFOCUS, GEA_SYNC_DOM_REFS, GEA_SYNC_ITEMS, GEA_SYNC_MAP, GEA_SYNC_UNRENDERED_LIST_ITEMS, GEA_SYNC_VALUE_PROPS, GEA_TEARDOWN_SELF_LISTENERS, GEA_UPDATE_PROPS, GEA_UPDATE_TEXT, Link, Outlet, Router, RouterView, Store, applyListChanges, clearUidProvider, createRouter, gea as default, findPropertyDescriptor, geaCondPatchedSymbol, geaCondValueSymbol, __escapeHtml as geaEscapeHtml, geaListItemsSymbol, geaObservePrevSymbol, geaPrevGuardSymbol, __sanitizeAttr as geaSanitizeAttr, h, isClassConstructorValue, matchRoute, resetUidCounter, rootDeleteProperty, rootGetValue, rootSetValue, router, setUidProvider, stashComponentForTransfer };

//# sourceMappingURL=index.mjs.map