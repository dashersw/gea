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
//#endregion
//#region src/lib/base/row-id.ts
/**
* Keyed `.map()` row roots use DOM `id` with a stable generated shape:
*   `${componentId}-${containerBindingId}-gk-${encodeURIComponent(itemKey)}`
* `-gk-` (gea key) separates the list binding segment from the encoded item key.
*/
const GEA_MAP_KEY_SEP = "-gk-";
/** Build a document-unique id for a keyed list row when the user did not set `id`. */
function geaBuildMapRowId(componentId, containerBindingId, itemKey) {
	return `${componentId}-${containerBindingId}${GEA_MAP_KEY_SEP}${encodeURIComponent(itemKey)}`;
}
/** Parse the logical item key from a generated row id, or return null if the shape does not match. */
function geaTryParseMapRowKeyFromId(fullId, componentId, containerBindingId) {
	const prefix = `${componentId}-${containerBindingId}${GEA_MAP_KEY_SEP}`;
	if (!fullId.startsWith(prefix)) return null;
	try {
		return decodeURIComponent(fullId.slice(prefix.length));
	} catch {
		return null;
	}
}
/** Parse the logical key from any generated row id (finds `-gk-` anywhere). */
function geaTryParseMapRowKeyFromGeneratedRowId(fullId) {
	const i = fullId.indexOf(GEA_MAP_KEY_SEP);
	if (i === -1) return null;
	try {
		return decodeURIComponent(fullId.slice(i + 4));
	} catch {
		return null;
	}
}
/** True if `id` was produced by {@link geaBuildMapRowId} for this list (prefix match). */
function geaIsGeneratedMapRowId(fullId, componentId, containerBindingId) {
	return fullId.startsWith(`${componentId}-${containerBindingId}${GEA_MAP_KEY_SEP}`);
}
/** Walk from `start` toward `root` and return the nearest map row root (delegated events). */
function geaFindDelegatedMapRow(start, root) {
	let n = start;
	while (n && n !== root) {
		if (n.nodeType === 1) {
			if (n.__geaItem !== void 0) return n;
			if (n.id && n.id.includes("-gk-")) return n;
		}
		n = n.parentElement;
	}
	return null;
}
/** String key used for `__itemHandlers_` lookup — matches row `id` (parsed `-gk-` segment or user id). */
function geaItemHandlerKeyFromRow(row) {
	if (!row.id) return null;
	return geaTryParseMapRowKeyFromGeneratedRowId(row.id) ?? row.id;
}
/** DOM row key for list reconciliation (matches `getKey` / encoded `id`). */
function geaDomRowKeyFromElement(row, getKey, index) {
	const it = row.__geaItem;
	if (it != null) return getKey(it, index);
	if (row.id) {
		const parsed = geaTryParseMapRowKeyFromGeneratedRowId(row.id);
		if (parsed != null) return parsed;
		return row.id;
	}
	return null;
}
/** Whether this element is likely a keyed list row (vs placeholder UI). */
function rowLooksLikeKeyedListRow(el) {
	if (el.nodeType !== 1) return false;
	const h = el;
	return h.__geaItem !== void 0 || !!h.id;
}
//#endregion
//#region src/lib/base/component-manager.ts
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
			const root = c.element_ ?? (typeof document !== "undefined" ? document.getElementById(c.id) : null);
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
	}
	onLoad() {
		this.loaded_ = true;
		this.addDocumentEventListeners_(this.getActiveDocumentEventTypes_());
		this.installConfiguredPlugins_();
		new MutationObserver((_mutations) => {
			for (const cmpId in this.componentsToRender) {
				const comp = this.componentsToRender[cmpId];
				if (comp.__geaCompiledChild) {
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
		if (ids = node.parentComps) {
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
			delete child.parentComps;
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
		child.parentComps = ids.join(",");
		return parentComps;
	}
	callHandlers(comps, eventsByComp, e, rootSteps, step) {
		let broken = false;
		for (let i = 0; i < comps.length; i++) {
			const comp = comps[i];
			if (!comp) continue;
			const rootStep = rootSteps[i];
			if (rootStep !== void 0 && step > rootStep) continue;
			if (this.callEventsGetterHandler(comp, e, eventsByComp[i]) === false) {
				broken = true;
				break;
			}
			if (this.callItemHandler(comp, e) === false) {
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
		const geaEvt = targetEl.getAttribute?.("data-gea-event");
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
		for (const selector in handlers) if (selector.charAt(0) === "#" ? targetEl.id === selector.slice(1) : targetEl.matches(selector)) {
			const handler = handlers[selector];
			if (typeof handler === "function") {
				const targetComponent = this.getOwningComponent(targetEl);
				Object.defineProperty(e, "currentTarget", {
					value: targetEl,
					configurable: true
				});
				if (handler.call(comp, e, targetComponent !== comp ? targetComponent : void 0) === false) return false;
			}
		}
		return true;
	}
	callItemHandler(comp, e) {
		if (!comp || typeof comp.__handleItemHandler !== "function") return true;
		const targetEl = e.targetEl;
		if (!targetEl || typeof targetEl.getAttribute !== "function") return true;
		const root = comp.element_ ?? comp.el;
		const itemEl = geaFindDelegatedMapRow(targetEl, root ?? null);
		if (itemEl && root && root.contains(itemEl)) {
			const itemId = geaItemHandlerKeyFromRow(itemEl);
			if (itemId != null) return comp.__handleItemHandler(itemId, e);
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
		if (ctor.__geaTagName && this.componentClassRegistry[ctor.__geaTagName]) return;
		const normalized = tagName || ctor.__geaTagName || this.generateTagName_(ctor);
		ctor.__geaTagName = normalized;
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
//#region src/lib/base/list.ts
function samePathParts$1(a, b) {
	if (!a || !b || a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
	return true;
}
function rebuildList(container, array, config) {
	if (array.length === 0) {
		if (container.textContent !== "") container.textContent = "";
		return;
	}
	if (config.render && !config.hasComponentItems) {
		const n = array.length;
		const parts = new Array(n);
		const render = config.render;
		for (let i = 0; i < n; i++) parts[i] = render(array[i], i);
		container.innerHTML = parts.join("");
		for (let i = 0; i < n; i++) {
			const row = container.children[i];
			if (row) row.__geaItem = array[i];
		}
		return;
	}
	const fragment = document.createDocumentFragment();
	for (let i = 0; i < array.length; i++) fragment.appendChild(config.create(array[i], i));
	if (container.textContent !== "") container.textContent = "";
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
	const rawItems = items && items.__getTarget ? items.__getTarget : items;
	let handledAny = false;
	for (let i = 0; i < changes.length; i++) {
		const change = changes[i];
		if (!change?.isArrayItemPropUpdate) continue;
		if (!samePathParts$1(change.arrayPathParts, config.arrayPathParts)) continue;
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
		const domKey = geaDomRowKeyFromElement(row, config.getKey, index);
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
	const items = proxiedItems && proxiedItems.__getTarget ? proxiedItems.__getTarget : proxiedItems;
	if (!changes || changes.length === 0) {
		rerenderListInPlace(container, items, config.create);
		return;
	}
	const firstChange = changes[0];
	if (firstChange?.type === "reorder" && samePathParts$1(firstChange.pathParts, config.arrayPathParts) && Array.isArray(firstChange.permutation)) {
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
	if ((firstChange?.type === "update" || firstChange?.type === "add") && samePathParts$1(firstChange.pathParts, config.arrayPathParts)) {
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
		if (firstChild && !rowLooksLikeKeyedListRow(firstChild)) {
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
//#region src/lib/store.ts
function createObserverNode(pathParts) {
	return {
		pathParts,
		handlers: /* @__PURE__ */ new Set(),
		children: /* @__PURE__ */ new Map()
	};
}
function splitPath(path) {
	if (Array.isArray(path)) return path;
	return path ? path.split(".") : [];
}
function appendPathParts(pathParts, propStr) {
	return pathParts.length > 0 ? [...pathParts, propStr] : [propStr];
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
		const p = mkProxy(arr[i], nextPath, appendPathParts(baseParts, String(i)));
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
function samePathParts(a, b) {
	if (!a || !b || a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
	return true;
}
function isArrayIndexUpdate(change) {
	return change && change.type === "update" && Array.isArray(change.target) && isNumericIndex(change.property);
}
function isReciprocalSwap(a, b) {
	if (!isArrayIndexUpdate(a) || !isArrayIndexUpdate(b)) return false;
	if (a.target !== b.target || a.property === b.property) return false;
	if (!samePathParts(a.pathParts.slice(0, -1), b.pathParts.slice(0, -1))) return false;
	return a.previousValue === b.newValue && b.previousValue === a.newValue;
}
/** Props that must bypass Store reactivity (compiler/runtime internals on Component). */
const INTERNAL_PROPS = new Set([
	"props",
	"actions",
	"parentComponent",
	"events"
]);
function isInternalProp(prop) {
	if (prop.charCodeAt(0) === 95) return true;
	if (prop.charCodeAt(prop.length - 1) === 95) return true;
	return INTERNAL_PROPS.has(prop);
}
/**
* Nested paths that must not be wrapped in reactive proxies (delegated event maps,
* compiler-generated plain objects, etc.).
*/
function shouldSkipReactiveWrapForPath(basePath) {
	if (basePath === "events" || basePath.startsWith("events.")) return true;
	return false;
}
function rootGetValue(t, prop, receiver) {
	if (!Object.prototype.hasOwnProperty.call(t, prop)) return Reflect.get(t, prop, receiver);
	const value = t[prop];
	if (typeof value === "function") return value;
	if (value !== null && value !== void 0 && typeof value === "object") {
		if (Object.getPrototypeOf(value) !== Object.prototype && !Array.isArray(value)) return value;
		if (shouldSkipReactiveWrapForPath(prop)) return value;
		const entry = t._topLevelProxies.get(prop);
		if (entry && entry[0] === value) return entry[1];
		const p = t._createProxy(value, prop, [prop]);
		t._topLevelProxies.set(prop, [value, p]);
		return p;
	}
	return value;
}
function rootSetValue(t, prop, value) {
	if (typeof value === "function") {
		t[prop] = value;
		return true;
	}
	if (value && typeof value === "object" && value.__isProxy) {
		const raw = value.__getTarget;
		if (raw !== void 0) value = raw;
	}
	const hadProp = Object.prototype.hasOwnProperty.call(t, prop);
	const oldValue = hadProp ? t[prop] : void 0;
	if (hadProp && oldValue === value) return true;
	if (oldValue && typeof oldValue === "object") {
		t._proxyCache.delete(oldValue);
		t._clearArrayIndexCache(oldValue);
	}
	t._topLevelProxies.delete(prop);
	t[prop] = value;
	if (Array.isArray(oldValue) && Array.isArray(value) && value.length > oldValue.length) {
		let isAppend = true;
		for (let i = 0; i < oldValue.length; i++) if (oldValue[i] !== value[i]) {
			isAppend = false;
			break;
		}
		if (isAppend) {
			const start = oldValue.length;
			t._emitChanges([{
				type: "append",
				property: prop,
				target: t,
				pathParts: [prop],
				start,
				count: value.length - start,
				newValue: value.slice(start)
			}]);
			return true;
		}
	}
	t._emitChanges([{
		type: hadProp ? "update" : "add",
		property: prop,
		target: t,
		pathParts: [prop],
		newValue: value,
		previousValue: oldValue
	}]);
	return true;
}
function rootDeleteProperty(t, prop) {
	if (!Object.prototype.hasOwnProperty.call(t, prop)) return true;
	const oldValue = t[prop];
	if (oldValue && typeof oldValue === "object") {
		t._proxyCache.delete(oldValue);
		t._clearArrayIndexCache(oldValue);
	}
	t._topLevelProxies.delete(prop);
	delete t[prop];
	t._emitChanges([{
		type: "delete",
		property: prop,
		target: t,
		pathParts: [prop],
		previousValue: oldValue
	}]);
	return true;
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
		this._noDirectTopLevelValue = Symbol("noDirectTopLevelValue");
	}
	static {
		this._rootProxyHandlerFactory = null;
	}
	static _getBrowserRootProxyHandler() {
		if (!Store._browserRootProxyHandler) Store._browserRootProxyHandler = {
			get(t, prop, receiver) {
				if (typeof prop === "symbol") return Reflect.get(t, prop, receiver);
				if (prop === "__isProxy") return true;
				if (prop === "__raw") return t;
				if (prop === "__getRawTarget") return t;
				if (isInternalProp(prop)) return Reflect.get(t, prop, receiver);
				return rootGetValue(t, prop, receiver);
			},
			set(t, prop, value) {
				if (typeof prop === "symbol") {
					t[prop] = value;
					return true;
				}
				if (isInternalProp(prop)) {
					t[prop] = value;
					return true;
				}
				return rootSetValue(t, prop, value);
			},
			deleteProperty(t, prop) {
				if (typeof prop === "symbol") {
					delete t[prop];
					return true;
				}
				if (isInternalProp(prop)) {
					delete t[prop];
					return true;
				}
				return rootDeleteProperty(t, prop);
			},
			defineProperty(t, prop, descriptor) {
				return Reflect.defineProperty(t, prop, descriptor);
			}
		};
		return Store._browserRootProxyHandler;
	}
	constructor(initialData) {
		this._pendingChanges = [];
		this._flushScheduled = false;
		this._nextArrayOpId = 0;
		this._observerRoot = createObserverNode([]);
		this._proxyCache = /* @__PURE__ */ new WeakMap();
		this._arrayIndexProxyCache = /* @__PURE__ */ new WeakMap();
		this._internedArrayPaths = /* @__PURE__ */ new Map();
		this._topLevelProxies = /* @__PURE__ */ new Map();
		this._pendingBatchKind = 0;
		this._pendingBatchArrayPathParts = null;
		this._flushChanges = () => {
			this._flushScheduled = false;
			const pendingBatch = this._pendingChanges;
			const pendingBatchKind = this._pendingBatchKind;
			const pendingBatchArrayPathParts = this._pendingBatchArrayPathParts;
			this._pendingChanges = [];
			this._pendingBatchKind = 0;
			this._pendingBatchArrayPathParts = null;
			if (pendingBatch.length === 0) return;
			if (pendingBatchKind === 1 && pendingBatchArrayPathParts && this._deliverKnownArrayItemPropBatch(pendingBatch, pendingBatchArrayPathParts)) return;
			if (this._deliverTopLevelBatch(pendingBatch)) return;
			const batch = this._normalizeBatch(pendingBatch);
			if (this._deliverArrayItemPropBatch(batch)) return;
			if (batch.length === 1) {
				const change = batch[0];
				const matches = this._collectMatchingObserverNodes(change.pathParts);
				this._addDescendantsForObjectReplacement(change, matches);
				for (let i = 0; i < matches.length; i++) this._notifyHandlers(matches[i], batch);
				return;
			}
			const deliveries = /* @__PURE__ */ new Map();
			for (let i = 0; i < batch.length; i++) {
				const change = batch[i];
				const matches = this._collectMatchingObserverNodes(change.pathParts);
				this._addDescendantsForObjectReplacement(change, matches);
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
			for (const [node, relevant] of deliveries) this._notifyHandlers(node, relevant);
		};
		const handler = Store._rootProxyHandlerFactory ? Store._rootProxyHandlerFactory() : Store._getBrowserRootProxyHandler();
		const proxy = new Proxy(this, handler);
		this._selfProxy = proxy;
		if (initialData) for (const key of Object.keys(initialData)) Object.defineProperty(this, key, {
			value: initialData[key],
			writable: true,
			enumerable: true,
			configurable: true
		});
		return proxy;
	}
	/** Used by vite plugin when passing store to components. Same as `this`. */
	get __store() {
		return this;
	}
	silent(fn) {
		try {
			fn();
		} finally {
			this._pendingChanges = [];
			this._flushScheduled = false;
			this._pendingBatchKind = 0;
			this._pendingBatchArrayPathParts = null;
		}
	}
	observe(path, handler) {
		const pathParts = splitPath(path);
		return this._addObserver(pathParts, handler);
	}
	_addObserver(pathParts, handler) {
		const nodes = [this._observerRoot];
		let node = this._observerRoot;
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
	_collectMatchingObserverNodes(pathParts) {
		const matches = [];
		let node = this._observerRoot;
		if (node.handlers.size > 0) matches.push(node);
		for (let i = 0; i < pathParts.length; i++) {
			node = node.children.get(pathParts[i]);
			if (!node) break;
			if (node.handlers.size > 0) matches.push(node);
		}
		return matches;
	}
	_collectDescendantObserverNodes(node, matches) {
		for (const child of node.children.values()) {
			if (child.handlers.size > 0) matches.push(child);
			if (child.children.size > 0) this._collectDescendantObserverNodes(child, matches);
		}
	}
	/** When a property is replaced with a new object, descendant observers
	*  must be notified because their nested values may have changed. */
	_addDescendantsForObjectReplacement(change, matches) {
		if ((change.type === "update" || change.type === "add") && change.newValue && typeof change.newValue === "object") {
			const node = this._getObserverNode(change.pathParts);
			if (node && node.children.size > 0) this._collectDescendantObserverNodes(node, matches);
		}
	}
	_getObserverNode(pathParts) {
		let node = this._observerRoot;
		for (let i = 0; i < pathParts.length; i++) {
			node = node.children.get(pathParts[i]);
			if (!node) return null;
		}
		return node;
	}
	_collectMatchingObserverNodesFromNode(startNode, pathParts, offset) {
		const matches = [];
		let node = startNode;
		for (let i = offset; i < pathParts.length; i++) {
			node = node.children.get(pathParts[i]);
			if (!node) break;
			if (node.handlers.size > 0) matches.push(node);
		}
		return matches;
	}
	_notifyHandlers(node, relevant) {
		const value = getByPathParts(this, node.pathParts);
		for (const handler of node.handlers) try {
			handler(value, relevant);
		} catch (e) {
			console.error("[Gea Store] Observer threw:", e);
		}
	}
	_notifyHandlersWithValue(node, value, relevant) {
		for (const handler of node.handlers) try {
			handler(value, relevant);
		} catch (e) {
			console.error("[Gea Store] Observer threw:", e);
		}
	}
	_getDirectTopLevelObservedValue(change) {
		const nextValue = change.newValue;
		if (Array.isArray(nextValue) && nextValue.length === 0) return nextValue;
		return Store._noDirectTopLevelValue;
	}
	_getTopLevelObservedValue(change) {
		if (change.type === "delete") return void 0;
		const value = this[change.property];
		if (value === null || value === void 0 || typeof value !== "object") return value;
		if (Object.getPrototypeOf(value) !== Object.prototype && !Array.isArray(value)) return value;
		const entry = this._topLevelProxies.get(change.property);
		if (entry && entry[0] === value) return entry[1];
		const proxy = this._createProxy(value, change.property, [change.property]);
		this._topLevelProxies.set(change.property, [value, proxy]);
		return proxy;
	}
	_clearArrayIndexCache(arr) {
		if (arr && typeof arr === "object") this._arrayIndexProxyCache.delete(arr);
	}
	_normalizeBatch(batch) {
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
				const opId = `swap:${this._nextArrayOpId++}`;
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
	_deliverArrayItemPropBatch(batch) {
		if (!batch[0]?.isArrayItemPropUpdate) return false;
		const arrayPathParts = batch[0].arrayPathParts;
		let allSameArray = true;
		for (let i = 1; i < batch.length; i++) {
			const change = batch[i];
			if (!change.isArrayItemPropUpdate || change.arrayPathParts !== arrayPathParts && !samePathParts(change.arrayPathParts, arrayPathParts)) {
				allSameArray = false;
				break;
			}
		}
		if (!allSameArray) return false;
		return this._deliverKnownArrayItemPropBatch(batch, arrayPathParts);
	}
	_deliverKnownArrayItemPropBatch(batch, arrayPathParts) {
		const arrayNode = this._getObserverNode(arrayPathParts);
		if (this._observerRoot.handlers.size === 0 && arrayNode && arrayNode.children.size === 0 && arrayNode.handlers.size > 0) {
			this._notifyHandlers(arrayNode, batch);
			return true;
		}
		const commonMatches = this._collectMatchingObserverNodes(arrayPathParts);
		for (let i = 0; i < commonMatches.length; i++) this._notifyHandlers(commonMatches[i], batch);
		if (!arrayNode || arrayNode.children.size === 0) return true;
		const deliveries = /* @__PURE__ */ new Map();
		const suffixOffset = arrayPathParts.length;
		for (let i = 0; i < batch.length; i++) {
			const change = batch[i];
			const matches = this._collectMatchingObserverNodesFromNode(arrayNode, change.pathParts, suffixOffset);
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
		for (const [node, relevant] of deliveries) this._notifyHandlers(node, relevant);
		return true;
	}
	_deliverTopLevelBatch(batch) {
		if (this._observerRoot.handlers.size > 0) return false;
		const deliveries = /* @__PURE__ */ new Map();
		for (let i = 0; i < batch.length; i++) {
			const change = batch[i];
			if (change.target !== this || change.pathParts.length !== 1) return false;
			const node = this._observerRoot.children.get(change.property);
			if (!node) continue;
			if (node.children.size > 0) return false;
			if (node.handlers.size === 0) continue;
			let delivery = deliveries.get(node);
			if (!delivery) {
				const directValue = this._getDirectTopLevelObservedValue(change);
				delivery = {
					value: directValue !== Store._noDirectTopLevelValue ? directValue : this._getTopLevelObservedValue(change),
					relevant: []
				};
				deliveries.set(node, delivery);
			}
			delivery.relevant.push(change);
		}
		for (const [node, delivery] of deliveries) this._notifyHandlersWithValue(node, delivery.value, delivery.relevant);
		return true;
	}
	_emitChanges(changes) {
		for (let i = 0; i < changes.length; i++) this._queueChange(changes[i]);
		this._scheduleFlush();
	}
	_queueChange(change) {
		this._pendingChanges.push(change);
		this._trackPendingChange(change);
	}
	_trackPendingChange(change) {
		if (this._pendingBatchKind === 2) return;
		if (!change.isArrayItemPropUpdate || !change.arrayPathParts) {
			this._pendingBatchKind = 2;
			this._pendingBatchArrayPathParts = null;
			return;
		}
		if (this._pendingBatchKind === 0) {
			this._pendingBatchKind = 1;
			this._pendingBatchArrayPathParts = change.arrayPathParts;
			return;
		}
		const pendingArrayPathParts = this._pendingBatchArrayPathParts;
		if (pendingArrayPathParts !== change.arrayPathParts && !samePathParts(pendingArrayPathParts, change.arrayPathParts)) {
			this._pendingBatchKind = 2;
			this._pendingBatchArrayPathParts = null;
		}
	}
	_scheduleFlush() {
		if (!this._flushScheduled) {
			this._flushScheduled = true;
			queueMicrotask(this._flushChanges);
		}
	}
	_queueDirectArrayItemPrimitiveChange(target, property, value, previousValue, isNew, arrayMeta, getPathParts, getLeafPathParts) {
		this._queueChange({
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
		});
		this._scheduleFlush();
	}
	_interceptArrayMethod(arr, method, _basePath, baseParts) {
		const store = this;
		switch (method) {
			case "splice": return function(...args) {
				store._clearArrayIndexCache(arr);
				const len = arr.length;
				const rawStart = args[0] ?? 0;
				const start = rawStart < 0 ? Math.max(len + rawStart, 0) : Math.min(rawStart, len);
				const deleteCount = args.length < 2 ? len - start : Math.min(Math.max(args[1] ?? 0, 0), len - start);
				const items = args.slice(2).map((v) => v && typeof v === "object" && v.__isProxy ? v.__getTarget : v);
				const removed = arr.slice(start, start + deleteCount);
				Array.prototype.splice.call(arr, start, deleteCount, ...items);
				if (deleteCount === 0 && items.length > 0 && start === len) {
					store._emitChanges([{
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
				if (changes.length > 0) store._emitChanges(changes);
				return removed;
			};
			case "push": return function(...items) {
				store._clearArrayIndexCache(arr);
				const rawItems = items.map((v) => v && typeof v === "object" && v.__isProxy ? v.__getTarget : v);
				const startIndex = arr.length;
				Array.prototype.push.apply(arr, rawItems);
				if (rawItems.length > 0) store._emitChanges([{
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
				store._clearArrayIndexCache(arr);
				const idx = method === "pop" ? arr.length - 1 : 0;
				const removed = arr[idx];
				if (method === "pop") Array.prototype.pop.call(arr);
				else Array.prototype.shift.call(arr);
				store._emitChanges([{
					type: "delete",
					property: String(idx),
					target: arr,
					pathParts: appendPathParts(baseParts, String(idx)),
					previousValue: removed
				}]);
				return removed;
			};
			case "unshift": return function(...items) {
				store._clearArrayIndexCache(arr);
				const rawItems = items.map((v) => v && typeof v === "object" && v.__isProxy ? v.__getTarget : v);
				Array.prototype.unshift.apply(arr, rawItems);
				const changes = [];
				for (let i = 0; i < rawItems.length; i++) changes.push({
					type: "add",
					property: String(i),
					target: arr,
					pathParts: appendPathParts(baseParts, String(i)),
					newValue: rawItems[i]
				});
				if (changes.length > 0) store._emitChanges(changes);
				return arr.length;
			};
			case "sort":
			case "reverse": return function(...args) {
				store._clearArrayIndexCache(arr);
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
				store._emitChanges([{
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
	_interceptArrayIterator(arr, method, basePath, baseParts, mkProxy) {
		switch (method) {
			case "indexOf":
			case "includes": {
				const native = method === "indexOf" ? Array.prototype.indexOf : Array.prototype.includes;
				return function(searchElement, fromIndex) {
					const raw = searchElement && typeof searchElement === "object" && searchElement.__isProxy ? searchElement.__getTarget : searchElement;
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
					const p = mkProxy(arr[i], nextPath, appendPathParts(baseParts, String(i)));
					acc = cb(acc, p, i, arr);
				}
				return acc;
			};
			default: return null;
		}
	}
	_getCachedArrayMeta(baseParts) {
		for (let i = baseParts.length - 1; i >= 0; i--) {
			if (!isNumericIndex(baseParts[i])) continue;
			let internKey;
			let interned;
			if (i === 1) {
				internKey = baseParts[0];
				interned = this._internedArrayPaths.get(internKey);
				if (!interned) {
					interned = [baseParts[0]];
					this._internedArrayPaths.set(internKey, interned);
				}
			} else {
				internKey = baseParts.slice(0, i).join("\0");
				interned = this._internedArrayPaths.get(internKey);
				if (!interned) {
					interned = baseParts.slice(0, i);
					this._internedArrayPaths.set(internKey, interned);
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
	_createProxy(target, basePath, baseParts = [], arrayMeta) {
		if (!target || typeof target !== "object") return target;
		if (!Array.isArray(target)) {
			const cached = this._proxyCache.get(target);
			if (cached) return cached;
		}
		const store = this;
		const cachedArrayMeta = arrayMeta ?? store._getCachedArrayMeta(baseParts);
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
		const createProxy = (t, bp, bps, nextArrayMeta) => store._createProxy(t, bp, bps, nextArrayMeta);
		const proxy = new Proxy(target, {
			get(obj, prop) {
				if (typeof prop === "symbol") return obj[prop];
				if (prop.charCodeAt(0) === 95 && prop.charCodeAt(1) === 95) {
					if (prop === "__getTarget") return obj;
					if (prop === "__isProxy") return true;
					if (prop === "__raw") return obj;
					if (prop === "__getPath") return basePath;
					if (prop === "__store") return store._selfProxy || store;
				}
				const value = obj[prop];
				if (value === null || value === void 0) return value;
				const valType = typeof value;
				if (valType !== "object" && valType !== "function") return value;
				if (Array.isArray(obj) && valType === "function") {
					if (prop === "constructor") return value;
					if (!methodCache) methodCache = /* @__PURE__ */ new Map();
					let cached = methodCache.get(prop);
					if (cached !== void 0) return cached;
					cached = store._interceptArrayMethod(obj, prop, basePath, baseParts) || store._interceptArrayIterator(obj, prop, basePath, baseParts, createProxy) || value.bind(obj);
					methodCache.set(prop, cached);
					return cached;
				}
				if (valType === "object") {
					if (shouldSkipReactiveWrapForPath(basePath)) return value;
					if (Array.isArray(obj) && isNumericIndex(prop)) {
						const indexCache = store._arrayIndexProxyCache.get(obj);
						if (indexCache) {
							const cached = indexCache.get(prop);
							if (cached) return cached;
						}
					} else {
						const cached = store._proxyCache.get(value);
						if (cached) return cached;
					}
					if (Object.getPrototypeOf(value) !== Object.prototype && !Array.isArray(value)) return value;
					if (Array.isArray(obj) && isNumericIndex(prop)) {
						let indexCache = store._arrayIndexProxyCache.get(obj);
						if (!indexCache) {
							indexCache = /* @__PURE__ */ new Map();
							store._arrayIndexProxyCache.set(obj, indexCache);
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
					store._proxyCache.set(value, created);
					return created;
				}
				if (prop === "constructor") return value;
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
						store._proxyCache.delete(oldValue);
						store._clearArrayIndexCache(oldValue);
					}
					obj[prop] = value;
					if (cachedArrayMeta && cachedArrayMeta.baseTail.length === 0) {
						store._queueDirectArrayItemPrimitiveChange(obj, prop, value, oldValue, isNew, cachedArrayMeta, getCachedPathParts, getCachedLeafPathParts);
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
					store._queueChange(change);
					store._scheduleFlush();
					return true;
				}
				if (value.__isProxy) {
					const raw = value.__getTarget;
					if (raw !== void 0) value = raw;
				}
				if (prop === "length" && Array.isArray(obj)) {
					store._clearArrayIndexCache(obj);
					obj[prop] = value;
					return true;
				}
				const isNew = !Object.prototype.hasOwnProperty.call(obj, prop);
				if (Array.isArray(obj) && isNumericIndex(prop)) store._clearArrayIndexCache(obj);
				if (oldValue && typeof oldValue === "object") {
					store._proxyCache.delete(oldValue);
					store._clearArrayIndexCache(oldValue);
				}
				obj[prop] = value;
				if (Array.isArray(oldValue) && Array.isArray(value) && value.length > oldValue.length) {
					let isAppend = true;
					for (let i = 0; i < oldValue.length; i++) {
						let o = oldValue[i];
						let v = value[i];
						if (o && o.__isProxy) o = o.__getTarget;
						if (v && v.__isProxy) v = v.__getTarget;
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
						store._queueChange(change);
						store._scheduleFlush();
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
				store._queueChange(change);
				store._scheduleFlush();
				return true;
			},
			deleteProperty(obj, prop) {
				if (typeof prop === "symbol") {
					delete obj[prop];
					return true;
				}
				const oldValue = obj[prop];
				if (Array.isArray(obj) && isNumericIndex(prop)) store._clearArrayIndexCache(obj);
				if (oldValue && typeof oldValue === "object") {
					store._proxyCache.delete(oldValue);
					store._clearArrayIndexCache(oldValue);
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
				store._queueChange(change);
				store._scheduleFlush();
				return true;
			}
		});
		if (!Array.isArray(target)) this._proxyCache.set(target, proxy);
		return proxy;
	}
};
//#endregion
//#region src/lib/base/component.tsx
/**
* Declared React `Component` surface + `render(): ReactNode` overload so Gea classes are valid JSX class
* tags while `JSX.IntrinsicElements` is sourced from `@types/react`. Runtime is still Gea-only.
*/
var Component = class Component extends Store {
	static {
		this.__componentClasses = /* @__PURE__ */ new Map();
	}
	constructor(props = {}, _unusedReactContext) {
		super();
		this.__rawProps_ = {};
		this.__elCache = /* @__PURE__ */ new Map();
		this.id_ = ComponentManager.getInstance().getUid();
		this.element_ = null;
		this.__bindings = [];
		this.__selfListeners = [];
		this.__childComponents = [];
		this.actions = void 0;
		this.__geaDependencies = [];
		this.__geaEventBindings = /* @__PURE__ */ new Map();
		this.__geaPropBindings = /* @__PURE__ */ new Map();
		this.__geaAttrBindings = /* @__PURE__ */ new Map();
		this.__observer_removers__ = [];
		const Ctor = this.constructor;
		ComponentManager.getInstance().registerComponentClass(Ctor);
		Component.__componentClasses.set(Ctor.name, Ctor);
		this.rendered_ = false;
		let _rawProps = props || {};
		let _propsProxy = this.__createPropsProxy(_rawProps);
		this.__rawProps_ = _rawProps;
		Object.defineProperty(this, "props", {
			get: () => _propsProxy,
			set: (newProps) => {
				_rawProps = newProps || {};
				_propsProxy = this.__createPropsProxy(_rawProps);
				this.__rawProps_ = _rawProps;
			},
			configurable: true,
			enumerable: true
		});
		ComponentManager.getInstance().setComponent(this);
		this.created(this.props);
		this.createdHooks(this.props);
		if (typeof this.__setupLocalStateObservers === "function") this.__setupLocalStateObservers();
	}
	created(_props) {}
	createdHooks(_props) {}
	get id() {
		return this.id_;
	}
	get el() {
		if (!this.element_) {
			const cloneFn = this.__cloneTemplate;
			if (typeof cloneFn === "function") this.element_ = cloneFn.call(this);
			else {
				const existing = document.getElementById(this.id_);
				if (existing) this.element_ = existing;
				else this.element_ = ComponentManager.getInstance().createElement(String(this.template(this.props)).trim());
			}
		}
		return this.element_;
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
		const el = this.element_;
		if (el) rv = selector == void 0 || selector === ":scope" ? el : el.querySelector(selector);
		return rv;
	}
	__applyListChanges(container, array, changes, config) {
		const prevCount = container.childElementCount;
		applyListChanges(container, array, changes, config);
		if (container.childElementCount !== prevCount || config.hasComponentItems) this.instantiateChildComponents_();
	}
	render(rootEl, opt_index = Infinity) {
		if (this.rendered_) return true;
		this.element_ = this.el;
		if (rootEl) {
			if (opt_index < 0) opt_index = Infinity;
			if (rootEl != this.element_.parentElement) rootEl.insertBefore(this.element_, rootEl.children[opt_index]);
			else {
				let newIndex = opt_index;
				let elementIndex = 0;
				let t = this.element_;
				while (t = t.previousElementSibling) elementIndex++;
				if (elementIndex < newIndex) newIndex++;
				if (!(elementIndex == newIndex || newIndex >= rootEl.childElementCount && this.element_ == rootEl.lastElementChild)) rootEl.insertBefore(this.element_, rootEl.children[newIndex]);
			}
		}
		this.rendered_ = true;
		if (this.element_) this.element_.__geaComponent = this;
		ComponentManager.getInstance().markComponentRendered(this);
		this.attachBindings_();
		this.mountCompiledChildComponents_();
		this.instantiateChildComponents_();
		this.setupEventDirectives_();
		if (typeof this.__setupRefs === "function") this.__setupRefs();
		this.onAfterRender();
		this.onAfterRenderHooks();
		this.__syncUnrenderedListItems();
		requestAnimationFrame(() => this.onAfterRenderAsync());
		return true;
	}
	get rendered() {
		return this.rendered_;
	}
	onAfterRender() {}
	onAfterRenderAsync() {}
	onAfterRenderHooks() {}
	/** Render pre-created list items that weren't mounted during construction
	*  (e.g. component was a lazy child inside a conditional slot). */
	__syncUnrenderedListItems() {
		const configs = this.__geaListConfigs;
		if (!configs) return;
		for (const { config: c } of configs) {
			if (!c.items && c.itemsKey) c.items = this[c.itemsKey];
			if (!c.items?.length) continue;
			const container = c.container();
			if (!container) continue;
			for (const item of c.items) if (!item.rendered_) item.render(container);
		}
	}
	__createPropsProxy(raw) {
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
				if (typeof component.__onPropChange === "function") {
					if (value !== prev || typeof prev === "object" && prev !== null) component.__onPropChange(prop, value);
				}
				return true;
			}
		});
	}
	__reactiveProps(obj) {
		return obj;
	}
	__geaUpdateProps(nextProps) {
		if (!this.rendered_) {
			const el = document.getElementById(this.id_);
			if (el) {
				this.element_ = el;
				this.rendered_ = true;
			}
		}
		if (typeof this.__onPropChange === "function") {
			const raw = this.__rawProps_;
			for (const key in nextProps) {
				const prev = raw[key];
				const next = nextProps[key];
				raw[key] = next;
				if (next !== prev || typeof prev === "object" && prev !== null) this.__onPropChange(key, next);
			}
		} else {
			for (const key in nextProps) this.props[key] = nextProps[key];
			this.__geaRequestRender();
		}
	}
	toString() {
		return String(this.template(this.props)).trim();
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
		if (this.element_) this.element_.__geaComponent = void 0;
		this.element_ && this.element_.parentNode && this.element_.parentNode.removeChild(this.element_);
		this.element_ = null;
		if (this.__observer_removers__) {
			this.__observer_removers__.forEach((fn) => fn());
			this.__observer_removers__ = [];
		}
		this.cleanupBindings_();
		this.teardownSelfListeners_();
		this.__childComponents.forEach((child) => child && child.dispose && child.dispose());
		this.__childComponents = [];
	}
	__geaRequestRender() {
		if (!this.element_ || !this.element_.parentNode) return;
		const parent = this.element_.parentNode;
		const activeElement = document.activeElement;
		const shouldRestoreFocus = Boolean(activeElement && this.element_.contains(activeElement));
		const focusedId = shouldRestoreFocus ? activeElement?.id || null : null;
		const restoreRootFocus = Boolean(shouldRestoreFocus && activeElement === this.element_);
		const selectionStart = shouldRestoreFocus && activeElement && "selectionStart" in activeElement ? activeElement.selectionStart ?? null : null;
		const selectionEnd = shouldRestoreFocus && activeElement && "selectionEnd" in activeElement ? activeElement.selectionEnd ?? null : null;
		const focusedValue = shouldRestoreFocus && activeElement && "value" in activeElement ? String(activeElement.value ?? "") : null;
		this.cleanupBindings_();
		this.teardownSelfListeners_();
		if (this.__childComponents && this.__childComponents.length) {
			this.__childComponents.forEach((child) => {
				if (!child) return;
				if (child["__geaCompiledChild"]) {
					child.rendered_ = false;
					child.element_ = null;
					this.__resetChildTree(child);
					return;
				}
				if (typeof child.dispose == "function") child.dispose();
			});
			this.__childComponents = [];
		}
		this.__elCache.clear();
		this.__resetEls?.();
		const placeholder = document.createComment("");
		parent.insertBefore(placeholder, this.element_);
		parent.removeChild(this.element_);
		const manager = ComponentManager.getInstance();
		const cloneFn = this.__cloneTemplate;
		const newElement = typeof cloneFn === "function" ? cloneFn.call(this) : manager.createElement(String(this.template(this.props)).trim());
		if (!newElement) {
			this.element_ = placeholder;
			this.rendered_ = true;
			return;
		}
		parent.replaceChild(newElement, placeholder);
		this.element_ = newElement;
		this.rendered_ = true;
		manager.markComponentRendered(this);
		this.attachBindings_();
		this.mountCompiledChildComponents_();
		this.instantiateChildComponents_();
		this.setupEventDirectives_();
		if (typeof this.__setupRefs === "function") this.__setupRefs();
		if (this.__geaListConfigs) for (const { store: s, path: p, config: c } of this.__geaListConfigs) {
			if (!c.items && c.itemsKey) c.items = this[c.itemsKey];
			if (!c.items) continue;
			const arr = p.reduce((obj, key) => obj?.[key], s.__store) ?? [];
			if (arr.length === c.items.length) continue;
			const oldByKey = /* @__PURE__ */ new Map();
			for (const item of c.items) if (item.__geaItemKey != null) oldByKey.set(item.__geaItemKey, item);
			const next = arr.map((data) => {
				const key = String(c.key(data));
				const existing = oldByKey.get(key);
				if (existing) {
					existing.__geaUpdateProps(c.props(data));
					oldByKey.delete(key);
					return existing;
				}
				return this.__child(c.Ctor, c.props(data), key);
			});
			c.items.length = 0;
			c.items.push(...next);
			const container = c.container();
			if (container) {
				for (const item of next) if (!item.rendered_) item.render(container);
			}
		}
		if (shouldRestoreFocus) {
			const focusTarget = (focusedId ? document.getElementById(focusedId) || null : null) || (restoreRootFocus ? this.element_ : null);
			if (focusTarget && this.element_.contains(focusTarget) && typeof focusTarget.focus === "function") {
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
	__resetChildTree(comp) {
		if (!comp.__childComponents) return;
		comp.__childComponents.forEach((c) => {
			if (!c) return;
			c.rendered_ = false;
			c.element_ = null;
			this.__resetChildTree(c);
		});
	}
	attachBindings_() {
		this.cleanupBindings_();
	}
	static _register(ctor) {
		if (!ctor || !ctor.name || ctor.__geaAutoRegistered) return;
		if (Object.getPrototypeOf(ctor.prototype) === Component.prototype) {
			ctor.__geaAutoRegistered = true;
			Component.__componentClasses.set(ctor.name, ctor);
			const manager = ComponentManager.getInstance();
			const tagName = manager.generateTagName_(ctor);
			manager.registerComponentClass(ctor, tagName);
		}
	}
	instantiateChildComponents_() {
		if (!this.element_) return;
		const manager = ComponentManager.getInstance();
		const selectors = manager.getComponentSelectors();
		let elements = [];
		if (selectors.length > 0) elements = Array.from(this.element_.querySelectorAll(selectors.join(",")));
		elements.forEach((el) => {
			if (el.getAttribute("data-gea-component-mounted")) return;
			if (el.__geaCompiledChildRoot) return;
			const ctorName = el.constructor.name;
			if (ctorName !== "HTMLUnknownElement" && ctorName !== "HTMLElement") return;
			const tagName = el.tagName.toLowerCase();
			let Ctor = manager.getComponentConstructor(tagName);
			if (!Ctor && Component.__componentClasses) {
				const pascalCase = tagName.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
				Ctor = Component.__componentClasses.get(pascalCase);
				if (Ctor) manager.registerComponentClass(Ctor, tagName);
			}
			if (!Ctor) return;
			const props = this.extractComponentProps_(el);
			const itemId = el.getAttribute("data-prop-item-id");
			const child = new Ctor(props);
			child.parentComponent = this;
			this.__childComponents.push(child);
			const parent = el.parentElement;
			if (!parent) return;
			const index = Array.prototype.slice.call(parent.children).indexOf(el);
			child.render(parent, index);
			if (itemId != null && child.el) {
				const wrapper = document.createElement("div");
				wrapper.id = geaBuildMapRowId(this.id_, "cc", String(itemId));
				parent.replaceChild(wrapper, child.el);
				wrapper.appendChild(child.el);
			}
			child.el && child.el.setAttribute("data-gea-component-root", child.id);
			parent.removeChild(el);
		});
	}
	mountCompiledChildComponents_() {
		const manager = ComponentManager.getInstance();
		const seen = /* @__PURE__ */ new Set();
		const collect = (value) => {
			if (!value) return;
			if (Array.isArray(value)) {
				value.forEach(collect);
				return;
			}
			if (value && typeof value === "object" && value.__geaCompiledChild && value.parentComponent === this) {
				if (!seen.has(value)) {
					seen.add(value);
					if (!this.__childComponents.includes(value)) this.__childComponents.push(value);
				}
			}
		};
		Object.keys(this).forEach((key) => {
			collect(this[key]);
		});
		seen.forEach((child) => {
			const existing = document.getElementById(child.id);
			if (!existing) return;
			if (child.rendered_ && child.element_ === existing) return;
			existing.__geaCompiledChildRoot = true;
			child.element_ = existing;
			existing.__geaComponent = child;
			child.rendered_ = true;
			manager.markComponentRendered(child);
			child.attachBindings_();
			child.mountCompiledChildComponents_();
			child.instantiateChildComponents_();
			child.setupEventDirectives_();
			child.onAfterRender();
			child.onAfterRenderHooks();
			child.__syncUnrenderedListItems();
			requestAnimationFrame(() => child.onAfterRenderAsync());
		});
	}
	__child(Ctor, props, key) {
		const child = new Ctor(props);
		child.parentComponent = this;
		child.__geaCompiledChild = true;
		if (key !== void 0) child.__geaItemKey = String(key);
		if (!this.__childComponents.includes(child)) this.__childComponents.push(child);
		return child;
	}
	__el(suffix) {
		let el = this.__elCache.get(suffix) ?? null;
		if (!el || !el.isConnected) {
			el = document.getElementById(this.id_ + "-" + suffix);
			if (el) this.__elCache.set(suffix, el);
			else this.__elCache.delete(suffix);
		}
		return el;
	}
	__updateText(suffix, text) {
		const el = this.__el(suffix);
		if (el) el.textContent = text;
	}
	__observe(store, path, handler) {
		const remover = store.__store.observe(path, handler.bind(this));
		this.__observer_removers__.push(remover);
	}
	__reorderChildren(container, items) {
		if (!container || !this.rendered_) return;
		for (const item of items) if (!item.rendered_) {
			if (!this.__childComponents.includes(item)) this.__childComponents.push(item);
			item.render(container);
		}
		const ordered = [];
		for (const item of items) {
			let el = item.element_;
			if (!el) continue;
			while (el.parentElement && el.parentElement !== container) el = el.parentElement;
			ordered.push(el);
		}
		if (ordered.length === 0) return;
		const itemSet = new Set(ordered);
		let cursor = container.firstChild;
		while (cursor && !itemSet.has(cursor)) cursor = cursor.nextSibling;
		for (const el of ordered) if (el !== cursor) container.insertBefore(el, cursor || null);
		else {
			cursor = cursor.nextSibling;
			while (cursor && !itemSet.has(cursor)) cursor = cursor.nextSibling;
		}
	}
	__reconcileList(oldItems, newData, container, Ctor, propsFactory, keyExtractor) {
		const oldByKey = /* @__PURE__ */ new Map();
		for (const item of oldItems) if (item.__geaItemKey != null) oldByKey.set(item.__geaItemKey, item);
		const next = newData.map((data, idx) => {
			const key = String(keyExtractor(data, idx));
			const existing = oldByKey.get(key);
			if (existing) {
				existing.__geaUpdateProps(propsFactory(data, idx));
				oldByKey.delete(key);
				return existing;
			}
			return this.__child(Ctor, propsFactory(data, idx), key);
		});
		for (const removed of oldByKey.values()) removed.dispose?.();
		this.__reorderChildren(container, next);
		this.__childComponents = this.__childComponents.filter((child) => !oldItems.includes(child) || next.includes(child));
		return next;
	}
	__observeList(store, path, config) {
		if (!this.__geaListConfigs) this.__geaListConfigs = [];
		this.__geaListConfigs.push({
			store,
			path,
			config
		});
		this.__observe(store, path, (_value, changes) => {
			if (!config.items && config.itemsKey) config.items = this[config.itemsKey];
			if (!config.items) return;
			if (config.__refreshing) return;
			config.__refreshing = true;
			try {
				const storeData = store.__store;
				const arr = path.reduce((obj, key) => obj?.[key], storeData) ?? [];
				if (changes.every((c) => c.isArrayItemPropUpdate)) for (const c of changes) {
					const item = config.items[c.arrayIndex];
					if (item) item.__geaUpdateProps(config.props(arr[c.arrayIndex], c.arrayIndex));
				}
				else if (changes.length === 1 && changes[0].type === "append") {
					const { start, count } = changes[0];
					const container = config.container();
					for (let i = 0; i < count; i++) {
						const data = arr[start + i];
						const item = this.__child(config.Ctor, config.props(data, start + i), config.key(data, start + i));
						config.items.push(item);
						if (this.rendered_ && container) item.render(container);
					}
				} else {
					const newItems = this.__reconcileList(config.items, arr, config.container(), config.Ctor, config.props, config.key);
					config.items.length = 0;
					config.items.push(...newItems);
				}
				config.onchange?.();
			} finally {
				config.__refreshing = false;
			}
		});
	}
	/**
	* Force-reconcile a list config by re-reading the getter value through the
	* store proxy.  Used by compiler-generated delegates when a getter-backed
	* array map's underlying dependency changes (e.g. activePlaylistId changes
	* causing filteredTracks to return different items).
	*/
	__refreshList(pathKey) {
		const configs = this.__geaListConfigs;
		if (!configs) return;
		for (const { store: s, path: p, config: c } of configs) {
			if (p.join(".") !== pathKey) continue;
			if (!c.items && c.itemsKey) c.items = this[c.itemsKey];
			if (!c.items) continue;
			if (c.__refreshing) return;
			c.__refreshing = true;
			try {
				const arr = p.reduce((obj, key) => obj?.[key], s) ?? [];
				const newItems = this.__reconcileList(c.items, arr, c.container(), c.Ctor, c.props, c.key);
				c.items.length = 0;
				c.items.push(...newItems);
				c.onchange?.();
			} finally {
				c.__refreshing = false;
			}
		}
	}
	__geaSwapChild(markerId, newChild) {
		const marker = document.getElementById(this.id_ + "-" + markerId);
		if (!marker) return;
		const oldEl = marker.nextElementSibling;
		if (newChild && newChild.rendered_ && newChild.element_ === oldEl) return;
		if (oldEl && oldEl.tagName !== "TEMPLATE") {
			const oldChild = this.__childComponents.find((c) => c.element_ === oldEl);
			if (oldChild) {
				oldChild.rendered_ = false;
				oldChild.element_ = null;
			}
			oldEl.remove();
		}
		if (!newChild) return;
		const html = String(newChild.template(newChild.props)).trim();
		marker.insertAdjacentHTML("afterend", html);
		const newEl = marker.nextElementSibling;
		if (!newEl) return;
		newChild.element_ = newEl;
		newChild.rendered_ = true;
		if (!this.__childComponents.includes(newChild)) this.__childComponents.push(newChild);
		ComponentManager.getInstance().markComponentRendered(newChild);
		newChild.attachBindings_();
		newChild.mountCompiledChildComponents_();
		newChild.instantiateChildComponents_();
		newChild.setupEventDirectives_();
		newChild.onAfterRender();
		newChild.onAfterRenderHooks();
	}
	cleanupBindings_() {
		this.__bindings = [];
	}
	setupEventDirectives_() {}
	teardownSelfListeners_() {
		this.__selfListeners.forEach((remove) => {
			if (typeof remove == "function") remove();
		});
		this.__selfListeners = [];
	}
	extractComponentProps_(el) {
		if (el.__geaProps) {
			const jsProps = el.__geaProps;
			delete el.__geaProps;
			return jsProps;
		}
		const props = {};
		if (!el.getAttributeNames) return props;
		el.getAttributeNames().filter((name) => name.startsWith("data-prop-")).forEach((name) => {
			const value = el.getAttribute(name);
			const propName = this.normalizePropName_(name.slice(10));
			if (this.__geaPropBindings && value && value.startsWith("__gea_prop_")) {
				const propValue = this.__geaPropBindings.get(value);
				if (propValue === void 0) console.warn(`[gea] Prop binding not found for ${value} on component ${this.constructor.name}`);
				props[propName] = propValue;
			} else props[propName] = this.coerceStaticPropValue_(value);
			el.removeAttribute(name);
		});
		if (!("children" in props)) {
			const inner = el.innerHTML;
			if (inner) props["children"] = inner;
		}
		return props;
	}
	coerceStaticPropValue_(value) {
		if (value == null) return void 0;
		if (value === "true") return true;
		if (value === "false") return false;
		if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
		return value;
	}
	normalizePropName_(name) {
		return name.replace(/-([a-z])/g, (_, chr) => chr.toUpperCase());
	}
	__geaRegisterMap(idx, containerProp, getContainer, getItems, createItem, keyProp) {
		if (!this.__geaMaps) this.__geaMaps = {};
		this.__geaMaps[idx] = {
			containerProp,
			getContainer,
			getItems,
			createItem,
			container: null,
			keyProp
		};
	}
	__geaSyncMap(idx) {
		if (!this.rendered_) return;
		const map = this.__geaMaps?.[idx];
		if (!map) return;
		let container = map.getContainer();
		if (!container) return;
		if (container.id) {
			let hasDirectItems = false;
			for (let n = container.firstChild; n; n = n.nextSibling) {
				if (n.nodeType === 1 && rowLooksLikeKeyedListRow(n)) {
					hasDirectItems = true;
					break;
				}
				if (n.nodeType === 8 && !n.data) break;
			}
			if (!hasDirectItems) {
				const nested = container.querySelector(`[id^="${container.id}-"][id*="-gk-"]`);
				if (nested?.parentElement && nested.parentElement !== container) container = nested.parentElement;
				else if (!nested) {
					let insideCondSlot = false;
					for (let s = container.firstChild; s; s = s.nextSibling) if (s.nodeType === 8 && s.data && /-c\d+$/.test(s.data)) {
						insideCondSlot = true;
						break;
					}
					if (insideCondSlot) return;
				}
			}
		}
		map.container = container;
		this[map.containerProp] = container;
		const items = map.getItems();
		const normalizedItems = Array.isArray(items) ? items : [];
		this.__geaSyncItems(container, normalizedItems, map.createItem, map.keyProp);
	}
	__geaSyncItems(container, items, createItemFn, keyProp) {
		const itemKey = (item) => {
			if (item != null && typeof item === "object") {
				if (keyProp && keyProp in item) return String(item[keyProp]);
				if ("id" in item) return String(item.id);
			}
			return String(item);
		};
		const c = container;
		let prev = c.__geaPrev;
		if (!prev) {
			prev = [];
			let domIdx = 0;
			for (let n = container.firstChild; n; n = n.nextSibling) if (n.nodeType === 1) {
				const aid = geaDomRowKeyFromElement(n, (item) => itemKey(item), domIdx);
				domIdx++;
				if (aid) prev.push(aid);
			} else if (n.nodeType === 8 && !n.data) break;
			c.__geaCount = prev.length;
		}
		if (prev.length === items.length) {
			let same = true;
			for (let j = 0; j < prev.length; j++) if (itemKey(prev[j]) !== itemKey(items[j])) {
				same = false;
				break;
			}
			if (same) {
				let child = container.firstChild;
				for (let j = 0; j < items.length; j++) {
					while (child && (child.nodeType !== 1 || !rowLooksLikeKeyedListRow(child))) {
						if (child.nodeType === 8 && !child.data) break;
						child = child.nextSibling;
					}
					if (!child || child.nodeType !== 1) break;
					const oldEl = child;
					child = child.nextSibling;
					const newEl = createItemFn(items[j], j);
					if (oldEl.innerHTML !== newEl.innerHTML) oldEl.innerHTML = newEl.innerHTML;
					for (let ai = 0; ai < newEl.attributes.length; ai++) {
						const a = newEl.attributes[ai];
						if (oldEl.getAttribute(a.name) !== a.value) oldEl.setAttribute(a.name, a.value);
					}
				}
				c.__geaPrev = items.slice();
				return;
			}
		}
		if (items.length > prev.length && prev.length > 0) {
			let appendOk = true;
			for (let j = 0; j < prev.length; j++) if (itemKey(prev[j]) !== itemKey(items[j])) {
				appendOk = false;
				break;
			}
			if (appendOk) {
				const frag = document.createDocumentFragment();
				for (let j = prev.length; j < items.length; j++) frag.appendChild(createItemFn(items[j], j));
				let marker = null;
				for (let sc = container.firstChild; sc; sc = sc.nextSibling) if (sc.nodeType === 8 && !sc.data) {
					marker = sc;
					break;
				}
				container.insertBefore(frag, marker);
				c.__geaPrev = items.slice();
				c.__geaCount = items.length;
				return;
			}
		}
		if (items.length < prev.length) {
			const newSet = /* @__PURE__ */ new Set();
			for (let j = 0; j < items.length; j++) newSet.add(itemKey(items[j]));
			const removals = [];
			let ridx = 0;
			for (let sc = container.firstChild; sc; sc = sc.nextSibling) if (sc.nodeType === 1) {
				const aid = geaDomRowKeyFromElement(sc, (item) => itemKey(item), ridx);
				ridx++;
				if (aid && !newSet.has(aid)) removals.push(sc);
			} else if (sc.nodeType === 8 && !sc.data) break;
			if (removals.length === prev.length - items.length) {
				for (let j = 0; j < removals.length; j++) container.removeChild(removals[j]);
				c.__geaPrev = items.slice();
				c.__geaCount = items.length;
				return;
			}
		}
		c.__geaPrev = items.slice();
		let oldCount = c.__geaCount;
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
		container.insertBefore(fragment, container.firstChild);
		c.__geaCount = items.length;
	}
	__geaCloneItem(container, item, renderFn, bindingId, itemIdProp, patches) {
		const c = container;
		const idProp = itemIdProp || "id";
		if (!c.__geaTpl) try {
			const tw = container.cloneNode(false);
			tw.innerHTML = renderFn({
				[idProp]: 0,
				label: ""
			});
			c.__geaTpl = tw.firstElementChild;
		} catch {}
		let el;
		if (c.__geaTpl) el = c.__geaTpl.cloneNode(true);
		else {
			const tw = container.cloneNode(false);
			tw.innerHTML = renderFn(item);
			el = tw.firstElementChild;
		}
		const raw = item != null && typeof item === "object" ? item[idProp] : void 0;
		const itemKeyStr = String(raw != null ? raw : item);
		el.id = geaBuildMapRowId(this.id_, bindingId ?? "list", itemKeyStr);
		el.__geaItem = item;
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
			else target.setAttribute(type, String(val));
		}
		return el;
	}
	__geaRegisterCond(idx, slotId, getCond, getTruthyHtml, getFalsyHtml) {
		if (!this.__geaConds) this.__geaConds = {};
		this.__geaConds[idx] = {
			slotId,
			getCond,
			getTruthyHtml,
			getFalsyHtml
		};
	}
	/**
	* Re-run compiler-generated `__setupRefs()` after incremental DOM updates (e.g. conditional
	* slots) so `ref={this.x}` targets stay in sync; `querySelector` returns `null` when a marked
	* node is absent, clearing stale references.
	*/
	__syncDomRefs() {
		if (typeof this.__setupRefs === "function") this.__setupRefs();
	}
	__geaPatchCond(idx) {
		const conf = this.__geaConds?.[idx];
		if (!conf) return false;
		let cond;
		try {
			cond = !!conf.getCond();
		} catch {
			return false;
		}
		const condProp = "__geaCond_" + idx;
		const prev = this[condProp];
		const needsPatch = cond !== prev;
		this[condProp] = cond;
		const root = this.element_ || document.getElementById(this.id_);
		if (!root) return false;
		const markerText = this.id_ + "-" + conf.slotId;
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
		if (!marker || !endMarker || !parent) return false;
		const replaceSlotContent = (htmlFn) => {
			if (!htmlFn) {
				let node = marker.nextSibling;
				while (node && node !== endMarker) {
					const next = node.nextSibling;
					node.remove();
					node = next;
				}
				return;
			}
			const html = htmlFn();
			if (html === "") {
				let node = marker.nextSibling;
				while (node && node !== endMarker) {
					const next = node.nextSibling;
					if (node.nodeType !== 1) node.remove();
					else if (!rowLooksLikeKeyedListRow(node)) node.remove();
					node = next;
				}
				return;
			}
			let node = marker.nextSibling;
			while (node && node !== endMarker) {
				const next = node.nextSibling;
				node.remove();
				node = next;
			}
			if ("namespaceURI" in parent && parent.namespaceURI === "http://www.w3.org/2000/svg") {
				const wrap = document.createElementNS("http://www.w3.org/2000/svg", "svg");
				wrap.innerHTML = html;
				while (wrap.firstChild) parent.insertBefore(wrap.firstChild, endMarker);
			} else {
				const tpl = document.createElement("template");
				tpl.innerHTML = html;
				Component.__syncValueProps(tpl.content);
				parent.insertBefore(tpl.content, endMarker);
			}
		};
		if (needsPatch) {
			if (!cond) {
				const disposed = /* @__PURE__ */ new Set();
				let node = marker.nextSibling;
				while (node && node !== endMarker) {
					if (node.nodeType === 1) {
						const el = node;
						for (const child of this.__childComponents) if (child.__geaCompiledChild && child.element_ && (child.element_ === el || el.contains(child.element_))) disposed.add(child);
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
				if (disposed.size > 0) this.__childComponents = this.__childComponents.filter((c) => !disposed.has(c));
			}
			replaceSlotContent(cond ? conf.getTruthyHtml : conf.getFalsyHtml);
			if (cond) {
				this.mountCompiledChildComponents_();
				this.instantiateChildComponents_();
				this.setupEventDirectives_();
				Component.__syncAutofocus(marker, endMarker);
			}
		} else if (cond && conf.getTruthyHtml) {
			const existingNode = marker.nextSibling;
			if (existingNode && existingNode !== endMarker && existingNode.nodeType === 1) {
				if (existingNode.__geaCompiledChildRoot) return needsPatch;
				const newHtml = conf.getTruthyHtml();
				const tpl = document.createElement("template");
				tpl.innerHTML = newHtml;
				const newEl = tpl.content.firstElementChild;
				if (newEl) Component.__patchNode(existingNode, newEl);
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
					if (!existing.__geaCompiledChildRoot) Component.__patchNode(existing, desired);
				} else if (existing.nodeType === 3 && desired.nodeType === 3) {
					if (existing.textContent !== desired.textContent) existing.textContent = desired.textContent;
				}
				existing = existing.nextSibling;
				idx++;
			}
		}
		this.__syncDomRefs();
		return needsPatch;
	}
	static __syncValueProps(root) {
		const els = root.querySelectorAll?.("textarea[value], input[value], select[value]");
		if (!els) return;
		for (let i = 0; i < els.length; i++) {
			const el = els[i];
			el.value = el.getAttribute("value") || "";
		}
	}
	static __syncAutofocus(startMarker, endMarker) {
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
	static __patchNode(existing, desired) {
		if (existing.tagName !== desired.tagName) {
			existing.replaceWith(desired.cloneNode(true));
			return;
		}
		const oldAttrs = existing.attributes;
		const newAttrs = desired.attributes;
		for (let i = oldAttrs.length - 1; i >= 0; i--) {
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
				} else if (oldChild.nodeType === 1) Component.__patchNode(oldChild, newChild);
			}
		}
	}
	static register(tagName) {
		ComponentManager.getInstance().registerComponentClass(this, tagName);
		if (Component.__componentClasses) Component.__componentClasses.set(this.name, this);
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
var Outlet = class Outlet extends Component {
	constructor(..._args) {
		super(..._args);
		this.__isRouterOutlet = true;
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
		let parent = this.parentComponent;
		while (parent) {
			if (parent.__isRouterOutlet) {
				depth = parent._routerDepth + 1;
				router = parent._router ?? parent.props?.router ?? null;
				break;
			}
			parent = parent.parentComponent;
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
			this.__childComponents = [];
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
		if (this._currentChild && (!this._currentChild.element_ || !this.el.contains(this._currentChild.element_))) this._clearCurrent();
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
			child.parentComponent = this;
			child.render(this.el);
			if (child.element_) child.element_.__geaCompiledChildRoot = true;
			this._currentChild = child;
			this._currentComponentClass = item.component;
			this.__childComponents = [child];
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
var RouterView = class extends Component {
	constructor(..._args) {
		super(..._args);
		this.__isRouterOutlet = true;
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
			this.__childComponents = [];
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
		if (this._currentChild && (!this._currentChild.element_ || !this.el.contains(this._currentChild.element_))) this._clearCurrent();
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
			child.parentComponent = this;
			child.render(this.el);
			this._currentChild = child;
			this._currentComponentClass = item.component;
			this.__childComponents = [child];
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
export { Component, ComponentManager, GEA_MAP_KEY_SEP, Link, Outlet, Router, RouterView, Store, applyListChanges, clearUidProvider, createRouter, gea as default, geaBuildMapRowId, geaDomRowKeyFromElement, geaFindDelegatedMapRow, geaIsGeneratedMapRowId, geaItemHandlerKeyFromRow, geaTryParseMapRowKeyFromGeneratedRowId, geaTryParseMapRowKeyFromId, h, isInternalProp, matchRoute, resetUidCounter, rootDeleteProperty, rootGetValue, rootSetValue, router, rowLooksLikeKeyedListRow, setUidProvider };

//# sourceMappingURL=index.mjs.map