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
*
*/
const GEA_SELF_PROXY = /* @__PURE__ */ Symbol.for("gea.selfProxy");
/** Store engine — `GEA_STORE_ROOT` replaces the `__store` getter. */
const GEA_STORE_ROOT = /* @__PURE__ */ Symbol.for("gea.store.rootProxy");
/** Test/profiler hook: returns the browser root `ProxyHandler` (same object the store constructor uses). */
const GEA_STORE_GET_BROWSER_ROOT_PROXY_HANDLER_FOR_TESTS = /* @__PURE__ */ Symbol.for("gea.store.getBrowserRootProxyHandlerForTests");
/** Store proxy introspection (root + nested). */
const GEA_PROXY_IS_PROXY = /* @__PURE__ */ Symbol.for("gea.proxy.isProxy");
const GEA_PROXY_RAW = /* @__PURE__ */ Symbol.for("gea.proxy.raw");
const GEA_PROXY_GET_RAW_TARGET = /* @__PURE__ */ Symbol.for("gea.proxy.getRawTarget");
const GEA_PROXY_GET_TARGET = /* @__PURE__ */ Symbol.for("gea.proxy.getTarget");
const GEA_PROXY_GET_PATH = /* @__PURE__ */ Symbol.for("gea.proxy.getPath");
/** Router: Outlet / RouterView marker (avoid string keys on component instances). */
const GEA_IS_ROUTER_OUTLET = /* @__PURE__ */ Symbol.for("gea.router.isOutlet");
/** Router internals shared between RouterView and Outlet (cross-instance). */
const GEA_ROUTER_DEPTH = /* @__PURE__ */ Symbol.for("gea.router.depth");
const GEA_ROUTER_REF = /* @__PURE__ */ Symbol.for("gea.router.ref");
/**
* Serialized `data-prop-*` attribute values that reference `GEA_PROP_BINDINGS` map keys.
* DOM cannot store symbols; this prefix marks engine-owned binding tokens (not user strings).
*/
const GEA_PROP_BINDING_ATTR_PREFIX = "gea:p:";
/** Cached parent component id chain on DOM nodes (delegated events / bubbling). */
const GEA_DOM_PARENT_CHAIN = /* @__PURE__ */ Symbol.for("gea.dom.parentChain");
const GEA_ID = /* @__PURE__ */ Symbol.for("gea.id");
const GEA_ELEMENT = /* @__PURE__ */ Symbol.for("gea.element");
/** Parent component link for compiled children / router / DnD (engine-only). */
const GEA_PARENT_COMPONENT = /* @__PURE__ */ Symbol.for("gea.component.parentComponent");
const GEA_RENDERED = /* @__PURE__ */ Symbol.for("gea.rendered");
const GEA_RAW_PROPS = /* @__PURE__ */ Symbol.for("gea.rawProps");
const GEA_BINDINGS = /* @__PURE__ */ Symbol.for("gea.bindings");
const GEA_SELF_LISTENERS = /* @__PURE__ */ Symbol.for("gea.selfListeners");
const GEA_CHILD_COMPONENTS = /* @__PURE__ */ Symbol.for("gea.childComponents");
const GEA_DEPENDENCIES = /* @__PURE__ */ Symbol.for("gea.dependencies");
const GEA_EVENT_BINDINGS = /* @__PURE__ */ Symbol.for("gea.eventBindings");
const GEA_PROP_BINDINGS = /* @__PURE__ */ Symbol.for("gea.propBindings");
const GEA_ATTR_BINDINGS = /* @__PURE__ */ Symbol.for("gea.attrBindings");
const GEA_OBSERVER_REMOVERS = /* @__PURE__ */ Symbol.for("gea.observerRemovers");
const GEA_COMPILED_CHILD = /* @__PURE__ */ Symbol.for("gea.compiledChild");
const GEA_ITEM_KEY = /* @__PURE__ */ Symbol.for("gea.itemKey");
const GEA_MAPS = /* @__PURE__ */ Symbol.for("gea.maps");
const GEA_CONDS = /* @__PURE__ */ Symbol.for("gea.conds");
const GEA_RESET_ELS = /* @__PURE__ */ Symbol.for("gea.resetEls");
const GEA_LIST_CONFIGS = /* @__PURE__ */ Symbol.for("gea.listConfigs");
/**
* Stable symbol key for a component-array backing store (same reference for a given
* `arrayPropName` in every module/realm via the global symbol registry).
*/
function geaListItemsSymbol(arrayPropName) {
	return /* @__PURE__ */ Symbol.for(`gea.listItems.${arrayPropName}`);
}
/** Per-slot flag for conditional patch microtask reset (compiler-generated). */
function geaCondPatchedSymbol(idx) {
	return /* @__PURE__ */ Symbol.for(`gea.condPatched.${idx}`);
}
/** Cached boolean result of `getCond()` for conditional slots (compiler + runtime). */
function geaCondValueSymbol(idx) {
	return /* @__PURE__ */ Symbol.for(`gea.condValue.${idx}`);
}
/** Compiler: truthiness-only guard for early-return observer methods. */
function geaPrevGuardSymbol(methodName) {
	return /* @__PURE__ */ Symbol.for(`gea.prevGuard.${methodName}`);
}
/** Component engine methods — `this[GEA_*]()` only; never user string keys. */
const GEA_APPLY_LIST_CHANGES = /* @__PURE__ */ Symbol.for("gea.component.applyListChanges");
const GEA_CREATE_PROPS_PROXY = /* @__PURE__ */ Symbol.for("gea.component.createPropsProxy");
const GEA_REACTIVE_PROPS = /* @__PURE__ */ Symbol.for("gea.component.reactiveProps");
const GEA_UPDATE_PROPS = /* @__PURE__ */ Symbol.for("gea.component.updateProps");
const GEA_REQUEST_RENDER = /* @__PURE__ */ Symbol.for("gea.component.requestRender");
const GEA_RESET_CHILD_TREE = /* @__PURE__ */ Symbol.for("gea.component.resetChildTree");
const GEA_CHILD = /* @__PURE__ */ Symbol.for("gea.component.child");
const GEA_EL_CACHE = /* @__PURE__ */ Symbol.for("gea.component.elCache");
const GEA_EL = /* @__PURE__ */ Symbol.for("gea.component.el");
const GEA_UPDATE_TEXT = /* @__PURE__ */ Symbol.for("gea.component.updateText");
const GEA_OBSERVE = /* @__PURE__ */ Symbol.for("gea.component.observe");
const GEA_REORDER_CHILDREN = /* @__PURE__ */ Symbol.for("gea.component.reorderChildren");
const GEA_RECONCILE_LIST = /* @__PURE__ */ Symbol.for("gea.component.reconcileList");
const GEA_OBSERVE_LIST = /* @__PURE__ */ Symbol.for("gea.component.observeList");
const GEA_REFRESH_LIST = /* @__PURE__ */ Symbol.for("gea.component.refreshList");
const GEA_SWAP_CHILD = /* @__PURE__ */ Symbol.for("gea.component.swapChild");
const GEA_REGISTER_MAP = /* @__PURE__ */ Symbol.for("gea.component.registerMap");
const GEA_SYNC_MAP = /* @__PURE__ */ Symbol.for("gea.component.syncMap");
const GEA_SYNC_ITEMS = /* @__PURE__ */ Symbol.for("gea.component.syncItems");
const GEA_CLONE_ITEM = /* @__PURE__ */ Symbol.for("gea.component.cloneItem");
const GEA_REGISTER_COND = /* @__PURE__ */ Symbol.for("gea.component.registerCond");
const GEA_PATCH_COND = /* @__PURE__ */ Symbol.for("gea.component.patchCond");
const GEA_SYNC_DOM_REFS = /* @__PURE__ */ Symbol.for("gea.component.syncDomRefs");
const GEA_ENSURE_ARRAY_CONFIGS = /* @__PURE__ */ Symbol.for("gea.component.ensureArrayConfigs");
const GEA_SWAP_STATE_CHILDREN = /* @__PURE__ */ Symbol.for("gea.component.swapStateChildren");
const GEA_COMPONENT_CLASSES = /* @__PURE__ */ Symbol.for("gea.component.componentClasses");
const GEA_STATIC_ESCAPE_HTML = /* @__PURE__ */ Symbol.for("gea.component.staticEscapeHtml");
const GEA_STATIC_SANITIZE_ATTR = /* @__PURE__ */ Symbol.for("gea.component.staticSanitizeAttr");
const GEA_SYNC_VALUE_PROPS = /* @__PURE__ */ Symbol.for("gea.component.syncValueProps");
const GEA_SYNC_AUTOFOCUS = /* @__PURE__ */ Symbol.for("gea.component.syncAutofocus");
const GEA_PATCH_NODE = /* @__PURE__ */ Symbol.for("gea.component.patchNode");
const GEA_SETUP_LOCAL_STATE_OBSERVERS = /* @__PURE__ */ Symbol.for("gea.component.setupLocalStateObservers");
/** Compiler: `template()` clone for SSR/hydration; optional on subclasses. */
const GEA_CLONE_TEMPLATE = /* @__PURE__ */ Symbol.for("gea.component.cloneTemplate");
/** Compiler: refresh `ref={}` targets after DOM updates. */
const GEA_SETUP_REFS = /* @__PURE__ */ Symbol.for("gea.component.setupRefs");
/** Compiler: incremental prop-driven DOM patches after `props` updates. */
const GEA_ON_PROP_CHANGE = /* @__PURE__ */ Symbol.for("gea.component.onPropChange");
/** Re-render helper: sync list rows not yet mounted (getter-backed lists). */
const GEA_SYNC_UNRENDERED_LIST_ITEMS = /* @__PURE__ */ Symbol.for("gea.component.syncUnrenderedListItems");
/** Internal lifecycle / DOM helpers — override via `this[GEA_*]()`. */
const GEA_ATTACH_BINDINGS = /* @__PURE__ */ Symbol.for("gea.component.attachBindings");
const GEA_CLEANUP_BINDINGS = /* @__PURE__ */ Symbol.for("gea.component.cleanupBindings");
const GEA_MOUNT_COMPILED_CHILD_COMPONENTS = /* @__PURE__ */ Symbol.for("gea.component.mountCompiledChildComponents");
const GEA_INSTANTIATE_CHILD_COMPONENTS = /* @__PURE__ */ Symbol.for("gea.component.instantiateChildComponents");
const GEA_SETUP_EVENT_DIRECTIVES = /* @__PURE__ */ Symbol.for("gea.component.setupEventDirectives");
const GEA_TEARDOWN_SELF_LISTENERS = /* @__PURE__ */ Symbol.for("gea.component.teardownSelfListeners");
const GEA_EXTRACT_COMPONENT_PROPS = /* @__PURE__ */ Symbol.for("gea.component.extractComponentProps");
const GEA_COERCE_STATIC_PROP_VALUE = /* @__PURE__ */ Symbol.for("gea.component.coerceStaticPropValue");
const GEA_NORMALIZE_PROP_NAME = /* @__PURE__ */ Symbol.for("gea.component.normalizePropName");
const GEA_CTOR_AUTO_REGISTERED = /* @__PURE__ */ Symbol.for("gea.ctor.autoRegistered");
const GEA_CTOR_TAG_NAME = /* @__PURE__ */ Symbol.for("gea.ctor.tagName");
/** ComponentManager.callEventsGetterHandler: skip callItemHandler (delegated handler ran on an ancestor). */
const GEA_SKIP_ITEM_HANDLER = /* @__PURE__ */ Symbol.for("gea.componentManager.skipItemHandler");
/** DOM expandos on nodes (engine-only). */
const GEA_DOM_COMPONENT = /* @__PURE__ */ Symbol.for("gea.dom.component");
const GEA_DOM_KEY = /* @__PURE__ */ Symbol.for("gea.dom.key");
const GEA_DOM_ITEM = /* @__PURE__ */ Symbol.for("gea.dom.item");
const GEA_DOM_PROPS = /* @__PURE__ */ Symbol.for("gea.dom.props");
const GEA_DOM_COMPILED_CHILD_ROOT = /* @__PURE__ */ Symbol.for("gea.dom.compiledChildRoot");
/** Cached delegated event token (mirrors `data-ge` without attribute read). */
const GEA_DOM_EVENT_HINT = /* @__PURE__ */ Symbol.for("gea.dom.eventHint");
/** Delegated `.map()` row clicks — `this[GEA_HANDLE_ITEM_HANDLER](itemId, e)`. */
const GEA_HANDLE_ITEM_HANDLER = /* @__PURE__ */ Symbol.for("gea.component.handleItemHandler");
/** Map sync state on internal config objects. */
const GEA_MAP_CONFIG_PREV = /* @__PURE__ */ Symbol.for("gea.mapConfig.prev");
const GEA_MAP_CONFIG_COUNT = /* @__PURE__ */ Symbol.for("gea.mapConfig.count");
const GEA_MAP_CONFIG_TPL = /* @__PURE__ */ Symbol.for("gea.mapConfig.tpl");
/** __observeList config bag */
const GEA_LIST_CONFIG_REFRESHING = /* @__PURE__ */ Symbol.for("gea.listConfig.refreshing");
//#endregion
//#region src/lib/store.ts
const _isArr = Array.isArray;
const _getProto = Object.getPrototypeOf;
const _objProto = Object.prototype;
const _hasOwn = _objProto.hasOwnProperty;
const _isPlain = (v) => {
	const p = _getProto(v);
	return p === _objProto || p === null || _isArr(v);
};
const _mkNode = (pathParts) => ({
	pathParts,
	handlers: /* @__PURE__ */ new Set(),
	children: /* @__PURE__ */ new Map()
});
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
	if (_isArr(path)) return path;
	return path ? path.split(".") : [];
}
function appendPathParts(pathParts, propStr) {
	return [...pathParts, propStr];
}
function joinPath(basePath, seg) {
	return basePath ? `${basePath}.${seg}` : String(seg);
}
function _mkChange(type, property, target, pathParts, newValue, previousValue) {
	return {
		type,
		property,
		target,
		pathParts,
		newValue,
		previousValue
	};
}
function _mkAppend(property, target, pathParts, start, count, newValue) {
	return {
		type: "append",
		property,
		target,
		pathParts,
		start,
		count,
		newValue
	};
}
function _commitObjSet(store, isNew, prop, obj, objPathParts, val, old, unwrapAppend, p, aMeta, leafFn) {
	const c = _isArr(old) && _isArr(val) && val.length > old.length && _isAppend(old, val, unwrapAppend) ? _mkAppend(prop, obj, objPathParts, old.length, val.length - old.length, val.slice(old.length)) : _mkChange(isNew ? "add" : "update", prop, obj, objPathParts, val, old);
	if (aMeta && leafFn) _tagArrayItem(c, aMeta, leafFn(prop));
	_pushAndSchedule(store, c, p);
}
function shouldWrapNestedReactiveValue(value) {
	return value != null && typeof value === "object" && _isPlain(value);
}
const getByPathParts = (obj, pathParts) => pathParts.reduce((o, k) => o?.[k], obj);
function _wrapItem(store, arr, i, basePath, baseParts) {
	const raw = arr[i];
	return shouldWrapNestedReactiveValue(raw) ? _createProxy(store, raw, joinPath(basePath, i), appendPathParts(baseParts, String(i))) : raw;
}
function proxyIterate(store, arr, basePath, baseParts, method, cb, thisArg) {
	const isMap = method === "map";
	const result = isMap ? new Array(arr.length) : method === "filter" ? [] : void 0;
	for (let i = 0; i < arr.length; i++) {
		const p = _wrapItem(store, arr, i, basePath, baseParts);
		const v = cb.call(thisArg, p, i, arr);
		if (isMap) result[i] = v;
		else if (v) {
			if (method === "filter") result.push(p);
			else if (method === "find") return p;
		}
	}
	return result;
}
function isNumericIndex(value) {
	return value.length > 0 && !/\D/.test(value);
}
function samePathParts(a, b) {
	if (a === b) return true;
	if (!a || !b) return false;
	const len = a.length;
	if (len !== b.length) return false;
	for (let i = 0; i < len; i++) if (a[i] !== b[i]) return false;
	return true;
}
function isClassConstructorValue(fn) {
	if (typeof fn !== "function") return false;
	try {
		const d = Object.getOwnPropertyDescriptor(fn, "prototype");
		return !!(d && d.writable === false);
	} catch {
		return true;
	}
}
function isArrayIndexUpdate(change) {
	return change && change.type === "update" && _isArr(change.target) && isNumericIndex(change.property);
}
function isReciprocalSwap(a, b) {
	if (!isArrayIndexUpdate(a) || !isArrayIndexUpdate(b)) return false;
	if (a.target !== b.target || a.property === b.property) return false;
	const ap = a.pathParts, bp = b.pathParts;
	if (ap.length !== bp.length) return false;
	for (let i = 0, end = ap.length - 1; i < end; i++) if (ap[i] !== bp[i]) return false;
	return a.previousValue === b.newValue && b.previousValue === a.newValue;
}
/**
* Walk the prototype chain for `prop` (same as Reflect.get semantics for accessors).
* Used by the root proxy and SSR so `set`/`delete` on accessors do not go through
* reactive `rootSetValue`/`rootDeleteProperty` (no change notifications for framework
* getters/setters; user data fields remain plain data properties).
*/
function findPropertyDescriptor(obj, prop) {
	for (let o = obj; o; o = _getProto(o)) {
		const d = Object.getOwnPropertyDescriptor(o, prop);
		if (d) return d;
	}
}
const _skipRx = /^(props|events|compiledItems|routeConfig)\b/;
function shouldSkipReactiveWrapForPath(basePath) {
	if (_skipRx.test(basePath)) return true;
	const dot = basePath.indexOf(".");
	const head = dot === -1 ? basePath : basePath.slice(0, dot);
	if (head === "_items" || /^_[a-zA-Z][a-zA-Z0-9]*Items$/.test(head)) return true;
	return false;
}
const _pendingStores = /* @__PURE__ */ new Set();
const _emptyArr = [];
let _flushing = false;
let _browserRootProxyHandler;
function _rootPathPartsCache(priv, prop) {
	const m = priv.pathPartsCache;
	let p = m.get(prop);
	if (!p) m.set(prop, p = [prop]);
	return p;
}
/**
* Browser root proxy: **4 traps only** (get/set/deleteProperty/defineProperty).
* No `has`/`ownKeys`/`getOwnPropertyDescriptor` — V8 optimizes this shape better for hot paths.
*
* SSR overlay handler lives in `@geajs/ssr` and is wired via `Store.rootProxyHandlerFactory`.
*/
function _bindVal(v, ctx) {
	return typeof v !== "function" ? v : isClassConstructorValue(v) ? v : v.bind(ctx);
}
function _getBrowserRootProxyHandler() {
	if (!_browserRootProxyHandler) _browserRootProxyHandler = {
		get(t, prop, receiver) {
			if (typeof prop === "symbol") {
				if (prop === GEA_PROXY_IS_PROXY) return true;
				if (prop === GEA_PROXY_RAW || prop === GEA_PROXY_GET_RAW_TARGET) return t;
				return Reflect.get(t, prop, receiver);
			}
			if (typeof prop === "string") {
				const bridged = tryComponentRootBridgeGet(t, prop);
				if (bridged?.ok) return _bindVal(bridged.value, receiver);
			}
			return _bindVal(Store.rootGetValue(t, prop, receiver), receiver);
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
		}
	};
	return _browserRootProxyHandler;
}
function _addObserver(store, pathParts, handler) {
	const p = getPriv(store);
	const nodes = [p.observerRoot];
	let node = p.observerRoot;
	for (let i = 0; i < pathParts.length; i++) {
		const part = pathParts[i];
		let child = node.children.get(part);
		if (!child) {
			child = _mkNode(appendPathParts(node.pathParts, part));
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
function _collectMatchingNodes(root, pathParts) {
	const matches = [];
	let node = root;
	if (node.handlers.size > 0) matches.push(node);
	for (let i = 0; i < pathParts.length; i++) {
		node = node.children.get(pathParts[i]);
		if (!node) break;
		if (node.handlers.size > 0) matches.push(node);
	}
	return matches;
}
function _collectDescendantNodes(node, matches) {
	for (const child of node.children.values()) {
		if (child.handlers.size > 0) matches.push(child);
		if (child.children.size > 0) _collectDescendantNodes(child, matches);
	}
}
/** When a property is replaced with a new object, descendant observers
*  must be notified because their nested values may have changed. */
function _getObserverNode(root, pathParts) {
	let node = root;
	for (let i = 0; i < pathParts.length; i++) {
		node = node.children.get(pathParts[i]);
		if (!node) return null;
	}
	return node;
}
function _notify(raw, node, relevant, value) {
	const v = arguments.length > 3 ? value : getByPathParts(raw, node.pathParts);
	for (const handler of node.handlers) handler(v, relevant);
}
function _topProxy(store, prop, value, p) {
	if (!p) {
		p = getPriv(store);
		const entry = p.topLevelProxies.get(prop);
		if (entry && entry[0] === value) return entry[1];
	}
	const proxy = _createProxy(store, value, prop, [prop], void 0, p);
	p.topLevelProxies.set(prop, [value, proxy]);
	return proxy;
}
function _getTopLevelValue(raw, change) {
	if (change.type === "delete") return void 0;
	const value = raw[change.property];
	if (value == null || typeof value !== "object") return value;
	if (!_isPlain(value)) return value;
	return _topProxy(raw, change.property, value);
}
function _tagArrayItem(c, m, leafParts) {
	c.arrayPathParts = m.arrayPathParts;
	c.arrayIndex = m.arrayIndex;
	c.leafPathParts = leafParts;
	c.isArrayItemPropUpdate = true;
}
function _dropCaches(p, v) {
	p.proxyCache.delete(v);
	p.arrayIndexProxyCache.delete(v);
}
function _dropOld(p, old) {
	if (old && typeof old === "object") _dropCaches(p, old);
}
function _clearArrayIndexCache(p, arr) {
	p.arrayIndexProxyCache.delete(arr);
}
function _normalizeBatch(p, batch) {
	if (batch.length < 2) return batch;
	for (let i = 0; i < batch.length; i++) {
		const change = batch[i];
		if (change.opId || !isArrayIndexUpdate(change)) continue;
		for (let j = i + 1; j < batch.length; j++) {
			const candidate = batch[j];
			if (candidate.opId || !isReciprocalSwap(change, candidate)) continue;
			const opId = `swap:${p.nextArrayOpId++}`;
			change.arrayPathParts = candidate.arrayPathParts = change.pathParts.slice(0, -1);
			change.arrayOp = candidate.arrayOp = "swap";
			change.otherIndex = Number(candidate.property);
			candidate.otherIndex = Number(change.property);
			change.opId = candidate.opId = opId;
			break;
		}
	}
	return batch;
}
function _deliverArrayBatch(raw, p, batch, knownArrayPathParts) {
	let arrayPathParts = knownArrayPathParts;
	if (!arrayPathParts) {
		if (!batch[0]?.isArrayItemPropUpdate) return false;
		arrayPathParts = batch[0].arrayPathParts;
		for (let i = 1; i < batch.length; i++) {
			const change = batch[i];
			if (!change.isArrayItemPropUpdate || change.arrayPathParts !== arrayPathParts && !samePathParts(change.arrayPathParts, arrayPathParts)) return false;
		}
	}
	const root = p.observerRoot;
	const arrayNode = _getObserverNode(root, arrayPathParts);
	if (root.handlers.size === 0 && arrayNode && arrayNode.children.size === 0 && arrayNode.handlers.size > 0) {
		_notify(raw, arrayNode, batch);
		return true;
	}
	const commonMatches = _collectMatchingNodes(root, arrayPathParts);
	for (let i = 0; i < commonMatches.length; i++) _notify(raw, commonMatches[i], batch);
	if (!arrayNode || arrayNode.children.size === 0) return true;
	const deliveries = /* @__PURE__ */ new Map();
	const suffixOffset = arrayPathParts.length;
	for (let i = 0; i < batch.length; i++) {
		const change = batch[i];
		let cur = arrayNode;
		for (let k = suffixOffset; k < change.pathParts.length; k++) {
			cur = cur.children.get(change.pathParts[k]);
			if (!cur) break;
			if (cur.handlers.size > 0) {
				let relevant = deliveries.get(cur);
				if (!relevant) deliveries.set(cur, relevant = []);
				relevant.push(change);
			}
		}
	}
	for (const [node, relevant] of deliveries) _notify(raw, node, relevant);
	return true;
}
function _deliverTopLevelBatch(raw, p, batch) {
	const root = p.observerRoot;
	if (root.handlers.size > 0) return false;
	if (batch.length === 1) {
		const change = batch[0];
		if (change.target !== raw || change.pathParts.length !== 1) return false;
		const node = root.children.get(change.property);
		if (!node || node.handlers.size === 0) return true;
		if (node.children.size > 0) return false;
		const nv = change.newValue;
		_notify(raw, node, batch, _isArr(nv) && nv.length === 0 ? nv : _getTopLevelValue(raw, change));
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
			const nv = change.newValue;
			deliveries.set(node, delivery = {
				value: _isArr(nv) && nv.length === 0 ? nv : _getTopLevelValue(raw, change),
				relevant: []
			});
		}
		delivery.relevant.push(change);
	}
	for (const [node, delivery] of deliveries) _notify(raw, node, delivery.relevant, delivery.value);
	return true;
}
function _flushChanges(raw, p) {
	p.flushScheduled = false;
	_pendingStores.delete(raw);
	const pendingBatch = p.pendingChanges;
	const pendingBatchKind = p.pendingBatchKind;
	const pendingBatchArrayPathParts = p.pendingBatchArrayPathParts;
	p.pendingChangesPool.length = 0;
	p.pendingChanges = p.pendingChangesPool;
	p.pendingChangesPool = pendingBatch;
	p.pendingBatchKind = 0;
	p.pendingBatchArrayPathParts = null;
	if (pendingBatch.length === 0) return;
	if (pendingBatchKind === 1 && pendingBatchArrayPathParts && _deliverArrayBatch(raw, p, pendingBatch, pendingBatchArrayPathParts)) return;
	if (_deliverTopLevelBatch(raw, p, pendingBatch)) return;
	const batch = _normalizeBatch(p, pendingBatch);
	if (_deliverArrayBatch(raw, p, batch)) return;
	const root = p.observerRoot;
	const deliveries = /* @__PURE__ */ new Map();
	for (let i = 0; i < batch.length; i++) {
		const change = batch[i];
		const matches = _collectMatchingNodes(root, change.pathParts);
		if ((change.type === "update" || change.type === "add") && change.newValue && typeof change.newValue === "object") {
			const node = _getObserverNode(root, change.pathParts);
			if (node && node.children.size > 0) _collectDescendantNodes(node, matches);
		}
		for (let j = 0; j < matches.length; j++) {
			const node = matches[j];
			let relevant = deliveries.get(node);
			if (!relevant) deliveries.set(node, relevant = []);
			relevant.push(change);
		}
	}
	for (const [node, relevant] of deliveries) _notify(raw, node, relevant);
}
function _pushAndSchedule(raw, changes, p) {
	if (_isArr(changes)) for (const c of changes) p.pendingChanges.push(c);
	else p.pendingChanges.push(changes);
	if (p.pendingBatchKind !== 2) {
		p.pendingBatchKind = 2;
		p.pendingBatchArrayPathParts = null;
	}
	if (!p.flushScheduled) _scheduleFlush(p, raw);
}
function _isAppend(oldArr, newArr, unwrap) {
	for (let i = 0; i < oldArr.length; i++) {
		let o = oldArr[i], v = newArr[i];
		if (unwrap) {
			if (o) o = unwrapNestedProxyValue(o);
			if (v) v = unwrapNestedProxyValue(v);
		}
		if (o !== v) return false;
	}
	return true;
}
function _queueChange(raw, change, p) {
	p.pendingChanges.push(change);
	if (p.pendingBatchKind !== 2 && !(p.pendingBatchKind === 1 && p.pendingBatchArrayPathParts === change.arrayPathParts)) _trackPendingChange(p, change);
	if (!p.flushScheduled) _scheduleFlush(p, raw);
}
function _trackPendingChange(p, change) {
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
	if (pendingArrayPathParts !== change.arrayPathParts && !samePathParts(pendingArrayPathParts, change.arrayPathParts)) {
		p.pendingBatchKind = 2;
		p.pendingBatchArrayPathParts = null;
	}
}
let _globalFlushScheduled = false;
function _flushAllPending() {
	_globalFlushScheduled = false;
	let firstError;
	while (_pendingStores.size > 0) {
		const batch = [..._pendingStores];
		_pendingStores.clear();
		for (let i = 0; i < batch.length; i++) {
			const raw = batch[i];
			const p = storeInstancePrivate.get(raw);
			if (p.pendingChanges.length > 0) try {
				_flushChanges(raw, p);
			} catch (e) {
				if (!firstError) firstError = e;
			}
			else p.flushScheduled = false;
		}
	}
	if (firstError) throw firstError;
}
function _scheduleFlush(p, raw) {
	p.flushScheduled = true;
	_pendingStores.add(raw);
	if (!_globalFlushScheduled) {
		_globalFlushScheduled = true;
		queueMicrotask(_flushAllPending);
	}
}
function _interceptArray(store, arr, method, basePath, baseParts, p) {
	switch (method) {
		case "splice": return function(...args) {
			_clearArrayIndexCache(p, arr);
			const len = arr.length;
			const rawStart = args[0] ?? 0;
			const start = rawStart < 0 ? Math.max(len + rawStart, 0) : Math.min(rawStart, len);
			const deleteCount = args.length < 2 ? len - start : Math.min(Math.max(args[1] ?? 0, 0), len - start);
			const hasInserts = args.length > 2;
			const items = hasInserts ? args.slice(2).map((v) => unwrapNestedProxyValue(v)) : _emptyArr;
			const removed = arr.slice(start, start + deleteCount);
			if (hasInserts) Array.prototype.splice.call(arr, start, deleteCount, ...items);
			else Array.prototype.splice.call(arr, start, deleteCount);
			if (deleteCount === 0 && items.length > 0 && start === len) {
				_pushAndSchedule(store, [_mkAppend(String(start), arr, baseParts, start, items.length, items)], p);
				return removed;
			}
			const changes = [];
			for (let i = 0; i < removed.length; i++) {
				const idx = String(start + i);
				changes.push(_mkChange("delete", idx, arr, appendPathParts(baseParts, idx), void 0, removed[i]));
			}
			for (let i = 0; i < items.length; i++) {
				const idx = String(start + i);
				changes.push(_mkChange("add", idx, arr, appendPathParts(baseParts, idx), items[i]));
			}
			if (changes.length > 0) _pushAndSchedule(store, changes, p);
			return removed;
		};
		case "push":
		case "unshift": return function(...items) {
			_clearArrayIndexCache(p, arr);
			const rawItems = items.map((v) => unwrapNestedProxyValue(v));
			if (rawItems.length === 0) return arr.length;
			const start = method === "push" ? arr.length : 0;
			Array.prototype[method].apply(arr, rawItems);
			if (method === "push") _pushAndSchedule(store, [_mkAppend(String(start), arr, baseParts, start, rawItems.length, rawItems)], p);
			else {
				const changes = [];
				for (let i = 0; i < rawItems.length; i++) changes.push(_mkChange("add", String(i), arr, appendPathParts(baseParts, String(i)), rawItems[i]));
				_pushAndSchedule(store, changes, p);
			}
			return arr.length;
		};
		case "pop":
		case "shift": return function() {
			if (arr.length === 0) return void 0;
			_clearArrayIndexCache(p, arr);
			const idx = method === "pop" ? arr.length - 1 : 0;
			const removed = arr[idx];
			Array.prototype[method].call(arr);
			_pushAndSchedule(store, [_mkChange("delete", String(idx), arr, appendPathParts(baseParts, String(idx)), void 0, removed)], p);
			return removed;
		};
		case "sort":
		case "reverse": return function(...args) {
			_clearArrayIndexCache(p, arr);
			const prev = arr.slice();
			Array.prototype[method].apply(arr, args);
			const idxMap = /* @__PURE__ */ new Map();
			for (let i = 0; i < prev.length; i++) {
				const a = idxMap.get(prev[i]);
				a ? a.push(i) : idxMap.set(prev[i], [i]);
			}
			const ch = _mkChange("reorder", baseParts[baseParts.length - 1] || "", arr, baseParts, arr);
			ch.permutation = arr.map((v, i) => {
				const a = idxMap.get(v);
				return a?.length ? a.shift() : i;
			});
			_pushAndSchedule(store, [ch], p);
			return arr;
		};
		case "indexOf":
		case "includes": return function(searchElement, fromIndex) {
			return Array.prototype[method].call(arr, unwrapNestedProxyValue(searchElement), fromIndex);
		};
		case "findIndex":
		case "some":
		case "every": return Array.prototype[method].bind(arr);
		case "forEach":
		case "map":
		case "filter":
		case "find": return (cb, thisArg) => proxyIterate(store, arr, basePath, baseParts, method, cb, thisArg);
		case "reduce": return function(cb, init) {
			let acc = arguments.length >= 2 ? init : arr[0];
			const start = arguments.length >= 2 ? 0 : 1;
			for (let i = start; i < arr.length; i++) acc = cb(acc, _wrapItem(store, arr, i, basePath, baseParts), i, arr);
			return acc;
		};
		default: return null;
	}
}
function _getCachedArrayMeta(p, baseParts) {
	const map = p.internedArrayPaths;
	for (let i = baseParts.length - 1; i >= 0; i--) {
		if (!isNumericIndex(baseParts[i])) continue;
		const internKey = i === 1 ? baseParts[0] : baseParts.slice(0, i).join("\0");
		let interned = map.get(internKey);
		if (!interned) {
			interned = i === 1 ? [baseParts[0]] : baseParts.slice(0, i);
			map.set(internKey, interned);
		}
		return {
			arrayPathParts: interned,
			arrayIndex: Number(baseParts[i]),
			baseTail: i + 1 < baseParts.length ? baseParts.slice(i + 1) : []
		};
	}
	return null;
}
function _makePathCache(base) {
	const m = /* @__PURE__ */ new Map();
	return (prop) => {
		let v = m.get(prop);
		if (!v) {
			v = base.length ? [...base, prop] : [prop];
			m.set(prop, v);
		}
		return v;
	};
}
function _createProxy(store, target, basePath, baseParts = [], arrayMeta, existingP) {
	if (!target || typeof target !== "object") return target;
	const _p = existingP || getPriv(store);
	if (!_isArr(target)) {
		const cached = _p.proxyCache.get(target);
		if (cached) return cached;
	}
	const cachedArrayMeta = arrayMeta ?? _getCachedArrayMeta(_p, baseParts);
	let methodCache;
	const skipReactive = shouldSkipReactiveWrapForPath(basePath);
	const getCachedPathParts = _makePathCache(baseParts);
	const getCachedLeafPathParts = _makePathCache(cachedArrayMeta?.baseTail ?? []);
	const proxy = new Proxy(target, {
		get(obj, prop) {
			if (prop === GEA_STORE_ROOT) return _p.selfProxy || store;
			if (prop === GEA_PROXY_IS_PROXY) return true;
			if (prop === GEA_PROXY_RAW || prop === GEA_PROXY_GET_TARGET) return obj;
			if (prop === GEA_PROXY_GET_PATH) return basePath;
			if (typeof prop === "symbol") return obj[prop];
			const value = obj[prop];
			if (value == null) return value;
			const valType = typeof value;
			if (valType !== "object" && valType !== "function") return value;
			if (valType === "function") {
				if (prop === "constructor") return value;
				if (_isArr(obj)) {
					if (!methodCache) methodCache = /* @__PURE__ */ new Map();
					let cached = methodCache.get(prop);
					if (cached !== void 0) return cached;
					cached = _interceptArray(store, obj, prop, basePath, baseParts, _p) || value.bind(obj);
					methodCache.set(prop, cached);
					return cached;
				}
				if (skipReactive) return value;
				return value.bind(obj);
			}
			if (skipReactive) return value;
			const isArrIdx = _isArr(obj) && isNumericIndex(prop);
			if (isArrIdx) {
				const indexCache = _p.arrayIndexProxyCache.get(obj);
				if (indexCache) {
					const cached = indexCache.get(prop);
					if (cached) return cached;
				}
				const proxyCached = _p.proxyCache.get(value);
				if (proxyCached) {
					let ic = indexCache || _p.arrayIndexProxyCache.get(obj);
					if (!ic) {
						ic = /* @__PURE__ */ new Map();
						_p.arrayIndexProxyCache.set(obj, ic);
					}
					ic.set(prop, proxyCached);
					return proxyCached;
				}
			} else {
				const cached = _p.proxyCache.get(value);
				if (cached) return cached;
			}
			if (!_isPlain(value)) return value;
			if (isArrIdx) {
				let indexCache = _p.arrayIndexProxyCache.get(obj);
				if (!indexCache) {
					indexCache = /* @__PURE__ */ new Map();
					_p.arrayIndexProxyCache.set(obj, indexCache);
				}
				const propStr = prop;
				const created = _createProxy(store, value, joinPath(basePath, propStr), getCachedPathParts(propStr), {
					arrayPathParts: baseParts,
					arrayIndex: Number(propStr),
					baseTail: []
				}, _p);
				indexCache.set(prop, created);
				return created;
			}
			const created = _createProxy(store, value, joinPath(basePath, prop), getCachedPathParts(prop), void 0, _p);
			_p.proxyCache.set(value, created);
			return created;
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
				if (!isNew) _dropOld(_p, oldValue);
				obj[prop] = value;
				const change = _mkChange(isNew ? "add" : "update", prop, obj, getCachedPathParts(prop), value, oldValue);
				if (cachedArrayMeta) _tagArrayItem(change, cachedArrayMeta, getCachedLeafPathParts(prop));
				_queueChange(store, change, _p);
				return true;
			}
			value = unwrapNestedProxyValue(value);
			if (prop === "length" && _isArr(obj)) {
				_p.arrayIndexProxyCache.delete(obj);
				obj[prop] = value;
				return true;
			}
			const isNew = !_hasOwn.call(obj, prop);
			if (_isArr(obj) && isNumericIndex(prop)) {
				const ic = _p.arrayIndexProxyCache.get(obj);
				if (ic) ic.delete(prop);
			}
			_dropOld(_p, oldValue);
			obj[prop] = value;
			_commitObjSet(store, isNew, prop, obj, getCachedPathParts(prop), value, oldValue, true, _p, cachedArrayMeta, getCachedLeafPathParts);
			return true;
		},
		deleteProperty(obj, prop) {
			if (typeof prop === "symbol") {
				delete obj[prop];
				return true;
			}
			const oldValue = obj[prop];
			if (_isArr(obj) && isNumericIndex(prop)) {
				const ic = _p.arrayIndexProxyCache.get(obj);
				if (ic) ic.delete(prop);
			}
			_dropOld(_p, oldValue);
			delete obj[prop];
			const change = _mkChange("delete", prop, obj, getCachedPathParts(prop), void 0, oldValue);
			if (cachedArrayMeta) _tagArrayItem(change, cachedArrayMeta, getCachedLeafPathParts(prop));
			_queueChange(store, change, _p);
			return true;
		}
	});
	if (!_isArr(target)) _p.proxyCache.set(target, proxy);
	return proxy;
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
	static {
		this.rootProxyHandlerFactory = null;
	}
	static flushAll() {
		if (_flushing) return;
		_flushing = true;
		let firstError;
		try {
			while (_pendingStores.size > 0) {
				const batch = [..._pendingStores];
				_pendingStores.clear();
				for (let i = 0; i < batch.length; i++) {
					const raw = batch[i];
					const p = storeInstancePrivate.get(raw);
					if (p.pendingChanges.length > 0) try {
						_flushChanges(raw, p);
					} catch (e) {
						if (!firstError) firstError = e;
					}
					else p.flushScheduled = false;
				}
			}
		} finally {
			_flushing = false;
		}
		if (firstError) throw firstError;
	}
	static rootGetValue(t, prop, receiver) {
		if (!_hasOwn.call(t, prop)) return Reflect.get(t, prop, receiver);
		const value = t[prop];
		if (typeof value === "function") return value;
		if (value != null && typeof value === "object") {
			if (!_isPlain(value)) return value;
			if (shouldSkipReactiveWrapForPath(prop)) return value;
			const p = storeInstancePrivate.get(t);
			const entry = p.topLevelProxies.get(prop);
			if (entry && entry[0] === value) return entry[1];
			return _topProxy(t, prop, value, p);
		}
		return value;
	}
	static rootSetValue(t, prop, value) {
		if (typeof value === "function") {
			t[prop] = value;
			return true;
		}
		const p = storeInstancePrivate.get(t);
		const pathParts = _rootPathPartsCache(p, prop);
		if (value == null || typeof value !== "object") {
			const oldValue = t[prop];
			if (oldValue === value && prop in t) return true;
			const hadProp = prop in t;
			if (oldValue && typeof oldValue === "object") {
				_dropCaches(p, oldValue);
				p.topLevelProxies.delete(prop);
			}
			t[prop] = value;
			_pushAndSchedule(t, _mkChange(hadProp ? "update" : "add", prop, t, pathParts, value, oldValue), p);
			return true;
		}
		value = unwrapNestedProxyValue(value);
		const hadProp = _hasOwn.call(t, prop);
		const oldValue = hadProp ? t[prop] : void 0;
		if (hadProp && oldValue === value) return true;
		_dropOld(p, oldValue);
		p.topLevelProxies.delete(prop);
		t[prop] = value;
		_commitObjSet(t, !hadProp, prop, t, pathParts, value, oldValue, false, p);
		return true;
	}
	static rootDeleteProperty(t, prop) {
		if (!_hasOwn.call(t, prop)) return true;
		const oldValue = t[prop];
		const dp = storeInstancePrivate.get(t);
		_dropOld(dp, oldValue);
		dp.topLevelProxies.delete(prop);
		delete t[prop];
		_pushAndSchedule(t, [_mkChange("delete", prop, t, _rootPathPartsCache(dp, prop), void 0, oldValue)], dp);
		return true;
	}
	constructor(initialData) {
		const priv = {
			selfProxy: void 0,
			pendingChanges: [],
			pendingChangesPool: [],
			flushScheduled: false,
			nextArrayOpId: 0,
			observerRoot: _mkNode([]),
			proxyCache: /* @__PURE__ */ new WeakMap(),
			arrayIndexProxyCache: /* @__PURE__ */ new WeakMap(),
			internedArrayPaths: /* @__PURE__ */ new Map(),
			topLevelProxies: /* @__PURE__ */ new Map(),
			pathPartsCache: /* @__PURE__ */ new Map(),
			pendingBatchKind: 0,
			pendingBatchArrayPathParts: null
		};
		storeInstancePrivate.set(this, priv);
		const handler = Store.rootProxyHandlerFactory ? Store.rootProxyHandlerFactory() : _getBrowserRootProxyHandler();
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
		const raw = storeRaw(this);
		const p = storeInstancePrivate.get(raw);
		if (p.pendingChanges.length > 0) _flushChanges(raw, p);
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
		return _addObserver(this, pathParts, handler);
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
//#region src/lib/base/component-internal.ts
function createEngineState() {
	return {
		bindings: [],
		selfListeners: [],
		childComponents: [],
		geaPropBindings: /* @__PURE__ */ new Map(),
		observerRemovers: [],
		rawProps: {},
		elCache: /* @__PURE__ */ new Map(),
		listConfigs: []
	};
}
const engineStateByRawInstance = /* @__PURE__ */ new WeakMap();
function engineThis(c) {
	return c[GEA_PROXY_GET_RAW_TARGET] ?? c;
}
/**
* Returns per-component engine state (WeakMap, not on `this`).
* Safe to call after `super()` in Component constructors.
*/
function getComponentInternals(component) {
	const key = engineThis(component);
	let s = engineStateByRawInstance.get(key);
	if (!s) {
		s = createEngineState();
		engineStateByRawInstance.set(key, s);
	}
	return s;
}
//#endregion
//#region src/lib/base/component-manager.ts
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
			const root = engineThis(c)[GEA_ELEMENT] ?? (typeof document !== "undefined" ? document.getElementById(c.id) : null);
			rootSteps[i] = root ? bubbleStepMap.get(root) : void 0;
		}
		let broken = false;
		let step = 0;
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
		for (const type of eventTypes) {
			if (this.registeredDocumentEvents_.has(type)) continue;
			const useCapture = ComponentManager.NON_BUBBLING_EVENTS_.has(type);
			document.body.addEventListener(type, this.boundHandleEvent_, useCapture);
			this.registeredDocumentEvents_.add(type);
		}
	}
	installConfiguredPlugins_() {
		for (const plugin of ComponentManager.eventPlugins_) this.installEventPlugin_(plugin);
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
				const cid = node.getAttribute("data-gcc");
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
		const ev = events ?? comp.events;
		if (!comp || !ev) return true;
		const targetEl = e.targetEl;
		if (!targetEl || typeof targetEl.matches !== "function") return true;
		const handlers = ev[e.type];
		if (!handlers) return true;
		const geaEvt = targetEl[GEA_DOM_EVENT_HINT] ?? targetEl.getAttribute?.("data-ge");
		if (geaEvt) {
			const handler = handlers[`[data-ge="${geaEvt}"]`];
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
			const matchedEl = selector.charAt(0) === "#" ? targetEl.id === selector.slice(1) ? targetEl : null : selector.includes("data-ge") && typeof targetEl.closest === "function" ? targetEl.closest(selector) : targetEl.matches(selector) ? targetEl : null;
			if (matchedEl) {
				const handler = handlers[selector];
				if (typeof handler === "function") {
					const targetComponent = this.getOwningComponent(targetEl);
					Object.defineProperty(e, "currentTarget", {
						value: matchedEl,
						configurable: true
					});
					if (handler.call(comp, e, targetComponent !== comp ? targetComponent : void 0) === false) return false;
					if ((targetEl[GEA_DOM_KEY] != null || targetEl.getAttribute?.("data-gid") != null) && matchedEl !== targetEl) return GEA_SKIP_ITEM_HANDLER;
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
		const root = engineThis(comp)[GEA_ELEMENT] ?? comp.el;
		while (itemEl && itemEl !== root) {
			if (itemEl[GEA_DOM_KEY] != null || itemEl.getAttribute?.("data-gid")) break;
			itemEl = itemEl.parentElement;
		}
		if (itemEl && itemEl !== root) {
			const itemId = itemEl[GEA_DOM_KEY] ?? itemEl.getAttribute?.("data-gid");
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
					const cid = current.getAttribute("data-gcc");
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
		return tagName.includes("-") ? tagName : `gea-${tagName}`;
	}
	getComponentSelectors() {
		if (!this.componentSelectorsCache_) this.componentSelectorsCache_ = Object.keys(this.componentClassRegistry);
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
		for (const comp of Object.values(this.componentRegistry)) if (comp.events) for (const type of Object.keys(comp.events)) eventTypes.add(type);
		return [...eventTypes];
	}
	static getInstance() {
		if (!ComponentManager.instance) ComponentManager.instance = new ComponentManager();
		return ComponentManager.instance;
	}
	static registerEventTypes(eventTypes) {
		let changed = false;
		for (const type of eventTypes) {
			if (ComponentManager.customEventTypes_.includes(type)) continue;
			ComponentManager.customEventTypes_.push(type);
			changed = true;
		}
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
//#region src/lib/base/list.ts
const _frag$1 = () => document.createDocumentFragment();
function rebuildList(container, array, config) {
	container.textContent = "";
	if (array.length === 0) return;
	const f = _frag$1();
	for (let i = 0; i < array.length; i++) f.appendChild(config.create(array[i], i));
	container.appendChild(f);
}
function rerenderListInPlace(container, array, create) {
	const cl = container.children.length;
	const nl = array.length;
	for (let i = 0; i < (cl < nl ? cl : nl); i++) container.children[i].replaceWith(create(array[i], i));
	if (nl > cl) {
		const f = _frag$1();
		for (let i = cl; i < nl; i++) f.appendChild(create(array[i], i));
		container.appendChild(f);
	}
	while (container.children.length > nl) container.lastElementChild.remove();
}
function applyReorder(container, permutation) {
	const rows = Array.from(container.children);
	for (let i = 0; i < permutation.length; i++) {
		const r = rows[permutation[i]];
		if (r && r !== container.children[i]) container.insertBefore(r, container.children[i] || null);
	}
}
function applyPropChanges(container, rawItems, changes, config) {
	if (!config.propPatchers) return false;
	const children = container.children;
	let handledAny = false;
	const firstAipu = changes[0];
	const arppMatch = firstAipu?.isArrayItemPropUpdate ? samePathParts(firstAipu.arrayPathParts, config.arrayPathParts) : false;
	for (let i = 0; i < changes.length; i++) {
		const change = changes[i];
		if (!change.isArrayItemPropUpdate || change.arrayIndex == null) continue;
		if (!arppMatch && !samePathParts(change.arrayPathParts, config.arrayPathParts)) continue;
		const lp = change.leafPathParts;
		const key = lp && lp.length > 0 ? lp.length === 1 ? lp[0] : lp.join(".") : change.property;
		const patchers = config.propPatchers[key] || config.propPatchers[change.property];
		if (!patchers || patchers.length === 0) continue;
		const row = children[change.arrayIndex];
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
		const domKey = row[GEA_DOM_KEY] ?? row.getAttribute("data-gid");
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
	const items = proxiedItems?.[GEA_PROXY_GET_TARGET] ?? proxiedItems;
	if (!changes || changes.length === 0) {
		rerenderListInPlace(container, items, config.create);
		return;
	}
	const firstChange = changes[0];
	if (firstChange?.type === "reorder" && samePathParts(firstChange.pathParts, config.arrayPathParts) && Array.isArray(firstChange.permutation)) {
		applyReorder(container, firstChange.permutation);
		return;
	}
	let allSwaps = true;
	for (let i = 0; i < changes.length; i++) {
		const c = changes[i];
		if (!(c?.type === "update" && c.arrayOp === "swap")) {
			allSwaps = false;
			break;
		}
	}
	if (allSwaps) {
		const seen = /* @__PURE__ */ new Set();
		for (let i = 0; i < changes.length; i++) {
			const c = changes[i];
			const id = c.opId || c.property + ":" + c.otherIndex;
			if (seen.has(id)) continue;
			seen.add(id);
			const a = +c.property, b = +c.otherIndex;
			if (a === b || !(a >= 0) || !(b >= 0)) continue;
			const ea = container.children[a], eb = container.children[b];
			if (ea && eb) {
				const ref = eb.nextElementSibling;
				container.insertBefore(eb, ea);
				container.insertBefore(ea, ref);
			}
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
		if (change.type === "delete" || change.type === "add") {
			const idx = Number(change.property);
			if (Number.isInteger(idx) && idx >= 0) {
				(change.type === "delete" ? deleteIndexes : addIndexes).push(idx);
				handledMutation = true;
			}
			continue;
		}
		if (change.type === "append") {
			const start = change.start ?? 0;
			const count = change.count ?? 0;
			if (count > 0) {
				const fragment = _frag$1();
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
		if (firstChild && firstChild[GEA_DOM_KEY] == null && !firstChild.hasAttribute("data-gid")) {
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
const _cm = () => ComponentManager.getInstance();
const _getEl = (id) => document.getElementById(id);
const _frag = () => document.createDocumentFragment();
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
const ITEM_ID_ATTR = "data-gid";
function _pushCC(_i, child) {
	if (!_i.childComponents.includes(child)) _i.childComponents.push(child);
}
const _isSentinel = (n) => n.nodeType === 8 && !n.data;
function _itemId(n) {
	return n[GEA_DOM_KEY] ?? n.getAttribute?.(ITEM_ID_ATTR) ?? null;
}
function _rootIn(el, container) {
	while (el.parentElement && el.parentElement !== container) el = el.parentElement;
	return el;
}
function _setParent(child, parent) {
	engineThis(child)[GEA_PARENT_COMPONENT] = parent[GEA_SELF_PROXY] ?? parent;
}
function _updateMapState(c, items) {
	c[GEA_MAP_CONFIG_PREV] = items.slice();
	c[GEA_MAP_CONFIG_COUNT] = items.length;
}
const _transferByKey = /* @__PURE__ */ new Map();
const _inTransfer = /* @__PURE__ */ new WeakSet();
/**
* Find the conditional-slot comment marker at a specific slot index.
* The compiler tells each list which slot index immediately follows it in JSX
* source order via `afterCondSlotIndex`.  We look for `<!--{id}-c{N}-->`.
* Returns null when no such marker exists (map is last, or no conditionals follow).
*/
function _compiledChildOwns(child, el) {
	if (!child[GEA_COMPILED_CHILD]) return false;
	const root = engineThis(child)[GEA_ELEMENT];
	return root != null && (root === el || el.contains(root));
}
function _moveBeforeCond(container, item, condRef) {
	if (!condRef) return;
	const el = engineThis(item)[GEA_ELEMENT];
	if (el && el.parentNode === container) container.insertBefore(el, condRef);
}
function _findComment(root, data, deep) {
	if (deep) {
		const w = document.createTreeWalker(root, 128);
		let n;
		while (n = w.nextNode()) if (n.data === data) return n;
	} else for (let n = root.firstChild; n; n = n.nextSibling) if (n.nodeType === 8 && n.data === data) return n;
	return null;
}
function _findCondMarkerByIndex(container, componentId, slotIndex) {
	if (slotIndex == null) return null;
	return _findComment(container, `${componentId}-c${slotIndex}`);
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
	const raw = engineThis(comp);
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
	return _inTransfer.has(engineThis(comp));
}
function __escapeHtml(str) {
	return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
/** Ensures static template HTML from list `items.join('')` survives GEA_PATCH_COND empty reinjection. */
function injectDataGeaItemIdOnFirstOpenTag(html, key) {
	const m = html.match(/^<([A-Za-z][\w:-]*)([^>]*)>/);
	if (!m) return html;
	const full = m[0];
	if (/\sdata-gid\s*=/.test(full)) return html;
	const esc = __escapeHtml(key);
	return `<${m[1]}${m[2]} ${ITEM_ID_ATTR}="${esc}">` + html.slice(full.length);
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
	globalThis.__gid ??= _getEl;
}
function _attachAndMount(comp, refs, bindings = true) {
	if (bindings) comp[GEA_ATTACH_BINDINGS]();
	comp[GEA_MOUNT_COMPILED_CHILD_COMPONENTS]();
	comp[GEA_INSTANTIATE_CHILD_COMPONENTS]();
	comp[GEA_SETUP_EVENT_DIRECTIVES]();
	if (refs) {
		const sr = comp[GEA_SETUP_REFS];
		if (typeof sr === "function") sr.call(comp);
	}
}
function _syncAndMount(comp) {
	comp[GEA_SYNC_UNRENDERED_LIST_ITEMS]();
	_mountComp(comp, true);
	comp[GEA_SYNC_UNRENDERED_LIST_ITEMS]();
}
function _mountComp(comp, refs) {
	comp[GEA_RENDERED] = true;
	_cm().markComponentRendered(comp);
	_attachAndMount(comp, refs);
	comp.onAfterRender();
	comp.onAfterRenderHooks();
}
function _handleListChange(comp, storeObj, path, config, changes) {
	if ((!config.items || config.items.length === 0) && config.itemsKey) config.items = comp[config.itemsKey];
	if (!config.items) return;
	if (config[GEA_LIST_CONFIG_REFRESHING]) return;
	config[GEA_LIST_CONFIG_REFRESHING] = true;
	try {
		const arr = path.reduce((obj, key) => obj?.[key], storeObj) ?? [];
		if (changes && changes.every((c) => c.aipu)) for (const c of changes) {
			const item = config.items[c.arix];
			if (item) item[GEA_UPDATE_PROPS](config.props(arr[c.arix], c.arix));
		}
		else if (changes && changes.length === 1 && changes[0].type === "append" && changes[0].pathParts.length === path.length && changes[0].pathParts.every((p, i) => p === path[i])) {
			const { start, count } = changes[0];
			const container = config.container();
			const condRef = container ? _findCondMarkerByIndex(container, engineThis(comp)[GEA_ID], config.afterCondSlotIndex) : null;
			for (let i = 0; i < count; i++) {
				const data = arr[start + i];
				const item = comp[GEA_CHILD](config.Ctor, config.props(data, start + i), config.key(data, start + i));
				config.items.push(item);
				if (comp[GEA_RENDERED] && container) {
					item.render(container);
					_moveBeforeCond(container, item, condRef);
				}
			}
		} else {
			const newItems = comp[GEA_RECONCILE_LIST](config.items, arr, config.container(), config.Ctor, config.props, config.key, config.afterCondSlotIndex);
			config.items.length = 0;
			config.items.push(...newItems);
		}
		config.onchange?.();
	} finally {
		config[GEA_LIST_CONFIG_REFRESHING] = false;
	}
}
function _resolveMapContainer(container) {
	if (!container) return null;
	if (!container.id) return container;
	for (let n = container.firstChild; n; n = n.nextSibling) {
		if (n.nodeType === 1 && _itemId(n) != null) return container;
		if (_isSentinel(n)) break;
	}
	const prefix = container.id + "-";
	const nested = container.querySelector(`[id^="${prefix}"][${ITEM_ID_ATTR}]`) || Array.from(container.querySelectorAll(`[id^="${prefix}"]`)).find((el) => el[GEA_DOM_KEY] != null) || null;
	if (nested?.parentElement && nested.parentElement !== container) return nested.parentElement;
	if (!nested) for (let s = container.firstChild; s; s = s.nextSibling) {
		if (_isSentinel(s)) break;
		if (s.nodeType === 8 && s.data && /-c\d+$/.test(s.data)) return null;
	}
	return container;
}
function _findKeyedAncestor(comp) {
	let c = comp;
	while (c) {
		if (c[GEA_ITEM_KEY] != null) return c;
		c = engineThis(c)[GEA_PARENT_COMPONENT];
	}
}
function _eachBetween(start, end, fn) {
	let node = start.nextSibling;
	while (node && node !== end) {
		const next = node.nextSibling;
		if (fn(node) === false) break;
		node = next;
	}
}
function _clearBetweenMarkers(start, end) {
	_eachBetween(start, end, (n) => {
		n.remove();
	});
}
function _collectCompiledChildrenBetween(comp, start, end) {
	const result = /* @__PURE__ */ new Set();
	_eachBetween(start, end, (n) => {
		if (n.nodeType === 1) {
			for (const child of getComponentInternals(comp).childComponents) if (_compiledChildOwns(child, n)) result.add(child);
		}
	});
	return result;
}
function _disposeAndRemoveChildren(comp, disposed) {
	if (disposed.size === 0) return;
	for (const child of disposed) {
		child.dispose();
		const k = Object.keys(comp).find((k) => comp[k] === child);
		if (k) comp[k] = null;
	}
	const ci = getComponentInternals(comp);
	ci.childComponents = ci.childComponents.filter((c) => !disposed.has(c));
}
/**
* Declared React `Component` surface + `render(): ReactNode` overload so Gea classes are valid JSX class
* tags while `JSX.IntrinsicElements` is sourced from `@types/react`. Runtime is still Gea-only.
*/
var Component = class Component extends Store {
	constructor(props = {}, _unusedReactContext) {
		super();
		const _i = getComponentInternals(this);
		const eng = engineThis(this);
		eng[GEA_ID] = _cm().getUid();
		eng[GEA_ELEMENT] = null;
		eng[GEA_PARENT_COMPONENT] = void 0;
		const Ctor = this.constructor;
		_cm().registerComponentClass(Ctor);
		_componentClassesMap.set(Ctor.name, Ctor);
		this[GEA_RENDERED] = false;
		let _rawProps = props || {};
		let _propsProxy = this[GEA_CREATE_PROPS_PROXY](_rawProps);
		_i.rawProps = _rawProps;
		Object.defineProperty(this, "props", {
			get: () => _propsProxy,
			set: (newProps) => {
				_rawProps = newProps || {};
				_propsProxy = this[GEA_CREATE_PROPS_PROXY](_rawProps);
				_i.rawProps = _rawProps;
			},
			configurable: true,
			enumerable: true
		});
		_cm().setComponent(this);
		this.created(this.props);
		this.createdHooks(this.props);
		if (typeof this[GEA_SETUP_LOCAL_STATE_OBSERVERS] === "function") this[GEA_SETUP_LOCAL_STATE_OBSERVERS]();
	}
	created(_props) {}
	createdHooks(_props) {}
	get id() {
		return engineThis(this)[GEA_ID];
	}
	get el() {
		const eng = engineThis(this);
		let el = eng[GEA_ELEMENT];
		if (!el) {
			const cloneFn = this[GEA_CLONE_TEMPLATE];
			if (typeof cloneFn === "function") el = cloneFn.call(this);
			else {
				let existing = _getEl(eng[GEA_ID]);
				if (existing && existing.id === "app" && !existing.classList.contains("store-layout")) existing = null;
				el = existing || _cm().createElement(String(this.template(this.props)).trim());
			}
			eng[GEA_ELEMENT] = el;
			if (el) Component[GEA_SYNC_VALUE_PROPS](el);
		}
		if (el) el[GEA_DOM_COMPONENT] = this;
		return el;
	}
	$$(selector) {
		const el = this.el;
		if (!el) return [];
		return !selector || selector === ":scope" ? [el] : [...el.querySelectorAll(selector)];
	}
	$(selector) {
		const el = engineThis(this)[GEA_ELEMENT];
		if (!el) return null;
		return !selector || selector === ":scope" ? el : el.querySelector(selector);
	}
	render(rootEl, opt_index = Infinity) {
		if (this[GEA_RENDERED]) return true;
		const eng = engineThis(this);
		const el = eng[GEA_ELEMENT] = this.el;
		if (rootEl) {
			if (opt_index < 0) opt_index = Infinity;
			if (rootEl != el.parentElement) {
				if (!rootEl.contains(el)) rootEl.insertBefore(el, rootEl.children[opt_index]);
			} else {
				let newIndex = opt_index;
				let elementIndex = 0;
				let t = el;
				while (t = t.previousElementSibling) elementIndex++;
				if (elementIndex < newIndex) newIndex++;
				if (!(elementIndex == newIndex || newIndex >= rootEl.childElementCount && el == rootEl.lastElementChild)) rootEl.insertBefore(el, rootEl.children[newIndex]);
			}
		}
		_syncAndMount(this);
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
		const eid = engineThis(this)[GEA_ID];
		for (const { config: c } of configs) {
			if (!c.items && c.itemsKey) c.items = this[c.itemsKey];
			if (!c.items?.length) continue;
			const container = c.container();
			if (!container) continue;
			const condRef = _findCondMarkerByIndex(container, eid, c.afterCondSlotIndex);
			for (const item of c.items) {
				if (!item) continue;
				if (!item[GEA_RENDERED]) {
					item.render(container);
					_moveBeforeCond(container, item, condRef);
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
		const eng = engineThis(this);
		if (!this[GEA_RENDERED]) {
			const el = _getEl(eng[GEA_ID]);
			if (el) {
				eng[GEA_ELEMENT] = el;
				el[GEA_DOM_COMPONENT] = this;
				_syncAndMount(this);
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
			this[GEA_REQUEST_RENDER]?.();
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
		const _i = getComponentInternals(this);
		_cm().removeComponent(this);
		const eng = engineThis(this);
		const el = eng[GEA_ELEMENT] || _getEl(eng[GEA_ID]);
		if (el) {
			el[GEA_DOM_COMPONENT] = void 0;
			el.parentNode?.removeChild(el);
		}
		eng[GEA_ELEMENT] = null;
		for (const fn of _i.observerRemovers) fn();
		_i.observerRemovers = [];
		this[GEA_CLEANUP_BINDINGS]();
		this[GEA_TEARDOWN_SELF_LISTENERS]();
		for (const child of _i.childComponents) child?.dispose?.();
		_i.childComponents = [];
	}
	[GEA_ATTACH_BINDINGS]() {
		this[GEA_CLEANUP_BINDINGS]();
	}
	static _register(ctor, compiledTagName) {
		if (!ctor || !ctor.name || ctor[GEA_CTOR_AUTO_REGISTERED]) return;
		if (Object.getPrototypeOf(ctor.prototype) === Component.prototype) {
			ctor[GEA_CTOR_AUTO_REGISTERED] = true;
			_componentClassesMap.set(ctor.name, ctor);
			const manager = _cm();
			const tagName = compiledTagName || manager.generateTagName_(ctor);
			manager.registerComponentClass(ctor, tagName);
		}
	}
	[GEA_INSTANTIATE_CHILD_COMPONENTS]() {
		const eng = engineThis(this);
		if (!eng[GEA_ELEMENT]) return;
		const manager = _cm();
		const selectors = manager.getComponentSelectors();
		const elements = selectors.length ? Array.from(eng[GEA_ELEMENT].querySelectorAll(selectors.join(","))) : [];
		for (const el of elements) {
			if (el.getAttribute("data-gcm")) continue;
			if (el[GEA_DOM_COMPILED_CHILD_ROOT]) continue;
			const ctorName = el.constructor.name;
			if (ctorName !== "HTMLUnknownElement" && ctorName !== "HTMLElement") continue;
			const tagName = el.tagName.toLowerCase();
			let Ctor = manager.getComponentConstructor(tagName);
			if (!Ctor) {
				const pascalCase = tagName.replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase());
				Ctor = _componentClassesMap.get(pascalCase);
				if (Ctor) manager.registerComponentClass(Ctor, tagName);
			}
			if (!Ctor) continue;
			const props = this[GEA_EXTRACT_COMPONENT_PROPS](el);
			const itemId = el.getAttribute("data-prop-item-id");
			const child = new Ctor(props);
			_setParent(child, this);
			getComponentInternals(this).childComponents.push(child);
			const parent = el.parentElement;
			if (!parent) continue;
			const index = Array.prototype.slice.call(parent.children).indexOf(el);
			child.render(parent, index);
			if (itemId != null && child.el) {
				const wrapper = document.createElement("div");
				wrapper[GEA_DOM_KEY] = itemId;
				parent.replaceChild(wrapper, child.el);
				wrapper.appendChild(child.el);
			}
			child.el && child.el.setAttribute("data-gcr", child.id);
			parent.removeChild(el);
		}
	}
	[GEA_MOUNT_COMPILED_CHILD_COMPONENTS]() {
		const _i = getComponentInternals(this);
		const seen = /* @__PURE__ */ new Set();
		const collect = (value) => {
			if (!value) return;
			if (Array.isArray(value)) {
				for (const v of value) collect(v);
				return;
			}
			if (value && typeof value === "object" && value[GEA_COMPILED_CHILD] && engineThis(engineThis(value)[GEA_PARENT_COMPONENT]) === engineThis(this)) {
				if (!seen.has(value)) {
					seen.add(value);
					_pushCC(_i, value);
				}
			}
		};
		for (const key of Reflect.ownKeys(this)) collect(this[key]);
		for (const child of seen) {
			const existing = _getEl(child.id);
			if (!existing) continue;
			if (child[GEA_RENDERED] && engineThis(child)[GEA_ELEMENT] === existing) continue;
			existing[GEA_DOM_COMPILED_CHILD_ROOT] = true;
			engineThis(child)[GEA_ELEMENT] = existing;
			existing[GEA_DOM_COMPONENT] = child;
			_mountComp(child, true);
			child[GEA_SYNC_UNRENDERED_LIST_ITEMS]();
			requestAnimationFrame(() => child.onAfterRenderAsync());
		}
	}
	[GEA_CHILD](Ctor, props, key) {
		const _i = getComponentInternals(this);
		const child = new Ctor(props);
		_setParent(child, this);
		child[GEA_COMPILED_CHILD] = true;
		if (key !== void 0) child[GEA_ITEM_KEY] = String(key);
		_pushCC(_i, child);
		return child;
	}
	[GEA_EL](suffix) {
		const _i = getComponentInternals(this);
		const eng = engineThis(this);
		let el = _i.elCache.get(suffix) ?? null;
		if (!el || !el.isConnected) {
			const id = eng[GEA_ID] + "-" + suffix;
			const root = eng[GEA_ELEMENT];
			const bySelector = (r) => r.querySelector(`#${CSS.escape(id)}`);
			if (root) el = root.isConnected ? _getEl(id) ?? bySelector(root) : bySelector(root);
			else el = _getEl(id);
			if (el) _i.elCache.set(suffix, el);
			else _i.elCache.delete(suffix);
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
		const _i = getComponentInternals(this);
		const eng = engineThis(this);
		if (!container || !this[GEA_RENDERED]) return;
		for (const item of items) if (!item[GEA_RENDERED]) {
			_pushCC(_i, item);
			item.render(container);
		}
		const ordered = [];
		for (const item of items) {
			const el = engineThis(item)[GEA_ELEMENT];
			if (!el) continue;
			ordered.push(_rootIn(el, container));
		}
		if (ordered.length === 0) return;
		const condRef = _findCondMarkerByIndex(container, eng[GEA_ID], afterCondSlotIndex);
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
		const _i = getComponentInternals(this);
		const oldByKey = /* @__PURE__ */ new Map();
		for (const item of oldItems) {
			if (!item) continue;
			if (item[GEA_ITEM_KEY] != null) oldByKey.set(item[GEA_ITEM_KEY], item);
		}
		if (oldByKey.size === 0 && container) for (let ch = container.firstElementChild; ch; ch = ch.nextElementSibling) {
			const comp = ch[GEA_DOM_COMPONENT];
			if (!comp) continue;
			const keyed = _findKeyedAncestor(comp);
			if (keyed) oldByKey.set(keyed[GEA_ITEM_KEY], keyed);
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
				_setParent(transferred, this);
				_pushCC(_i, transferred);
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
				const eng = engineThis(item);
				if (!eng?.[GEA_ELEMENT]) continue;
				const el = _rootIn(eng[GEA_ELEMENT], container);
				if (el.parentElement === container) rootSet.add(el);
			}
			if (rootSet.size === next.length && container.childElementCount > next.length) for (let ch = container.firstChild; ch;) {
				const nx = ch.nextSibling;
				if (ch.nodeType === 1 && !rootSet.has(ch)) {
					const comp = ch[GEA_DOM_COMPONENT];
					const keyedAncestor = _findKeyedAncestor(comp);
					if (keyedAncestor) {
						keyedAncestor.dispose?.();
						ch.remove();
					}
				}
				ch = nx;
			}
		}
		_i.childComponents = _i.childComponents.filter((child) => !oldItems.includes(child) || next.includes(child));
		return next;
	}
	[GEA_CLEANUP_BINDINGS]() {
		getComponentInternals(this).bindings = [];
	}
	[GEA_SETUP_EVENT_DIRECTIVES]() {}
	[GEA_TEARDOWN_SELF_LISTENERS]() {
		const _i = getComponentInternals(this);
		for (const fn of _i.selfListeners) fn();
		_i.selfListeners = [];
	}
	[GEA_EXTRACT_COMPONENT_PROPS](el) {
		const _i = getComponentInternals(this);
		if (el[GEA_DOM_PROPS]) {
			const jsProps = el[GEA_DOM_PROPS];
			delete el[GEA_DOM_PROPS];
			return jsProps;
		}
		const props = {};
		if (!el.getAttributeNames) return props;
		for (const name of el.getAttributeNames()) {
			if (!name.startsWith("data-prop-")) continue;
			const value = el.getAttribute(name);
			const propName = this[GEA_NORMALIZE_PROP_NAME](name.slice(10));
			if (_i.geaPropBindings && value && value.startsWith("gea:p:")) props[propName] = _i.geaPropBindings.get(value);
			else props[propName] = this[GEA_COERCE_STATIC_PROP_VALUE](value);
			el.removeAttribute(name);
		}
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
	[GEA_REGISTER_COND](idx, slotId, getCond, getTruthyHtml, getFalsyHtml) {
		const _i = getComponentInternals(this);
		if (!_i.geaConds) _i.geaConds = {};
		_i.geaConds[idx] = {
			slotId,
			getCond,
			getTruthyHtml,
			getFalsyHtml
		};
		if (!this[GEA_RENDERED]) {
			if (!_i.condPatchPrev) _i.condPatchPrev = {};
			try {
				_i.condPatchPrev[idx] = !!getCond();
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
		const _i = getComponentInternals(this);
		const conf = _i.geaConds?.[idx];
		if (!conf) return false;
		let cond;
		try {
			cond = !!conf.getCond();
		} catch {
			return false;
		}
		const condPatchPrev = _i.condPatchPrev ??= {};
		const prev = condPatchPrev[idx];
		const needsPatch = cond !== prev;
		const eng = engineThis(this);
		const eid = eng[GEA_ID];
		const root = eng[GEA_ELEMENT] || _getEl(eid);
		if (!root) return false;
		const markerText = eid + "-" + conf.slotId;
		const endMarkerText = markerText + "-end";
		const marker = _findComment(root, markerText, true);
		const endMarker = _findComment(root, endMarkerText, true);
		const parent = endMarker && endMarker.parentNode;
		if (!marker || !endMarker || !parent) {
			condPatchPrev[idx] = void 0;
			return false;
		}
		const replaceSlotContent = (htmlFn) => {
			if (!htmlFn) {
				_clearBetweenMarkers(marker, endMarker);
				return;
			}
			const html = htmlFn();
			if (html === "") {
				if (!cond && prev === true) {
					_clearBetweenMarkers(marker, endMarker);
					return;
				}
				_eachBetween(marker, endMarker, (n) => {
					if (!n.parentNode) return false;
					try {
						if (n.nodeType !== 1) n.remove();
						else if (n[GEA_DOM_KEY] == null && !n.hasAttribute?.(ITEM_ID_ATTR)) n.remove();
					} catch {}
				});
				return;
			}
			_clearBetweenMarkers(marker, endMarker);
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
			if (prev === true && !cond || prev === false && cond) _disposeAndRemoveChildren(this, _collectCompiledChildrenBetween(this, marker, endMarker));
			replaceSlotContent(cond ? conf.getTruthyHtml : conf.getFalsyHtml);
			if (cond) {
				_attachAndMount(this, false, false);
				Component[GEA_SYNC_AUTOFOCUS](marker, endMarker);
			}
			condPatchPrev[idx] = cond;
		} else {
			const htmlFn = cond ? conf.getTruthyHtml : conf.getFalsyHtml;
			if (htmlFn) {
				if (cond) {
					const first = marker.nextSibling;
					if (first && first.nodeType === 1 && first !== endMarker) {
						if (first[GEA_DOM_COMPILED_CHILD_ROOT]) return needsPatch;
						for (const child of _i.childComponents) if (_compiledChildOwns(child, first)) return needsPatch;
					}
				}
				const tpl = document.createElement("template");
				tpl.innerHTML = htmlFn();
				const nc = Array.from(tpl.content.childNodes);
				let existing = marker.nextSibling;
				let ni = 0;
				while (existing && existing !== endMarker && ni < nc.length) {
					const desired = nc[ni];
					if (existing.nodeType === 1 && desired.nodeType === 1) {
						if (!existing[GEA_DOM_COMPILED_CHILD_ROOT]) Component[GEA_PATCH_NODE](existing, desired);
					} else if (existing.nodeType === 3 && desired.nodeType === 3) {
						if (existing.textContent !== desired.textContent) existing.textContent = desired.textContent;
					}
					existing = existing.nextSibling;
					ni++;
				}
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
		_eachBetween(startMarker, endMarker, (n) => {
			if (n.nodeType === 1) {
				const el = n;
				const target = el.hasAttribute("autofocus") ? el : el.querySelector("[autofocus]");
				if (target) {
					target.focus();
					return false;
				}
			}
		});
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
		_cm().registerComponentClass(this, tagName);
		_componentClassesMap.set(this.name, this);
	}
};
Object.defineProperty(Component, GEA_COMPONENT_CLASSES, {
	get() {
		return _componentClassesMap;
	},
	configurable: true
});
for (const [sym, field] of [
	[GEA_MAPS, "geaMaps"],
	[GEA_CONDS, "geaConds"],
	[GEA_EL_CACHE, "elCache"],
	[GEA_CHILD_COMPONENTS, "childComponents"],
	[GEA_OBSERVER_REMOVERS, "observerRemovers"],
	[GEA_COMPILED_CHILD, "geaCompiledChild"],
	[GEA_ITEM_KEY, "geaItemKey"],
	[GEA_SELF_LISTENERS, "selfListeners"],
	[GEA_PROP_BINDINGS, "geaPropBindings"],
	[GEA_RESET_ELS, "resetEls"]
]) Object.defineProperty(Component.prototype, sym, {
	get() {
		return getComponentInternals(this)[field];
	},
	set(v) {
		getComponentInternals(this)[field] = v;
	},
	configurable: true
});
Component.prototype[GEA_SWAP_CHILD] = function(markerId, newChild) {
	const _i = getComponentInternals(this);
	const marker = _getEl(engineThis(this)[GEA_ID] + "-" + markerId);
	if (!marker) return;
	const oldEl = marker.nextElementSibling;
	if (newChild && newChild[GEA_RENDERED] && engineThis(newChild)[GEA_ELEMENT] === oldEl) return;
	if (oldEl && oldEl.tagName !== "TEMPLATE") {
		const oldChild = _i.childComponents.find((c) => engineThis(c)[GEA_ELEMENT] === oldEl);
		if (oldChild) {
			oldChild[GEA_RENDERED] = false;
			engineThis(oldChild)[GEA_ELEMENT] = null;
		}
		oldEl.remove();
	}
	if (!newChild) return;
	marker.insertAdjacentHTML("afterend", String(newChild.template(newChild.props)).trim());
	const newEl = marker.nextElementSibling;
	if (!newEl) return;
	engineThis(newChild)[GEA_ELEMENT] = newEl;
	_pushCC(_i, newChild);
	_mountComp(newChild, false);
};
Component.prototype[GEA_REGISTER_MAP] = function(idx, containerProp, getContainer, getItems, createItem, keyProp) {
	const _i = getComponentInternals(this);
	if (!_i.geaMaps) _i.geaMaps = {};
	_i.geaMaps[idx] = {
		containerProp,
		getContainer,
		getItems,
		createItem,
		container: null,
		keyProp
	};
};
Component.prototype[GEA_SYNC_MAP] = function(idx) {
	if (!this[GEA_RENDERED]) return;
	const map = getComponentInternals(this).geaMaps?.[idx];
	if (!map) return;
	const container = _resolveMapContainer(map.getContainer());
	if (!container) return;
	map.container = container;
	this[map.containerProp] = container;
	const items = map.getItems();
	this[GEA_SYNC_ITEMS](container, Array.isArray(items) ? items : [], map.createItem, map.keyProp);
};
Component.prototype[GEA_SYNC_ITEMS] = function(container, items, createItemFn, keyProp) {
	const itemKey = typeof keyProp === "function" ? keyProp : (item, _index) => {
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
			const aid = _itemId(n);
			if (aid != null) prev.push(aid);
		} else if (_isSentinel(n)) break;
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
				while (child && (child.nodeType !== 1 || _itemId(child) == null)) {
					if (_isSentinel(child)) break;
					child = child.nextSibling;
				}
				if (!child || child.nodeType !== 1) break;
				const oldEl = child;
				child = child.nextSibling;
				const newEl = createItemFn(items[j], j);
				Component[GEA_PATCH_NODE](oldEl, newEl, true);
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
			const frag = _frag();
			for (let j = prev.length; j < items.length; j++) frag.appendChild(createItemFn(items[j], j));
			Component[GEA_SYNC_VALUE_PROPS](frag);
			let marker = null;
			for (let sc = container.firstChild; sc; sc = sc.nextSibling) if (_isSentinel(sc)) {
				marker = sc;
				break;
			}
			container.insertBefore(frag, marker);
			_updateMapState(c, items);
			return;
		}
	}
	if (items.length < prev.length) {
		const newSet = /* @__PURE__ */ new Set();
		for (let j = 0; j < items.length; j++) newSet.add(itemKey(items[j], j));
		const removals = [];
		for (let sc = container.firstChild; sc; sc = sc.nextSibling) if (sc.nodeType === 1) {
			const aid = _itemId(sc);
			if (aid != null && !newSet.has(aid)) removals.push(sc);
		} else if (_isSentinel(sc)) break;
		if (removals.length === prev.length - items.length) {
			for (let j = 0; j < removals.length; j++) container.removeChild(removals[j]);
			_updateMapState(c, items);
			return;
		}
	}
	let oldCount = c[GEA_MAP_CONFIG_COUNT];
	if (oldCount == null || oldCount === 0 && container.firstChild) {
		oldCount = 0;
		for (let n = container.firstChild; n; n = n.nextSibling) if (n.nodeType === 1) oldCount++;
		else if (_isSentinel(n)) break;
	}
	let toRemove = oldCount;
	while (toRemove > 0 && container.firstChild) {
		const rm = container.firstChild;
		if (rm.nodeType === 1) toRemove--;
		container.removeChild(rm);
	}
	const fragment = _frag();
	for (let i = 0; i < items.length; i++) fragment.appendChild(createItemFn(items[i], i));
	Component[GEA_SYNC_VALUE_PROPS](fragment);
	container.insertBefore(fragment, container.firstChild);
	_updateMapState(c, items);
};
Component.prototype[GEA_CLONE_ITEM] = function(container, item, renderFn, bindingId, itemIdProp, patches) {
	const c = container, idProp = itemIdProp || "id";
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
		const p = patches[i], path = p[0], type = p[1], val = p[2];
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
};
Component.prototype[GEA_REQUEST_RENDER] = function() {
	const _i = getComponentInternals(this);
	const eng = engineThis(this);
	const el = eng[GEA_ELEMENT];
	if (!el || !el.parentNode) return;
	const parent = el.parentNode;
	const a = document.activeElement;
	const hasFocus = a && el.contains(a);
	const focusId = hasFocus && a.id ? a.id : null;
	const focusIsRoot = hasFocus && a === el;
	const selStart = hasFocus && "selectionStart" in a ? a.selectionStart ?? null : null;
	const selEnd = hasFocus && "selectionStart" in a ? a.selectionEnd ?? null : null;
	const focusVal = hasFocus && "value" in a ? String(a.value ?? "") : null;
	this[GEA_CLEANUP_BINDINGS]();
	this[GEA_TEARDOWN_SELF_LISTENERS]();
	for (const child of _i.childComponents) {
		if (!child) continue;
		if (child[GEA_COMPILED_CHILD]) {
			child[GEA_RENDERED] = false;
			engineThis(child)[GEA_ELEMENT] = null;
			const resetTree = (c) => {
				if (!getComponentInternals(c).childComponents?.length) return;
				for (const ch of getComponentInternals(c).childComponents) {
					if (!ch) continue;
					ch[GEA_RENDERED] = false;
					engineThis(ch)[GEA_ELEMENT] = null;
					resetTree(ch);
				}
			};
			resetTree(child);
		} else if (typeof child.dispose == "function") child.dispose();
	}
	_i.childComponents = [];
	_i.elCache.clear();
	this[GEA_RESET_ELS]?.();
	const placeholder = document.createComment("");
	try {
		if (el.parentNode === parent) el.replaceWith(placeholder);
		else parent.appendChild(placeholder);
	} catch {
		if (!placeholder.parentNode) parent.appendChild(placeholder);
	}
	const manager = _cm();
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
	_attachAndMount(this, true);
	for (const { store: s, path: p, config: c } of _i.listConfigs) {
		if (!c.items && c.itemsKey) c.items = this[c.itemsKey];
		if (!c.items) continue;
		const arr = p.reduce((obj, key) => obj?.[key], s[GEA_STORE_ROOT]) ?? [];
		if (arr.length === c.items.length) continue;
		const next = this[GEA_RECONCILE_LIST](c.items, arr, c.container(), c.Ctor, c.props, c.key, c.afterCondSlotIndex);
		c.items.length = 0;
		c.items.push(...next);
	}
	if (hasFocus) {
		const root = eng[GEA_ELEMENT];
		const t = focusId && _getEl(focusId) || (focusIsRoot ? root : null);
		if (t && root.contains(t)) {
			t.focus();
			if (selStart != null && selEnd != null && "setSelectionRange" in t) {
				const inp = t;
				const v = "value" in inp ? String(inp.value ?? "") : "";
				const d = focusVal != null && selStart === selEnd ? v.length - focusVal.length : 0;
				inp.setSelectionRange(Math.max(0, Math.min(v.length, selStart + d)), Math.max(0, Math.min(v.length, selEnd + d)));
			}
		}
	}
	this.onAfterRender();
	this.onAfterRenderHooks();
	setTimeout(() => requestAnimationFrame(() => this.onAfterRenderAsync()));
};
Component.prototype[GEA_APPLY_LIST_CHANGES] = function(container, array, changes, config) {
	if (changes && changes.length > 0 && changes[0].aipu && !config.hasComponentItems) {
		applyListChanges(container, array, changes, config);
		return;
	}
	const prevCount = container.childElementCount;
	applyListChanges(container, array, changes, config);
	if (container.childElementCount !== prevCount || config.hasComponentItems) this[GEA_INSTANTIATE_CHILD_COMPONENTS]();
};
Component.prototype[GEA_OBSERVE_LIST] = function(store, path, config) {
	getComponentInternals(this).listConfigs.push({
		store,
		path,
		config
	});
	this[GEA_OBSERVE](store, path, (_value, changes) => {
		_handleListChange(this, store[GEA_STORE_ROOT], path, config, changes);
	});
};
Component.prototype[GEA_REFRESH_LIST] = function(pathKey) {
	const configs = getComponentInternals(this).listConfigs;
	if (!configs?.length) return;
	for (const { store: s, path: p, config: c } of configs) {
		if (p.join(".") !== pathKey) continue;
		_handleListChange(this, s, p, c, null);
	}
};
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
const _lp = /* @__PURE__ */ new WeakMap();
function rawLink(l) {
	return l[GEA_PROXY_RAW] ?? l;
}
function lp(link) {
	const key = rawLink(link);
	let p = _lp.get(key);
	if (!p) {
		p = {
			clickHandler: null,
			observerRemover: null
		};
		_lp.set(key, p);
	}
	return p;
}
var Link = class Link extends Component {
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
		const p = lp(this);
		const prev = el.__geaLinkHandler;
		if (prev) el.removeEventListener("click", prev);
		if (p.observerRemover) {
			p.observerRemover();
			p.observerRemover = null;
		}
		p.clickHandler = (e) => {
			const to = this.props.to;
			if (!to) return;
			if (to.startsWith("http://") || to.startsWith("https://")) return;
			if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
			e.preventDefault();
			this.props.onNavigate?.(e);
			const router = Link._router;
			if (router) this.props.replace ? router.replace(to) : router.push(to);
		};
		el.__geaLinkHandler = p.clickHandler;
		el.addEventListener("click", p.clickHandler);
		const router = Link._router;
		if (router) {
			_updateActive(this, router);
			p.observerRemover = router.observe("path", () => _updateActive(this, router));
		}
	}
	dispose() {
		const el = this.el;
		if (el) {
			const prev = el.__geaLinkHandler;
			if (prev) {
				el.removeEventListener("click", prev);
				delete el.__geaLinkHandler;
			}
		}
		const p = lp(this);
		p.clickHandler = null;
		if (p.observerRemover) {
			p.observerRemover();
			p.observerRemover = null;
		}
		super.dispose();
	}
};
function _updateActive(link, router) {
	const el = link.el;
	if (!el) return;
	const to = link.props.to;
	const active = link.props.exact ? router.isExact(to) : router.isActive(to);
	if (active) el.setAttribute("data-active", "");
	else el.removeAttribute("data-active");
	const base = (el.getAttribute("class") ?? "").replace(/\bactive\b/g, "").replace(/\s+/g, " ").trim();
	const nextClass = active ? base ? `${base} active` : "active" : base;
	if (nextClass) el.setAttribute("class", nextClass);
	else el.removeAttribute("class");
}
//#endregion
//#region src/lib/router/outlet.ts
const _op = /* @__PURE__ */ new WeakMap();
function rawOutlet(o) {
	return o[GEA_PROXY_RAW] ?? o;
}
function op(outlet) {
	const key = rawOutlet(outlet);
	let p = _op.get(key);
	if (!p) {
		p = {
			currentChild: null,
			currentComponentClass: null,
			lastCacheKey: null,
			lastPath: void 0,
			observerRemovers: []
		};
		_op.set(key, p);
	}
	return p;
}
var Outlet = class extends Component {
	constructor(..._args) {
		super(..._args);
		this[GEA_ROUTER_DEPTH] = -1;
		this[GEA_ROUTER_REF] = null;
	}
	static {
		this._router = null;
	}
	template() {
		return `<div id="${this.id}"></div>`;
	}
	onAfterRender() {
		const p = op(this);
		const { depth, router } = _computeDepthAndRouter(this);
		this[GEA_ROUTER_DEPTH] = depth;
		if (router && router !== this[GEA_ROUTER_REF]) {
			for (const remove of p.observerRemovers) remove();
			p.observerRemovers = [];
			this[GEA_ROUTER_REF] = router;
		}
		if (p.observerRemovers.length === 0 && this[GEA_ROUTER_REF]) {
			const r = this[GEA_ROUTER_REF];
			const removePath = r.observe("path", () => _updateView$1(this, op(this)));
			const removeError = r.observe("error", () => _updateView$1(this, op(this)));
			const removeQuery = r.observe("query", () => _updateView$1(this, op(this)));
			p.observerRemovers.push(removePath, removeError, removeQuery);
		}
		_updateView$1(this, p);
	}
	dispose() {
		const p = op(this);
		for (const remove of p.observerRemovers) remove();
		p.observerRemovers = [];
		_clearCurrent$1(this, p);
		super.dispose();
	}
};
Object.defineProperty(Outlet.prototype, GEA_IS_ROUTER_OUTLET, {
	value: true,
	enumerable: false,
	configurable: true
});
function _computeDepthAndRouter(outlet) {
	let depth = 0;
	let router = null;
	let parent = engineThis(outlet)[GEA_PARENT_COMPONENT];
	while (parent) {
		if (parent[GEA_IS_ROUTER_OUTLET]) {
			depth = parent[GEA_ROUTER_DEPTH] + 1;
			router = parent[GEA_ROUTER_REF] ?? parent.props?.router ?? null;
			break;
		}
		parent = engineThis(parent)[GEA_PARENT_COMPONENT];
	}
	if (!router) router = Outlet._router;
	return {
		depth,
		router
	};
}
function _clearCurrent$1(outlet, p) {
	if (p.currentChild) {
		p.currentChild.dispose();
		p.currentChild = null;
		outlet[GEA_CHILD_COMPONENTS] = [];
	}
	p.currentComponentClass = null;
	p.lastCacheKey = null;
}
function _isClassComponent$1(comp) {
	if (!comp || typeof comp !== "function") return false;
	let proto = comp.prototype;
	while (proto) {
		if (proto === Component.prototype) return true;
		proto = Object.getPrototypeOf(proto);
	}
	return false;
}
function _updateView$1(outlet, p) {
	if (!outlet.el) return;
	const router = outlet[GEA_ROUTER_REF] ?? outlet.props?.router ?? Outlet._router;
	if (!router) return;
	if (p.currentChild && (!engineThis(p.currentChild)[GEA_ELEMENT] || !outlet.el.contains(engineThis(p.currentChild)[GEA_ELEMENT]))) _clearCurrent$1(outlet, p);
	const depth = outlet[GEA_ROUTER_DEPTH];
	const item = router.getComponentAtDepth(depth);
	if (!item) {
		_clearCurrent$1(outlet, p);
		return;
	}
	const isLeaf = depth >= router.layoutCount;
	const isSameComponent = p.currentComponentClass === item.component;
	if (isSameComponent && !isLeaf) {
		if (item.cacheKey === null || item.cacheKey === p.lastCacheKey) return;
	}
	if (isSameComponent && isLeaf) {
		p.lastCacheKey = item.cacheKey;
		p.lastPath = router.path;
		return;
	}
	_clearCurrent$1(outlet, p);
	if (_isClassComponent$1(item.component)) {
		const child = new item.component(item.props);
		engineThis(child)[GEA_PARENT_COMPONENT] = outlet;
		child.render(outlet.el);
		if (engineThis(child)[GEA_ELEMENT]) engineThis(child)[GEA_ELEMENT][GEA_DOM_COMPILED_CHILD_ROOT] = true;
		p.currentChild = child;
		p.currentComponentClass = item.component;
		outlet[GEA_CHILD_COMPONENTS] = [child];
	}
	p.lastCacheKey = item.cacheKey;
	p.lastPath = router.path;
}
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
const _rp = /* @__PURE__ */ new WeakMap();
function raw(r) {
	return r[GEA_PROXY_RAW] ?? r;
}
function rp(router) {
	return _rp.get(raw(router));
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
		this.routeConfig = routes ?? {};
		const p = {
			routes: routes ?? {},
			options: {
				base: options?.base ?? "",
				scroll: options?.scroll ?? false
			},
			currentComponent: null,
			guardComponent: null,
			guardProceed: null,
			popstateHandler: null,
			clickHandler: null,
			scrollPositions: /* @__PURE__ */ new Map(),
			historyIndex: 0,
			queryModes: /* @__PURE__ */ new Map(),
			layouts: []
		};
		_rp.set(raw(this), p);
		Link._router = this;
		Outlet._router = this;
		p.popstateHandler = (_e) => {
			_resolve(this);
		};
		window.addEventListener("popstate", p.popstateHandler);
		p.clickHandler = (e) => {
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
		document.addEventListener("click", p.clickHandler);
		_resolve(this);
	}
	setRoutes(routes) {
		rp(this).routes = routes;
		this.routeConfig = routes;
		if (typeof window !== "undefined") _resolve(this);
	}
	get page() {
		const p = rp(this);
		return p.guardComponent ?? p.currentComponent;
	}
	push(target) {
		_navigate(this, target, "push");
	}
	navigate(target) {
		this.push(target);
	}
	replace(target) {
		_navigate(this, target, "replace");
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
		return rp(this).layouts.length;
	}
	getComponentAtDepth(depth) {
		const p = rp(this);
		if (depth < p.layouts.length) {
			const layout = p.layouts[depth];
			const props = { ...this.params };
			props.route = this.route;
			const nextDepth = depth + 1;
			if (nextDepth < p.layouts.length) props.page = p.layouts[nextDepth];
			else props.page = p.guardComponent ?? p.currentComponent;
			let cacheKey = null;
			const modeInfo = p.queryModes.get(depth);
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
		if (depth === p.layouts.length) {
			const comp = p.guardComponent ?? p.currentComponent;
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
			const p = rp(this);
			if (p.popstateHandler) {
				window.removeEventListener("popstate", p.popstateHandler);
				p.popstateHandler = null;
			}
			if (p.clickHandler) {
				document.removeEventListener("click", p.clickHandler);
				p.clickHandler = null;
			}
		}
	}
};
function _navigate(router, target, method) {
	if (typeof window === "undefined") return;
	const p = rp(router);
	const { path, search, hash } = buildUrl(target);
	const fullPath = p.options.base + path + search + hash;
	if (method === "push") {
		if (window.location.pathname + window.location.search + window.location.hash === fullPath) return;
	}
	if (p.options.scroll && method === "push") p.scrollPositions.set(p.historyIndex, {
		x: window.scrollX ?? 0,
		y: window.scrollY ?? 0
	});
	if (method === "push") {
		p.historyIndex++;
		window.history.pushState({ index: p.historyIndex }, "", fullPath);
	} else window.history.replaceState({ index: p.historyIndex }, "", fullPath);
	_resolve(router);
	if (p.options.scroll && method === "push") window.scrollTo(0, 0);
}
function _resolve(router) {
	if (typeof window === "undefined") return;
	const p = rp(router);
	const base = p.options.base;
	let currentPath = window.location.pathname;
	const currentSearch = window.location.search;
	const currentHash = window.location.hash;
	if (base && currentPath.startsWith(base)) currentPath = currentPath.slice(base.length) || "/";
	const resolved = resolveRoute(p.routes, currentPath, currentSearch);
	if (resolved.redirect) {
		const redirectMethod = resolved.redirectMethod ?? "replace";
		_navigate(router, resolved.redirect, redirectMethod);
		return;
	}
	if (resolved.guards.length > 0) {
		const guardResult = runGuards(resolved.guards);
		if (guardResult !== true) {
			if (typeof guardResult === "string") {
				_navigate(router, guardResult, "replace");
				return;
			}
			p.guardComponent = guardResult;
			p.guardProceed = () => {
				p.guardComponent = null;
				p.guardProceed = null;
				_applyResolved(router, resolved, currentPath, currentSearch, currentHash);
			};
			router.path = currentPath;
			router.route = resolved.pattern;
			router.params = resolved.params;
			router.query = parseQuery(currentSearch);
			router.hash = currentHash;
			router.matches = resolved.matches;
			return;
		}
	}
	if (resolved.isLazy && resolved.lazyLoader) {
		const loader = resolved.lazyLoader;
		resolveLazy(loader).then((component) => {
			resolved.component = component;
			_applyResolved(router, resolved, currentPath, currentSearch, currentHash);
		}).catch((err) => {
			router.error = err?.message ?? "Failed to load route component";
			p.currentComponent = null;
			p.guardComponent = null;
			router.path = currentPath;
			router.route = resolved.pattern;
			router.params = resolved.params;
			router.query = parseQuery(currentSearch);
			router.hash = currentHash;
			router.matches = resolved.matches;
		});
		router.path = currentPath;
		router.route = resolved.pattern;
		router.params = resolved.params;
		router.query = parseQuery(currentSearch);
		router.hash = currentHash;
		router.matches = resolved.matches;
		return;
	}
	_applyResolved(router, resolved, currentPath, currentSearch, currentHash);
}
function _applyResolved(router, resolved, currentPath, currentSearch, currentHash) {
	const p = rp(router);
	p.guardComponent = null;
	p.currentComponent = resolved.component;
	p.layouts = resolved.layouts;
	p.queryModes = resolved.queryModes;
	router.error = null;
	router.path = currentPath;
	router.route = resolved.pattern;
	router.params = resolved.params;
	router.query = parseQuery(currentSearch);
	router.hash = currentHash;
	router.matches = resolved.matches;
}
//#endregion
//#region src/lib/router/router-view.ts
const _rvp = /* @__PURE__ */ new WeakMap();
function rawView(v) {
	return v[GEA_PROXY_RAW] ?? v;
}
function rvp(view) {
	const key = rawView(view);
	let p = _rvp.get(key);
	if (!p) {
		p = {
			currentChild: null,
			currentComponentClass: null,
			lastCacheKey: null,
			lastPath: void 0,
			observerRemovers: [],
			routesApplied: false
		};
		_rvp.set(key, p);
	}
	return p;
}
var RouterView = class extends Component {
	constructor(..._args) {
		super(..._args);
		this[GEA_ROUTER_DEPTH] = 0;
		this[GEA_ROUTER_REF] = null;
	}
	template() {
		return `<div id="${this.id}"></div>`;
	}
	onAfterRender() {
		const p = rvp(this);
		const router = this.props?.router ?? this[GEA_ROUTER_REF] ?? Outlet._router;
		if (!router) return;
		if (this.props?.routes && !p.routesApplied) {
			router.setRoutes(this.props.routes);
			p.routesApplied = true;
		}
		if (router !== this[GEA_ROUTER_REF]) _rebindRouter(this, p, router);
		else if (p.observerRemovers.length === 0) _rebindRouter(this, p, router);
		_updateView(this, p);
	}
	dispose() {
		const p = rvp(this);
		for (const remove of p.observerRemovers) remove();
		p.observerRemovers = [];
		_clearCurrent(this, p);
		this[GEA_ROUTER_REF] = null;
		super.dispose();
	}
};
Object.defineProperty(RouterView.prototype, GEA_IS_ROUTER_OUTLET, {
	value: true,
	enumerable: false,
	configurable: true
});
function _rebindRouter(view, p, router) {
	for (const remove of p.observerRemovers) remove();
	p.observerRemovers = [];
	view[GEA_ROUTER_REF] = router;
	const removePath = router.observe("path", () => _updateView(view, rvp(view)));
	const removeError = router.observe("error", () => _updateView(view, rvp(view)));
	const removeQuery = router.observe("query", () => _updateView(view, rvp(view)));
	p.observerRemovers.push(removePath, removeError, removeQuery);
}
function _clearCurrent(view, p) {
	if (p.currentChild) {
		p.currentChild.dispose();
		p.currentChild = null;
		view[GEA_CHILD_COMPONENTS] = [];
	}
	p.currentComponentClass = null;
	p.lastCacheKey = null;
}
function _isClassComponent(comp) {
	if (!comp || typeof comp !== "function") return false;
	let proto = comp.prototype;
	while (proto) {
		if (proto === Component.prototype) return true;
		proto = Object.getPrototypeOf(proto);
	}
	return false;
}
function _updateView(view, p) {
	if (!view.el) return;
	const router = view.props?.router ?? view[GEA_ROUTER_REF] ?? Outlet._router;
	if (!router) return;
	if (p.currentChild && (!engineThis(p.currentChild)[GEA_ELEMENT] || !view.el.contains(engineThis(p.currentChild)[GEA_ELEMENT]))) _clearCurrent(view, p);
	const item = router.getComponentAtDepth(0);
	if (!item) {
		_clearCurrent(view, p);
		return;
	}
	const isLeaf = 0 >= router.layoutCount;
	const isSameComponent = p.currentComponentClass === item.component;
	if (isSameComponent && !isLeaf) {
		if (item.cacheKey === null || item.cacheKey === p.lastCacheKey) return;
	}
	if (isSameComponent && isLeaf && router.path === p.lastPath) return;
	_clearCurrent(view, p);
	while (view.el.firstChild) view.el.removeChild(view.el.firstChild);
	if (_isClassComponent(item.component)) {
		const child = new item.component(item.props);
		engineThis(child)[GEA_PARENT_COMPONENT] = view;
		child.render(view.el);
		p.currentChild = child;
		p.currentComponentClass = item.component;
		view[GEA_CHILD_COMPONENTS] = [child];
	}
	p.lastCacheKey = item.cacheKey;
	p.lastPath = router.path;
}
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
export { Component, ComponentManager, GEA_APPLY_LIST_CHANGES, GEA_ATTACH_BINDINGS, GEA_ATTR_BINDINGS, GEA_BINDINGS, GEA_CHILD, GEA_CHILD_COMPONENTS, GEA_CLEANUP_BINDINGS, GEA_CLONE_ITEM, GEA_CLONE_TEMPLATE, GEA_COERCE_STATIC_PROP_VALUE, GEA_COMPILED_CHILD, GEA_COMPONENT_CLASSES, GEA_CONDS, GEA_CREATE_PROPS_PROXY, GEA_CTOR_AUTO_REGISTERED, GEA_CTOR_TAG_NAME, GEA_DEPENDENCIES, GEA_DOM_COMPILED_CHILD_ROOT, GEA_DOM_COMPONENT, GEA_DOM_EVENT_HINT, GEA_DOM_ITEM, GEA_DOM_KEY, GEA_DOM_PARENT_CHAIN, GEA_DOM_PROPS, GEA_EL, GEA_ELEMENT, GEA_EL_CACHE, GEA_ENSURE_ARRAY_CONFIGS, GEA_EVENT_BINDINGS, GEA_EXTRACT_COMPONENT_PROPS, GEA_HANDLE_ITEM_HANDLER, GEA_ID, GEA_INSTANTIATE_CHILD_COMPONENTS, GEA_IS_ROUTER_OUTLET, GEA_ITEM_KEY, GEA_LIST_CONFIGS, GEA_LIST_CONFIG_REFRESHING, GEA_MAPS, GEA_MAP_CONFIG_COUNT, GEA_MAP_CONFIG_PREV, GEA_MAP_CONFIG_TPL, GEA_MOUNT_COMPILED_CHILD_COMPONENTS, GEA_NORMALIZE_PROP_NAME, GEA_OBSERVE, GEA_OBSERVER_REMOVERS, GEA_OBSERVE_LIST, GEA_ON_PROP_CHANGE, GEA_PARENT_COMPONENT, GEA_PATCH_COND, GEA_PATCH_NODE, GEA_PROP_BINDINGS, GEA_PROP_BINDING_ATTR_PREFIX, GEA_PROXY_GET_PATH, GEA_PROXY_GET_RAW_TARGET, GEA_PROXY_GET_TARGET, GEA_PROXY_IS_PROXY, GEA_PROXY_RAW, GEA_RAW_PROPS, GEA_REACTIVE_PROPS, GEA_RECONCILE_LIST, GEA_REFRESH_LIST, GEA_REGISTER_COND, GEA_REGISTER_MAP, GEA_RENDERED, GEA_REORDER_CHILDREN, GEA_REQUEST_RENDER, GEA_RESET_CHILD_TREE, GEA_RESET_ELS, GEA_ROUTER_DEPTH, GEA_ROUTER_REF, GEA_SELF_LISTENERS, GEA_SELF_PROXY, GEA_SETUP_EVENT_DIRECTIVES, GEA_SETUP_LOCAL_STATE_OBSERVERS, GEA_SETUP_REFS, GEA_SKIP_ITEM_HANDLER, GEA_STATIC_ESCAPE_HTML, GEA_STATIC_SANITIZE_ATTR, GEA_STORE_GET_BROWSER_ROOT_PROXY_HANDLER_FOR_TESTS, GEA_STORE_ROOT, GEA_SWAP_CHILD, GEA_SWAP_STATE_CHILDREN, GEA_SYNC_AUTOFOCUS, GEA_SYNC_DOM_REFS, GEA_SYNC_ITEMS, GEA_SYNC_MAP, GEA_SYNC_UNRENDERED_LIST_ITEMS, GEA_SYNC_VALUE_PROPS, GEA_TEARDOWN_SELF_LISTENERS, GEA_UPDATE_PROPS, GEA_UPDATE_TEXT, Link, Outlet, Router, RouterView, Store, applyListChanges, clearUidProvider, createRouter, gea as default, findPropertyDescriptor, geaCondPatchedSymbol, geaCondValueSymbol, __escapeHtml as geaEscapeHtml, geaListItemsSymbol, geaPrevGuardSymbol, __sanitizeAttr as geaSanitizeAttr, h, isClassConstructorValue, matchRoute, resetUidCounter, rootDeleteProperty, rootGetValue, rootSetValue, router, setUidProvider, stashComponentForTransfer };

//# sourceMappingURL=index.mjs.map