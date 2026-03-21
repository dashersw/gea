var __jiraApp = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // packages/vite-plugin-gea/tests/fixtures/jira-integration-entry.ts
  var jira_integration_entry_exports = {};
  __export(jira_integration_entry_exports, {
    Project: () => Project,
    authStore: () => auth_store_default,
    issueStore: () => issue_store_default,
    projectStore: () => project_store_default,
    router: () => router
  });

  // packages/gea/src/lib/base/uid.ts
  var counter = Math.floor(Math.random() * 2147483648);
  var getUid = () => (counter++).toString(36);
  var uid_default = getUid;

  // packages/gea/src/lib/base/component-manager.ts
  var RESERVED_HTML_TAG_NAMES = /* @__PURE__ */ new Set([
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
  var createElement = (() => {
    const template = document.createElement("template");
    return (htmlString) => {
      template.innerHTML = htmlString.trim();
      return template.content.firstElementChild;
    };
  })();
  var ComponentManager = class _ComponentManager {
    constructor() {
      this.componentRegistry = {};
      this.componentsToRender = {};
      this.eventPlugins_ = [];
      this.registeredDocumentEvents_ = /* @__PURE__ */ new Set();
      this.loaded_ = false;
      this.componentClassRegistry = {};
      this.componentSelectorsCache_ = null;
      this.boundHandleEvent_ = this.handleEvent.bind(this);
      if (document.body) this.onLoad();
      else document.addEventListener("DOMContentLoaded", () => this.onLoad());
      this.getUid = uid_default;
      this.createElement = createElement;
    }
    static {
      this.instance = void 0;
    }
    static {
      this.customEventTypes_ = [];
    }
    static {
      this.eventPlugins_ = [];
    }
    handleEvent(e) {
      e.targetEl = e.target;
      const comps = this.getParentComps(e.target);
      let broken = false;
      do {
        if (broken) break;
        broken = this.callHandlers(comps, e);
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
          const rendered = comp.render();
          if (rendered) delete this.componentsToRender[cmpId];
        }
      }).observe(document.body, { childList: true, subtree: true });
    }
    addDocumentEventListeners_(eventTypes) {
      if (!document.body) return;
      eventTypes.forEach((type) => {
        if (this.registeredDocumentEvents_.has(type)) return;
        document.body.addEventListener(type, this.boundHandleEvent_);
        this.registeredDocumentEvents_.add(type);
      });
    }
    installConfiguredPlugins_() {
      _ComponentManager.eventPlugins_.forEach((plugin) => this.installEventPlugin_(plugin));
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
        ids.split(",").forEach((id) => parentComps.push(this.componentRegistry[id]));
        return parentComps;
      }
      ids = [];
      do {
        if (comp = this.componentRegistry[node.id]) {
          parentComps.push(comp);
          ids.push(node.id);
        }
      } while (node = node.parentNode);
      child.parentComps = ids.join(",");
      return parentComps;
    }
    callHandlers(comps, e) {
      let broken = false;
      for (let i = 0; i < comps.length; i++) {
        const comp = comps[i];
        if (this.callEventsGetterHandler(comp, e) === false) {
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
    callEventsGetterHandler(comp, e) {
      if (!comp || !comp.events) return true;
      const targetEl = e.targetEl;
      if (!targetEl || typeof targetEl.matches !== "function") return true;
      const eventType = e.type;
      const handlers = comp.events[eventType];
      if (!handlers) return true;
      const geaEvt = targetEl.getAttribute?.("data-gea-event");
      if (geaEvt) {
        const selector = `[data-gea-event="${geaEvt}"]`;
        const handler = handlers[selector];
        if (typeof handler === "function") {
          const result = handler.call(comp, e);
          if (result === false) return false;
        }
        return true;
      }
      for (const selector in handlers) {
        const matched = selector.charAt(0) === "#" ? targetEl.id === selector.slice(1) : targetEl.matches(selector);
        if (matched) {
          const handler = handlers[selector];
          if (typeof handler === "function") {
            const targetComponent = this.getOwningComponent(targetEl);
            const result = handler.call(comp, e, targetComponent !== comp ? targetComponent : void 0);
            if (result === false) return false;
          }
        }
      }
      return true;
    }
    callItemHandler(comp, e) {
      if (!comp || typeof comp.__handleItemHandler !== "function") return true;
      const targetEl = e.targetEl;
      if (!targetEl || typeof targetEl.getAttribute !== "function") return true;
      const itemEl = targetEl.closest?.("[data-gea-item-id]");
      if (itemEl && comp.el && comp.el.contains(itemEl)) {
        const itemId = itemEl.getAttribute("data-gea-item-id");
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
        }
        current = current.parentNode;
      }
      return void 0;
    }
    getComponent(id) {
      return this.componentRegistry[id];
    }
    setComponent(comp) {
      this.componentRegistry[comp.id] = comp;
      if (!comp.rendered) this.componentsToRender[comp.id] = comp;
      if (this.loaded_) {
        if (comp.events) {
          this.addDocumentEventListeners_(Object.keys(comp.events));
        }
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
      const base = ctor.displayName || ctor.name || "component";
      const tagName = base.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/[\s_]+/g, "-").toLowerCase();
      return RESERVED_HTML_TAG_NAMES.has(tagName) ? `gea-${tagName}` : tagName;
    }
    getComponentSelectors() {
      if (!this.componentSelectorsCache_) {
        this.componentSelectorsCache_ = Object.keys(this.componentClassRegistry).map((name) => `${name}`);
      }
      return this.componentSelectorsCache_;
    }
    getComponentConstructor(tagName) {
      return this.componentClassRegistry[tagName];
    }
    markComponentRendered(comp) {
      delete this.componentsToRender[comp.id];
    }
    getActiveDocumentEventTypes_() {
      const eventTypes = new Set(_ComponentManager.customEventTypes_);
      Object.values(this.componentRegistry).forEach((comp) => {
        if (comp.events) {
          Object.keys(comp.events).forEach((type) => eventTypes.add(type));
        }
      });
      return [...eventTypes];
    }
    static getInstance() {
      if (!_ComponentManager.instance) _ComponentManager.instance = new _ComponentManager();
      return _ComponentManager.instance;
    }
    static registerEventTypes(eventTypes) {
      let changed = false;
      eventTypes.forEach((type) => {
        if (_ComponentManager.customEventTypes_.includes(type)) return;
        _ComponentManager.customEventTypes_.push(type);
        changed = true;
      });
      if (!changed || !_ComponentManager.instance) return;
      _ComponentManager.instance.addDocumentEventListeners_(eventTypes);
    }
    static installEventPlugin(plugin) {
      if (_ComponentManager.eventPlugins_.includes(plugin)) return;
      _ComponentManager.eventPlugins_.push(plugin);
      if (_ComponentManager.instance && _ComponentManager.instance.loaded_) {
        _ComponentManager.instance.installEventPlugin_(plugin);
      }
    }
  };

  // packages/gea/src/lib/base/list.ts
  function samePathParts(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }
  function rebuildList(container, array, create) {
    container.textContent = "";
    if (array.length === 0) return;
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < array.length; i++) {
      fragment.appendChild(create(array[i], i));
    }
    container.appendChild(fragment);
  }
  function rerenderListInPlace(container, array, create) {
    const currentLength = container.children.length;
    const nextLength = array.length;
    const sharedLength = currentLength < nextLength ? currentLength : nextLength;
    for (let i = 0; i < sharedLength; i++) {
      const row = container.children[i];
      const nextRow = create(array[i], i);
      if (row) {
        row.replaceWith(nextRow);
      } else {
        container.appendChild(nextRow);
      }
    }
    if (nextLength > currentLength) {
      const fragment = document.createDocumentFragment();
      for (let i = currentLength; i < nextLength; i++) {
        fragment.appendChild(create(array[i], i));
      }
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
      if (currentRow !== row) {
        container.insertBefore(row, currentRow || null);
      }
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
      for (let j = 0; j < patchers.length; j++) {
        patchers[j](row, change.newValue, item);
      }
    }
    return handledAny;
  }
  function applyListChanges(container, array, changes, config) {
    const items = Array.isArray(array) ? array : [];
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
    if (applyPropChanges(container, items, changes, config)) {
      return;
    }
    if ((firstChange?.type === "update" || firstChange?.type === "add") && samePathParts(firstChange.pathParts, config.arrayPathParts)) {
      rebuildList(container, items, config.create);
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
          for (let j = 0; j < count; j++) {
            fragment.appendChild(config.create(items[start + j], start + j));
          }
          container.appendChild(fragment);
        }
        handledMutation = true;
      }
    }
    if (!handledMutation) {
      rebuildList(container, items, config.create);
      return;
    }
    if (addIndexes.length > 0 && addIndexes.includes(0)) {
      const firstChild = container.children[0];
      if (firstChild && !firstChild.hasAttribute("data-gea-item-id")) {
        if (container.children.length === items.length) return;
        rebuildList(container, items, config.create);
        return;
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

  // packages/gea/src/lib/store.ts
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
      if (isMap) {
        result[i] = v;
      } else if (v) {
        if (method === "filter") {
          result.push(p);
        } else if (method === "some") return true;
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
    return typeof value === "string" && /^\d+$/.test(value);
  }
  function samePathParts2(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }
  function isArrayIndexUpdate(change) {
    return change && change.type === "update" && Array.isArray(change.target) && isNumericIndex(change.property);
  }
  function isReciprocalSwap(a, b) {
    if (!isArrayIndexUpdate(a) || !isArrayIndexUpdate(b)) return false;
    if (a.target !== b.target || a.property === b.property) return false;
    if (!samePathParts2(a.pathParts.slice(0, -1), b.pathParts.slice(0, -1))) return false;
    return a.previousValue === b.newValue && b.previousValue === a.newValue;
  }
  var INTERNAL_PROPS = /* @__PURE__ */ new Set(["props", "actions", "parentComponent"]);
  function isInternalProp(prop) {
    if (prop.charCodeAt(0) === 95) return true;
    if (prop.charCodeAt(prop.length - 1) === 95) return true;
    return INTERNAL_PROPS.has(prop);
  }
  var Store = class {
    constructor(initialData) {
      this._pendingChanges = [];
      this._flushScheduled = false;
      this._nextArrayOpId = 0;
      this._observerRoot = createObserverNode([]);
      this._proxyCache = /* @__PURE__ */ new WeakMap();
      this._arrayIndexProxyCache = /* @__PURE__ */ new WeakMap();
      this._internedArrayPaths = /* @__PURE__ */ new Map();
      this._topLevelProxies = /* @__PURE__ */ new Map();
      this._flushChanges = () => {
        this._flushScheduled = false;
        const batch = this._normalizeBatch(this._pendingChanges);
        this._pendingChanges = [];
        if (batch.length === 0) return;
        if (this._deliverArrayItemPropBatch(batch)) return;
        if (batch.length === 1) {
          const matches = this._collectMatchingObserverNodes(batch[0].pathParts);
          for (let i = 0; i < matches.length; i++) {
            this._notifyHandlers(matches[i], batch);
          }
          return;
        }
        const deliveries = /* @__PURE__ */ new Map();
        for (let i = 0; i < batch.length; i++) {
          const change = batch[i];
          const matches = this._collectMatchingObserverNodes(change.pathParts);
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
        for (const [node, relevant] of deliveries) {
          this._notifyHandlers(node, relevant);
        }
      };
      const proxy2 = new Proxy(this, {
        get(t, prop, receiver) {
          if (typeof prop === "symbol") return Reflect.get(t, prop, receiver);
          if (prop === "__isProxy") return true;
          if (isInternalProp(prop)) return Reflect.get(t, prop, receiver);
          if (!Object.prototype.hasOwnProperty.call(t, prop)) {
            return Reflect.get(t, prop, receiver);
          }
          const value = t[prop];
          if (typeof value === "function") return value;
          if (value !== null && value !== void 0 && typeof value === "object") {
            const proto = Object.getPrototypeOf(value);
            if (proto !== Object.prototype && !Array.isArray(value)) return value;
            const entry = t._topLevelProxies.get(prop);
            if (entry && entry[0] === value) return entry[1];
            const p = t._createProxy(value, prop, [prop]);
            t._topLevelProxies.set(prop, [value, p]);
            return p;
          }
          return value;
        },
        set(t, prop, value) {
          if (typeof prop === "symbol") {
            ;
            t[prop] = value;
            return true;
          }
          if (isInternalProp(prop)) {
            ;
            t[prop] = value;
            return true;
          }
          if (typeof value === "function") {
            ;
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
            for (let i = 0; i < oldValue.length; i++) {
              if (oldValue[i] !== value[i]) {
                isAppend = false;
                break;
              }
            }
            if (isAppend) {
              const start = oldValue.length;
              t._emitChanges([
                {
                  type: "append",
                  property: prop,
                  target: t,
                  pathParts: [prop],
                  start,
                  count: value.length - start,
                  newValue: value.slice(start)
                }
              ]);
              return true;
            }
          }
          t._emitChanges([
            {
              type: hadProp ? "update" : "add",
              property: prop,
              target: t,
              pathParts: [prop],
              newValue: value,
              previousValue: oldValue
            }
          ]);
          return true;
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
          const hadProp = Object.prototype.hasOwnProperty.call(t, prop);
          if (!hadProp) return true;
          const oldValue = t[prop];
          if (oldValue && typeof oldValue === "object") {
            t._proxyCache.delete(oldValue);
            t._clearArrayIndexCache(oldValue);
          }
          t._topLevelProxies.delete(prop);
          delete t[prop];
          t._emitChanges([
            {
              type: "delete",
              property: prop,
              target: t,
              pathParts: [prop],
              previousValue: oldValue
            }
          ]);
          return true;
        },
        defineProperty(t, prop, descriptor) {
          return Reflect.defineProperty(t, prop, descriptor);
        }
      });
      this._selfProxy = proxy2;
      if (initialData) {
        for (const key of Object.keys(initialData)) {
          Object.defineProperty(this, key, {
            value: initialData[key],
            writable: true,
            enumerable: true,
            configurable: true
          });
        }
      }
      return proxy2;
    }
    /** Used by vite plugin when passing store to components. Same as `this`. */
    get __store() {
      return this;
    }
    observe(path, handler) {
      const pathParts = splitPath(path);
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
    _getObserverNode(pathParts) {
      let node = this._observerRoot;
      for (let i = 0; i < pathParts.length; i++) {
        node = node.children.get(pathParts[i]);
        if (!node) return null;
      }
      return node;
    }
    _collectMatchingObserverNodesFromNode(startNode, pathParts, offset3) {
      const matches = [];
      let node = startNode;
      for (let i = offset3; i < pathParts.length; i++) {
        node = node.children.get(pathParts[i]);
        if (!node) break;
        if (node.handlers.size > 0) matches.push(node);
      }
      return matches;
    }
    _notifyHandlers(node, relevant) {
      const value = getByPathParts(this, node.pathParts);
      for (const handler of node.handlers) {
        handler(value, relevant);
      }
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
        if (!change.isArrayItemPropUpdate || !samePathParts2(change.arrayPathParts, arrayPathParts)) {
          allSameArray = false;
          break;
        }
      }
      if (!allSameArray) return false;
      const arrayNode = this._getObserverNode(arrayPathParts);
      if (this._observerRoot.handlers.size === 0 && arrayNode && arrayNode.children.size === 0 && arrayNode.handlers.size > 0) {
        const value = getByPathParts(this, arrayPathParts);
        for (const handler of arrayNode.handlers) {
          handler(value, batch);
        }
        return true;
      }
      const commonMatches = this._collectMatchingObserverNodes(arrayPathParts);
      for (let i = 0; i < commonMatches.length; i++) {
        this._notifyHandlers(commonMatches[i], batch);
      }
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
      for (const [node, relevant] of deliveries) {
        this._notifyHandlers(node, relevant);
      }
      return true;
    }
    _emitChanges(changes) {
      for (let i = 0; i < changes.length; i++) this._pendingChanges.push(changes[i]);
      if (!this._flushScheduled) {
        this._flushScheduled = true;
        queueMicrotask(this._flushChanges);
      }
    }
    _interceptArrayMethod(arr, method, _basePath, baseParts) {
      const store = this;
      switch (method) {
        case "splice":
          return function(...args) {
            store._clearArrayIndexCache(arr);
            const len = arr.length;
            const rawStart = args[0] ?? 0;
            const start = rawStart < 0 ? Math.max(len + rawStart, 0) : Math.min(rawStart, len);
            const deleteCount = args.length < 2 ? len - start : Math.min(Math.max(args[1] ?? 0, 0), len - start);
            const items = args.slice(2).map((v) => v && typeof v === "object" && v.__isProxy ? v.__getTarget : v);
            const removed = arr.slice(start, start + deleteCount);
            Array.prototype.splice.call(arr, start, deleteCount, ...items);
            if (deleteCount === 0 && items.length > 0 && start === len) {
              store._emitChanges([
                {
                  type: "append",
                  property: String(start),
                  target: arr,
                  pathParts: baseParts,
                  start,
                  count: items.length,
                  newValue: items
                }
              ]);
              return removed;
            }
            const changes = [];
            for (let i = 0; i < removed.length; i++) {
              changes.push({
                type: "delete",
                property: String(start + i),
                target: arr,
                pathParts: appendPathParts(baseParts, String(start + i)),
                previousValue: removed[i]
              });
            }
            for (let i = 0; i < items.length; i++) {
              changes.push({
                type: "add",
                property: String(start + i),
                target: arr,
                pathParts: appendPathParts(baseParts, String(start + i)),
                newValue: items[i]
              });
            }
            if (changes.length > 0) store._emitChanges(changes);
            return removed;
          };
        case "push":
          return function(...items) {
            store._clearArrayIndexCache(arr);
            const rawItems = items.map((v) => v && typeof v === "object" && v.__isProxy ? v.__getTarget : v);
            const startIndex = arr.length;
            Array.prototype.push.apply(arr, rawItems);
            if (rawItems.length > 0) {
              store._emitChanges([
                {
                  type: "append",
                  property: String(startIndex),
                  target: arr,
                  pathParts: baseParts,
                  start: startIndex,
                  count: rawItems.length,
                  newValue: rawItems
                }
              ]);
            }
            return arr.length;
          };
        case "pop":
        case "shift":
          return function() {
            if (arr.length === 0) return void 0;
            store._clearArrayIndexCache(arr);
            const idx = method === "pop" ? arr.length - 1 : 0;
            const removed = arr[idx];
            if (method === "pop") Array.prototype.pop.call(arr);
            else Array.prototype.shift.call(arr);
            store._emitChanges([
              {
                type: "delete",
                property: String(idx),
                target: arr,
                pathParts: appendPathParts(baseParts, String(idx)),
                previousValue: removed
              }
            ]);
            return removed;
          };
        case "unshift":
          return function(...items) {
            store._clearArrayIndexCache(arr);
            const rawItems = items.map((v) => v && typeof v === "object" && v.__isProxy ? v.__getTarget : v);
            Array.prototype.unshift.apply(arr, rawItems);
            const changes = [];
            for (let i = 0; i < rawItems.length; i++) {
              changes.push({
                type: "add",
                property: String(i),
                target: arr,
                pathParts: appendPathParts(baseParts, String(i)),
                newValue: rawItems[i]
              });
            }
            if (changes.length > 0) store._emitChanges(changes);
            return arr.length;
          };
        case "sort":
        case "reverse":
          return function(...args) {
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
            store._emitChanges([
              {
                type: "reorder",
                property: baseParts[baseParts.length - 1] || "",
                target: arr,
                pathParts: baseParts,
                permutation,
                newValue: arr
              }
            ]);
            return arr;
          };
        default:
          return null;
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
        case "forEach":
        case "map":
        case "filter":
        case "some":
        case "every":
        case "find":
        case "findIndex":
          return (cb, thisArg) => proxyIterate(arr, basePath, baseParts, mkProxy, method, cb, thisArg);
        case "reduce":
          return function(cb, init) {
            let acc = arguments.length >= 2 ? init : arr[0];
            const start = arguments.length >= 2 ? 0 : 1;
            for (let i = start; i < arr.length; i++) {
              const nextPath = basePath ? `${basePath}.${i}` : String(i);
              const p = mkProxy(arr[i], nextPath, appendPathParts(baseParts, String(i)));
              acc = cb(acc, p, i, arr);
            }
            return acc;
          };
        default:
          return null;
      }
    }
    _createProxy(target, basePath, baseParts = []) {
      if (!target || typeof target !== "object") return target;
      const store = this;
      let cachedArrayMeta = null;
      for (let i = baseParts.length - 1; i >= 0; i--) {
        if (!/^\d+$/.test(baseParts[i])) continue;
        const internKey = baseParts.slice(0, i).join("\0");
        let interned = store._internedArrayPaths.get(internKey);
        if (!interned) {
          interned = baseParts.slice(0, i);
          store._internedArrayPaths.set(internKey, interned);
        }
        cachedArrayMeta = {
          arrayPathParts: interned,
          arrayIndex: Number(baseParts[i]),
          baseTail: baseParts.slice(i + 1)
        };
        break;
      }
      const pathCache = /* @__PURE__ */ new Map();
      const leafCache = /* @__PURE__ */ new Map();
      function getCachedPathParts(propStr) {
        let pp = pathCache.get(propStr);
        if (!pp) {
          pp = baseParts.length > 0 ? [...baseParts, propStr] : [propStr];
          pathCache.set(propStr, pp);
        }
        return pp;
      }
      const createProxy = (t, bp, bps) => store._createProxy(t, bp, bps);
      return new Proxy(target, {
        get(obj, prop) {
          if (typeof prop === "symbol") return obj[prop];
          if (prop === "__getTarget") return obj;
          if (prop === "__raw") return obj;
          if (prop === "__isProxy") return true;
          if (prop === "__getPath") return basePath;
          if (prop === "__store") return store._selfProxy || store;
          const value = obj[prop];
          if (value === null || value === void 0) return value;
          const valType = typeof value;
          if (valType !== "object" && valType !== "function") return value;
          if (Array.isArray(obj) && valType === "function") {
            if (prop === "constructor") return value;
            const intercepted = store._interceptArrayMethod(obj, prop, basePath, baseParts);
            if (intercepted) return intercepted;
            const iterProxy = store._interceptArrayIterator(obj, prop, basePath, baseParts, createProxy);
            if (iterProxy) return iterProxy;
            return value.bind(obj);
          }
          if (valType === "object") {
            const proto = Object.getPrototypeOf(value);
            if (proto !== Object.prototype && !Array.isArray(value)) return value;
            if (Array.isArray(obj) && /^\d+$/.test(prop)) {
              let indexCache = store._arrayIndexProxyCache.get(obj);
              if (!indexCache) {
                indexCache = /* @__PURE__ */ new Map();
                store._arrayIndexProxyCache.set(obj, indexCache);
              }
              let cached2 = indexCache.get(prop);
              if (cached2) return cached2;
              const currentPath2 = basePath ? `${basePath}.${prop}` : prop;
              cached2 = createProxy(value, currentPath2, getCachedPathParts(prop));
              indexCache.set(prop, cached2);
              return cached2;
            }
            let cached = store._proxyCache.get(value);
            if (cached) return cached;
            const currentPath = basePath ? `${basePath}.${prop}` : prop;
            cached = createProxy(value, currentPath, getCachedPathParts(prop));
            store._proxyCache.set(value, cached);
            return cached;
          }
          if (prop === "constructor") return value;
          return value.bind(obj);
        },
        set(obj, prop, value) {
          if (typeof prop === "symbol") {
            obj[prop] = value;
            return true;
          }
          if (value && typeof value === "object" && value.__isProxy) {
            const raw = value.__getTarget;
            if (raw !== void 0) value = raw;
          }
          if (prop === "length" && Array.isArray(obj)) {
            store._clearArrayIndexCache(obj);
            obj[prop] = value;
            return true;
          }
          const oldValue = obj[prop];
          if (oldValue === value) return true;
          const isNew = !Object.prototype.hasOwnProperty.call(obj, prop);
          if (Array.isArray(obj) && /^\d+$/.test(prop)) store._clearArrayIndexCache(obj);
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
              const change2 = {
                type: "append",
                property: prop,
                target: obj,
                pathParts: getCachedPathParts(prop),
                start,
                count,
                newValue: value.slice(start)
              };
              if (cachedArrayMeta) {
                let lp = leafCache.get(prop);
                if (!lp) {
                  lp = cachedArrayMeta.baseTail.length > 0 ? [...cachedArrayMeta.baseTail, prop] : [prop];
                  leafCache.set(prop, lp);
                }
                change2.arrayPathParts = cachedArrayMeta.arrayPathParts;
                change2.arrayIndex = cachedArrayMeta.arrayIndex;
                change2.leafPathParts = lp;
                change2.isArrayItemPropUpdate = true;
              }
              store._pendingChanges.push(change2);
              if (!store._flushScheduled) {
                store._flushScheduled = true;
                queueMicrotask(store._flushChanges);
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
            let lp = leafCache.get(prop);
            if (!lp) {
              lp = cachedArrayMeta.baseTail.length > 0 ? [...cachedArrayMeta.baseTail, prop] : [prop];
              leafCache.set(prop, lp);
            }
            change.arrayPathParts = cachedArrayMeta.arrayPathParts;
            change.arrayIndex = cachedArrayMeta.arrayIndex;
            change.leafPathParts = lp;
            change.isArrayItemPropUpdate = true;
          }
          store._pendingChanges.push(change);
          if (!store._flushScheduled) {
            store._flushScheduled = true;
            queueMicrotask(store._flushChanges);
          }
          return true;
        },
        deleteProperty(obj, prop) {
          if (typeof prop === "symbol") {
            delete obj[prop];
            return true;
          }
          const oldValue = obj[prop];
          if (Array.isArray(obj) && /^\d+$/.test(prop)) store._clearArrayIndexCache(obj);
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
            let lp = leafCache.get(prop);
            if (!lp) {
              lp = cachedArrayMeta.baseTail.length > 0 ? [...cachedArrayMeta.baseTail, prop] : [prop];
              leafCache.set(prop, lp);
            }
            change.arrayPathParts = cachedArrayMeta.arrayPathParts;
            change.arrayIndex = cachedArrayMeta.arrayIndex;
            change.leafPathParts = lp;
            change.isArrayItemPropUpdate = true;
          }
          store._pendingChanges.push(change);
          if (!store._flushScheduled) {
            store._flushScheduled = true;
            queueMicrotask(store._flushChanges);
          }
          return true;
        }
      });
    }
  };

  // packages/gea/src/lib/base/component.tsx
  function __geaSyncItemKey(item) {
    if (item != null && typeof item === "object" && "id" in item) {
      return String(item.id);
    }
    return String(item);
  }
  var Component = class _Component extends Store {
    static {
      this.__componentClasses = /* @__PURE__ */ new Map();
    }
    constructor(props = {}) {
      super();
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
      _Component.__componentClasses.set(Ctor.name, Ctor);
      this.rendered_ = false;
      let _propsProxy = this.__createPropsProxy(props || {});
      Object.defineProperty(this, "props", {
        get: () => _propsProxy,
        set: (newProps) => {
          _propsProxy = this.__createPropsProxy(newProps || {});
        },
        configurable: true,
        enumerable: true
      });
      ComponentManager.getInstance().setComponent(this);
      this.created(this.props);
      this.createdHooks(this.props);
      if (typeof this.__setupLocalStateObservers === "function") {
        ;
        this.__setupLocalStateObservers();
      }
    }
    created(_props) {
    }
    createdHooks(_props) {
    }
    get id() {
      return this.id_;
    }
    get el() {
      if (!this.element_) {
        const existing = document.getElementById(this.id_);
        if (existing) {
          this.element_ = existing;
        } else {
          this.element_ = ComponentManager.getInstance().createElement(String(this.template(this.props)).trim());
        }
      }
      return this.element_;
    }
    $$(selector) {
      let rv = [];
      const el = this.el;
      if (el) {
        if (selector == void 0 || selector === ":scope") rv = [el];
        else rv = [...el.querySelectorAll(selector)];
      }
      return rv;
    }
    $(selector) {
      let rv = null;
      const el = this.element_;
      if (el) {
        rv = selector == void 0 || selector === ":scope" ? el : el.querySelector(selector);
      }
      return rv;
    }
    __applyListChanges(container, array, changes, config) {
      return applyListChanges(container, array, changes, config);
    }
    render(rootEl, opt_index = Infinity) {
      if (this.rendered_) return true;
      this.element_ = this.el;
      if (rootEl) {
        if (opt_index < 0) opt_index = Infinity;
        if (rootEl != this.element_.parentElement) {
          rootEl.insertBefore(this.element_, rootEl.children[opt_index]);
        } else {
          let newIndex = opt_index;
          let elementIndex = 0;
          let t = this.element_;
          while (t = t.previousElementSibling) elementIndex++;
          if (elementIndex < newIndex) newIndex++;
          if (!(elementIndex == newIndex || newIndex >= rootEl.childElementCount && this.element_ == rootEl.lastElementChild)) {
            rootEl.insertBefore(this.element_, rootEl.children[newIndex]);
          }
        }
      }
      this.rendered_ = true;
      ComponentManager.getInstance().markComponentRendered(this);
      this.attachBindings_();
      this.mountCompiledChildComponents_();
      this.instantiateChildComponents_();
      this.setupEventDirectives_();
      this.onAfterRender();
      this.onAfterRenderHooks();
      requestAnimationFrame(() => this.onAfterRenderAsync());
      return true;
    }
    get rendered() {
      return this.rendered_;
    }
    onAfterRender() {
    }
    onAfterRenderAsync() {
    }
    onAfterRenderHooks() {
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
            if (value !== prev || typeof prev === "object" && prev !== null) {
              ;
              component.__onPropChange(prop, value);
            }
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
      for (const key in nextProps) {
        this.props[key] = nextProps[key];
      }
      if (typeof this.__onPropChange !== "function" && typeof this.__geaRequestRender === "function") {
        this.__geaRequestRender();
      }
    }
    toString() {
      return String(this.template(this.props)).trim();
    }
    template(_props) {
      return "<div></div>";
    }
    dispose() {
      ComponentManager.getInstance().removeComponent(this);
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
      const nextSibling = this.element_.nextSibling;
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
            return;
          }
          if (typeof child.dispose == "function") child.dispose();
        });
        this.__childComponents = [];
      }
      const manager = ComponentManager.getInstance();
      const newElement = manager.createElement(String(this.template(this.props)).trim());
      parent.insertBefore(newElement, nextSibling);
      parent.removeChild(this.element_);
      this.element_ = newElement;
      this.rendered_ = true;
      manager.markComponentRendered(this);
      this.attachBindings_();
      this.mountCompiledChildComponents_();
      this.instantiateChildComponents_();
      this.setupEventDirectives_();
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
    attachBindings_() {
      this.cleanupBindings_();
    }
    static _register(ctor) {
      if (!ctor || !ctor.name || ctor.__geaAutoRegistered) return;
      if (Object.getPrototypeOf(ctor.prototype) === _Component.prototype) {
        ctor.__geaAutoRegistered = true;
        _Component.__componentClasses.set(ctor.name, ctor);
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
      if (selectors.length > 0) {
        elements = Array.from(this.element_.querySelectorAll(selectors.join(",")));
      }
      elements.forEach((el) => {
        if (el.getAttribute("data-gea-component-mounted")) return;
        if (el.hasAttribute("data-gea-compiled-child-root")) return;
        const ctorName = el.constructor.name;
        if (ctorName !== "HTMLUnknownElement" && ctorName !== "HTMLElement") return;
        const tagName = el.tagName.toLowerCase();
        let Ctor = manager.getComponentConstructor(tagName);
        if (!Ctor && _Component.__componentClasses) {
          const pascalCase = tagName.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
          Ctor = _Component.__componentClasses.get(pascalCase);
          if (Ctor) {
            manager.registerComponentClass(Ctor, tagName);
          }
        }
        if (!Ctor) return;
        const props = this.extractComponentProps_(el);
        const itemId = el.getAttribute("data-prop-item-id");
        const child = new Ctor(props);
        child.parentComponent = this;
        this.__childComponents.push(child);
        const parent = el.parentElement;
        if (!parent) return;
        const children = Array.prototype.slice.call(parent.children);
        const index = children.indexOf(el);
        child.render(parent, index);
        if (itemId != null && child.el) {
          const wrapper = document.createElement("div");
          wrapper.setAttribute("data-gea-item-id", itemId);
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
            if (!this.__childComponents.includes(value)) {
              this.__childComponents.push(value);
            }
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
        existing.setAttribute("data-gea-compiled-child-root", "");
        child.element_ = existing;
        child.rendered_ = true;
        manager.markComponentRendered(child);
        child.attachBindings_();
        child.mountCompiledChildComponents_();
        child.instantiateChildComponents_();
        child.setupEventDirectives_();
        child.onAfterRender();
        child.onAfterRenderHooks();
        requestAnimationFrame(() => child.onAfterRenderAsync());
      });
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
      if (!this.__childComponents.includes(newChild)) {
        this.__childComponents.push(newChild);
      }
      const mgr = ComponentManager.getInstance();
      mgr.markComponentRendered(newChild);
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
    setupEventDirectives_() {
      return;
    }
    teardownSelfListeners_() {
      this.__selfListeners.forEach((remove2) => {
        if (typeof remove2 == "function") remove2();
      });
      this.__selfListeners = [];
    }
    extractComponentProps_(el) {
      const props = {};
      if (!el.getAttributeNames) return props;
      el.getAttributeNames().filter((name) => name.startsWith("data-prop-")).forEach((name) => {
        const value = el.getAttribute(name);
        const propName = this.normalizePropName_(name.slice(10));
        if (this.__geaPropBindings && value && value.startsWith("__gea_prop_")) {
          const propValue = this.__geaPropBindings.get(value);
          if (propValue === void 0) {
            console.warn(`[gea] Prop binding not found for ${value} on component ${this.constructor.name}`);
          }
          props[propName] = propValue;
        } else {
          props[propName] = this.coerceStaticPropValue_(value);
        }
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
    __geaRegisterMap(idx, containerProp, getContainer, getItems, createItem) {
      if (!this.__geaMaps) this.__geaMaps = {};
      this.__geaMaps[idx] = { containerProp, getContainer, getItems, createItem, container: null };
    }
    __geaSyncMap(idx) {
      if (!this.rendered_) return;
      const map = this.__geaMaps?.[idx];
      if (!map) return;
      const container = map.getContainer();
      if (!container) return;
      map.container = container;
      this[map.containerProp] = container;
      const items = map.getItems();
      const normalizedItems = Array.isArray(items) ? items : [];
      this.__geaSyncItems(container, normalizedItems, map.createItem);
    }
    __geaSyncItems(container, items, createItemFn) {
      const c = container;
      let prev = c.__geaPrev;
      if (!prev) {
        prev = [];
        for (let n = container.firstChild; n; n = n.nextSibling) {
          if (n.nodeType === 1) {
            const aid = n.getAttribute("data-gea-item-id");
            if (aid) prev.push(aid);
          } else if (n.nodeType === 8 && !n.data) break;
        }
        c.__geaCount = prev.length;
      }
      if (prev.length === items.length) {
        let same = true;
        for (let j = 0; j < prev.length; j++) {
          if (__geaSyncItemKey(prev[j]) !== __geaSyncItemKey(items[j])) {
            same = false;
            break;
          }
        }
        if (same) {
          c.__geaPrev = items.slice();
          return;
        }
      }
      if (items.length > prev.length) {
        let appendOk = true;
        for (let j = 0; j < prev.length; j++) {
          if (__geaSyncItemKey(prev[j]) !== __geaSyncItemKey(items[j])) {
            appendOk = false;
            break;
          }
        }
        if (appendOk) {
          const frag = document.createDocumentFragment();
          for (let j = prev.length; j < items.length; j++) {
            frag.appendChild(createItemFn(items[j], j));
          }
          let marker = null;
          for (let sc = container.firstChild; sc; sc = sc.nextSibling) {
            if (sc.nodeType === 8 && !sc.data) {
              marker = sc;
              break;
            }
          }
          container.insertBefore(frag, marker);
          c.__geaPrev = items.slice();
          c.__geaCount = items.length;
          return;
        }
      }
      if (items.length < prev.length) {
        const newSet = /* @__PURE__ */ new Set();
        for (let j = 0; j < items.length; j++) newSet.add(__geaSyncItemKey(items[j]));
        const removals = [];
        for (let sc = container.firstChild; sc; sc = sc.nextSibling) {
          if (sc.nodeType === 1) {
            const aid = sc.getAttribute("data-gea-item-id");
            if (aid && !newSet.has(aid)) removals.push(sc);
          } else if (sc.nodeType === 8 && !sc.data) break;
        }
        if (removals.length === prev.length - items.length) {
          for (let j = 0; j < removals.length; j++) container.removeChild(removals[j]);
          c.__geaPrev = items.slice();
          c.__geaCount = items.length;
          return;
        }
      }
      c.__geaPrev = items.slice();
      let oldCount = c.__geaCount;
      if (oldCount == null) {
        oldCount = 0;
        for (let n = container.firstChild; n; n = n.nextSibling) {
          if (n.nodeType === 1) oldCount++;
          else if (n.nodeType === 8 && !n.data) break;
        }
      }
      let toRemove = oldCount;
      while (toRemove > 0 && container.firstChild) {
        const rm = container.firstChild;
        if (rm.nodeType === 1) toRemove--;
        container.removeChild(rm);
      }
      const fragment = document.createDocumentFragment();
      for (let i = 0; i < items.length; i++) {
        fragment.appendChild(createItemFn(items[i], i));
      }
      container.insertBefore(fragment, container.firstChild);
      c.__geaCount = items.length;
    }
    __geaCloneItem(container, item, renderFn, bindingId, itemIdProp, patches) {
      const c = container;
      const idProp = itemIdProp || "id";
      if (!c.__geaTpl) {
        if (bindingId) c.__geaIdPfx = this.id_ + "-" + bindingId + "-";
        try {
          const tw = container.cloneNode(false);
          tw.innerHTML = renderFn({ [idProp]: 0, label: "" });
          c.__geaTpl = tw.firstElementChild;
        } catch {
        }
      }
      let el;
      if (c.__geaTpl) {
        el = c.__geaTpl.cloneNode(true);
      } else {
        const tw = container.cloneNode(false);
        tw.innerHTML = renderFn(item);
        el = tw.firstElementChild;
      }
      const raw = item != null && typeof item === "object" ? item[idProp] : void 0;
      const itemKey = String(raw != null ? raw : item);
      el.setAttribute("data-gea-item-id", itemKey);
      if (c.__geaIdPfx) el.id = c.__geaIdPfx + itemKey;
      el.__geaItem = item;
      if (patches) {
        for (let i = 0; i < patches.length; i++) {
          const p = patches[i];
          const path = p[0];
          const type = p[1];
          const val = p[2];
          let target = el;
          for (let j = 0; j < path.length; j++) target = target.children[path[j]];
          if (type === "c") target.className = String(val).trim();
          else if (type === "t") target.textContent = String(val);
          else {
            if (val == null || val === false) target.removeAttribute(type);
            else target.setAttribute(type, String(val));
          }
        }
      }
      return el;
    }
    __geaRegisterCond(idx, slotId, getCond, getTruthyHtml, getFalsyHtml) {
      if (!this.__geaConds) this.__geaConds = {};
      this.__geaConds[idx] = { slotId, getCond, getTruthyHtml, getFalsyHtml };
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
        let node = marker.nextSibling;
        while (node && node !== endMarker) {
          const next = node.nextSibling;
          node.remove();
          node = next;
        }
        if (htmlFn) {
          const html = htmlFn();
          const isSvg = "namespaceURI" in parent && parent.namespaceURI === "http://www.w3.org/2000/svg";
          if (isSvg) {
            const wrap2 = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            wrap2.innerHTML = html;
            while (wrap2.firstChild) parent.insertBefore(wrap2.firstChild, endMarker);
          } else {
            const tpl = document.createElement("template");
            tpl.innerHTML = html;
            _Component.__syncValueProps(tpl.content);
            parent.insertBefore(tpl.content, endMarker);
          }
        }
      };
      if (needsPatch) {
        if (!cond) {
          const disposed = /* @__PURE__ */ new Set();
          let node = marker.nextSibling;
          while (node && node !== endMarker) {
            if (node.nodeType === 1) {
              const el = node;
              for (const child of this.__childComponents) {
                if (child.__geaCompiledChild && child.element_ && (child.element_ === el || el.contains(child.element_))) {
                  disposed.add(child);
                }
              }
            }
            node = node.nextSibling;
          }
          for (const child of disposed) {
            child.dispose();
            for (const key of Object.keys(this)) {
              if (this[key] === child) {
                ;
                this[key] = null;
                break;
              }
            }
          }
          if (disposed.size > 0) {
            this.__childComponents = this.__childComponents.filter((c) => !disposed.has(c));
          }
        }
        replaceSlotContent(cond ? conf.getTruthyHtml : conf.getFalsyHtml);
        if (cond) {
          this.mountCompiledChildComponents_();
          this.instantiateChildComponents_();
          this.setupEventDirectives_();
          _Component.__syncAutofocus(marker, endMarker);
        }
      } else if (cond && conf.getTruthyHtml) {
        const existingNode = marker.nextSibling;
        if (existingNode && existingNode !== endMarker && existingNode.nodeType === 1) {
          if (existingNode.hasAttribute("data-gea-compiled-child-root")) return needsPatch;
          const newHtml = conf.getTruthyHtml();
          const tpl = document.createElement("template");
          tpl.innerHTML = newHtml;
          const newEl = tpl.content.firstElementChild;
          if (newEl) {
            _Component.__patchNode(existingNode, newEl);
          }
        }
      }
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
            ;
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
        if (name === "value" && "value" in existing) {
          ;
          existing.value = value;
        }
      }
      const oldChildren = existing.childNodes;
      const newChildren = desired.childNodes;
      const max2 = Math.max(oldChildren.length, newChildren.length);
      for (let i = 0; i < max2; i++) {
        const oldChild = oldChildren[i];
        const newChild = newChildren[i];
        if (!oldChild && newChild) {
          existing.appendChild(newChild.cloneNode(true));
        } else if (oldChild && !newChild) {
          oldChild.remove();
          i--;
        } else if (oldChild && newChild) {
          if (oldChild.nodeType !== newChild.nodeType) {
            oldChild.replaceWith(newChild.cloneNode(true));
          } else if (oldChild.nodeType === 3) {
            if (oldChild.textContent !== newChild.textContent) oldChild.textContent = newChild.textContent;
          } else if (oldChild.nodeType === 1) {
            _Component.__patchNode(oldChild, newChild);
          }
        }
      }
    }
    static register(tagName) {
      const manager = ComponentManager.getInstance();
      manager.registerComponentClass(this, tagName);
      if (_Component.__componentClasses) {
        _Component.__componentClasses.set(this.name, this);
      }
    }
  };

  // packages/gea/src/lib/router/match.ts
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
      if (pp.startsWith(":")) {
        params[pp.slice(1)] = decodeURIComponent(pathPart);
      } else if (pp !== pathPart) {
        return null;
      }
    }
    if (hasWildcard) {
      params["*"] = pathParts.slice(patternParts.length).map(decodeURIComponent).join("/");
    }
    return { pattern, params };
  }

  // packages/gea/src/lib/router/redirect.ts
  function resolveRedirect(entry, params, currentPath) {
    if (typeof entry === "string") {
      return { target: entry, method: "replace" };
    }
    const target = typeof entry.redirect === "function" ? entry.redirect(params, currentPath) : entry.redirect;
    return {
      target,
      method: entry.method ?? "replace",
      status: entry.status
    };
  }

  // packages/gea/src/lib/router/resolve.ts
  function isRouteGroupConfig(entry) {
    return typeof entry === "object" && entry !== null && "children" in entry;
  }
  function isRedirectConfig(entry) {
    return typeof entry === "object" && entry !== null && "redirect" in entry;
  }
  function isLazyComponent(entry) {
    return typeof entry === "function" && !entry.prototype;
  }
  function matchPrefix(pattern, path) {
    if (pattern === "/") {
      return { params: {}, rest: path };
    }
    const patternParts = pattern.split("/").filter(Boolean);
    const pathParts = path.split("/").filter(Boolean);
    if (pathParts.length < patternParts.length) return null;
    const params = {};
    for (let i = 0; i < patternParts.length; i++) {
      const pp = patternParts[i];
      const pathPart = pathParts[i];
      if (pp.startsWith(":")) {
        params[pp.slice(1)] = decodeURIComponent(pathPart);
      } else if (pp !== pathPart) {
        return null;
      }
    }
    const rest = "/" + pathParts.slice(patternParts.length).join("/");
    return { params, rest };
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
    const resolved = resolveRecursive(routes, path, search || "", result);
    return resolved;
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
      const match4 = matchRoute(pattern, path);
      if (!match4) return null;
      const redirectResult = resolveRedirect(entry, match4.params, path);
      return {
        ...result,
        pattern,
        params: { ...result.params, ...match4.params },
        matches: [...result.matches, pattern],
        redirect: redirectResult.target,
        redirectMethod: redirectResult.method
      };
    }
    if (isRedirectConfig(entry)) {
      const match4 = matchRoute(pattern, path);
      if (!match4) return null;
      const redirectResult = resolveRedirect(entry, match4.params, path);
      return {
        ...result,
        pattern,
        params: { ...result.params, ...match4.params },
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
        params: { ...result.params, ...prefixMatch.params },
        matches: [...result.matches, pattern],
        layouts: [...result.layouts],
        guards: [...result.guards],
        queryModes: new Map(result.queryModes)
      };
      if (entry.layout) {
        nextResult.layouts.push(entry.layout);
      }
      if (entry.guard) {
        nextResult.guards.push(entry.guard);
      }
      if (entry.mode && entry.mode.type === "query") {
        const childKeys = Object.keys(entry.children);
        const searchParams = new URLSearchParams(search);
        let activeKey = searchParams.get(entry.mode.param) || childKeys[0];
        if (!childKeys.includes(activeKey)) {
          activeKey = childKeys[0];
        }
        if (entry.layout) {
          nextResult.queryModes.set(nextResult.layouts.length - 1, {
            activeKey,
            keys: childKeys,
            param: entry.mode.param
          });
        }
        const childEntry = entry.children[activeKey];
        if (childEntry !== void 0) {
          const childRoutes = { [prefixMatch.rest]: childEntry };
          return resolveRecursive(childRoutes, prefixMatch.rest, search, nextResult);
        }
        return nextResult;
      }
      return resolveRecursive(entry.children, prefixMatch.rest, search, nextResult);
    }
    const match3 = matchRoute(pattern, path);
    if (!match3) return null;
    const mergedParams = { ...result.params, ...match3.params };
    const mergedMatches = [...result.matches, pattern];
    if (isLazyComponent(entry)) {
      return {
        ...result,
        component: null,
        pattern,
        params: mergedParams,
        matches: mergedMatches,
        isLazy: true,
        lazyLoader: entry
      };
    }
    return {
      ...result,
      component: entry,
      pattern,
      params: mergedParams,
      matches: mergedMatches
    };
  }

  // packages/gea/src/lib/router/guard.ts
  function runGuards(guards) {
    for (const guard of guards) {
      const result = guard();
      if (result !== true) return result;
    }
    return true;
  }

  // packages/gea/src/lib/router/lazy.ts
  async function resolveLazy(loader, retries = 3, delay2 = 1e3) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const mod = await loader();
        return mod && typeof mod === "object" && "default" in mod ? mod.default : mod;
      } catch (err) {
        lastError = err;
        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, delay2 * 2 ** attempt));
        }
      }
    }
    throw lastError;
  }

  // packages/gea/src/lib/router/query.ts
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
      if (existing === void 0) {
        result[key] = value;
      } else if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        result[key] = [existing, value];
      }
    }
    return result;
  }

  // packages/gea/src/lib/router/link.ts
  function escapeAttr(value) {
    return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  }
  var Link = class _Link extends Component {
    constructor() {
      super(...arguments);
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
        const router3 = _Link._router;
        if (router3) {
          this.props.replace ? router3.replace(to) : router3.push(to);
        }
      };
      el.addEventListener("click", this._clickHandler);
      const router2 = _Link._router;
      if (router2) {
        this._updateActive(router2);
        this._observerRemover = router2.observe("path", () => this._updateActive(router2));
      }
    }
    _updateActive(router2) {
      const el = this.el;
      if (!el) return;
      const to = this.props.to;
      const active = this.props.exact ? router2.isExact(to) : router2.isActive(to);
      if (active) {
        el.setAttribute("data-active", "");
      } else {
        el.removeAttribute("data-active");
      }
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

  // packages/gea/src/lib/router/outlet.ts
  var Outlet = class _Outlet extends Component {
    constructor() {
      super(...arguments);
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
      let router2 = null;
      let parent = this.parentComponent;
      while (parent) {
        if (parent.__isRouterOutlet) {
          depth = parent._routerDepth + 1;
          router2 = parent._router ?? parent.props?.router ?? null;
          break;
        }
        parent = parent.parentComponent;
      }
      if (!router2) router2 = _Outlet._router;
      return { depth, router: router2 };
    }
    onAfterRender() {
      const { depth, router: router2 } = this._computeDepthAndRouter();
      this._routerDepth = depth;
      if (router2 && router2 !== this._router) {
        for (const remove2 of this._observerRemovers) remove2();
        this._observerRemovers = [];
        this._router = router2;
      }
      if (this._observerRemovers.length === 0 && this._router) {
        const r2 = this._router;
        const removePath = r2.observe("path", () => this._updateView());
        const removeError = r2.observe("error", () => this._updateView());
        const removeQuery = r2.observe("query", () => this._updateView());
        this._observerRemovers.push(removePath, removeError, removeQuery);
      }
      this._updateView();
    }
    _getRouter() {
      return this._router ?? this.props?.router ?? _Outlet._router;
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
      const router2 = this._getRouter();
      if (!router2) return;
      if (this._currentChild && (!this._currentChild.element_ || !this.el.contains(this._currentChild.element_))) {
        this._clearCurrent();
      }
      const depth = this._routerDepth;
      const item = router2.getComponentAtDepth(depth);
      if (!item) {
        this._clearCurrent();
        return;
      }
      const isLeaf = depth >= router2.layoutCount;
      const isSameComponent = this._currentComponentClass === item.component;
      if (isSameComponent && !isLeaf) {
        if (item.cacheKey === null || item.cacheKey === this._lastCacheKey) {
          return;
        }
      }
      if (isSameComponent && isLeaf && router2.path === this._lastPath) {
        return;
      }
      this._clearCurrent();
      if (this._isClassComponent(item.component)) {
        const child = new item.component(item.props);
        child.parentComponent = this;
        child.render(this.el);
        this._currentChild = child;
        this._currentComponentClass = item.component;
        this.__childComponents = [child];
      }
      this._lastCacheKey = item.cacheKey;
      this._lastPath = router2.path;
    }
    dispose() {
      for (const remove2 of this._observerRemovers) {
        remove2();
      }
      this._observerRemovers = [];
      this._clearCurrent();
      super.dispose();
    }
  };

  // packages/gea/src/lib/router/router.ts
  function buildUrl(target) {
    if (typeof target === "string") {
      let path = target;
      let search2 = "";
      let hash2 = "";
      const hashIdx = path.indexOf("#");
      if (hashIdx !== -1) {
        hash2 = path.slice(hashIdx);
        path = path.slice(0, hashIdx);
      }
      const qIdx = path.indexOf("?");
      if (qIdx !== -1) {
        search2 = path.slice(qIdx);
        path = path.slice(0, qIdx);
      }
      return { path, search: search2, hash: hash2 };
    }
    let search = "";
    if (target.query) {
      const parts4 = [];
      for (const [key, val] of Object.entries(target.query)) {
        if (Array.isArray(val)) {
          for (const v of val) {
            parts4.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
          }
        } else {
          parts4.push(`${encodeURIComponent(key)}=${encodeURIComponent(val)}`);
        }
      }
      if (parts4.length > 0) search = "?" + parts4.join("&");
    }
    const hash = target.hash ? target.hash.startsWith("#") ? target.hash : "#" + target.hash : "";
    return { path: target.path, search, hash };
  }
  var Router = class extends Store {
    constructor(routes, options) {
      super();
      // Reactive class fields (tracked by Store proxy)
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
      this._resolve();
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
      window.history.back();
    }
    forward() {
      window.history.forward();
    }
    go(delta) {
      window.history.go(delta);
    }
    get layoutCount() {
      return this._layouts.length;
    }
    getComponentAtDepth(depth) {
      if (depth < this._layouts.length) {
        const layout = this._layouts[depth];
        const props = { ...this.params };
        let cacheKey = null;
        const modeInfo = this._queryModes.get(depth);
        if (modeInfo) {
          props.activeKey = modeInfo.activeKey;
          props.keys = modeInfo.keys;
          props.navigate = (key) => {
            const sp = new URLSearchParams(window.location.search);
            sp.set(modeInfo.param, key);
            this.replace({ path: this.path, query: Object.fromEntries(sp) });
          };
          cacheKey = modeInfo.activeKey;
        }
        return { component: layout, props, cacheKey };
      }
      if (depth === this._layouts.length) {
        const comp = this._guardComponent ?? this._currentComponent;
        return comp ? { component: comp, props: { ...this.params }, cacheKey: null } : null;
      }
      return null;
    }
    isActive(path) {
      return this.path.startsWith(path);
    }
    isExact(path) {
      return this.path === path;
    }
    dispose() {
      if (this._popstateHandler) {
        window.removeEventListener("popstate", this._popstateHandler);
        this._popstateHandler = null;
      }
      if (this._clickHandler) {
        document.removeEventListener("click", this._clickHandler);
        this._clickHandler = null;
      }
    }
    _navigate(target, method) {
      const { path, search, hash } = buildUrl(target);
      const base = this._options.base;
      const fullPath = base + path + search + hash;
      if (this._options.scroll && method === "push") {
        this._scrollPositions.set(this._historyIndex, {
          x: window.scrollX ?? 0,
          y: window.scrollY ?? 0
        });
      }
      if (method === "push") {
        this._historyIndex++;
        window.history.pushState({ index: this._historyIndex }, "", fullPath);
      } else {
        window.history.replaceState({ index: this._historyIndex }, "", fullPath);
      }
      this._resolve();
      if (this._options.scroll && method === "push") {
        window.scrollTo(0, 0);
      }
    }
    _resolve() {
      const base = this._options.base;
      let currentPath = window.location.pathname;
      const currentSearch = window.location.search;
      const currentHash = window.location.hash;
      if (base && currentPath.startsWith(base)) {
        currentPath = currentPath.slice(base.length) || "/";
      }
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

  // packages/gea/src/lib/router/index.ts
  var _router = null;
  var router = new Proxy({}, {
    get(_target, prop, receiver) {
      if (!_router) _router = new Router();
      return Reflect.get(_router, prop, receiver);
    },
    set(_target, prop, value) {
      if (!_router) _router = new Router();
      return Reflect.set(_router, prop, value);
    }
  });

  // node_modules/@zag-js/vanilla/dist/chunk-QZ7TP4HQ.mjs
  var __defProp2 = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp2(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // node_modules/@zag-js/utils/dist/array.mjs
  function toArray(v) {
    if (v == null) return [];
    return Array.isArray(v) ? v : [v];
  }
  var has = (v, t) => v.indexOf(t) !== -1;
  var add = (v, ...items) => v.concat(items);
  var remove = (v, ...items) => v.filter((t) => !items.includes(t));
  var addOrRemove = (v, item) => has(v, item) ? remove(v, item) : add(v, item);

  // node_modules/@zag-js/utils/dist/equal.mjs
  var isArrayLike = (value) => value?.constructor.name === "Array";
  var isArrayEqual = (a, b) => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!isEqual(a[i], b[i])) return false;
    }
    return true;
  };
  var isEqual = (a, b) => {
    if (Object.is(a, b)) return true;
    if (a == null && b != null || a != null && b == null) return false;
    if (typeof a?.isEqual === "function" && typeof b?.isEqual === "function") {
      return a.isEqual(b);
    }
    if (typeof a === "function" && typeof b === "function") {
      return a.toString() === b.toString();
    }
    if (isArrayLike(a) && isArrayLike(b)) {
      return isArrayEqual(Array.from(a), Array.from(b));
    }
    if (!(typeof a === "object") || !(typeof b === "object")) return false;
    const keys = Object.keys(b ?? /* @__PURE__ */ Object.create(null));
    const length = keys.length;
    for (let i = 0; i < length; i++) {
      const hasKey = Reflect.has(a, keys[i]);
      if (!hasKey) return false;
    }
    for (let i = 0; i < length; i++) {
      const key = keys[i];
      if (!isEqual(a[key], b[key])) return false;
    }
    return true;
  };

  // node_modules/@zag-js/utils/dist/guard.mjs
  var isArray = (v) => Array.isArray(v);
  var isObjectLike = (v) => v != null && typeof v === "object";
  var isObject = (v) => isObjectLike(v) && !isArray(v);
  var isString = (v) => typeof v === "string";
  var isFunction = (v) => typeof v === "function";
  var isNull = (v) => v == null;
  var hasProp = (obj, prop) => Object.prototype.hasOwnProperty.call(obj, prop);
  var baseGetTag = (v) => Object.prototype.toString.call(v);
  var fnToString = Function.prototype.toString;
  var objectCtorString = fnToString.call(Object);
  var isPlainObject = (v) => {
    if (!isObjectLike(v) || baseGetTag(v) != "[object Object]" || isFrameworkElement(v)) return false;
    const proto = Object.getPrototypeOf(v);
    if (proto === null) return true;
    const Ctor = hasProp(proto, "constructor") && proto.constructor;
    return typeof Ctor == "function" && Ctor instanceof Ctor && fnToString.call(Ctor) == objectCtorString;
  };
  var isReactElement = (x) => typeof x === "object" && x !== null && "$$typeof" in x && "props" in x;
  var isVueElement = (x) => typeof x === "object" && x !== null && "__v_isVNode" in x;
  var isFrameworkElement = (x) => isReactElement(x) || isVueElement(x);

  // node_modules/@zag-js/utils/dist/functions.mjs
  var runIfFn = (v, ...a) => {
    const res = typeof v === "function" ? v(...a) : v;
    return res ?? void 0;
  };
  var identity = (v) => v();
  var noop = () => {
  };
  var callAll = (...fns) => (...a) => {
    fns.forEach(function(fn) {
      fn?.(...a);
    });
  };
  var uuid = /* @__PURE__ */ (() => {
    let id = 0;
    return () => {
      id++;
      return id.toString(36);
    };
  })();

  // node_modules/@zag-js/utils/dist/object.mjs
  function compact(obj) {
    if (!isPlainObject(obj) || obj === void 0) return obj;
    const keys = Reflect.ownKeys(obj).filter((key) => typeof key === "string");
    const filtered = {};
    for (const key of keys) {
      const value = obj[key];
      if (value !== void 0) {
        filtered[key] = compact(value);
      }
    }
    return filtered;
  }

  // node_modules/@zag-js/utils/dist/warning.mjs
  function warn(...a) {
    const m = a.length === 1 ? a[0] : a[1];
    const c = a.length === 2 ? a[0] : true;
    if (c && true) {
      console.warn(m);
    }
  }
  function ensure(c, m) {
    if (c == null) throw new Error(m());
  }

  // node_modules/@zag-js/core/dist/state.mjs
  var STATE_DELIMITER = ".";
  var ABSOLUTE_PREFIX = "#";
  var stateIndexCache = /* @__PURE__ */ new WeakMap();
  var stateIdIndexCache = /* @__PURE__ */ new WeakMap();
  function joinStatePath(parts4) {
    return parts4.join(STATE_DELIMITER);
  }
  function isAbsoluteStatePath(value) {
    return value.includes(STATE_DELIMITER);
  }
  function isExplicitAbsoluteStatePath(value) {
    return value.startsWith(ABSOLUTE_PREFIX);
  }
  function stripAbsolutePrefix(value) {
    return isExplicitAbsoluteStatePath(value) ? value.slice(ABSOLUTE_PREFIX.length) : value;
  }
  function appendStatePath(base, segment) {
    return base ? `${base}${STATE_DELIMITER}${segment}` : segment;
  }
  function buildStateIndex(machine5) {
    const index = /* @__PURE__ */ new Map();
    const idIndex = /* @__PURE__ */ new Map();
    const visit = (basePath, state) => {
      index.set(basePath, state);
      const stateId = state.id;
      if (stateId) {
        if (idIndex.has(stateId)) {
          throw new Error(`Duplicate state id: ${stateId}`);
        }
        idIndex.set(stateId, basePath);
      }
      const childStates = state.states;
      if (!childStates) return;
      for (const [childKey, childState] of Object.entries(childStates)) {
        if (!childState) continue;
        const childPath = appendStatePath(basePath, childKey);
        visit(childPath, childState);
      }
    };
    for (const [topKey, topState] of Object.entries(machine5.states)) {
      if (!topState) continue;
      visit(topKey, topState);
    }
    return { index, idIndex };
  }
  function ensureStateIndex(machine5) {
    const cached = stateIndexCache.get(machine5);
    if (cached) return cached;
    const { index, idIndex } = buildStateIndex(machine5);
    stateIndexCache.set(machine5, index);
    stateIdIndexCache.set(machine5, idIndex);
    return index;
  }
  function getStatePathById(machine5, stateId) {
    ensureStateIndex(machine5);
    return stateIdIndexCache.get(machine5)?.get(stateId);
  }
  function toSegments(value) {
    if (!value) return [];
    return String(value).split(STATE_DELIMITER).filter(Boolean);
  }
  function getStateChain(machine5, state) {
    if (!state) return [];
    const stateIndex = ensureStateIndex(machine5);
    const segments = toSegments(state);
    const chain = [];
    const statePath = [];
    for (const segment of segments) {
      statePath.push(segment);
      const path = joinStatePath(statePath);
      const current = stateIndex.get(path);
      if (!current) break;
      chain.push({ path, state: current });
    }
    return chain;
  }
  function resolveAbsoluteStateValue(machine5, value) {
    const stateIndex = ensureStateIndex(machine5);
    const segments = toSegments(value);
    if (!segments.length) return value;
    const resolved = [];
    for (const segment of segments) {
      resolved.push(segment);
      const path = joinStatePath(resolved);
      if (!stateIndex.has(path)) return value;
    }
    let resolvedPath = joinStatePath(resolved);
    let current = stateIndex.get(resolvedPath);
    while (current?.initial) {
      const nextPath = `${resolvedPath}${STATE_DELIMITER}${current.initial}`;
      const nextState = stateIndex.get(nextPath);
      if (!nextState) break;
      resolvedPath = nextPath;
      current = nextState;
    }
    return resolvedPath;
  }
  function hasStatePath(machine5, value) {
    const stateIndex = ensureStateIndex(machine5);
    return stateIndex.has(value);
  }
  function resolveStateValue(machine5, value, source) {
    const stateValue = String(value);
    if (isExplicitAbsoluteStatePath(stateValue)) {
      const stateId = stripAbsolutePrefix(stateValue);
      const statePath = getStatePathById(machine5, stateId);
      if (!statePath) {
        throw new Error(`Unknown state id: ${stateId}`);
      }
      return resolveAbsoluteStateValue(machine5, statePath);
    }
    if (!isAbsoluteStatePath(stateValue) && source) {
      const sourceSegments = toSegments(source);
      for (let index = sourceSegments.length; index >= 1; index--) {
        const base = sourceSegments.slice(0, index).join(STATE_DELIMITER);
        const candidate = appendStatePath(base, stateValue);
        if (hasStatePath(machine5, candidate)) return resolveAbsoluteStateValue(machine5, candidate);
      }
    }
    return resolveAbsoluteStateValue(machine5, stateValue);
  }
  function findTransition(machine5, state, eventType) {
    const chain = getStateChain(machine5, state);
    for (let index = chain.length - 1; index >= 0; index--) {
      const transitionMap = chain[index]?.state.on;
      const transition = transitionMap?.[eventType];
      if (transition) return { transitions: transition, source: chain[index]?.path };
    }
    const rootTransitionMap = machine5.on;
    return { transitions: rootTransitionMap?.[eventType], source: void 0 };
  }
  function getExitEnterStates(machine5, prevState, nextState, reenter) {
    const prevChain = prevState ? getStateChain(machine5, prevState) : [];
    const nextChain = getStateChain(machine5, nextState);
    let commonIndex = 0;
    while (commonIndex < prevChain.length && commonIndex < nextChain.length && prevChain[commonIndex]?.path === nextChain[commonIndex]?.path) {
      commonIndex += 1;
    }
    let exiting = prevChain.slice(commonIndex).reverse();
    let entering = nextChain.slice(commonIndex);
    const sameLeaf = prevChain.at(-1)?.path === nextChain.at(-1)?.path;
    if (reenter && sameLeaf) {
      exiting = prevChain.slice().reverse();
      entering = nextChain;
    }
    return { exiting, entering };
  }
  function matchesState(current, value) {
    if (!current) return false;
    return current === value || current.startsWith(`${value}${STATE_DELIMITER}`);
  }
  function hasTag(machine5, state, tag) {
    return getStateChain(machine5, state).some((item) => item.state.tags?.includes(tag));
  }

  // node_modules/@zag-js/core/dist/create-machine.mjs
  function createGuards() {
    return {
      and: (...guards) => {
        return function andGuard(params) {
          return guards.every((str) => params.guard(str));
        };
      },
      or: (...guards) => {
        return function orGuard(params) {
          return guards.some((str) => params.guard(str));
        };
      },
      not: (guard) => {
        return function notGuard(params) {
          return !params.guard(guard);
        };
      }
    };
  }
  function createMachine(config) {
    ensureStateIndex(config);
    return config;
  }

  // node_modules/@zag-js/core/dist/types.mjs
  var MachineStatus = /* @__PURE__ */ ((MachineStatus2) => {
    MachineStatus2["NotStarted"] = "Not Started";
    MachineStatus2["Started"] = "Started";
    MachineStatus2["Stopped"] = "Stopped";
    return MachineStatus2;
  })(MachineStatus || {});
  var INIT_STATE = "__init__";

  // node_modules/@zag-js/dom-query/dist/chunk-QZ7TP4HQ.mjs
  var __defProp3 = Object.defineProperty;
  var __defNormalProp2 = (obj, key, value) => key in obj ? __defProp3(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField2 = (obj, key, value) => __defNormalProp2(obj, typeof key !== "symbol" ? key + "" : key, value);

  // node_modules/@zag-js/dom-query/dist/shared.mjs
  var wrap = (v, idx) => {
    return v.map((_, index) => v[(Math.max(idx, 0) + index) % v.length]);
  };
  var noop2 = () => void 0;
  var isObject2 = (v) => typeof v === "object" && v !== null;
  var dataAttr = (guard) => guard ? "" : void 0;
  var ariaAttr = (guard) => guard ? "true" : void 0;

  // node_modules/@zag-js/dom-query/dist/node.mjs
  var ELEMENT_NODE = 1;
  var DOCUMENT_NODE = 9;
  var DOCUMENT_FRAGMENT_NODE = 11;
  var isHTMLElement = (el) => isObject2(el) && el.nodeType === ELEMENT_NODE && typeof el.nodeName === "string";
  var isDocument = (el) => isObject2(el) && el.nodeType === DOCUMENT_NODE;
  var isWindow = (el) => isObject2(el) && el === el.window;
  var getNodeName = (node) => {
    if (isHTMLElement(node)) return node.localName || "";
    return "#document";
  };
  function isRootElement(node) {
    return ["html", "body", "#document"].includes(getNodeName(node));
  }
  var isNode = (el) => isObject2(el) && el.nodeType !== void 0;
  var isShadowRoot = (el) => isNode(el) && el.nodeType === DOCUMENT_FRAGMENT_NODE && "host" in el;
  var isInputElement = (el) => isHTMLElement(el) && el.localName === "input";
  var isElementVisible = (el) => {
    if (!isHTMLElement(el)) return false;
    return el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0;
  };
  function isActiveElement(element) {
    if (!element) return false;
    const rootNode = element.getRootNode();
    return getActiveElement(rootNode) === element;
  }
  var TEXTAREA_SELECT_REGEX = /(textarea|select)/;
  function isEditableElement(el) {
    if (el == null || !isHTMLElement(el)) return false;
    try {
      return isInputElement(el) && el.selectionStart != null || TEXTAREA_SELECT_REGEX.test(el.localName) || el.isContentEditable || el.getAttribute("contenteditable") === "true" || el.getAttribute("contenteditable") === "";
    } catch {
      return false;
    }
  }
  function contains(parent, child) {
    if (!parent || !child) return false;
    if (!isHTMLElement(parent) || !isHTMLElement(child)) return false;
    const rootNode = child.getRootNode?.();
    if (parent === child) return true;
    if (parent.contains(child)) return true;
    if (rootNode && isShadowRoot(rootNode)) {
      let next = child;
      while (next) {
        if (parent === next) return true;
        next = next.parentNode || next.host;
      }
    }
    return false;
  }
  function getDocument(el) {
    if (isDocument(el)) return el;
    if (isWindow(el)) return el.document;
    return el?.ownerDocument ?? document;
  }
  function getDocumentElement(el) {
    return getDocument(el).documentElement;
  }
  function getWindow(el) {
    if (isShadowRoot(el)) return getWindow(el.host);
    if (isDocument(el)) return el.defaultView ?? window;
    if (isHTMLElement(el)) return el.ownerDocument?.defaultView ?? window;
    return window;
  }
  function getActiveElement(rootNode) {
    let activeElement = rootNode.activeElement;
    while (activeElement?.shadowRoot) {
      const el = activeElement.shadowRoot.activeElement;
      if (!el || el === activeElement) break;
      else activeElement = el;
    }
    return activeElement;
  }
  function getParentNode(node) {
    if (getNodeName(node) === "html") return node;
    const result = node.assignedSlot || node.parentNode || isShadowRoot(node) && node.host || getDocumentElement(node);
    return isShadowRoot(result) ? result.host : result;
  }
  function getRootNode(node) {
    let result;
    try {
      result = node.getRootNode({ composed: true });
      if (isDocument(result) || isShadowRoot(result)) return result;
    } catch {
    }
    return node.ownerDocument ?? document;
  }

  // node_modules/@zag-js/dom-query/dist/computed-style.mjs
  var styleCache = /* @__PURE__ */ new WeakMap();
  function getComputedStyle2(el) {
    if (!styleCache.has(el)) {
      styleCache.set(el, getWindow(el).getComputedStyle(el));
    }
    return styleCache.get(el);
  }

  // node_modules/@zag-js/dom-query/dist/controller.mjs
  var INTERACTIVE_CONTAINER_ROLE = /* @__PURE__ */ new Set(["menu", "listbox", "dialog", "grid", "tree", "region"]);
  var isInteractiveContainerRole = (role) => INTERACTIVE_CONTAINER_ROLE.has(role);
  var getAriaControls = (element) => element.getAttribute("aria-controls")?.split(" ") || [];
  function isControlledElement(container, element) {
    const visitedIds = /* @__PURE__ */ new Set();
    const rootNode = getRootNode(container);
    const checkElement = (searchRoot) => {
      const controllingElements = searchRoot.querySelectorAll("[aria-controls]");
      for (const controller of controllingElements) {
        if (controller.getAttribute("aria-expanded") !== "true") continue;
        const controlledIds = getAriaControls(controller);
        for (const id of controlledIds) {
          if (!id || visitedIds.has(id)) continue;
          visitedIds.add(id);
          const controlledElement = rootNode.getElementById(id);
          if (controlledElement) {
            const role = controlledElement.getAttribute("role");
            const modal = controlledElement.getAttribute("aria-modal") === "true";
            if (role && isInteractiveContainerRole(role) && !modal) {
              if (controlledElement === element || controlledElement.contains(element)) {
                return true;
              }
              if (checkElement(controlledElement)) {
                return true;
              }
            }
          }
        }
      }
      return false;
    };
    return checkElement(container);
  }
  function findControlledElements(searchRoot, callback) {
    const rootNode = getRootNode(searchRoot);
    const visitedIds = /* @__PURE__ */ new Set();
    const findRecursive = (root) => {
      const controllingElements = root.querySelectorAll("[aria-controls]");
      for (const controller of controllingElements) {
        if (controller.getAttribute("aria-expanded") !== "true") continue;
        const controlledIds = getAriaControls(controller);
        for (const id of controlledIds) {
          if (!id || visitedIds.has(id)) continue;
          visitedIds.add(id);
          const controlledElement = rootNode.getElementById(id);
          if (controlledElement) {
            const role = controlledElement.getAttribute("role");
            const modal = controlledElement.getAttribute("aria-modal") === "true";
            if (role && INTERACTIVE_CONTAINER_ROLE.has(role) && !modal) {
              callback(controlledElement);
              findRecursive(controlledElement);
            }
          }
        }
      }
    };
    findRecursive(searchRoot);
  }
  function getControlledElements(container) {
    const controlledElements = /* @__PURE__ */ new Set();
    findControlledElements(container, (controlledElement) => {
      if (!container.contains(controlledElement)) {
        controlledElements.add(controlledElement);
      }
    });
    return Array.from(controlledElements);
  }
  function isInteractiveContainerElement(element) {
    const role = element.getAttribute("role");
    return Boolean(role && INTERACTIVE_CONTAINER_ROLE.has(role));
  }
  function isControllerElement(element) {
    return element.hasAttribute("aria-controls") && element.getAttribute("aria-expanded") === "true";
  }
  function hasControllerElements(element) {
    if (isControllerElement(element)) return true;
    return Boolean(element.querySelector?.('[aria-controls][aria-expanded="true"]'));
  }
  function isControlledByExpandedController(element) {
    if (!element.id) return false;
    const rootNode = getRootNode(element);
    const escapedId = CSS.escape(element.id);
    const selector = `[aria-controls~="${escapedId}"][aria-expanded="true"], [aria-controls="${escapedId}"][aria-expanded="true"]`;
    const controller = rootNode.querySelector(selector);
    return Boolean(controller && isInteractiveContainerElement(element));
  }

  // node_modules/@zag-js/dom-query/dist/platform.mjs
  var isDom = () => typeof document !== "undefined";
  function getPlatform() {
    const agent = navigator.userAgentData;
    return agent?.platform ?? navigator.platform;
  }
  function getUserAgent() {
    const ua2 = navigator.userAgentData;
    if (ua2 && Array.isArray(ua2.brands)) {
      return ua2.brands.map(({ brand, version }) => `${brand}/${version}`).join(" ");
    }
    return navigator.userAgent;
  }
  var pt = (v) => isDom() && v.test(getPlatform());
  var ua = (v) => isDom() && v.test(getUserAgent());
  var isTouchDevice = () => isDom() && !!navigator.maxTouchPoints;
  var isIPhone = () => pt(/^iPhone/i);
  var isIPad = () => pt(/^iPad/i) || isMac() && navigator.maxTouchPoints > 1;
  var isIos = () => isIPhone() || isIPad();
  var isMac = () => pt(/^Mac/i);
  var isAndroid = () => ua(/Android/i);

  // node_modules/@zag-js/dom-query/dist/event.mjs
  function getComposedPath(event) {
    return event.composedPath?.() ?? event.nativeEvent?.composedPath?.();
  }
  function getEventTarget(event) {
    const composedPath = getComposedPath(event);
    return composedPath?.[0] ?? event.target;
  }
  function isVirtualClick(e) {
    if (e.pointerType === "" && e.isTrusted) return true;
    if (isAndroid() && e.pointerType) {
      return e.type === "click" && e.buttons === 1;
    }
    return e.detail === 0 && !e.pointerType;
  }
  var isContextMenuEvent = (e) => {
    return e.button === 2 || isMac() && e.ctrlKey && e.button === 0;
  };
  var keyMap = {
    Up: "ArrowUp",
    Down: "ArrowDown",
    Esc: "Escape",
    " ": "Space",
    ",": "Comma",
    Left: "ArrowLeft",
    Right: "ArrowRight"
  };
  var rtlKeyMap = {
    ArrowLeft: "ArrowRight",
    ArrowRight: "ArrowLeft"
  };
  function getEventKey(event, options = {}) {
    const { dir = "ltr", orientation = "horizontal" } = options;
    let key = event.key;
    key = keyMap[key] ?? key;
    const isRtl = dir === "rtl" && orientation === "horizontal";
    if (isRtl && key in rtlKeyMap) key = rtlKeyMap[key];
    return key;
  }
  function getNativeEvent(event) {
    return event.nativeEvent ?? event;
  }
  var addDomEvent = (target, eventName, handler, options) => {
    const node = typeof target === "function" ? target() : target;
    node?.addEventListener(eventName, handler, options);
    return () => {
      node?.removeEventListener(eventName, handler, options);
    };
  };

  // node_modules/@zag-js/dom-query/dist/form.mjs
  function isFormElement(el) {
    return el.matches("textarea, input, select, button");
  }
  function trackFormReset(el, callback) {
    if (!el) return;
    const form = isFormElement(el) ? el.form : el.closest("form");
    const onReset = (e) => {
      if (e.defaultPrevented) return;
      callback();
    };
    form?.addEventListener("reset", onReset, { passive: true });
    return () => form?.removeEventListener("reset", onReset);
  }
  function trackFieldsetDisabled(el, callback) {
    const fieldset = el?.closest("fieldset");
    if (!fieldset) return;
    callback(fieldset.disabled);
    const win = getWindow(fieldset);
    const obs = new win.MutationObserver(() => callback(fieldset.disabled));
    obs.observe(fieldset, {
      attributes: true,
      attributeFilter: ["disabled"]
    });
    return () => obs.disconnect();
  }
  function trackFormControl(el, options) {
    if (!el) return;
    const { onFieldsetDisabledChange, onFormReset } = options;
    const cleanups = [trackFormReset(el, onFormReset), trackFieldsetDisabled(el, onFieldsetDisabledChange)];
    return () => cleanups.forEach((cleanup) => cleanup?.());
  }
  var INTERNAL_CHANGE_EVENT = /* @__PURE__ */ Symbol.for("zag.changeEvent");
  function isInternalChangeEvent(e) {
    return Object.prototype.hasOwnProperty.call(e, INTERNAL_CHANGE_EVENT);
  }
  function markAsInternalChangeEvent(event) {
    if (isInternalChangeEvent(event)) return event;
    Object.defineProperty(event, INTERNAL_CHANGE_EVENT, { value: true });
    return event;
  }

  // node_modules/@zag-js/dom-query/dist/tabbable.mjs
  var isFrame = (el) => isHTMLElement(el) && el.tagName === "IFRAME";
  var NATURALLY_TABBABLE_REGEX = /^(audio|video|details)$/;
  function parseTabIndex(el) {
    const attr = el.getAttribute("tabindex");
    if (!attr) return NaN;
    return parseInt(attr, 10);
  }
  var hasTabIndex = (el) => !Number.isNaN(parseTabIndex(el));
  var hasNegativeTabIndex = (el) => parseTabIndex(el) < 0;
  function getShadowRootForNode(element, getShadowRoot) {
    if (!getShadowRoot) return null;
    if (getShadowRoot === true) {
      return element.shadowRoot || null;
    }
    const result = getShadowRoot(element);
    return (result === true ? element.shadowRoot : result) || null;
  }
  function collectElementsWithShadowDOM(elements, getShadowRoot, filterFn) {
    const allElements = [...elements];
    const toProcess = [...elements];
    const processed = /* @__PURE__ */ new Set();
    const positionMap = /* @__PURE__ */ new Map();
    elements.forEach((el, i) => positionMap.set(el, i));
    let processIndex = 0;
    while (processIndex < toProcess.length) {
      const element = toProcess[processIndex++];
      if (!element || processed.has(element)) continue;
      processed.add(element);
      const shadowRoot = getShadowRootForNode(element, getShadowRoot);
      if (shadowRoot) {
        const shadowElements = Array.from(shadowRoot.querySelectorAll(focusableSelector)).filter(filterFn);
        const hostIndex = positionMap.get(element);
        if (hostIndex !== void 0) {
          const insertPosition = hostIndex + 1;
          allElements.splice(insertPosition, 0, ...shadowElements);
          shadowElements.forEach((el, i) => {
            positionMap.set(el, insertPosition + i);
          });
          for (let i = insertPosition + shadowElements.length; i < allElements.length; i++) {
            positionMap.set(allElements[i], i);
          }
        } else {
          const insertPosition = allElements.length;
          allElements.push(...shadowElements);
          shadowElements.forEach((el, i) => {
            positionMap.set(el, insertPosition + i);
          });
        }
        toProcess.push(...shadowElements);
      }
    }
    return allElements;
  }
  var focusableSelector = "input:not([type='hidden']):not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], button:not([disabled]), [tabindex], iframe, object, embed, area[href], audio[controls], video[controls], [contenteditable]:not([contenteditable='false']), details > summary:first-of-type";
  var getFocusables = (container, options = {}) => {
    if (!container) return [];
    const { includeContainer = false, getShadowRoot } = options;
    const elements = Array.from(container.querySelectorAll(focusableSelector));
    const include = includeContainer == true || includeContainer == "if-empty" && elements.length === 0;
    if (include && isHTMLElement(container) && isFocusable(container)) {
      elements.unshift(container);
    }
    const focusableElements = [];
    for (const element of elements) {
      if (!isFocusable(element)) continue;
      if (isFrame(element) && element.contentDocument) {
        const frameBody = element.contentDocument.body;
        focusableElements.push(...getFocusables(frameBody, { getShadowRoot }));
        continue;
      }
      focusableElements.push(element);
    }
    if (getShadowRoot) {
      return collectElementsWithShadowDOM(focusableElements, getShadowRoot, isFocusable);
    }
    return focusableElements;
  };
  function isFocusable(element) {
    if (!isHTMLElement(element) || element.closest("[inert]")) return false;
    return element.matches(focusableSelector) && isElementVisible(element);
  }
  function getTabbables(container, options = {}) {
    if (!container) return [];
    const { includeContainer, getShadowRoot } = options;
    const elements = Array.from(container.querySelectorAll(focusableSelector));
    if (includeContainer && isTabbable(container)) {
      elements.unshift(container);
    }
    const tabbableElements = [];
    for (const element of elements) {
      if (!isTabbable(element)) continue;
      if (isFrame(element) && element.contentDocument) {
        const frameBody = element.contentDocument.body;
        tabbableElements.push(...getTabbables(frameBody, { getShadowRoot }));
        continue;
      }
      tabbableElements.push(element);
    }
    if (getShadowRoot) {
      const allElements = collectElementsWithShadowDOM(tabbableElements, getShadowRoot, isTabbable);
      if (!allElements.length && includeContainer) {
        return elements;
      }
      return allElements;
    }
    if (!tabbableElements.length && includeContainer) {
      return elements;
    }
    return tabbableElements;
  }
  function isTabbable(el) {
    if (isHTMLElement(el) && el.tabIndex > 0) return true;
    return isFocusable(el) && !hasNegativeTabIndex(el);
  }
  function getTabbableEdges(container, options = {}) {
    const elements = getTabbables(container, options);
    const first = elements[0] || null;
    const last = elements[elements.length - 1] || null;
    return [first, last];
  }
  function getTabIndex(node) {
    if (node.tabIndex < 0) {
      if ((NATURALLY_TABBABLE_REGEX.test(node.localName) || isEditableElement(node)) && !hasTabIndex(node)) {
        return 0;
      }
    }
    return node.tabIndex;
  }

  // node_modules/@zag-js/dom-query/dist/initial-focus.mjs
  function getInitialFocus(options) {
    const { root, getInitialEl, filter, enabled = true } = options;
    if (!enabled) return;
    let node = null;
    node || (node = typeof getInitialEl === "function" ? getInitialEl() : getInitialEl);
    node || (node = root?.querySelector("[data-autofocus],[autofocus]"));
    if (!node) {
      const tabbables = getTabbables(root);
      node = filter ? tabbables.filter(filter)[0] : tabbables[0];
    }
    return node || root || void 0;
  }
  function isValidTabEvent(event) {
    const container = event.currentTarget;
    if (!container) return false;
    const [firstTabbable, lastTabbable] = getTabbableEdges(container);
    if (isActiveElement(firstTabbable) && event.shiftKey) return false;
    if (isActiveElement(lastTabbable) && !event.shiftKey) return false;
    if (!firstTabbable && !lastTabbable) return false;
    return true;
  }

  // node_modules/@zag-js/dom-query/dist/raf.mjs
  var AnimationFrame = class _AnimationFrame {
    constructor() {
      __publicField2(this, "id", null);
      __publicField2(this, "fn_cleanup");
      __publicField2(this, "cleanup", () => {
        this.cancel();
      });
    }
    static create() {
      return new _AnimationFrame();
    }
    request(fn) {
      this.cancel();
      this.id = globalThis.requestAnimationFrame(() => {
        this.id = null;
        this.fn_cleanup = fn?.();
      });
    }
    cancel() {
      if (this.id !== null) {
        globalThis.cancelAnimationFrame(this.id);
        this.id = null;
      }
      this.fn_cleanup?.();
      this.fn_cleanup = void 0;
    }
    isActive() {
      return this.id !== null;
    }
  };
  function raf(fn) {
    const frame = AnimationFrame.create();
    frame.request(fn);
    return frame.cleanup;
  }
  function nextTick(fn) {
    const set = /* @__PURE__ */ new Set();
    function raf22(fn2) {
      const id = globalThis.requestAnimationFrame(fn2);
      set.add(() => globalThis.cancelAnimationFrame(id));
    }
    raf22(() => raf22(fn));
    return function cleanup() {
      set.forEach((fn2) => fn2());
    };
  }

  // node_modules/@zag-js/dom-query/dist/mutation-observer.mjs
  function observeAttributesImpl(node, options) {
    if (!node) return;
    const { attributes, callback: fn } = options;
    const win = node.ownerDocument.defaultView || window;
    const obs = new win.MutationObserver((changes) => {
      for (const change of changes) {
        if (change.type === "attributes" && change.attributeName && attributes.includes(change.attributeName)) {
          fn(change);
        }
      }
    });
    obs.observe(node, { attributes: true, attributeFilter: attributes });
    return () => obs.disconnect();
  }
  function observeAttributes(nodeOrFn, options) {
    const { defer } = options;
    const func = defer ? raf : (v) => v();
    const cleanups = [];
    cleanups.push(
      func(() => {
        const node = typeof nodeOrFn === "function" ? nodeOrFn() : nodeOrFn;
        cleanups.push(observeAttributesImpl(node, options));
      })
    );
    return () => {
      cleanups.forEach((fn) => fn?.());
    };
  }
  function observeChildrenImpl(node, options) {
    const { callback: fn } = options;
    if (!node) return;
    const win = node.ownerDocument.defaultView || window;
    const obs = new win.MutationObserver(fn);
    obs.observe(node, { childList: true, subtree: true });
    return () => obs.disconnect();
  }
  function observeChildren(nodeOrFn, options) {
    const { defer } = options;
    const func = defer ? raf : (v) => v();
    const cleanups = [];
    cleanups.push(
      func(() => {
        const node = typeof nodeOrFn === "function" ? nodeOrFn() : nodeOrFn;
        cleanups.push(observeChildrenImpl(node, options));
      })
    );
    return () => {
      cleanups.forEach((fn) => fn?.());
    };
  }

  // node_modules/@zag-js/dom-query/dist/overflow.mjs
  function getNearestOverflowAncestor(el) {
    const parentNode = getParentNode(el);
    if (isRootElement(parentNode)) return getDocument(parentNode).body;
    if (isHTMLElement(parentNode) && isOverflowElement(parentNode)) return parentNode;
    return getNearestOverflowAncestor(parentNode);
  }
  var OVERFLOW_RE = /auto|scroll|overlay|hidden|clip/;
  var nonOverflowValues = /* @__PURE__ */ new Set(["inline", "contents"]);
  function isOverflowElement(el) {
    const win = getWindow(el);
    const { overflow, overflowX, overflowY, display } = win.getComputedStyle(el);
    return OVERFLOW_RE.test(overflow + overflowY + overflowX) && !nonOverflowValues.has(display);
  }
  function isScrollable(el) {
    return el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth;
  }
  function scrollIntoView(el, options) {
    const { rootEl, ...scrollOptions } = options || {};
    if (!el || !rootEl) return;
    if (!isOverflowElement(rootEl) || !isScrollable(rootEl)) return;
    el.scrollIntoView(scrollOptions);
  }

  // node_modules/@zag-js/dom-query/dist/query.mjs
  var defaultItemToId = (v) => v.id;
  function itemById(v, id, itemToId = defaultItemToId) {
    return v.find((item) => itemToId(item) === id);
  }
  function indexOfId(v, id, itemToId = defaultItemToId) {
    const item = itemById(v, id, itemToId);
    return item ? v.indexOf(item) : -1;
  }

  // node_modules/@zag-js/dom-query/dist/searchable.mjs
  var sanitize = (str) => str.split("").map((char) => {
    const code = char.charCodeAt(0);
    if (code > 0 && code < 128) return char;
    if (code >= 128 && code <= 255) return `/x${code.toString(16)}`.replace("/", "\\");
    return "";
  }).join("").trim();
  var getValueText = (el) => {
    return sanitize(el.dataset?.valuetext ?? el.textContent ?? "");
  };
  var match = (valueText, query) => {
    return valueText.trim().toLowerCase().startsWith(query.toLowerCase());
  };
  function getByText(v, text, currentId, itemToId = defaultItemToId) {
    const index = currentId ? indexOfId(v, currentId, itemToId) : -1;
    let items = currentId ? wrap(v, index) : v;
    const isSingleKey = text.length === 1;
    if (isSingleKey) {
      items = items.filter((item) => itemToId(item) !== currentId);
    }
    return items.find((item) => match(getValueText(item), text));
  }

  // node_modules/@zag-js/dom-query/dist/set.mjs
  function setStyle(el, style) {
    if (!el) return noop2;
    const prev = Object.keys(style).reduce((acc, key) => {
      acc[key] = el.style.getPropertyValue(key);
      return acc;
    }, {});
    if (isEqual2(prev, style)) return noop2;
    Object.assign(el.style, style);
    return () => {
      Object.assign(el.style, prev);
      if (el.style.length === 0) {
        el.removeAttribute("style");
      }
    };
  }
  function setStyleProperty(el, prop, value) {
    if (!el) return noop2;
    const prev = el.style.getPropertyValue(prop);
    if (prev === value) return noop2;
    el.style.setProperty(prop, value);
    return () => {
      el.style.setProperty(prop, prev);
      if (el.style.length === 0) {
        el.removeAttribute("style");
      }
    };
  }
  function isEqual2(a, b) {
    return Object.keys(a).every((key) => a[key] === b[key]);
  }

  // node_modules/@zag-js/dom-query/dist/typeahead.mjs
  function getByTypeaheadImpl(baseItems, options) {
    const { state, activeId, key, timeout = 350, itemToId } = options;
    const search = state.keysSoFar + key;
    const isRepeated = search.length > 1 && Array.from(search).every((char) => char === search[0]);
    const query = isRepeated ? search[0] : search;
    let items = baseItems.slice();
    const next = getByText(items, query, activeId, itemToId);
    function cleanup() {
      clearTimeout(state.timer);
      state.timer = -1;
    }
    function update(value) {
      state.keysSoFar = value;
      cleanup();
      if (value !== "") {
        state.timer = +setTimeout(() => {
          update("");
          cleanup();
        }, timeout);
      }
    }
    update(search);
    return next;
  }
  var getByTypeahead = /* @__PURE__ */ Object.assign(getByTypeaheadImpl, {
    defaultOptions: { keysSoFar: "", timer: -1 },
    isValidEvent: isValidTypeaheadEvent
  });
  function isValidTypeaheadEvent(event) {
    return event.key.length === 1 && !event.ctrlKey && !event.metaKey;
  }

  // node_modules/@zag-js/dom-query/dist/visually-hidden.mjs
  var visuallyHiddenStyle = {
    border: "0",
    clip: "rect(0 0 0 0)",
    height: "1px",
    margin: "-1px",
    overflow: "hidden",
    padding: "0",
    position: "absolute",
    width: "1px",
    whiteSpace: "nowrap",
    wordWrap: "normal"
  };

  // node_modules/@zag-js/dom-query/dist/wait-for.mjs
  function waitForPromise(promise, controller, timeout) {
    const { signal } = controller;
    const wrappedPromise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Timeout of ${timeout}ms exceeded`));
      }, timeout);
      signal.addEventListener("abort", () => {
        clearTimeout(timeoutId);
        reject(new Error("Promise aborted"));
      });
      promise.then((result) => {
        if (!signal.aborted) {
          clearTimeout(timeoutId);
          resolve(result);
        }
      }).catch((error) => {
        if (!signal.aborted) {
          clearTimeout(timeoutId);
          reject(error);
        }
      });
    });
    const abort = () => controller.abort();
    return [wrappedPromise, abort];
  }
  function waitForElement(target, options) {
    const { timeout, rootNode } = options;
    const win = getWindow(rootNode);
    const doc = getDocument(rootNode);
    const controller = new win.AbortController();
    return waitForPromise(
      new Promise((resolve) => {
        const el = target();
        if (el) {
          resolve(el);
          return;
        }
        const observer = new win.MutationObserver(() => {
          const el2 = target();
          if (el2 && el2.isConnected) {
            observer.disconnect();
            resolve(el2);
          }
        });
        observer.observe(doc.body, {
          childList: true,
          subtree: true
        });
      }),
      controller,
      timeout
    );
  }

  // node_modules/@zag-js/core/dist/scope.mjs
  function createScope(props) {
    const getRootNode2 = () => props.getRootNode?.() ?? document;
    const getDoc = () => getDocument(getRootNode2());
    const getWin = () => getDoc().defaultView ?? window;
    const getActiveElementFn = () => getActiveElement(getRootNode2());
    const getById = (id) => getRootNode2().getElementById(id);
    return {
      ...props,
      getRootNode: getRootNode2,
      getDoc,
      getWin,
      getActiveElement: getActiveElementFn,
      isActiveElement,
      getById
    };
  }

  // node_modules/@zag-js/types/dist/prop-types.mjs
  function createNormalizer(fn) {
    return new Proxy({}, {
      get(_target, key) {
        if (key === "style")
          return (props) => {
            return fn({ style: props }).style;
          };
        return fn;
      }
    });
  }

  // node_modules/@zag-js/vanilla/dist/normalize-props.mjs
  var propMap = {
    onFocus: "onFocusin",
    onBlur: "onFocusout",
    onChange: "onInput",
    onDoubleClick: "onDblclick",
    htmlFor: "for",
    className: "class",
    defaultValue: "value",
    defaultChecked: "checked"
  };
  var caseSensitiveSvgAttrs = /* @__PURE__ */ new Set(["viewBox", "preserveAspectRatio"]);
  var toStyleString = (style) => {
    let string = "";
    for (let key in style) {
      const value = style[key];
      if (value === null || value === void 0) continue;
      if (!key.startsWith("--")) key = key.replace(/[A-Z]/g, (match3) => `-${match3.toLowerCase()}`);
      string += `${key}:${value};`;
    }
    return string;
  };
  var normalizeProps = createNormalizer((props) => {
    return Object.entries(props).reduce((acc, [key, value]) => {
      if (value === void 0) return acc;
      if (key in propMap) {
        key = propMap[key];
      }
      if (key === "style" && typeof value === "object") {
        acc.style = toStyleString(value);
        return acc;
      }
      const normalizedKey = caseSensitiveSvgAttrs.has(key) ? key : key.toLowerCase();
      acc[normalizedKey] = value;
      return acc;
    }, {});
  });

  // node_modules/@zag-js/vanilla/dist/spread-props.mjs
  var prevAttrsMap = /* @__PURE__ */ new WeakMap();
  var assignableProps = /* @__PURE__ */ new Set(["value", "checked", "selected"]);
  var caseSensitiveSvgAttrs2 = /* @__PURE__ */ new Set([
    "viewBox",
    "preserveAspectRatio",
    "clipPath",
    "clipRule",
    "fillRule",
    "strokeWidth",
    "strokeLinecap",
    "strokeLinejoin",
    "strokeDasharray",
    "strokeDashoffset",
    "strokeMiterlimit"
  ]);
  var isSvgElement = (node) => {
    return node.tagName === "svg" || node.namespaceURI === "http://www.w3.org/2000/svg";
  };
  var getAttributeName = (node, attrName) => {
    const shouldPreserveCase = isSvgElement(node) && caseSensitiveSvgAttrs2.has(attrName);
    return shouldPreserveCase ? attrName : attrName.toLowerCase();
  };
  function spreadProps(node, attrs, machineId) {
    const scopeKey = machineId || "default";
    let machineMap = prevAttrsMap.get(node);
    if (!machineMap) {
      machineMap = /* @__PURE__ */ new Map();
      prevAttrsMap.set(node, machineMap);
    }
    const oldAttrs = machineMap.get(scopeKey) || {};
    const attrKeys = Object.keys(attrs);
    const addEvt = (e, f) => {
      node.addEventListener(e.toLowerCase(), f);
    };
    const remEvt = (e, f) => {
      node.removeEventListener(e.toLowerCase(), f);
    };
    const onEvents = (attr) => attr.startsWith("on");
    const others = (attr) => !attr.startsWith("on");
    const setup = (attr) => addEvt(attr.substring(2), attrs[attr]);
    const teardown = (attr) => remEvt(attr.substring(2), attrs[attr]);
    const apply = (attrName) => {
      const value = attrs[attrName];
      const oldValue = oldAttrs[attrName];
      if (value === oldValue) return;
      if (attrName === "class") {
        ;
        node.className = value ?? "";
        return;
      }
      if (assignableProps.has(attrName)) {
        ;
        node[attrName] = value ?? "";
        return;
      }
      if (typeof value === "boolean" && !attrName.includes("aria-")) {
        ;
        node.toggleAttribute(getAttributeName(node, attrName), value);
        return;
      }
      if (attrName === "children") {
        node.innerHTML = value;
        return;
      }
      if (value != null) {
        node.setAttribute(getAttributeName(node, attrName), value);
        return;
      }
      node.removeAttribute(getAttributeName(node, attrName));
    };
    for (const key in oldAttrs) {
      if (attrs[key] == null) {
        if (key === "class") {
          ;
          node.className = "";
        } else if (assignableProps.has(key)) {
          ;
          node[key] = "";
        } else {
          node.removeAttribute(getAttributeName(node, key));
        }
      }
    }
    const oldEvents = Object.keys(oldAttrs).filter(onEvents);
    oldEvents.forEach((evt) => {
      remEvt(evt.substring(2), oldAttrs[evt]);
    });
    attrKeys.filter(onEvents).forEach(setup);
    attrKeys.filter(others).forEach(apply);
    machineMap.set(scopeKey, attrs);
    return function cleanup() {
      attrKeys.filter(onEvents).forEach(teardown);
      const currentMachineMap = prevAttrsMap.get(node);
      if (currentMachineMap) {
        currentMachineMap.delete(scopeKey);
        if (currentMachineMap.size === 0) {
          prevAttrsMap.delete(node);
        }
      }
    };
  }

  // node_modules/@zag-js/store/dist/global.mjs
  function glob() {
    if (typeof globalThis !== "undefined") return globalThis;
    if (typeof self !== "undefined") return self;
    if (typeof window !== "undefined") return window;
    if (typeof global !== "undefined") return global;
  }
  function globalRef(key, value) {
    const g = glob();
    if (!g) return value();
    g[key] || (g[key] = value());
    return g[key];
  }
  var refSet = globalRef("__zag__refSet", () => /* @__PURE__ */ new WeakSet());

  // node_modules/@zag-js/store/dist/utils.mjs
  var isReactElement2 = (x) => typeof x === "object" && x !== null && "$$typeof" in x && "props" in x;
  var isVueElement2 = (x) => typeof x === "object" && x !== null && "__v_isVNode" in x;
  var isDOMElement = (x) => typeof x === "object" && x !== null && "nodeType" in x && typeof x.nodeName === "string";
  var isElement = (x) => isReactElement2(x) || isVueElement2(x) || isDOMElement(x);
  var isObject3 = (x) => x !== null && typeof x === "object";
  var canProxy = (x) => isObject3(x) && !refSet.has(x) && (Array.isArray(x) || !(Symbol.iterator in x)) && !isElement(x) && !(x instanceof WeakMap) && !(x instanceof WeakSet) && !(x instanceof Error) && !(x instanceof Number) && !(x instanceof Date) && !(x instanceof String) && !(x instanceof RegExp) && !(x instanceof ArrayBuffer) && !(x instanceof Promise) && !(x instanceof File) && !(x instanceof Blob) && !(x instanceof AbortController);
  var isDev = () => true;

  // node_modules/proxy-compare/dist/index.js
  var GET_ORIGINAL_SYMBOL = /* @__PURE__ */ Symbol();
  var getProto = Object.getPrototypeOf;
  var objectsToTrack = /* @__PURE__ */ new WeakMap();
  var isObjectToTrack = (obj) => obj && (objectsToTrack.has(obj) ? objectsToTrack.get(obj) : getProto(obj) === Object.prototype || getProto(obj) === Array.prototype);
  var getUntracked = (obj) => {
    if (isObjectToTrack(obj)) {
      return obj[GET_ORIGINAL_SYMBOL] || null;
    }
    return null;
  };
  var markToTrack = (obj, mark = true) => {
    objectsToTrack.set(obj, mark);
  };

  // node_modules/@zag-js/store/dist/proxy.mjs
  var proxyStateMap = globalRef("__zag__proxyStateMap", () => /* @__PURE__ */ new WeakMap());
  var buildProxyFunction = (objectIs = Object.is, newProxy = (target, handler) => new Proxy(target, handler), snapCache = /* @__PURE__ */ new WeakMap(), createSnapshot = (target, version) => {
    const cache = snapCache.get(target);
    if (cache?.[0] === version) {
      return cache[1];
    }
    const snap = Array.isArray(target) ? [] : Object.create(Object.getPrototypeOf(target));
    markToTrack(snap, true);
    snapCache.set(target, [version, snap]);
    Reflect.ownKeys(target).forEach((key) => {
      const value = Reflect.get(target, key);
      if (refSet.has(value)) {
        markToTrack(value, false);
        snap[key] = value;
      } else if (proxyStateMap.has(value)) {
        snap[key] = snapshot(value);
      } else {
        snap[key] = value;
      }
    });
    return Object.freeze(snap);
  }, proxyCache = /* @__PURE__ */ new WeakMap(), versionHolder = [1, 1], proxyFunction2 = (initialObject) => {
    if (!isObject3(initialObject)) {
      throw new Error("object required");
    }
    const found = proxyCache.get(initialObject);
    if (found) {
      return found;
    }
    let version = versionHolder[0];
    const listeners = /* @__PURE__ */ new Set();
    const notifyUpdate = (op, nextVersion = ++versionHolder[0]) => {
      if (version !== nextVersion) {
        version = nextVersion;
        listeners.forEach((listener) => listener(op, nextVersion));
      }
    };
    let checkVersion = versionHolder[1];
    const ensureVersion = (nextCheckVersion = ++versionHolder[1]) => {
      if (checkVersion !== nextCheckVersion && !listeners.size) {
        checkVersion = nextCheckVersion;
        propProxyStates.forEach(([propProxyState]) => {
          const propVersion = propProxyState[1](nextCheckVersion);
          if (propVersion > version) {
            version = propVersion;
          }
        });
      }
      return version;
    };
    const createPropListener = (prop) => (op, nextVersion) => {
      const newOp = [...op];
      newOp[1] = [prop, ...newOp[1]];
      notifyUpdate(newOp, nextVersion);
    };
    const propProxyStates = /* @__PURE__ */ new Map();
    const addPropListener = (prop, propProxyState) => {
      if (isDev() && propProxyStates.has(prop)) {
        throw new Error("prop listener already exists");
      }
      if (listeners.size) {
        const remove2 = propProxyState[3](createPropListener(prop));
        propProxyStates.set(prop, [propProxyState, remove2]);
      } else {
        propProxyStates.set(prop, [propProxyState]);
      }
    };
    const removePropListener = (prop) => {
      const entry = propProxyStates.get(prop);
      if (entry) {
        propProxyStates.delete(prop);
        entry[1]?.();
      }
    };
    const addListener = (listener) => {
      listeners.add(listener);
      if (listeners.size === 1) {
        propProxyStates.forEach(([propProxyState, prevRemove], prop) => {
          if (isDev() && prevRemove) {
            throw new Error("remove already exists");
          }
          const remove2 = propProxyState[3](createPropListener(prop));
          propProxyStates.set(prop, [propProxyState, remove2]);
        });
      }
      const removeListener = () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          propProxyStates.forEach(([propProxyState, remove2], prop) => {
            if (remove2) {
              remove2();
              propProxyStates.set(prop, [propProxyState]);
            }
          });
        }
      };
      return removeListener;
    };
    const baseObject = Array.isArray(initialObject) ? [] : Object.create(Object.getPrototypeOf(initialObject));
    const handler = {
      deleteProperty(target, prop) {
        const prevValue = Reflect.get(target, prop);
        removePropListener(prop);
        const deleted = Reflect.deleteProperty(target, prop);
        if (deleted) {
          notifyUpdate(["delete", [prop], prevValue]);
        }
        return deleted;
      },
      set(target, prop, value, receiver) {
        const hasPrevValue = Reflect.has(target, prop);
        const prevValue = Reflect.get(target, prop, receiver);
        if (hasPrevValue && (objectIs(prevValue, value) || proxyCache.has(value) && objectIs(prevValue, proxyCache.get(value)))) {
          return true;
        }
        removePropListener(prop);
        if (isObject3(value)) {
          value = getUntracked(value) || value;
        }
        let nextValue = value;
        if (Object.getOwnPropertyDescriptor(target, prop)?.set) {
        } else {
          if (!proxyStateMap.has(value) && canProxy(value)) {
            nextValue = proxy(value);
          }
          const childProxyState = !refSet.has(nextValue) && proxyStateMap.get(nextValue);
          if (childProxyState) {
            addPropListener(prop, childProxyState);
          }
        }
        Reflect.set(target, prop, nextValue, receiver);
        notifyUpdate(["set", [prop], value, prevValue]);
        return true;
      }
    };
    const proxyObject = newProxy(baseObject, handler);
    proxyCache.set(initialObject, proxyObject);
    const proxyState = [baseObject, ensureVersion, createSnapshot, addListener];
    proxyStateMap.set(proxyObject, proxyState);
    Reflect.ownKeys(initialObject).forEach((key) => {
      const desc = Object.getOwnPropertyDescriptor(initialObject, key);
      if (desc.get || desc.set) {
        Object.defineProperty(baseObject, key, desc);
      } else {
        proxyObject[key] = initialObject[key];
      }
    });
    return proxyObject;
  }) => [
    // public functions
    proxyFunction2,
    // shared state
    proxyStateMap,
    refSet,
    // internal things
    objectIs,
    newProxy,
    canProxy,
    snapCache,
    createSnapshot,
    proxyCache,
    versionHolder
  ];
  var [proxyFunction] = buildProxyFunction();
  function proxy(initialObject = {}) {
    return proxyFunction(initialObject);
  }
  function subscribe(proxyObject, callback, notifyInSync) {
    const proxyState = proxyStateMap.get(proxyObject);
    if (isDev() && !proxyState) {
      console.warn("Please use proxy object");
    }
    let promise;
    const ops = [];
    const addListener = proxyState[3];
    let isListenerActive = false;
    const listener = (op) => {
      ops.push(op);
      if (notifyInSync) {
        callback(ops.splice(0));
        return;
      }
      if (!promise) {
        promise = Promise.resolve().then(() => {
          promise = void 0;
          if (isListenerActive) {
            callback(ops.splice(0));
          }
        });
      }
    };
    const removeListener = addListener(listener);
    isListenerActive = true;
    return () => {
      isListenerActive = false;
      removeListener();
    };
  }
  function snapshot(proxyObject) {
    const proxyState = proxyStateMap.get(proxyObject);
    if (isDev() && !proxyState) {
      console.warn("Please use proxy object");
    }
    const [target, ensureVersion, createSnapshot] = proxyState;
    return createSnapshot(target, ensureVersion());
  }

  // node_modules/@zag-js/vanilla/dist/bindable.mjs
  function bindable(props) {
    const initial = props().value ?? props().defaultValue;
    if (props().debug) {
      console.log(`[bindable > ${props().debug}] initial`, initial);
    }
    const eq = props().isEqual ?? Object.is;
    const store = proxy({ value: initial });
    const controlled = () => props().value !== void 0;
    return {
      initial,
      ref: store,
      get() {
        return controlled() ? props().value : store.value;
      },
      set(nextValue) {
        const prev = controlled() ? props().value : store.value;
        const next = isFunction(nextValue) ? nextValue(prev) : nextValue;
        if (props().debug) {
          console.log(`[bindable > ${props().debug}] setValue`, { next, prev });
        }
        if (!controlled()) store.value = next;
        if (!eq(next, prev)) {
          props().onChange?.(next, prev);
        }
      },
      invoke(nextValue, prevValue) {
        props().onChange?.(nextValue, prevValue);
      },
      hash(value) {
        return props().hash?.(value) ?? String(value);
      }
    };
  }
  bindable.cleanup = (_fn) => {
  };
  bindable.ref = (defaultValue) => {
    let value = defaultValue;
    return {
      get: () => value,
      set: (next) => {
        value = next;
      }
    };
  };

  // node_modules/@zag-js/vanilla/dist/refs.mjs
  function createRefs(refs) {
    const ref2 = { current: refs };
    return {
      get(key) {
        return ref2.current[key];
      },
      set(key, value) {
        ref2.current[key] = value;
      }
    };
  }

  // node_modules/@zag-js/vanilla/dist/merge-machine-props.mjs
  function mergeMachineProps(prev, next) {
    if (!isPlainObject(prev) || !isPlainObject(next)) {
      return next === void 0 ? prev : next;
    }
    const result = { ...prev };
    for (const key of Object.keys(next)) {
      const nextValue = next[key];
      const prevValue = prev[key];
      if (nextValue === void 0) {
        continue;
      }
      if (isPlainObject(prevValue) && isPlainObject(nextValue)) {
        result[key] = mergeMachineProps(prevValue, nextValue);
      } else {
        result[key] = nextValue;
      }
    }
    return result;
  }

  // node_modules/@zag-js/vanilla/dist/machine.mjs
  var VanillaMachine = class {
    constructor(machine5, userProps = {}) {
      this.machine = machine5;
      __publicField(this, "scope");
      __publicField(this, "context");
      __publicField(this, "prop");
      __publicField(this, "state");
      __publicField(this, "refs");
      __publicField(this, "computed");
      __publicField(this, "event", { type: "" });
      __publicField(this, "previousEvent", { type: "" });
      __publicField(this, "effects", /* @__PURE__ */ new Map());
      __publicField(this, "transition", null);
      __publicField(this, "cleanups", []);
      __publicField(this, "subscriptions", []);
      __publicField(this, "userPropsRef");
      __publicField(this, "getEvent", () => ({
        ...this.event,
        current: () => this.event,
        previous: () => this.previousEvent
      }));
      __publicField(this, "getState", () => ({
        ...this.state,
        matches: (...values) => values.some((value) => matchesState(this.state.get(), value)),
        hasTag: (tag) => hasTag(this.machine, this.state.get(), tag)
      }));
      __publicField(this, "debug", (...args) => {
        if (this.machine.debug) console.log(...args);
      });
      __publicField(this, "notify", () => {
        this.publish();
      });
      __publicField(this, "send", (event) => {
        if (this.status !== MachineStatus.Started) return;
        queueMicrotask(() => {
          if (!event) return;
          this.previousEvent = this.event;
          this.event = event;
          this.debug("send", event);
          let currentState = this.state.get();
          const eventType = event.type;
          const { transitions, source } = findTransition(this.machine, currentState, eventType);
          const transition = this.choose(transitions);
          if (!transition) return;
          this.transition = transition;
          const target = resolveStateValue(this.machine, transition.target ?? currentState, source);
          this.debug("transition", transition);
          const changed = target !== currentState;
          if (changed) {
            this.state.set(target);
          } else if (transition.reenter) {
            this.state.invoke(currentState, currentState);
          } else {
            this.action(transition.actions);
          }
        });
      });
      __publicField(this, "action", (keys) => {
        const strs = isFunction(keys) ? keys(this.getParams()) : keys;
        if (!strs) return;
        const fns = strs.map((s) => {
          const fn = this.machine.implementations?.actions?.[s];
          if (!fn) warn(`[zag-js] No implementation found for action "${JSON.stringify(s)}"`);
          return fn;
        });
        for (const fn of fns) {
          fn?.(this.getParams());
        }
      });
      __publicField(this, "guard", (str) => {
        if (isFunction(str)) return str(this.getParams());
        return this.machine.implementations?.guards?.[str](this.getParams());
      });
      __publicField(this, "effect", (keys) => {
        const strs = isFunction(keys) ? keys(this.getParams()) : keys;
        if (!strs) return;
        const fns = strs.map((s) => {
          const fn = this.machine.implementations?.effects?.[s];
          if (!fn) warn(`[zag-js] No implementation found for effect "${JSON.stringify(s)}"`);
          return fn;
        });
        const cleanups = [];
        for (const fn of fns) {
          const cleanup = fn?.(this.getParams());
          if (cleanup) cleanups.push(cleanup);
        }
        return () => cleanups.forEach((fn) => fn?.());
      });
      __publicField(this, "choose", (transitions) => {
        return toArray(transitions).find((t) => {
          let result = !t.guard;
          if (isString(t.guard)) result = !!this.guard(t.guard);
          else if (isFunction(t.guard)) result = t.guard(this.getParams());
          return result;
        });
      });
      __publicField(this, "subscribe", (fn) => {
        this.subscriptions.push(fn);
        return () => {
          const index = this.subscriptions.indexOf(fn);
          if (index > -1) this.subscriptions.splice(index, 1);
        };
      });
      __publicField(this, "status", MachineStatus.NotStarted);
      __publicField(this, "publish", () => {
        this.callTrackers();
        this.subscriptions.forEach((fn) => fn(this.service));
      });
      __publicField(this, "trackers", []);
      __publicField(this, "setupTrackers", () => {
        this.machine.watch?.(this.getParams());
      });
      __publicField(this, "callTrackers", () => {
        this.trackers.forEach(({ deps, fn }) => {
          const next = deps.map((dep) => dep());
          if (!isEqual(fn.prev, next)) {
            fn();
            fn.prev = next;
          }
        });
      });
      __publicField(this, "getParams", () => ({
        state: this.getState(),
        context: this.context,
        event: this.getEvent(),
        prop: this.prop,
        send: this.send,
        action: this.action,
        guard: this.guard,
        track: (deps, fn) => {
          fn.prev = deps.map((dep) => dep());
          this.trackers.push({ deps, fn });
        },
        refs: this.refs,
        computed: this.computed,
        flush: identity,
        scope: this.scope,
        choose: this.choose
      }));
      this.userPropsRef = { current: userProps };
      const { id, ids, getRootNode: getRootNode2 } = runIfFn(userProps);
      this.scope = createScope({ id, ids, getRootNode: getRootNode2 });
      const prop = (key) => {
        const __props = runIfFn(this.userPropsRef.current);
        const props = machine5.props?.({ props: compact(__props), scope: this.scope }) ?? __props;
        return props[key];
      };
      this.prop = prop;
      const context = machine5.context?.({
        prop,
        bindable,
        scope: this.scope,
        flush(fn) {
          queueMicrotask(fn);
        },
        getContext() {
          return ctx;
        },
        getComputed() {
          return computed;
        },
        getRefs() {
          return refs;
        },
        getEvent: this.getEvent.bind(this)
      });
      if (context) {
        Object.values(context).forEach((item) => {
          const unsub = subscribe(item.ref, () => this.notify());
          this.cleanups.push(unsub);
        });
      }
      const ctx = {
        get(key) {
          return context?.[key].get();
        },
        set(key, value) {
          context?.[key].set(value);
        },
        initial(key) {
          return context?.[key].initial;
        },
        hash(key) {
          const current = context?.[key].get();
          return context?.[key].hash(current);
        }
      };
      this.context = ctx;
      const computed = (key) => {
        return machine5.computed?.[key]({
          context: ctx,
          event: this.getEvent(),
          prop,
          refs: this.refs,
          scope: this.scope,
          computed
        }) ?? {};
      };
      this.computed = computed;
      const refs = createRefs(machine5.refs?.({ prop, context: ctx }) ?? {});
      this.refs = refs;
      const state = bindable(() => ({
        defaultValue: resolveStateValue(machine5, machine5.initialState({ prop })),
        onChange: (nextState, prevState) => {
          const { exiting, entering } = getExitEnterStates(this.machine, prevState, nextState, this.transition?.reenter);
          exiting.forEach((item) => {
            const exitEffects = this.effects.get(item.path);
            exitEffects?.();
            this.effects.delete(item.path);
          });
          exiting.forEach((item) => {
            this.action(item.state?.exit);
          });
          this.action(this.transition?.actions);
          entering.forEach((item) => {
            const cleanup = this.effect(item.state?.effects);
            if (cleanup) this.effects.set(item.path, cleanup);
          });
          if (prevState === INIT_STATE) {
            this.action(machine5.entry);
            const cleanup = this.effect(machine5.effects);
            if (cleanup) this.effects.set(INIT_STATE, cleanup);
          }
          entering.forEach((item) => {
            this.action(item.state?.entry);
          });
        }
      }));
      this.state = state;
      this.cleanups.push(subscribe(this.state.ref, () => this.notify()));
    }
    updateProps(newProps) {
      const prevSource = this.userPropsRef.current;
      this.userPropsRef.current = () => {
        const prev = runIfFn(prevSource);
        const next = runIfFn(newProps);
        return mergeMachineProps(prev, next);
      };
      this.notify();
    }
    start() {
      this.status = MachineStatus.Started;
      this.debug("initializing...");
      this.state.invoke(this.state.initial, INIT_STATE);
      this.setupTrackers();
    }
    stop() {
      this.effects.forEach((fn) => fn?.());
      this.effects.clear();
      this.transition = null;
      this.action(this.machine.exit);
      this.cleanups.forEach((unsub) => unsub());
      this.cleanups = [];
      this.subscriptions = [];
      this.status = MachineStatus.Stopped;
      this.debug("unmounting...");
    }
    get service() {
      return {
        state: this.getState(),
        send: this.send,
        context: this.context,
        prop: this.prop,
        scope: this.scope,
        refs: this.refs,
        computed: this.computed,
        event: this.getEvent(),
        getStatus: () => this.status
      };
    }
  };

  // packages/gea-ui/src/primitives/zag-component.ts
  var ZagComponent = class extends Component {
    createMachine(_props) {
      return null;
    }
    getMachineProps(_props) {
      return {};
    }
    connectApi(_service) {
      return null;
    }
    getSpreadMap() {
      return {};
    }
    syncState(_api) {
    }
    created(props) {
      if (!this._spreadCleanups) this._spreadCleanups = /* @__PURE__ */ new Map();
      if (this._spreadScheduled === void 0) this._spreadScheduled = false;
      const machineDef = this.createMachine(props);
      if (!machineDef) return;
      const machineProps = this.getMachineProps(props);
      this._machine = new VanillaMachine(machineDef, machineProps);
      this._machine.start();
      this._api = this.connectApi(this._machine.service);
      this.syncState(this._api);
      this._machine.subscribe(() => {
        if (!this._machine) return;
        this._api = this.connectApi(this._machine.service);
        this._scheduleSpreadApplication();
      });
    }
    _syncMachineProps() {
      const machine5 = this._machine;
      if (!machine5?.userPropsRef) return;
      const next = this.getMachineProps(this.props);
      machine5.userPropsRef.current = next;
      this._api = this.connectApi(this._machine.service);
      this._scheduleSpreadApplication();
    }
    __geaUpdateProps(nextProps) {
      super.__geaUpdateProps(nextProps);
      this._syncMachineProps();
    }
    _scheduleSpreadApplication() {
      if (this._spreadScheduled) return;
      this._spreadScheduled = true;
      queueMicrotask(() => {
        this._spreadScheduled = false;
        this._applyAllSpreads();
      });
    }
    _resolveProps(getter, el) {
      if (typeof getter === "function") {
        return getter(this._api, el);
      }
      const method = this._api[getter];
      if (typeof method !== "function") return null;
      return method.call(this._api);
    }
    _queryAllIncludingSelf(selector) {
      const results = this.$$(selector);
      const root = this.el;
      if (root && root.matches(selector) && !results.includes(root)) {
        results.unshift(root);
      }
      return results;
    }
    _applyAllSpreads() {
      if (!this.rendered_ || !this._api) return;
      const map = this.getSpreadMap();
      for (const selector in map) {
        const getter = map[selector];
        const elements = this._queryAllIncludingSelf(selector);
        for (let i = 0; i < elements.length; i++) {
          const el = elements[i];
          const key = selector + ":" + i;
          const nextProps = this._resolveProps(getter, el);
          if (!nextProps) continue;
          const cleanup = spreadProps(el, nextProps);
          this._spreadCleanups.set(key, cleanup);
        }
      }
    }
    onAfterRender() {
      this._cacheArrayContainers();
      this._applyAllSpreads();
    }
    _cacheArrayContainers() {
      const maps = this.__geaMaps;
      if (!maps) return;
      for (const idx in maps) {
        const map = maps[idx];
        map.container = map.getContainer();
        if (map.container) this[map.containerProp] = map.container;
      }
    }
    dispose() {
      for (const cleanup of this._spreadCleanups.values()) {
        cleanup();
      }
      this._spreadCleanups.clear();
      if (this._machine) {
        this._machine.stop();
        this._machine = null;
      }
      this._api = null;
      super.dispose();
    }
    static {
      this.normalizeProps = normalizeProps;
    }
  };

  // node_modules/clsx/dist/clsx.mjs
  function r(e) {
    var t, f, n = "";
    if ("string" == typeof e || "number" == typeof e) n += e;
    else if ("object" == typeof e) if (Array.isArray(e)) {
      var o = e.length;
      for (t = 0; t < o; t++) e[t] && (f = r(e[t])) && (n && (n += " "), n += f);
    } else for (f in e) e[f] && (n && (n += " "), n += f);
    return n;
  }
  function clsx() {
    for (var e, t, f = 0, n = "", o = arguments.length; f < o; f++) (e = arguments[f]) && (t = r(e)) && (n && (n += " "), n += t);
    return n;
  }

  // node_modules/tailwind-merge/dist/bundle-mjs.mjs
  var concatArrays = (array1, array2) => {
    const combinedArray = new Array(array1.length + array2.length);
    for (let i = 0; i < array1.length; i++) {
      combinedArray[i] = array1[i];
    }
    for (let i = 0; i < array2.length; i++) {
      combinedArray[array1.length + i] = array2[i];
    }
    return combinedArray;
  };
  var createClassValidatorObject = (classGroupId, validator) => ({
    classGroupId,
    validator
  });
  var createClassPartObject = (nextPart = /* @__PURE__ */ new Map(), validators = null, classGroupId) => ({
    nextPart,
    validators,
    classGroupId
  });
  var CLASS_PART_SEPARATOR = "-";
  var EMPTY_CONFLICTS = [];
  var ARBITRARY_PROPERTY_PREFIX = "arbitrary..";
  var createClassGroupUtils = (config) => {
    const classMap = createClassMap(config);
    const {
      conflictingClassGroups,
      conflictingClassGroupModifiers
    } = config;
    const getClassGroupId = (className) => {
      if (className.startsWith("[") && className.endsWith("]")) {
        return getGroupIdForArbitraryProperty(className);
      }
      const classParts = className.split(CLASS_PART_SEPARATOR);
      const startIndex = classParts[0] === "" && classParts.length > 1 ? 1 : 0;
      return getGroupRecursive(classParts, startIndex, classMap);
    };
    const getConflictingClassGroupIds = (classGroupId, hasPostfixModifier) => {
      if (hasPostfixModifier) {
        const modifierConflicts = conflictingClassGroupModifiers[classGroupId];
        const baseConflicts = conflictingClassGroups[classGroupId];
        if (modifierConflicts) {
          if (baseConflicts) {
            return concatArrays(baseConflicts, modifierConflicts);
          }
          return modifierConflicts;
        }
        return baseConflicts || EMPTY_CONFLICTS;
      }
      return conflictingClassGroups[classGroupId] || EMPTY_CONFLICTS;
    };
    return {
      getClassGroupId,
      getConflictingClassGroupIds
    };
  };
  var getGroupRecursive = (classParts, startIndex, classPartObject) => {
    const classPathsLength = classParts.length - startIndex;
    if (classPathsLength === 0) {
      return classPartObject.classGroupId;
    }
    const currentClassPart = classParts[startIndex];
    const nextClassPartObject = classPartObject.nextPart.get(currentClassPart);
    if (nextClassPartObject) {
      const result = getGroupRecursive(classParts, startIndex + 1, nextClassPartObject);
      if (result) return result;
    }
    const validators = classPartObject.validators;
    if (validators === null) {
      return void 0;
    }
    const classRest = startIndex === 0 ? classParts.join(CLASS_PART_SEPARATOR) : classParts.slice(startIndex).join(CLASS_PART_SEPARATOR);
    const validatorsLength = validators.length;
    for (let i = 0; i < validatorsLength; i++) {
      const validatorObj = validators[i];
      if (validatorObj.validator(classRest)) {
        return validatorObj.classGroupId;
      }
    }
    return void 0;
  };
  var getGroupIdForArbitraryProperty = (className) => className.slice(1, -1).indexOf(":") === -1 ? void 0 : (() => {
    const content = className.slice(1, -1);
    const colonIndex = content.indexOf(":");
    const property = content.slice(0, colonIndex);
    return property ? ARBITRARY_PROPERTY_PREFIX + property : void 0;
  })();
  var createClassMap = (config) => {
    const {
      theme,
      classGroups
    } = config;
    return processClassGroups(classGroups, theme);
  };
  var processClassGroups = (classGroups, theme) => {
    const classMap = createClassPartObject();
    for (const classGroupId in classGroups) {
      const group2 = classGroups[classGroupId];
      processClassesRecursively(group2, classMap, classGroupId, theme);
    }
    return classMap;
  };
  var processClassesRecursively = (classGroup, classPartObject, classGroupId, theme) => {
    const len = classGroup.length;
    for (let i = 0; i < len; i++) {
      const classDefinition = classGroup[i];
      processClassDefinition(classDefinition, classPartObject, classGroupId, theme);
    }
  };
  var processClassDefinition = (classDefinition, classPartObject, classGroupId, theme) => {
    if (typeof classDefinition === "string") {
      processStringDefinition(classDefinition, classPartObject, classGroupId);
      return;
    }
    if (typeof classDefinition === "function") {
      processFunctionDefinition(classDefinition, classPartObject, classGroupId, theme);
      return;
    }
    processObjectDefinition(classDefinition, classPartObject, classGroupId, theme);
  };
  var processStringDefinition = (classDefinition, classPartObject, classGroupId) => {
    const classPartObjectToEdit = classDefinition === "" ? classPartObject : getPart(classPartObject, classDefinition);
    classPartObjectToEdit.classGroupId = classGroupId;
  };
  var processFunctionDefinition = (classDefinition, classPartObject, classGroupId, theme) => {
    if (isThemeGetter(classDefinition)) {
      processClassesRecursively(classDefinition(theme), classPartObject, classGroupId, theme);
      return;
    }
    if (classPartObject.validators === null) {
      classPartObject.validators = [];
    }
    classPartObject.validators.push(createClassValidatorObject(classGroupId, classDefinition));
  };
  var processObjectDefinition = (classDefinition, classPartObject, classGroupId, theme) => {
    const entries = Object.entries(classDefinition);
    const len = entries.length;
    for (let i = 0; i < len; i++) {
      const [key, value] = entries[i];
      processClassesRecursively(value, getPart(classPartObject, key), classGroupId, theme);
    }
  };
  var getPart = (classPartObject, path) => {
    let current = classPartObject;
    const parts4 = path.split(CLASS_PART_SEPARATOR);
    const len = parts4.length;
    for (let i = 0; i < len; i++) {
      const part = parts4[i];
      let next = current.nextPart.get(part);
      if (!next) {
        next = createClassPartObject();
        current.nextPart.set(part, next);
      }
      current = next;
    }
    return current;
  };
  var isThemeGetter = (func) => "isThemeGetter" in func && func.isThemeGetter === true;
  var createLruCache = (maxCacheSize) => {
    if (maxCacheSize < 1) {
      return {
        get: () => void 0,
        set: () => {
        }
      };
    }
    let cacheSize = 0;
    let cache = /* @__PURE__ */ Object.create(null);
    let previousCache = /* @__PURE__ */ Object.create(null);
    const update = (key, value) => {
      cache[key] = value;
      cacheSize++;
      if (cacheSize > maxCacheSize) {
        cacheSize = 0;
        previousCache = cache;
        cache = /* @__PURE__ */ Object.create(null);
      }
    };
    return {
      get(key) {
        let value = cache[key];
        if (value !== void 0) {
          return value;
        }
        if ((value = previousCache[key]) !== void 0) {
          update(key, value);
          return value;
        }
      },
      set(key, value) {
        if (key in cache) {
          cache[key] = value;
        } else {
          update(key, value);
        }
      }
    };
  };
  var IMPORTANT_MODIFIER = "!";
  var MODIFIER_SEPARATOR = ":";
  var EMPTY_MODIFIERS = [];
  var createResultObject = (modifiers, hasImportantModifier, baseClassName, maybePostfixModifierPosition, isExternal) => ({
    modifiers,
    hasImportantModifier,
    baseClassName,
    maybePostfixModifierPosition,
    isExternal
  });
  var createParseClassName = (config) => {
    const {
      prefix,
      experimentalParseClassName
    } = config;
    let parseClassName = (className) => {
      const modifiers = [];
      let bracketDepth = 0;
      let parenDepth = 0;
      let modifierStart = 0;
      let postfixModifierPosition;
      const len = className.length;
      for (let index = 0; index < len; index++) {
        const currentCharacter = className[index];
        if (bracketDepth === 0 && parenDepth === 0) {
          if (currentCharacter === MODIFIER_SEPARATOR) {
            modifiers.push(className.slice(modifierStart, index));
            modifierStart = index + 1;
            continue;
          }
          if (currentCharacter === "/") {
            postfixModifierPosition = index;
            continue;
          }
        }
        if (currentCharacter === "[") bracketDepth++;
        else if (currentCharacter === "]") bracketDepth--;
        else if (currentCharacter === "(") parenDepth++;
        else if (currentCharacter === ")") parenDepth--;
      }
      const baseClassNameWithImportantModifier = modifiers.length === 0 ? className : className.slice(modifierStart);
      let baseClassName = baseClassNameWithImportantModifier;
      let hasImportantModifier = false;
      if (baseClassNameWithImportantModifier.endsWith(IMPORTANT_MODIFIER)) {
        baseClassName = baseClassNameWithImportantModifier.slice(0, -1);
        hasImportantModifier = true;
      } else if (
        /**
         * In Tailwind CSS v3 the important modifier was at the start of the base class name. This is still supported for legacy reasons.
         * @see https://github.com/dcastil/tailwind-merge/issues/513#issuecomment-2614029864
         */
        baseClassNameWithImportantModifier.startsWith(IMPORTANT_MODIFIER)
      ) {
        baseClassName = baseClassNameWithImportantModifier.slice(1);
        hasImportantModifier = true;
      }
      const maybePostfixModifierPosition = postfixModifierPosition && postfixModifierPosition > modifierStart ? postfixModifierPosition - modifierStart : void 0;
      return createResultObject(modifiers, hasImportantModifier, baseClassName, maybePostfixModifierPosition);
    };
    if (prefix) {
      const fullPrefix = prefix + MODIFIER_SEPARATOR;
      const parseClassNameOriginal = parseClassName;
      parseClassName = (className) => className.startsWith(fullPrefix) ? parseClassNameOriginal(className.slice(fullPrefix.length)) : createResultObject(EMPTY_MODIFIERS, false, className, void 0, true);
    }
    if (experimentalParseClassName) {
      const parseClassNameOriginal = parseClassName;
      parseClassName = (className) => experimentalParseClassName({
        className,
        parseClassName: parseClassNameOriginal
      });
    }
    return parseClassName;
  };
  var createSortModifiers = (config) => {
    const modifierWeights = /* @__PURE__ */ new Map();
    config.orderSensitiveModifiers.forEach((mod, index) => {
      modifierWeights.set(mod, 1e6 + index);
    });
    return (modifiers) => {
      const result = [];
      let currentSegment = [];
      for (let i = 0; i < modifiers.length; i++) {
        const modifier = modifiers[i];
        const isArbitrary = modifier[0] === "[";
        const isOrderSensitive = modifierWeights.has(modifier);
        if (isArbitrary || isOrderSensitive) {
          if (currentSegment.length > 0) {
            currentSegment.sort();
            result.push(...currentSegment);
            currentSegment = [];
          }
          result.push(modifier);
        } else {
          currentSegment.push(modifier);
        }
      }
      if (currentSegment.length > 0) {
        currentSegment.sort();
        result.push(...currentSegment);
      }
      return result;
    };
  };
  var createConfigUtils = (config) => ({
    cache: createLruCache(config.cacheSize),
    parseClassName: createParseClassName(config),
    sortModifiers: createSortModifiers(config),
    ...createClassGroupUtils(config)
  });
  var SPLIT_CLASSES_REGEX = /\s+/;
  var mergeClassList = (classList, configUtils) => {
    const {
      parseClassName,
      getClassGroupId,
      getConflictingClassGroupIds,
      sortModifiers
    } = configUtils;
    const classGroupsInConflict = [];
    const classNames = classList.trim().split(SPLIT_CLASSES_REGEX);
    let result = "";
    for (let index = classNames.length - 1; index >= 0; index -= 1) {
      const originalClassName = classNames[index];
      const {
        isExternal,
        modifiers,
        hasImportantModifier,
        baseClassName,
        maybePostfixModifierPosition
      } = parseClassName(originalClassName);
      if (isExternal) {
        result = originalClassName + (result.length > 0 ? " " + result : result);
        continue;
      }
      let hasPostfixModifier = !!maybePostfixModifierPosition;
      let classGroupId = getClassGroupId(hasPostfixModifier ? baseClassName.substring(0, maybePostfixModifierPosition) : baseClassName);
      if (!classGroupId) {
        if (!hasPostfixModifier) {
          result = originalClassName + (result.length > 0 ? " " + result : result);
          continue;
        }
        classGroupId = getClassGroupId(baseClassName);
        if (!classGroupId) {
          result = originalClassName + (result.length > 0 ? " " + result : result);
          continue;
        }
        hasPostfixModifier = false;
      }
      const variantModifier = modifiers.length === 0 ? "" : modifiers.length === 1 ? modifiers[0] : sortModifiers(modifiers).join(":");
      const modifierId = hasImportantModifier ? variantModifier + IMPORTANT_MODIFIER : variantModifier;
      const classId = modifierId + classGroupId;
      if (classGroupsInConflict.indexOf(classId) > -1) {
        continue;
      }
      classGroupsInConflict.push(classId);
      const conflictGroups = getConflictingClassGroupIds(classGroupId, hasPostfixModifier);
      for (let i = 0; i < conflictGroups.length; ++i) {
        const group2 = conflictGroups[i];
        classGroupsInConflict.push(modifierId + group2);
      }
      result = originalClassName + (result.length > 0 ? " " + result : result);
    }
    return result;
  };
  var twJoin = (...classLists) => {
    let index = 0;
    let argument;
    let resolvedValue;
    let string = "";
    while (index < classLists.length) {
      if (argument = classLists[index++]) {
        if (resolvedValue = toValue(argument)) {
          string && (string += " ");
          string += resolvedValue;
        }
      }
    }
    return string;
  };
  var toValue = (mix) => {
    if (typeof mix === "string") {
      return mix;
    }
    let resolvedValue;
    let string = "";
    for (let k = 0; k < mix.length; k++) {
      if (mix[k]) {
        if (resolvedValue = toValue(mix[k])) {
          string && (string += " ");
          string += resolvedValue;
        }
      }
    }
    return string;
  };
  var createTailwindMerge = (createConfigFirst, ...createConfigRest) => {
    let configUtils;
    let cacheGet;
    let cacheSet;
    let functionToCall;
    const initTailwindMerge = (classList) => {
      const config = createConfigRest.reduce((previousConfig, createConfigCurrent) => createConfigCurrent(previousConfig), createConfigFirst());
      configUtils = createConfigUtils(config);
      cacheGet = configUtils.cache.get;
      cacheSet = configUtils.cache.set;
      functionToCall = tailwindMerge;
      return tailwindMerge(classList);
    };
    const tailwindMerge = (classList) => {
      const cachedResult = cacheGet(classList);
      if (cachedResult) {
        return cachedResult;
      }
      const result = mergeClassList(classList, configUtils);
      cacheSet(classList, result);
      return result;
    };
    functionToCall = initTailwindMerge;
    return (...args) => functionToCall(twJoin(...args));
  };
  var fallbackThemeArr = [];
  var fromTheme = (key) => {
    const themeGetter = (theme) => theme[key] || fallbackThemeArr;
    themeGetter.isThemeGetter = true;
    return themeGetter;
  };
  var arbitraryValueRegex = /^\[(?:(\w[\w-]*):)?(.+)\]$/i;
  var arbitraryVariableRegex = /^\((?:(\w[\w-]*):)?(.+)\)$/i;
  var fractionRegex = /^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/;
  var tshirtUnitRegex = /^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/;
  var lengthUnitRegex = /\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/;
  var colorFunctionRegex = /^(rgba?|hsla?|hwb|(ok)?(lab|lch)|color-mix)\(.+\)$/;
  var shadowRegex = /^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/;
  var imageRegex = /^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/;
  var isFraction = (value) => fractionRegex.test(value);
  var isNumber = (value) => !!value && !Number.isNaN(Number(value));
  var isInteger = (value) => !!value && Number.isInteger(Number(value));
  var isPercent = (value) => value.endsWith("%") && isNumber(value.slice(0, -1));
  var isTshirtSize = (value) => tshirtUnitRegex.test(value);
  var isAny = () => true;
  var isLengthOnly = (value) => (
    // `colorFunctionRegex` check is necessary because color functions can have percentages in them which which would be incorrectly classified as lengths.
    // For example, `hsl(0 0% 0%)` would be classified as a length without this check.
    // I could also use lookbehind assertion in `lengthUnitRegex` but that isn't supported widely enough.
    lengthUnitRegex.test(value) && !colorFunctionRegex.test(value)
  );
  var isNever = () => false;
  var isShadow = (value) => shadowRegex.test(value);
  var isImage = (value) => imageRegex.test(value);
  var isAnyNonArbitrary = (value) => !isArbitraryValue(value) && !isArbitraryVariable(value);
  var isArbitrarySize = (value) => getIsArbitraryValue(value, isLabelSize, isNever);
  var isArbitraryValue = (value) => arbitraryValueRegex.test(value);
  var isArbitraryLength = (value) => getIsArbitraryValue(value, isLabelLength, isLengthOnly);
  var isArbitraryNumber = (value) => getIsArbitraryValue(value, isLabelNumber, isNumber);
  var isArbitraryWeight = (value) => getIsArbitraryValue(value, isLabelWeight, isAny);
  var isArbitraryFamilyName = (value) => getIsArbitraryValue(value, isLabelFamilyName, isNever);
  var isArbitraryPosition = (value) => getIsArbitraryValue(value, isLabelPosition, isNever);
  var isArbitraryImage = (value) => getIsArbitraryValue(value, isLabelImage, isImage);
  var isArbitraryShadow = (value) => getIsArbitraryValue(value, isLabelShadow, isShadow);
  var isArbitraryVariable = (value) => arbitraryVariableRegex.test(value);
  var isArbitraryVariableLength = (value) => getIsArbitraryVariable(value, isLabelLength);
  var isArbitraryVariableFamilyName = (value) => getIsArbitraryVariable(value, isLabelFamilyName);
  var isArbitraryVariablePosition = (value) => getIsArbitraryVariable(value, isLabelPosition);
  var isArbitraryVariableSize = (value) => getIsArbitraryVariable(value, isLabelSize);
  var isArbitraryVariableImage = (value) => getIsArbitraryVariable(value, isLabelImage);
  var isArbitraryVariableShadow = (value) => getIsArbitraryVariable(value, isLabelShadow, true);
  var isArbitraryVariableWeight = (value) => getIsArbitraryVariable(value, isLabelWeight, true);
  var getIsArbitraryValue = (value, testLabel, testValue) => {
    const result = arbitraryValueRegex.exec(value);
    if (result) {
      if (result[1]) {
        return testLabel(result[1]);
      }
      return testValue(result[2]);
    }
    return false;
  };
  var getIsArbitraryVariable = (value, testLabel, shouldMatchNoLabel = false) => {
    const result = arbitraryVariableRegex.exec(value);
    if (result) {
      if (result[1]) {
        return testLabel(result[1]);
      }
      return shouldMatchNoLabel;
    }
    return false;
  };
  var isLabelPosition = (label) => label === "position" || label === "percentage";
  var isLabelImage = (label) => label === "image" || label === "url";
  var isLabelSize = (label) => label === "length" || label === "size" || label === "bg-size";
  var isLabelLength = (label) => label === "length";
  var isLabelNumber = (label) => label === "number";
  var isLabelFamilyName = (label) => label === "family-name";
  var isLabelWeight = (label) => label === "number" || label === "weight";
  var isLabelShadow = (label) => label === "shadow";
  var getDefaultConfig = () => {
    const themeColor = fromTheme("color");
    const themeFont = fromTheme("font");
    const themeText = fromTheme("text");
    const themeFontWeight = fromTheme("font-weight");
    const themeTracking = fromTheme("tracking");
    const themeLeading = fromTheme("leading");
    const themeBreakpoint = fromTheme("breakpoint");
    const themeContainer = fromTheme("container");
    const themeSpacing = fromTheme("spacing");
    const themeRadius = fromTheme("radius");
    const themeShadow = fromTheme("shadow");
    const themeInsetShadow = fromTheme("inset-shadow");
    const themeTextShadow = fromTheme("text-shadow");
    const themeDropShadow = fromTheme("drop-shadow");
    const themeBlur = fromTheme("blur");
    const themePerspective = fromTheme("perspective");
    const themeAspect = fromTheme("aspect");
    const themeEase = fromTheme("ease");
    const themeAnimate = fromTheme("animate");
    const scaleBreak = () => ["auto", "avoid", "all", "avoid-page", "page", "left", "right", "column"];
    const scalePosition = () => [
      "center",
      "top",
      "bottom",
      "left",
      "right",
      "top-left",
      // Deprecated since Tailwind CSS v4.1.0, see https://github.com/tailwindlabs/tailwindcss/pull/17378
      "left-top",
      "top-right",
      // Deprecated since Tailwind CSS v4.1.0, see https://github.com/tailwindlabs/tailwindcss/pull/17378
      "right-top",
      "bottom-right",
      // Deprecated since Tailwind CSS v4.1.0, see https://github.com/tailwindlabs/tailwindcss/pull/17378
      "right-bottom",
      "bottom-left",
      // Deprecated since Tailwind CSS v4.1.0, see https://github.com/tailwindlabs/tailwindcss/pull/17378
      "left-bottom"
    ];
    const scalePositionWithArbitrary = () => [...scalePosition(), isArbitraryVariable, isArbitraryValue];
    const scaleOverflow = () => ["auto", "hidden", "clip", "visible", "scroll"];
    const scaleOverscroll = () => ["auto", "contain", "none"];
    const scaleUnambiguousSpacing = () => [isArbitraryVariable, isArbitraryValue, themeSpacing];
    const scaleInset = () => [isFraction, "full", "auto", ...scaleUnambiguousSpacing()];
    const scaleGridTemplateColsRows = () => [isInteger, "none", "subgrid", isArbitraryVariable, isArbitraryValue];
    const scaleGridColRowStartAndEnd = () => ["auto", {
      span: ["full", isInteger, isArbitraryVariable, isArbitraryValue]
    }, isInteger, isArbitraryVariable, isArbitraryValue];
    const scaleGridColRowStartOrEnd = () => [isInteger, "auto", isArbitraryVariable, isArbitraryValue];
    const scaleGridAutoColsRows = () => ["auto", "min", "max", "fr", isArbitraryVariable, isArbitraryValue];
    const scaleAlignPrimaryAxis = () => ["start", "end", "center", "between", "around", "evenly", "stretch", "baseline", "center-safe", "end-safe"];
    const scaleAlignSecondaryAxis = () => ["start", "end", "center", "stretch", "center-safe", "end-safe"];
    const scaleMargin = () => ["auto", ...scaleUnambiguousSpacing()];
    const scaleSizing = () => [isFraction, "auto", "full", "dvw", "dvh", "lvw", "lvh", "svw", "svh", "min", "max", "fit", ...scaleUnambiguousSpacing()];
    const scaleSizingInline = () => [isFraction, "screen", "full", "dvw", "lvw", "svw", "min", "max", "fit", ...scaleUnambiguousSpacing()];
    const scaleSizingBlock = () => [isFraction, "screen", "full", "lh", "dvh", "lvh", "svh", "min", "max", "fit", ...scaleUnambiguousSpacing()];
    const scaleColor = () => [themeColor, isArbitraryVariable, isArbitraryValue];
    const scaleBgPosition = () => [...scalePosition(), isArbitraryVariablePosition, isArbitraryPosition, {
      position: [isArbitraryVariable, isArbitraryValue]
    }];
    const scaleBgRepeat = () => ["no-repeat", {
      repeat: ["", "x", "y", "space", "round"]
    }];
    const scaleBgSize = () => ["auto", "cover", "contain", isArbitraryVariableSize, isArbitrarySize, {
      size: [isArbitraryVariable, isArbitraryValue]
    }];
    const scaleGradientStopPosition = () => [isPercent, isArbitraryVariableLength, isArbitraryLength];
    const scaleRadius = () => [
      // Deprecated since Tailwind CSS v4.0.0
      "",
      "none",
      "full",
      themeRadius,
      isArbitraryVariable,
      isArbitraryValue
    ];
    const scaleBorderWidth = () => ["", isNumber, isArbitraryVariableLength, isArbitraryLength];
    const scaleLineStyle = () => ["solid", "dashed", "dotted", "double"];
    const scaleBlendMode = () => ["normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity"];
    const scaleMaskImagePosition = () => [isNumber, isPercent, isArbitraryVariablePosition, isArbitraryPosition];
    const scaleBlur = () => [
      // Deprecated since Tailwind CSS v4.0.0
      "",
      "none",
      themeBlur,
      isArbitraryVariable,
      isArbitraryValue
    ];
    const scaleRotate = () => ["none", isNumber, isArbitraryVariable, isArbitraryValue];
    const scaleScale = () => ["none", isNumber, isArbitraryVariable, isArbitraryValue];
    const scaleSkew = () => [isNumber, isArbitraryVariable, isArbitraryValue];
    const scaleTranslate = () => [isFraction, "full", ...scaleUnambiguousSpacing()];
    return {
      cacheSize: 500,
      theme: {
        animate: ["spin", "ping", "pulse", "bounce"],
        aspect: ["video"],
        blur: [isTshirtSize],
        breakpoint: [isTshirtSize],
        color: [isAny],
        container: [isTshirtSize],
        "drop-shadow": [isTshirtSize],
        ease: ["in", "out", "in-out"],
        font: [isAnyNonArbitrary],
        "font-weight": ["thin", "extralight", "light", "normal", "medium", "semibold", "bold", "extrabold", "black"],
        "inset-shadow": [isTshirtSize],
        leading: ["none", "tight", "snug", "normal", "relaxed", "loose"],
        perspective: ["dramatic", "near", "normal", "midrange", "distant", "none"],
        radius: [isTshirtSize],
        shadow: [isTshirtSize],
        spacing: ["px", isNumber],
        text: [isTshirtSize],
        "text-shadow": [isTshirtSize],
        tracking: ["tighter", "tight", "normal", "wide", "wider", "widest"]
      },
      classGroups: {
        // --------------
        // --- Layout ---
        // --------------
        /**
         * Aspect Ratio
         * @see https://tailwindcss.com/docs/aspect-ratio
         */
        aspect: [{
          aspect: ["auto", "square", isFraction, isArbitraryValue, isArbitraryVariable, themeAspect]
        }],
        /**
         * Container
         * @see https://tailwindcss.com/docs/container
         * @deprecated since Tailwind CSS v4.0.0
         */
        container: ["container"],
        /**
         * Columns
         * @see https://tailwindcss.com/docs/columns
         */
        columns: [{
          columns: [isNumber, isArbitraryValue, isArbitraryVariable, themeContainer]
        }],
        /**
         * Break After
         * @see https://tailwindcss.com/docs/break-after
         */
        "break-after": [{
          "break-after": scaleBreak()
        }],
        /**
         * Break Before
         * @see https://tailwindcss.com/docs/break-before
         */
        "break-before": [{
          "break-before": scaleBreak()
        }],
        /**
         * Break Inside
         * @see https://tailwindcss.com/docs/break-inside
         */
        "break-inside": [{
          "break-inside": ["auto", "avoid", "avoid-page", "avoid-column"]
        }],
        /**
         * Box Decoration Break
         * @see https://tailwindcss.com/docs/box-decoration-break
         */
        "box-decoration": [{
          "box-decoration": ["slice", "clone"]
        }],
        /**
         * Box Sizing
         * @see https://tailwindcss.com/docs/box-sizing
         */
        box: [{
          box: ["border", "content"]
        }],
        /**
         * Display
         * @see https://tailwindcss.com/docs/display
         */
        display: ["block", "inline-block", "inline", "flex", "inline-flex", "table", "inline-table", "table-caption", "table-cell", "table-column", "table-column-group", "table-footer-group", "table-header-group", "table-row-group", "table-row", "flow-root", "grid", "inline-grid", "contents", "list-item", "hidden"],
        /**
         * Screen Reader Only
         * @see https://tailwindcss.com/docs/display#screen-reader-only
         */
        sr: ["sr-only", "not-sr-only"],
        /**
         * Floats
         * @see https://tailwindcss.com/docs/float
         */
        float: [{
          float: ["right", "left", "none", "start", "end"]
        }],
        /**
         * Clear
         * @see https://tailwindcss.com/docs/clear
         */
        clear: [{
          clear: ["left", "right", "both", "none", "start", "end"]
        }],
        /**
         * Isolation
         * @see https://tailwindcss.com/docs/isolation
         */
        isolation: ["isolate", "isolation-auto"],
        /**
         * Object Fit
         * @see https://tailwindcss.com/docs/object-fit
         */
        "object-fit": [{
          object: ["contain", "cover", "fill", "none", "scale-down"]
        }],
        /**
         * Object Position
         * @see https://tailwindcss.com/docs/object-position
         */
        "object-position": [{
          object: scalePositionWithArbitrary()
        }],
        /**
         * Overflow
         * @see https://tailwindcss.com/docs/overflow
         */
        overflow: [{
          overflow: scaleOverflow()
        }],
        /**
         * Overflow X
         * @see https://tailwindcss.com/docs/overflow
         */
        "overflow-x": [{
          "overflow-x": scaleOverflow()
        }],
        /**
         * Overflow Y
         * @see https://tailwindcss.com/docs/overflow
         */
        "overflow-y": [{
          "overflow-y": scaleOverflow()
        }],
        /**
         * Overscroll Behavior
         * @see https://tailwindcss.com/docs/overscroll-behavior
         */
        overscroll: [{
          overscroll: scaleOverscroll()
        }],
        /**
         * Overscroll Behavior X
         * @see https://tailwindcss.com/docs/overscroll-behavior
         */
        "overscroll-x": [{
          "overscroll-x": scaleOverscroll()
        }],
        /**
         * Overscroll Behavior Y
         * @see https://tailwindcss.com/docs/overscroll-behavior
         */
        "overscroll-y": [{
          "overscroll-y": scaleOverscroll()
        }],
        /**
         * Position
         * @see https://tailwindcss.com/docs/position
         */
        position: ["static", "fixed", "absolute", "relative", "sticky"],
        /**
         * Inset
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        inset: [{
          inset: scaleInset()
        }],
        /**
         * Inset Inline
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        "inset-x": [{
          "inset-x": scaleInset()
        }],
        /**
         * Inset Block
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        "inset-y": [{
          "inset-y": scaleInset()
        }],
        /**
         * Inset Inline Start
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         * @todo class group will be renamed to `inset-s` in next major release
         */
        start: [{
          "inset-s": scaleInset(),
          /**
           * @deprecated since Tailwind CSS v4.2.0 in favor of `inset-s-*` utilities.
           * @see https://github.com/tailwindlabs/tailwindcss/pull/19613
           */
          start: scaleInset()
        }],
        /**
         * Inset Inline End
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         * @todo class group will be renamed to `inset-e` in next major release
         */
        end: [{
          "inset-e": scaleInset(),
          /**
           * @deprecated since Tailwind CSS v4.2.0 in favor of `inset-e-*` utilities.
           * @see https://github.com/tailwindlabs/tailwindcss/pull/19613
           */
          end: scaleInset()
        }],
        /**
         * Inset Block Start
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        "inset-bs": [{
          "inset-bs": scaleInset()
        }],
        /**
         * Inset Block End
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        "inset-be": [{
          "inset-be": scaleInset()
        }],
        /**
         * Top
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        top: [{
          top: scaleInset()
        }],
        /**
         * Right
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        right: [{
          right: scaleInset()
        }],
        /**
         * Bottom
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        bottom: [{
          bottom: scaleInset()
        }],
        /**
         * Left
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        left: [{
          left: scaleInset()
        }],
        /**
         * Visibility
         * @see https://tailwindcss.com/docs/visibility
         */
        visibility: ["visible", "invisible", "collapse"],
        /**
         * Z-Index
         * @see https://tailwindcss.com/docs/z-index
         */
        z: [{
          z: [isInteger, "auto", isArbitraryVariable, isArbitraryValue]
        }],
        // ------------------------
        // --- Flexbox and Grid ---
        // ------------------------
        /**
         * Flex Basis
         * @see https://tailwindcss.com/docs/flex-basis
         */
        basis: [{
          basis: [isFraction, "full", "auto", themeContainer, ...scaleUnambiguousSpacing()]
        }],
        /**
         * Flex Direction
         * @see https://tailwindcss.com/docs/flex-direction
         */
        "flex-direction": [{
          flex: ["row", "row-reverse", "col", "col-reverse"]
        }],
        /**
         * Flex Wrap
         * @see https://tailwindcss.com/docs/flex-wrap
         */
        "flex-wrap": [{
          flex: ["nowrap", "wrap", "wrap-reverse"]
        }],
        /**
         * Flex
         * @see https://tailwindcss.com/docs/flex
         */
        flex: [{
          flex: [isNumber, isFraction, "auto", "initial", "none", isArbitraryValue]
        }],
        /**
         * Flex Grow
         * @see https://tailwindcss.com/docs/flex-grow
         */
        grow: [{
          grow: ["", isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Flex Shrink
         * @see https://tailwindcss.com/docs/flex-shrink
         */
        shrink: [{
          shrink: ["", isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Order
         * @see https://tailwindcss.com/docs/order
         */
        order: [{
          order: [isInteger, "first", "last", "none", isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Grid Template Columns
         * @see https://tailwindcss.com/docs/grid-template-columns
         */
        "grid-cols": [{
          "grid-cols": scaleGridTemplateColsRows()
        }],
        /**
         * Grid Column Start / End
         * @see https://tailwindcss.com/docs/grid-column
         */
        "col-start-end": [{
          col: scaleGridColRowStartAndEnd()
        }],
        /**
         * Grid Column Start
         * @see https://tailwindcss.com/docs/grid-column
         */
        "col-start": [{
          "col-start": scaleGridColRowStartOrEnd()
        }],
        /**
         * Grid Column End
         * @see https://tailwindcss.com/docs/grid-column
         */
        "col-end": [{
          "col-end": scaleGridColRowStartOrEnd()
        }],
        /**
         * Grid Template Rows
         * @see https://tailwindcss.com/docs/grid-template-rows
         */
        "grid-rows": [{
          "grid-rows": scaleGridTemplateColsRows()
        }],
        /**
         * Grid Row Start / End
         * @see https://tailwindcss.com/docs/grid-row
         */
        "row-start-end": [{
          row: scaleGridColRowStartAndEnd()
        }],
        /**
         * Grid Row Start
         * @see https://tailwindcss.com/docs/grid-row
         */
        "row-start": [{
          "row-start": scaleGridColRowStartOrEnd()
        }],
        /**
         * Grid Row End
         * @see https://tailwindcss.com/docs/grid-row
         */
        "row-end": [{
          "row-end": scaleGridColRowStartOrEnd()
        }],
        /**
         * Grid Auto Flow
         * @see https://tailwindcss.com/docs/grid-auto-flow
         */
        "grid-flow": [{
          "grid-flow": ["row", "col", "dense", "row-dense", "col-dense"]
        }],
        /**
         * Grid Auto Columns
         * @see https://tailwindcss.com/docs/grid-auto-columns
         */
        "auto-cols": [{
          "auto-cols": scaleGridAutoColsRows()
        }],
        /**
         * Grid Auto Rows
         * @see https://tailwindcss.com/docs/grid-auto-rows
         */
        "auto-rows": [{
          "auto-rows": scaleGridAutoColsRows()
        }],
        /**
         * Gap
         * @see https://tailwindcss.com/docs/gap
         */
        gap: [{
          gap: scaleUnambiguousSpacing()
        }],
        /**
         * Gap X
         * @see https://tailwindcss.com/docs/gap
         */
        "gap-x": [{
          "gap-x": scaleUnambiguousSpacing()
        }],
        /**
         * Gap Y
         * @see https://tailwindcss.com/docs/gap
         */
        "gap-y": [{
          "gap-y": scaleUnambiguousSpacing()
        }],
        /**
         * Justify Content
         * @see https://tailwindcss.com/docs/justify-content
         */
        "justify-content": [{
          justify: [...scaleAlignPrimaryAxis(), "normal"]
        }],
        /**
         * Justify Items
         * @see https://tailwindcss.com/docs/justify-items
         */
        "justify-items": [{
          "justify-items": [...scaleAlignSecondaryAxis(), "normal"]
        }],
        /**
         * Justify Self
         * @see https://tailwindcss.com/docs/justify-self
         */
        "justify-self": [{
          "justify-self": ["auto", ...scaleAlignSecondaryAxis()]
        }],
        /**
         * Align Content
         * @see https://tailwindcss.com/docs/align-content
         */
        "align-content": [{
          content: ["normal", ...scaleAlignPrimaryAxis()]
        }],
        /**
         * Align Items
         * @see https://tailwindcss.com/docs/align-items
         */
        "align-items": [{
          items: [...scaleAlignSecondaryAxis(), {
            baseline: ["", "last"]
          }]
        }],
        /**
         * Align Self
         * @see https://tailwindcss.com/docs/align-self
         */
        "align-self": [{
          self: ["auto", ...scaleAlignSecondaryAxis(), {
            baseline: ["", "last"]
          }]
        }],
        /**
         * Place Content
         * @see https://tailwindcss.com/docs/place-content
         */
        "place-content": [{
          "place-content": scaleAlignPrimaryAxis()
        }],
        /**
         * Place Items
         * @see https://tailwindcss.com/docs/place-items
         */
        "place-items": [{
          "place-items": [...scaleAlignSecondaryAxis(), "baseline"]
        }],
        /**
         * Place Self
         * @see https://tailwindcss.com/docs/place-self
         */
        "place-self": [{
          "place-self": ["auto", ...scaleAlignSecondaryAxis()]
        }],
        // Spacing
        /**
         * Padding
         * @see https://tailwindcss.com/docs/padding
         */
        p: [{
          p: scaleUnambiguousSpacing()
        }],
        /**
         * Padding Inline
         * @see https://tailwindcss.com/docs/padding
         */
        px: [{
          px: scaleUnambiguousSpacing()
        }],
        /**
         * Padding Block
         * @see https://tailwindcss.com/docs/padding
         */
        py: [{
          py: scaleUnambiguousSpacing()
        }],
        /**
         * Padding Inline Start
         * @see https://tailwindcss.com/docs/padding
         */
        ps: [{
          ps: scaleUnambiguousSpacing()
        }],
        /**
         * Padding Inline End
         * @see https://tailwindcss.com/docs/padding
         */
        pe: [{
          pe: scaleUnambiguousSpacing()
        }],
        /**
         * Padding Block Start
         * @see https://tailwindcss.com/docs/padding
         */
        pbs: [{
          pbs: scaleUnambiguousSpacing()
        }],
        /**
         * Padding Block End
         * @see https://tailwindcss.com/docs/padding
         */
        pbe: [{
          pbe: scaleUnambiguousSpacing()
        }],
        /**
         * Padding Top
         * @see https://tailwindcss.com/docs/padding
         */
        pt: [{
          pt: scaleUnambiguousSpacing()
        }],
        /**
         * Padding Right
         * @see https://tailwindcss.com/docs/padding
         */
        pr: [{
          pr: scaleUnambiguousSpacing()
        }],
        /**
         * Padding Bottom
         * @see https://tailwindcss.com/docs/padding
         */
        pb: [{
          pb: scaleUnambiguousSpacing()
        }],
        /**
         * Padding Left
         * @see https://tailwindcss.com/docs/padding
         */
        pl: [{
          pl: scaleUnambiguousSpacing()
        }],
        /**
         * Margin
         * @see https://tailwindcss.com/docs/margin
         */
        m: [{
          m: scaleMargin()
        }],
        /**
         * Margin Inline
         * @see https://tailwindcss.com/docs/margin
         */
        mx: [{
          mx: scaleMargin()
        }],
        /**
         * Margin Block
         * @see https://tailwindcss.com/docs/margin
         */
        my: [{
          my: scaleMargin()
        }],
        /**
         * Margin Inline Start
         * @see https://tailwindcss.com/docs/margin
         */
        ms: [{
          ms: scaleMargin()
        }],
        /**
         * Margin Inline End
         * @see https://tailwindcss.com/docs/margin
         */
        me: [{
          me: scaleMargin()
        }],
        /**
         * Margin Block Start
         * @see https://tailwindcss.com/docs/margin
         */
        mbs: [{
          mbs: scaleMargin()
        }],
        /**
         * Margin Block End
         * @see https://tailwindcss.com/docs/margin
         */
        mbe: [{
          mbe: scaleMargin()
        }],
        /**
         * Margin Top
         * @see https://tailwindcss.com/docs/margin
         */
        mt: [{
          mt: scaleMargin()
        }],
        /**
         * Margin Right
         * @see https://tailwindcss.com/docs/margin
         */
        mr: [{
          mr: scaleMargin()
        }],
        /**
         * Margin Bottom
         * @see https://tailwindcss.com/docs/margin
         */
        mb: [{
          mb: scaleMargin()
        }],
        /**
         * Margin Left
         * @see https://tailwindcss.com/docs/margin
         */
        ml: [{
          ml: scaleMargin()
        }],
        /**
         * Space Between X
         * @see https://tailwindcss.com/docs/margin#adding-space-between-children
         */
        "space-x": [{
          "space-x": scaleUnambiguousSpacing()
        }],
        /**
         * Space Between X Reverse
         * @see https://tailwindcss.com/docs/margin#adding-space-between-children
         */
        "space-x-reverse": ["space-x-reverse"],
        /**
         * Space Between Y
         * @see https://tailwindcss.com/docs/margin#adding-space-between-children
         */
        "space-y": [{
          "space-y": scaleUnambiguousSpacing()
        }],
        /**
         * Space Between Y Reverse
         * @see https://tailwindcss.com/docs/margin#adding-space-between-children
         */
        "space-y-reverse": ["space-y-reverse"],
        // --------------
        // --- Sizing ---
        // --------------
        /**
         * Size
         * @see https://tailwindcss.com/docs/width#setting-both-width-and-height
         */
        size: [{
          size: scaleSizing()
        }],
        /**
         * Inline Size
         * @see https://tailwindcss.com/docs/width
         */
        "inline-size": [{
          inline: ["auto", ...scaleSizingInline()]
        }],
        /**
         * Min-Inline Size
         * @see https://tailwindcss.com/docs/min-width
         */
        "min-inline-size": [{
          "min-inline": ["auto", ...scaleSizingInline()]
        }],
        /**
         * Max-Inline Size
         * @see https://tailwindcss.com/docs/max-width
         */
        "max-inline-size": [{
          "max-inline": ["none", ...scaleSizingInline()]
        }],
        /**
         * Block Size
         * @see https://tailwindcss.com/docs/height
         */
        "block-size": [{
          block: ["auto", ...scaleSizingBlock()]
        }],
        /**
         * Min-Block Size
         * @see https://tailwindcss.com/docs/min-height
         */
        "min-block-size": [{
          "min-block": ["auto", ...scaleSizingBlock()]
        }],
        /**
         * Max-Block Size
         * @see https://tailwindcss.com/docs/max-height
         */
        "max-block-size": [{
          "max-block": ["none", ...scaleSizingBlock()]
        }],
        /**
         * Width
         * @see https://tailwindcss.com/docs/width
         */
        w: [{
          w: [themeContainer, "screen", ...scaleSizing()]
        }],
        /**
         * Min-Width
         * @see https://tailwindcss.com/docs/min-width
         */
        "min-w": [{
          "min-w": [
            themeContainer,
            "screen",
            /** Deprecated. @see https://github.com/tailwindlabs/tailwindcss.com/issues/2027#issuecomment-2620152757 */
            "none",
            ...scaleSizing()
          ]
        }],
        /**
         * Max-Width
         * @see https://tailwindcss.com/docs/max-width
         */
        "max-w": [{
          "max-w": [
            themeContainer,
            "screen",
            "none",
            /** Deprecated since Tailwind CSS v4.0.0. @see https://github.com/tailwindlabs/tailwindcss.com/issues/2027#issuecomment-2620152757 */
            "prose",
            /** Deprecated since Tailwind CSS v4.0.0. @see https://github.com/tailwindlabs/tailwindcss.com/issues/2027#issuecomment-2620152757 */
            {
              screen: [themeBreakpoint]
            },
            ...scaleSizing()
          ]
        }],
        /**
         * Height
         * @see https://tailwindcss.com/docs/height
         */
        h: [{
          h: ["screen", "lh", ...scaleSizing()]
        }],
        /**
         * Min-Height
         * @see https://tailwindcss.com/docs/min-height
         */
        "min-h": [{
          "min-h": ["screen", "lh", "none", ...scaleSizing()]
        }],
        /**
         * Max-Height
         * @see https://tailwindcss.com/docs/max-height
         */
        "max-h": [{
          "max-h": ["screen", "lh", ...scaleSizing()]
        }],
        // ------------------
        // --- Typography ---
        // ------------------
        /**
         * Font Size
         * @see https://tailwindcss.com/docs/font-size
         */
        "font-size": [{
          text: ["base", themeText, isArbitraryVariableLength, isArbitraryLength]
        }],
        /**
         * Font Smoothing
         * @see https://tailwindcss.com/docs/font-smoothing
         */
        "font-smoothing": ["antialiased", "subpixel-antialiased"],
        /**
         * Font Style
         * @see https://tailwindcss.com/docs/font-style
         */
        "font-style": ["italic", "not-italic"],
        /**
         * Font Weight
         * @see https://tailwindcss.com/docs/font-weight
         */
        "font-weight": [{
          font: [themeFontWeight, isArbitraryVariableWeight, isArbitraryWeight]
        }],
        /**
         * Font Stretch
         * @see https://tailwindcss.com/docs/font-stretch
         */
        "font-stretch": [{
          "font-stretch": ["ultra-condensed", "extra-condensed", "condensed", "semi-condensed", "normal", "semi-expanded", "expanded", "extra-expanded", "ultra-expanded", isPercent, isArbitraryValue]
        }],
        /**
         * Font Family
         * @see https://tailwindcss.com/docs/font-family
         */
        "font-family": [{
          font: [isArbitraryVariableFamilyName, isArbitraryFamilyName, themeFont]
        }],
        /**
         * Font Feature Settings
         * @see https://tailwindcss.com/docs/font-feature-settings
         */
        "font-features": [{
          "font-features": [isArbitraryValue]
        }],
        /**
         * Font Variant Numeric
         * @see https://tailwindcss.com/docs/font-variant-numeric
         */
        "fvn-normal": ["normal-nums"],
        /**
         * Font Variant Numeric
         * @see https://tailwindcss.com/docs/font-variant-numeric
         */
        "fvn-ordinal": ["ordinal"],
        /**
         * Font Variant Numeric
         * @see https://tailwindcss.com/docs/font-variant-numeric
         */
        "fvn-slashed-zero": ["slashed-zero"],
        /**
         * Font Variant Numeric
         * @see https://tailwindcss.com/docs/font-variant-numeric
         */
        "fvn-figure": ["lining-nums", "oldstyle-nums"],
        /**
         * Font Variant Numeric
         * @see https://tailwindcss.com/docs/font-variant-numeric
         */
        "fvn-spacing": ["proportional-nums", "tabular-nums"],
        /**
         * Font Variant Numeric
         * @see https://tailwindcss.com/docs/font-variant-numeric
         */
        "fvn-fraction": ["diagonal-fractions", "stacked-fractions"],
        /**
         * Letter Spacing
         * @see https://tailwindcss.com/docs/letter-spacing
         */
        tracking: [{
          tracking: [themeTracking, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Line Clamp
         * @see https://tailwindcss.com/docs/line-clamp
         */
        "line-clamp": [{
          "line-clamp": [isNumber, "none", isArbitraryVariable, isArbitraryNumber]
        }],
        /**
         * Line Height
         * @see https://tailwindcss.com/docs/line-height
         */
        leading: [{
          leading: [
            /** Deprecated since Tailwind CSS v4.0.0. @see https://github.com/tailwindlabs/tailwindcss.com/issues/2027#issuecomment-2620152757 */
            themeLeading,
            ...scaleUnambiguousSpacing()
          ]
        }],
        /**
         * List Style Image
         * @see https://tailwindcss.com/docs/list-style-image
         */
        "list-image": [{
          "list-image": ["none", isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * List Style Position
         * @see https://tailwindcss.com/docs/list-style-position
         */
        "list-style-position": [{
          list: ["inside", "outside"]
        }],
        /**
         * List Style Type
         * @see https://tailwindcss.com/docs/list-style-type
         */
        "list-style-type": [{
          list: ["disc", "decimal", "none", isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Text Alignment
         * @see https://tailwindcss.com/docs/text-align
         */
        "text-alignment": [{
          text: ["left", "center", "right", "justify", "start", "end"]
        }],
        /**
         * Placeholder Color
         * @deprecated since Tailwind CSS v3.0.0
         * @see https://v3.tailwindcss.com/docs/placeholder-color
         */
        "placeholder-color": [{
          placeholder: scaleColor()
        }],
        /**
         * Text Color
         * @see https://tailwindcss.com/docs/text-color
         */
        "text-color": [{
          text: scaleColor()
        }],
        /**
         * Text Decoration
         * @see https://tailwindcss.com/docs/text-decoration
         */
        "text-decoration": ["underline", "overline", "line-through", "no-underline"],
        /**
         * Text Decoration Style
         * @see https://tailwindcss.com/docs/text-decoration-style
         */
        "text-decoration-style": [{
          decoration: [...scaleLineStyle(), "wavy"]
        }],
        /**
         * Text Decoration Thickness
         * @see https://tailwindcss.com/docs/text-decoration-thickness
         */
        "text-decoration-thickness": [{
          decoration: [isNumber, "from-font", "auto", isArbitraryVariable, isArbitraryLength]
        }],
        /**
         * Text Decoration Color
         * @see https://tailwindcss.com/docs/text-decoration-color
         */
        "text-decoration-color": [{
          decoration: scaleColor()
        }],
        /**
         * Text Underline Offset
         * @see https://tailwindcss.com/docs/text-underline-offset
         */
        "underline-offset": [{
          "underline-offset": [isNumber, "auto", isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Text Transform
         * @see https://tailwindcss.com/docs/text-transform
         */
        "text-transform": ["uppercase", "lowercase", "capitalize", "normal-case"],
        /**
         * Text Overflow
         * @see https://tailwindcss.com/docs/text-overflow
         */
        "text-overflow": ["truncate", "text-ellipsis", "text-clip"],
        /**
         * Text Wrap
         * @see https://tailwindcss.com/docs/text-wrap
         */
        "text-wrap": [{
          text: ["wrap", "nowrap", "balance", "pretty"]
        }],
        /**
         * Text Indent
         * @see https://tailwindcss.com/docs/text-indent
         */
        indent: [{
          indent: scaleUnambiguousSpacing()
        }],
        /**
         * Vertical Alignment
         * @see https://tailwindcss.com/docs/vertical-align
         */
        "vertical-align": [{
          align: ["baseline", "top", "middle", "bottom", "text-top", "text-bottom", "sub", "super", isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Whitespace
         * @see https://tailwindcss.com/docs/whitespace
         */
        whitespace: [{
          whitespace: ["normal", "nowrap", "pre", "pre-line", "pre-wrap", "break-spaces"]
        }],
        /**
         * Word Break
         * @see https://tailwindcss.com/docs/word-break
         */
        break: [{
          break: ["normal", "words", "all", "keep"]
        }],
        /**
         * Overflow Wrap
         * @see https://tailwindcss.com/docs/overflow-wrap
         */
        wrap: [{
          wrap: ["break-word", "anywhere", "normal"]
        }],
        /**
         * Hyphens
         * @see https://tailwindcss.com/docs/hyphens
         */
        hyphens: [{
          hyphens: ["none", "manual", "auto"]
        }],
        /**
         * Content
         * @see https://tailwindcss.com/docs/content
         */
        content: [{
          content: ["none", isArbitraryVariable, isArbitraryValue]
        }],
        // -------------------
        // --- Backgrounds ---
        // -------------------
        /**
         * Background Attachment
         * @see https://tailwindcss.com/docs/background-attachment
         */
        "bg-attachment": [{
          bg: ["fixed", "local", "scroll"]
        }],
        /**
         * Background Clip
         * @see https://tailwindcss.com/docs/background-clip
         */
        "bg-clip": [{
          "bg-clip": ["border", "padding", "content", "text"]
        }],
        /**
         * Background Origin
         * @see https://tailwindcss.com/docs/background-origin
         */
        "bg-origin": [{
          "bg-origin": ["border", "padding", "content"]
        }],
        /**
         * Background Position
         * @see https://tailwindcss.com/docs/background-position
         */
        "bg-position": [{
          bg: scaleBgPosition()
        }],
        /**
         * Background Repeat
         * @see https://tailwindcss.com/docs/background-repeat
         */
        "bg-repeat": [{
          bg: scaleBgRepeat()
        }],
        /**
         * Background Size
         * @see https://tailwindcss.com/docs/background-size
         */
        "bg-size": [{
          bg: scaleBgSize()
        }],
        /**
         * Background Image
         * @see https://tailwindcss.com/docs/background-image
         */
        "bg-image": [{
          bg: ["none", {
            linear: [{
              to: ["t", "tr", "r", "br", "b", "bl", "l", "tl"]
            }, isInteger, isArbitraryVariable, isArbitraryValue],
            radial: ["", isArbitraryVariable, isArbitraryValue],
            conic: [isInteger, isArbitraryVariable, isArbitraryValue]
          }, isArbitraryVariableImage, isArbitraryImage]
        }],
        /**
         * Background Color
         * @see https://tailwindcss.com/docs/background-color
         */
        "bg-color": [{
          bg: scaleColor()
        }],
        /**
         * Gradient Color Stops From Position
         * @see https://tailwindcss.com/docs/gradient-color-stops
         */
        "gradient-from-pos": [{
          from: scaleGradientStopPosition()
        }],
        /**
         * Gradient Color Stops Via Position
         * @see https://tailwindcss.com/docs/gradient-color-stops
         */
        "gradient-via-pos": [{
          via: scaleGradientStopPosition()
        }],
        /**
         * Gradient Color Stops To Position
         * @see https://tailwindcss.com/docs/gradient-color-stops
         */
        "gradient-to-pos": [{
          to: scaleGradientStopPosition()
        }],
        /**
         * Gradient Color Stops From
         * @see https://tailwindcss.com/docs/gradient-color-stops
         */
        "gradient-from": [{
          from: scaleColor()
        }],
        /**
         * Gradient Color Stops Via
         * @see https://tailwindcss.com/docs/gradient-color-stops
         */
        "gradient-via": [{
          via: scaleColor()
        }],
        /**
         * Gradient Color Stops To
         * @see https://tailwindcss.com/docs/gradient-color-stops
         */
        "gradient-to": [{
          to: scaleColor()
        }],
        // ---------------
        // --- Borders ---
        // ---------------
        /**
         * Border Radius
         * @see https://tailwindcss.com/docs/border-radius
         */
        rounded: [{
          rounded: scaleRadius()
        }],
        /**
         * Border Radius Start
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-s": [{
          "rounded-s": scaleRadius()
        }],
        /**
         * Border Radius End
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-e": [{
          "rounded-e": scaleRadius()
        }],
        /**
         * Border Radius Top
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-t": [{
          "rounded-t": scaleRadius()
        }],
        /**
         * Border Radius Right
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-r": [{
          "rounded-r": scaleRadius()
        }],
        /**
         * Border Radius Bottom
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-b": [{
          "rounded-b": scaleRadius()
        }],
        /**
         * Border Radius Left
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-l": [{
          "rounded-l": scaleRadius()
        }],
        /**
         * Border Radius Start Start
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-ss": [{
          "rounded-ss": scaleRadius()
        }],
        /**
         * Border Radius Start End
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-se": [{
          "rounded-se": scaleRadius()
        }],
        /**
         * Border Radius End End
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-ee": [{
          "rounded-ee": scaleRadius()
        }],
        /**
         * Border Radius End Start
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-es": [{
          "rounded-es": scaleRadius()
        }],
        /**
         * Border Radius Top Left
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-tl": [{
          "rounded-tl": scaleRadius()
        }],
        /**
         * Border Radius Top Right
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-tr": [{
          "rounded-tr": scaleRadius()
        }],
        /**
         * Border Radius Bottom Right
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-br": [{
          "rounded-br": scaleRadius()
        }],
        /**
         * Border Radius Bottom Left
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-bl": [{
          "rounded-bl": scaleRadius()
        }],
        /**
         * Border Width
         * @see https://tailwindcss.com/docs/border-width
         */
        "border-w": [{
          border: scaleBorderWidth()
        }],
        /**
         * Border Width Inline
         * @see https://tailwindcss.com/docs/border-width
         */
        "border-w-x": [{
          "border-x": scaleBorderWidth()
        }],
        /**
         * Border Width Block
         * @see https://tailwindcss.com/docs/border-width
         */
        "border-w-y": [{
          "border-y": scaleBorderWidth()
        }],
        /**
         * Border Width Inline Start
         * @see https://tailwindcss.com/docs/border-width
         */
        "border-w-s": [{
          "border-s": scaleBorderWidth()
        }],
        /**
         * Border Width Inline End
         * @see https://tailwindcss.com/docs/border-width
         */
        "border-w-e": [{
          "border-e": scaleBorderWidth()
        }],
        /**
         * Border Width Block Start
         * @see https://tailwindcss.com/docs/border-width
         */
        "border-w-bs": [{
          "border-bs": scaleBorderWidth()
        }],
        /**
         * Border Width Block End
         * @see https://tailwindcss.com/docs/border-width
         */
        "border-w-be": [{
          "border-be": scaleBorderWidth()
        }],
        /**
         * Border Width Top
         * @see https://tailwindcss.com/docs/border-width
         */
        "border-w-t": [{
          "border-t": scaleBorderWidth()
        }],
        /**
         * Border Width Right
         * @see https://tailwindcss.com/docs/border-width
         */
        "border-w-r": [{
          "border-r": scaleBorderWidth()
        }],
        /**
         * Border Width Bottom
         * @see https://tailwindcss.com/docs/border-width
         */
        "border-w-b": [{
          "border-b": scaleBorderWidth()
        }],
        /**
         * Border Width Left
         * @see https://tailwindcss.com/docs/border-width
         */
        "border-w-l": [{
          "border-l": scaleBorderWidth()
        }],
        /**
         * Divide Width X
         * @see https://tailwindcss.com/docs/border-width#between-children
         */
        "divide-x": [{
          "divide-x": scaleBorderWidth()
        }],
        /**
         * Divide Width X Reverse
         * @see https://tailwindcss.com/docs/border-width#between-children
         */
        "divide-x-reverse": ["divide-x-reverse"],
        /**
         * Divide Width Y
         * @see https://tailwindcss.com/docs/border-width#between-children
         */
        "divide-y": [{
          "divide-y": scaleBorderWidth()
        }],
        /**
         * Divide Width Y Reverse
         * @see https://tailwindcss.com/docs/border-width#between-children
         */
        "divide-y-reverse": ["divide-y-reverse"],
        /**
         * Border Style
         * @see https://tailwindcss.com/docs/border-style
         */
        "border-style": [{
          border: [...scaleLineStyle(), "hidden", "none"]
        }],
        /**
         * Divide Style
         * @see https://tailwindcss.com/docs/border-style#setting-the-divider-style
         */
        "divide-style": [{
          divide: [...scaleLineStyle(), "hidden", "none"]
        }],
        /**
         * Border Color
         * @see https://tailwindcss.com/docs/border-color
         */
        "border-color": [{
          border: scaleColor()
        }],
        /**
         * Border Color Inline
         * @see https://tailwindcss.com/docs/border-color
         */
        "border-color-x": [{
          "border-x": scaleColor()
        }],
        /**
         * Border Color Block
         * @see https://tailwindcss.com/docs/border-color
         */
        "border-color-y": [{
          "border-y": scaleColor()
        }],
        /**
         * Border Color Inline Start
         * @see https://tailwindcss.com/docs/border-color
         */
        "border-color-s": [{
          "border-s": scaleColor()
        }],
        /**
         * Border Color Inline End
         * @see https://tailwindcss.com/docs/border-color
         */
        "border-color-e": [{
          "border-e": scaleColor()
        }],
        /**
         * Border Color Block Start
         * @see https://tailwindcss.com/docs/border-color
         */
        "border-color-bs": [{
          "border-bs": scaleColor()
        }],
        /**
         * Border Color Block End
         * @see https://tailwindcss.com/docs/border-color
         */
        "border-color-be": [{
          "border-be": scaleColor()
        }],
        /**
         * Border Color Top
         * @see https://tailwindcss.com/docs/border-color
         */
        "border-color-t": [{
          "border-t": scaleColor()
        }],
        /**
         * Border Color Right
         * @see https://tailwindcss.com/docs/border-color
         */
        "border-color-r": [{
          "border-r": scaleColor()
        }],
        /**
         * Border Color Bottom
         * @see https://tailwindcss.com/docs/border-color
         */
        "border-color-b": [{
          "border-b": scaleColor()
        }],
        /**
         * Border Color Left
         * @see https://tailwindcss.com/docs/border-color
         */
        "border-color-l": [{
          "border-l": scaleColor()
        }],
        /**
         * Divide Color
         * @see https://tailwindcss.com/docs/divide-color
         */
        "divide-color": [{
          divide: scaleColor()
        }],
        /**
         * Outline Style
         * @see https://tailwindcss.com/docs/outline-style
         */
        "outline-style": [{
          outline: [...scaleLineStyle(), "none", "hidden"]
        }],
        /**
         * Outline Offset
         * @see https://tailwindcss.com/docs/outline-offset
         */
        "outline-offset": [{
          "outline-offset": [isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Outline Width
         * @see https://tailwindcss.com/docs/outline-width
         */
        "outline-w": [{
          outline: ["", isNumber, isArbitraryVariableLength, isArbitraryLength]
        }],
        /**
         * Outline Color
         * @see https://tailwindcss.com/docs/outline-color
         */
        "outline-color": [{
          outline: scaleColor()
        }],
        // ---------------
        // --- Effects ---
        // ---------------
        /**
         * Box Shadow
         * @see https://tailwindcss.com/docs/box-shadow
         */
        shadow: [{
          shadow: [
            // Deprecated since Tailwind CSS v4.0.0
            "",
            "none",
            themeShadow,
            isArbitraryVariableShadow,
            isArbitraryShadow
          ]
        }],
        /**
         * Box Shadow Color
         * @see https://tailwindcss.com/docs/box-shadow#setting-the-shadow-color
         */
        "shadow-color": [{
          shadow: scaleColor()
        }],
        /**
         * Inset Box Shadow
         * @see https://tailwindcss.com/docs/box-shadow#adding-an-inset-shadow
         */
        "inset-shadow": [{
          "inset-shadow": ["none", themeInsetShadow, isArbitraryVariableShadow, isArbitraryShadow]
        }],
        /**
         * Inset Box Shadow Color
         * @see https://tailwindcss.com/docs/box-shadow#setting-the-inset-shadow-color
         */
        "inset-shadow-color": [{
          "inset-shadow": scaleColor()
        }],
        /**
         * Ring Width
         * @see https://tailwindcss.com/docs/box-shadow#adding-a-ring
         */
        "ring-w": [{
          ring: scaleBorderWidth()
        }],
        /**
         * Ring Width Inset
         * @see https://v3.tailwindcss.com/docs/ring-width#inset-rings
         * @deprecated since Tailwind CSS v4.0.0
         * @see https://github.com/tailwindlabs/tailwindcss/blob/v4.0.0/packages/tailwindcss/src/utilities.ts#L4158
         */
        "ring-w-inset": ["ring-inset"],
        /**
         * Ring Color
         * @see https://tailwindcss.com/docs/box-shadow#setting-the-ring-color
         */
        "ring-color": [{
          ring: scaleColor()
        }],
        /**
         * Ring Offset Width
         * @see https://v3.tailwindcss.com/docs/ring-offset-width
         * @deprecated since Tailwind CSS v4.0.0
         * @see https://github.com/tailwindlabs/tailwindcss/blob/v4.0.0/packages/tailwindcss/src/utilities.ts#L4158
         */
        "ring-offset-w": [{
          "ring-offset": [isNumber, isArbitraryLength]
        }],
        /**
         * Ring Offset Color
         * @see https://v3.tailwindcss.com/docs/ring-offset-color
         * @deprecated since Tailwind CSS v4.0.0
         * @see https://github.com/tailwindlabs/tailwindcss/blob/v4.0.0/packages/tailwindcss/src/utilities.ts#L4158
         */
        "ring-offset-color": [{
          "ring-offset": scaleColor()
        }],
        /**
         * Inset Ring Width
         * @see https://tailwindcss.com/docs/box-shadow#adding-an-inset-ring
         */
        "inset-ring-w": [{
          "inset-ring": scaleBorderWidth()
        }],
        /**
         * Inset Ring Color
         * @see https://tailwindcss.com/docs/box-shadow#setting-the-inset-ring-color
         */
        "inset-ring-color": [{
          "inset-ring": scaleColor()
        }],
        /**
         * Text Shadow
         * @see https://tailwindcss.com/docs/text-shadow
         */
        "text-shadow": [{
          "text-shadow": ["none", themeTextShadow, isArbitraryVariableShadow, isArbitraryShadow]
        }],
        /**
         * Text Shadow Color
         * @see https://tailwindcss.com/docs/text-shadow#setting-the-shadow-color
         */
        "text-shadow-color": [{
          "text-shadow": scaleColor()
        }],
        /**
         * Opacity
         * @see https://tailwindcss.com/docs/opacity
         */
        opacity: [{
          opacity: [isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Mix Blend Mode
         * @see https://tailwindcss.com/docs/mix-blend-mode
         */
        "mix-blend": [{
          "mix-blend": [...scaleBlendMode(), "plus-darker", "plus-lighter"]
        }],
        /**
         * Background Blend Mode
         * @see https://tailwindcss.com/docs/background-blend-mode
         */
        "bg-blend": [{
          "bg-blend": scaleBlendMode()
        }],
        /**
         * Mask Clip
         * @see https://tailwindcss.com/docs/mask-clip
         */
        "mask-clip": [{
          "mask-clip": ["border", "padding", "content", "fill", "stroke", "view"]
        }, "mask-no-clip"],
        /**
         * Mask Composite
         * @see https://tailwindcss.com/docs/mask-composite
         */
        "mask-composite": [{
          mask: ["add", "subtract", "intersect", "exclude"]
        }],
        /**
         * Mask Image
         * @see https://tailwindcss.com/docs/mask-image
         */
        "mask-image-linear-pos": [{
          "mask-linear": [isNumber]
        }],
        "mask-image-linear-from-pos": [{
          "mask-linear-from": scaleMaskImagePosition()
        }],
        "mask-image-linear-to-pos": [{
          "mask-linear-to": scaleMaskImagePosition()
        }],
        "mask-image-linear-from-color": [{
          "mask-linear-from": scaleColor()
        }],
        "mask-image-linear-to-color": [{
          "mask-linear-to": scaleColor()
        }],
        "mask-image-t-from-pos": [{
          "mask-t-from": scaleMaskImagePosition()
        }],
        "mask-image-t-to-pos": [{
          "mask-t-to": scaleMaskImagePosition()
        }],
        "mask-image-t-from-color": [{
          "mask-t-from": scaleColor()
        }],
        "mask-image-t-to-color": [{
          "mask-t-to": scaleColor()
        }],
        "mask-image-r-from-pos": [{
          "mask-r-from": scaleMaskImagePosition()
        }],
        "mask-image-r-to-pos": [{
          "mask-r-to": scaleMaskImagePosition()
        }],
        "mask-image-r-from-color": [{
          "mask-r-from": scaleColor()
        }],
        "mask-image-r-to-color": [{
          "mask-r-to": scaleColor()
        }],
        "mask-image-b-from-pos": [{
          "mask-b-from": scaleMaskImagePosition()
        }],
        "mask-image-b-to-pos": [{
          "mask-b-to": scaleMaskImagePosition()
        }],
        "mask-image-b-from-color": [{
          "mask-b-from": scaleColor()
        }],
        "mask-image-b-to-color": [{
          "mask-b-to": scaleColor()
        }],
        "mask-image-l-from-pos": [{
          "mask-l-from": scaleMaskImagePosition()
        }],
        "mask-image-l-to-pos": [{
          "mask-l-to": scaleMaskImagePosition()
        }],
        "mask-image-l-from-color": [{
          "mask-l-from": scaleColor()
        }],
        "mask-image-l-to-color": [{
          "mask-l-to": scaleColor()
        }],
        "mask-image-x-from-pos": [{
          "mask-x-from": scaleMaskImagePosition()
        }],
        "mask-image-x-to-pos": [{
          "mask-x-to": scaleMaskImagePosition()
        }],
        "mask-image-x-from-color": [{
          "mask-x-from": scaleColor()
        }],
        "mask-image-x-to-color": [{
          "mask-x-to": scaleColor()
        }],
        "mask-image-y-from-pos": [{
          "mask-y-from": scaleMaskImagePosition()
        }],
        "mask-image-y-to-pos": [{
          "mask-y-to": scaleMaskImagePosition()
        }],
        "mask-image-y-from-color": [{
          "mask-y-from": scaleColor()
        }],
        "mask-image-y-to-color": [{
          "mask-y-to": scaleColor()
        }],
        "mask-image-radial": [{
          "mask-radial": [isArbitraryVariable, isArbitraryValue]
        }],
        "mask-image-radial-from-pos": [{
          "mask-radial-from": scaleMaskImagePosition()
        }],
        "mask-image-radial-to-pos": [{
          "mask-radial-to": scaleMaskImagePosition()
        }],
        "mask-image-radial-from-color": [{
          "mask-radial-from": scaleColor()
        }],
        "mask-image-radial-to-color": [{
          "mask-radial-to": scaleColor()
        }],
        "mask-image-radial-shape": [{
          "mask-radial": ["circle", "ellipse"]
        }],
        "mask-image-radial-size": [{
          "mask-radial": [{
            closest: ["side", "corner"],
            farthest: ["side", "corner"]
          }]
        }],
        "mask-image-radial-pos": [{
          "mask-radial-at": scalePosition()
        }],
        "mask-image-conic-pos": [{
          "mask-conic": [isNumber]
        }],
        "mask-image-conic-from-pos": [{
          "mask-conic-from": scaleMaskImagePosition()
        }],
        "mask-image-conic-to-pos": [{
          "mask-conic-to": scaleMaskImagePosition()
        }],
        "mask-image-conic-from-color": [{
          "mask-conic-from": scaleColor()
        }],
        "mask-image-conic-to-color": [{
          "mask-conic-to": scaleColor()
        }],
        /**
         * Mask Mode
         * @see https://tailwindcss.com/docs/mask-mode
         */
        "mask-mode": [{
          mask: ["alpha", "luminance", "match"]
        }],
        /**
         * Mask Origin
         * @see https://tailwindcss.com/docs/mask-origin
         */
        "mask-origin": [{
          "mask-origin": ["border", "padding", "content", "fill", "stroke", "view"]
        }],
        /**
         * Mask Position
         * @see https://tailwindcss.com/docs/mask-position
         */
        "mask-position": [{
          mask: scaleBgPosition()
        }],
        /**
         * Mask Repeat
         * @see https://tailwindcss.com/docs/mask-repeat
         */
        "mask-repeat": [{
          mask: scaleBgRepeat()
        }],
        /**
         * Mask Size
         * @see https://tailwindcss.com/docs/mask-size
         */
        "mask-size": [{
          mask: scaleBgSize()
        }],
        /**
         * Mask Type
         * @see https://tailwindcss.com/docs/mask-type
         */
        "mask-type": [{
          "mask-type": ["alpha", "luminance"]
        }],
        /**
         * Mask Image
         * @see https://tailwindcss.com/docs/mask-image
         */
        "mask-image": [{
          mask: ["none", isArbitraryVariable, isArbitraryValue]
        }],
        // ---------------
        // --- Filters ---
        // ---------------
        /**
         * Filter
         * @see https://tailwindcss.com/docs/filter
         */
        filter: [{
          filter: [
            // Deprecated since Tailwind CSS v3.0.0
            "",
            "none",
            isArbitraryVariable,
            isArbitraryValue
          ]
        }],
        /**
         * Blur
         * @see https://tailwindcss.com/docs/blur
         */
        blur: [{
          blur: scaleBlur()
        }],
        /**
         * Brightness
         * @see https://tailwindcss.com/docs/brightness
         */
        brightness: [{
          brightness: [isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Contrast
         * @see https://tailwindcss.com/docs/contrast
         */
        contrast: [{
          contrast: [isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Drop Shadow
         * @see https://tailwindcss.com/docs/drop-shadow
         */
        "drop-shadow": [{
          "drop-shadow": [
            // Deprecated since Tailwind CSS v4.0.0
            "",
            "none",
            themeDropShadow,
            isArbitraryVariableShadow,
            isArbitraryShadow
          ]
        }],
        /**
         * Drop Shadow Color
         * @see https://tailwindcss.com/docs/filter-drop-shadow#setting-the-shadow-color
         */
        "drop-shadow-color": [{
          "drop-shadow": scaleColor()
        }],
        /**
         * Grayscale
         * @see https://tailwindcss.com/docs/grayscale
         */
        grayscale: [{
          grayscale: ["", isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Hue Rotate
         * @see https://tailwindcss.com/docs/hue-rotate
         */
        "hue-rotate": [{
          "hue-rotate": [isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Invert
         * @see https://tailwindcss.com/docs/invert
         */
        invert: [{
          invert: ["", isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Saturate
         * @see https://tailwindcss.com/docs/saturate
         */
        saturate: [{
          saturate: [isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Sepia
         * @see https://tailwindcss.com/docs/sepia
         */
        sepia: [{
          sepia: ["", isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Backdrop Filter
         * @see https://tailwindcss.com/docs/backdrop-filter
         */
        "backdrop-filter": [{
          "backdrop-filter": [
            // Deprecated since Tailwind CSS v3.0.0
            "",
            "none",
            isArbitraryVariable,
            isArbitraryValue
          ]
        }],
        /**
         * Backdrop Blur
         * @see https://tailwindcss.com/docs/backdrop-blur
         */
        "backdrop-blur": [{
          "backdrop-blur": scaleBlur()
        }],
        /**
         * Backdrop Brightness
         * @see https://tailwindcss.com/docs/backdrop-brightness
         */
        "backdrop-brightness": [{
          "backdrop-brightness": [isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Backdrop Contrast
         * @see https://tailwindcss.com/docs/backdrop-contrast
         */
        "backdrop-contrast": [{
          "backdrop-contrast": [isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Backdrop Grayscale
         * @see https://tailwindcss.com/docs/backdrop-grayscale
         */
        "backdrop-grayscale": [{
          "backdrop-grayscale": ["", isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Backdrop Hue Rotate
         * @see https://tailwindcss.com/docs/backdrop-hue-rotate
         */
        "backdrop-hue-rotate": [{
          "backdrop-hue-rotate": [isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Backdrop Invert
         * @see https://tailwindcss.com/docs/backdrop-invert
         */
        "backdrop-invert": [{
          "backdrop-invert": ["", isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Backdrop Opacity
         * @see https://tailwindcss.com/docs/backdrop-opacity
         */
        "backdrop-opacity": [{
          "backdrop-opacity": [isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Backdrop Saturate
         * @see https://tailwindcss.com/docs/backdrop-saturate
         */
        "backdrop-saturate": [{
          "backdrop-saturate": [isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Backdrop Sepia
         * @see https://tailwindcss.com/docs/backdrop-sepia
         */
        "backdrop-sepia": [{
          "backdrop-sepia": ["", isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        // --------------
        // --- Tables ---
        // --------------
        /**
         * Border Collapse
         * @see https://tailwindcss.com/docs/border-collapse
         */
        "border-collapse": [{
          border: ["collapse", "separate"]
        }],
        /**
         * Border Spacing
         * @see https://tailwindcss.com/docs/border-spacing
         */
        "border-spacing": [{
          "border-spacing": scaleUnambiguousSpacing()
        }],
        /**
         * Border Spacing X
         * @see https://tailwindcss.com/docs/border-spacing
         */
        "border-spacing-x": [{
          "border-spacing-x": scaleUnambiguousSpacing()
        }],
        /**
         * Border Spacing Y
         * @see https://tailwindcss.com/docs/border-spacing
         */
        "border-spacing-y": [{
          "border-spacing-y": scaleUnambiguousSpacing()
        }],
        /**
         * Table Layout
         * @see https://tailwindcss.com/docs/table-layout
         */
        "table-layout": [{
          table: ["auto", "fixed"]
        }],
        /**
         * Caption Side
         * @see https://tailwindcss.com/docs/caption-side
         */
        caption: [{
          caption: ["top", "bottom"]
        }],
        // ---------------------------------
        // --- Transitions and Animation ---
        // ---------------------------------
        /**
         * Transition Property
         * @see https://tailwindcss.com/docs/transition-property
         */
        transition: [{
          transition: ["", "all", "colors", "opacity", "shadow", "transform", "none", isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Transition Behavior
         * @see https://tailwindcss.com/docs/transition-behavior
         */
        "transition-behavior": [{
          transition: ["normal", "discrete"]
        }],
        /**
         * Transition Duration
         * @see https://tailwindcss.com/docs/transition-duration
         */
        duration: [{
          duration: [isNumber, "initial", isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Transition Timing Function
         * @see https://tailwindcss.com/docs/transition-timing-function
         */
        ease: [{
          ease: ["linear", "initial", themeEase, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Transition Delay
         * @see https://tailwindcss.com/docs/transition-delay
         */
        delay: [{
          delay: [isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Animation
         * @see https://tailwindcss.com/docs/animation
         */
        animate: [{
          animate: ["none", themeAnimate, isArbitraryVariable, isArbitraryValue]
        }],
        // ------------------
        // --- Transforms ---
        // ------------------
        /**
         * Backface Visibility
         * @see https://tailwindcss.com/docs/backface-visibility
         */
        backface: [{
          backface: ["hidden", "visible"]
        }],
        /**
         * Perspective
         * @see https://tailwindcss.com/docs/perspective
         */
        perspective: [{
          perspective: [themePerspective, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Perspective Origin
         * @see https://tailwindcss.com/docs/perspective-origin
         */
        "perspective-origin": [{
          "perspective-origin": scalePositionWithArbitrary()
        }],
        /**
         * Rotate
         * @see https://tailwindcss.com/docs/rotate
         */
        rotate: [{
          rotate: scaleRotate()
        }],
        /**
         * Rotate X
         * @see https://tailwindcss.com/docs/rotate
         */
        "rotate-x": [{
          "rotate-x": scaleRotate()
        }],
        /**
         * Rotate Y
         * @see https://tailwindcss.com/docs/rotate
         */
        "rotate-y": [{
          "rotate-y": scaleRotate()
        }],
        /**
         * Rotate Z
         * @see https://tailwindcss.com/docs/rotate
         */
        "rotate-z": [{
          "rotate-z": scaleRotate()
        }],
        /**
         * Scale
         * @see https://tailwindcss.com/docs/scale
         */
        scale: [{
          scale: scaleScale()
        }],
        /**
         * Scale X
         * @see https://tailwindcss.com/docs/scale
         */
        "scale-x": [{
          "scale-x": scaleScale()
        }],
        /**
         * Scale Y
         * @see https://tailwindcss.com/docs/scale
         */
        "scale-y": [{
          "scale-y": scaleScale()
        }],
        /**
         * Scale Z
         * @see https://tailwindcss.com/docs/scale
         */
        "scale-z": [{
          "scale-z": scaleScale()
        }],
        /**
         * Scale 3D
         * @see https://tailwindcss.com/docs/scale
         */
        "scale-3d": ["scale-3d"],
        /**
         * Skew
         * @see https://tailwindcss.com/docs/skew
         */
        skew: [{
          skew: scaleSkew()
        }],
        /**
         * Skew X
         * @see https://tailwindcss.com/docs/skew
         */
        "skew-x": [{
          "skew-x": scaleSkew()
        }],
        /**
         * Skew Y
         * @see https://tailwindcss.com/docs/skew
         */
        "skew-y": [{
          "skew-y": scaleSkew()
        }],
        /**
         * Transform
         * @see https://tailwindcss.com/docs/transform
         */
        transform: [{
          transform: [isArbitraryVariable, isArbitraryValue, "", "none", "gpu", "cpu"]
        }],
        /**
         * Transform Origin
         * @see https://tailwindcss.com/docs/transform-origin
         */
        "transform-origin": [{
          origin: scalePositionWithArbitrary()
        }],
        /**
         * Transform Style
         * @see https://tailwindcss.com/docs/transform-style
         */
        "transform-style": [{
          transform: ["3d", "flat"]
        }],
        /**
         * Translate
         * @see https://tailwindcss.com/docs/translate
         */
        translate: [{
          translate: scaleTranslate()
        }],
        /**
         * Translate X
         * @see https://tailwindcss.com/docs/translate
         */
        "translate-x": [{
          "translate-x": scaleTranslate()
        }],
        /**
         * Translate Y
         * @see https://tailwindcss.com/docs/translate
         */
        "translate-y": [{
          "translate-y": scaleTranslate()
        }],
        /**
         * Translate Z
         * @see https://tailwindcss.com/docs/translate
         */
        "translate-z": [{
          "translate-z": scaleTranslate()
        }],
        /**
         * Translate None
         * @see https://tailwindcss.com/docs/translate
         */
        "translate-none": ["translate-none"],
        // ---------------------
        // --- Interactivity ---
        // ---------------------
        /**
         * Accent Color
         * @see https://tailwindcss.com/docs/accent-color
         */
        accent: [{
          accent: scaleColor()
        }],
        /**
         * Appearance
         * @see https://tailwindcss.com/docs/appearance
         */
        appearance: [{
          appearance: ["none", "auto"]
        }],
        /**
         * Caret Color
         * @see https://tailwindcss.com/docs/just-in-time-mode#caret-color-utilities
         */
        "caret-color": [{
          caret: scaleColor()
        }],
        /**
         * Color Scheme
         * @see https://tailwindcss.com/docs/color-scheme
         */
        "color-scheme": [{
          scheme: ["normal", "dark", "light", "light-dark", "only-dark", "only-light"]
        }],
        /**
         * Cursor
         * @see https://tailwindcss.com/docs/cursor
         */
        cursor: [{
          cursor: ["auto", "default", "pointer", "wait", "text", "move", "help", "not-allowed", "none", "context-menu", "progress", "cell", "crosshair", "vertical-text", "alias", "copy", "no-drop", "grab", "grabbing", "all-scroll", "col-resize", "row-resize", "n-resize", "e-resize", "s-resize", "w-resize", "ne-resize", "nw-resize", "se-resize", "sw-resize", "ew-resize", "ns-resize", "nesw-resize", "nwse-resize", "zoom-in", "zoom-out", isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Field Sizing
         * @see https://tailwindcss.com/docs/field-sizing
         */
        "field-sizing": [{
          "field-sizing": ["fixed", "content"]
        }],
        /**
         * Pointer Events
         * @see https://tailwindcss.com/docs/pointer-events
         */
        "pointer-events": [{
          "pointer-events": ["auto", "none"]
        }],
        /**
         * Resize
         * @see https://tailwindcss.com/docs/resize
         */
        resize: [{
          resize: ["none", "", "y", "x"]
        }],
        /**
         * Scroll Behavior
         * @see https://tailwindcss.com/docs/scroll-behavior
         */
        "scroll-behavior": [{
          scroll: ["auto", "smooth"]
        }],
        /**
         * Scroll Margin
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        "scroll-m": [{
          "scroll-m": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Margin Inline
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        "scroll-mx": [{
          "scroll-mx": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Margin Block
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        "scroll-my": [{
          "scroll-my": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Margin Inline Start
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        "scroll-ms": [{
          "scroll-ms": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Margin Inline End
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        "scroll-me": [{
          "scroll-me": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Margin Block Start
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        "scroll-mbs": [{
          "scroll-mbs": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Margin Block End
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        "scroll-mbe": [{
          "scroll-mbe": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Margin Top
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        "scroll-mt": [{
          "scroll-mt": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Margin Right
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        "scroll-mr": [{
          "scroll-mr": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Margin Bottom
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        "scroll-mb": [{
          "scroll-mb": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Margin Left
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        "scroll-ml": [{
          "scroll-ml": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Padding
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        "scroll-p": [{
          "scroll-p": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Padding Inline
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        "scroll-px": [{
          "scroll-px": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Padding Block
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        "scroll-py": [{
          "scroll-py": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Padding Inline Start
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        "scroll-ps": [{
          "scroll-ps": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Padding Inline End
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        "scroll-pe": [{
          "scroll-pe": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Padding Block Start
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        "scroll-pbs": [{
          "scroll-pbs": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Padding Block End
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        "scroll-pbe": [{
          "scroll-pbe": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Padding Top
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        "scroll-pt": [{
          "scroll-pt": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Padding Right
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        "scroll-pr": [{
          "scroll-pr": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Padding Bottom
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        "scroll-pb": [{
          "scroll-pb": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Padding Left
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        "scroll-pl": [{
          "scroll-pl": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Snap Align
         * @see https://tailwindcss.com/docs/scroll-snap-align
         */
        "snap-align": [{
          snap: ["start", "end", "center", "align-none"]
        }],
        /**
         * Scroll Snap Stop
         * @see https://tailwindcss.com/docs/scroll-snap-stop
         */
        "snap-stop": [{
          snap: ["normal", "always"]
        }],
        /**
         * Scroll Snap Type
         * @see https://tailwindcss.com/docs/scroll-snap-type
         */
        "snap-type": [{
          snap: ["none", "x", "y", "both"]
        }],
        /**
         * Scroll Snap Type Strictness
         * @see https://tailwindcss.com/docs/scroll-snap-type
         */
        "snap-strictness": [{
          snap: ["mandatory", "proximity"]
        }],
        /**
         * Touch Action
         * @see https://tailwindcss.com/docs/touch-action
         */
        touch: [{
          touch: ["auto", "none", "manipulation"]
        }],
        /**
         * Touch Action X
         * @see https://tailwindcss.com/docs/touch-action
         */
        "touch-x": [{
          "touch-pan": ["x", "left", "right"]
        }],
        /**
         * Touch Action Y
         * @see https://tailwindcss.com/docs/touch-action
         */
        "touch-y": [{
          "touch-pan": ["y", "up", "down"]
        }],
        /**
         * Touch Action Pinch Zoom
         * @see https://tailwindcss.com/docs/touch-action
         */
        "touch-pz": ["touch-pinch-zoom"],
        /**
         * User Select
         * @see https://tailwindcss.com/docs/user-select
         */
        select: [{
          select: ["none", "text", "all", "auto"]
        }],
        /**
         * Will Change
         * @see https://tailwindcss.com/docs/will-change
         */
        "will-change": [{
          "will-change": ["auto", "scroll", "contents", "transform", isArbitraryVariable, isArbitraryValue]
        }],
        // -----------
        // --- SVG ---
        // -----------
        /**
         * Fill
         * @see https://tailwindcss.com/docs/fill
         */
        fill: [{
          fill: ["none", ...scaleColor()]
        }],
        /**
         * Stroke Width
         * @see https://tailwindcss.com/docs/stroke-width
         */
        "stroke-w": [{
          stroke: [isNumber, isArbitraryVariableLength, isArbitraryLength, isArbitraryNumber]
        }],
        /**
         * Stroke
         * @see https://tailwindcss.com/docs/stroke
         */
        stroke: [{
          stroke: ["none", ...scaleColor()]
        }],
        // ---------------------
        // --- Accessibility ---
        // ---------------------
        /**
         * Forced Color Adjust
         * @see https://tailwindcss.com/docs/forced-color-adjust
         */
        "forced-color-adjust": [{
          "forced-color-adjust": ["auto", "none"]
        }]
      },
      conflictingClassGroups: {
        overflow: ["overflow-x", "overflow-y"],
        overscroll: ["overscroll-x", "overscroll-y"],
        inset: ["inset-x", "inset-y", "inset-bs", "inset-be", "start", "end", "top", "right", "bottom", "left"],
        "inset-x": ["right", "left"],
        "inset-y": ["top", "bottom"],
        flex: ["basis", "grow", "shrink"],
        gap: ["gap-x", "gap-y"],
        p: ["px", "py", "ps", "pe", "pbs", "pbe", "pt", "pr", "pb", "pl"],
        px: ["pr", "pl"],
        py: ["pt", "pb"],
        m: ["mx", "my", "ms", "me", "mbs", "mbe", "mt", "mr", "mb", "ml"],
        mx: ["mr", "ml"],
        my: ["mt", "mb"],
        size: ["w", "h"],
        "font-size": ["leading"],
        "fvn-normal": ["fvn-ordinal", "fvn-slashed-zero", "fvn-figure", "fvn-spacing", "fvn-fraction"],
        "fvn-ordinal": ["fvn-normal"],
        "fvn-slashed-zero": ["fvn-normal"],
        "fvn-figure": ["fvn-normal"],
        "fvn-spacing": ["fvn-normal"],
        "fvn-fraction": ["fvn-normal"],
        "line-clamp": ["display", "overflow"],
        rounded: ["rounded-s", "rounded-e", "rounded-t", "rounded-r", "rounded-b", "rounded-l", "rounded-ss", "rounded-se", "rounded-ee", "rounded-es", "rounded-tl", "rounded-tr", "rounded-br", "rounded-bl"],
        "rounded-s": ["rounded-ss", "rounded-es"],
        "rounded-e": ["rounded-se", "rounded-ee"],
        "rounded-t": ["rounded-tl", "rounded-tr"],
        "rounded-r": ["rounded-tr", "rounded-br"],
        "rounded-b": ["rounded-br", "rounded-bl"],
        "rounded-l": ["rounded-tl", "rounded-bl"],
        "border-spacing": ["border-spacing-x", "border-spacing-y"],
        "border-w": ["border-w-x", "border-w-y", "border-w-s", "border-w-e", "border-w-bs", "border-w-be", "border-w-t", "border-w-r", "border-w-b", "border-w-l"],
        "border-w-x": ["border-w-r", "border-w-l"],
        "border-w-y": ["border-w-t", "border-w-b"],
        "border-color": ["border-color-x", "border-color-y", "border-color-s", "border-color-e", "border-color-bs", "border-color-be", "border-color-t", "border-color-r", "border-color-b", "border-color-l"],
        "border-color-x": ["border-color-r", "border-color-l"],
        "border-color-y": ["border-color-t", "border-color-b"],
        translate: ["translate-x", "translate-y", "translate-none"],
        "translate-none": ["translate", "translate-x", "translate-y", "translate-z"],
        "scroll-m": ["scroll-mx", "scroll-my", "scroll-ms", "scroll-me", "scroll-mbs", "scroll-mbe", "scroll-mt", "scroll-mr", "scroll-mb", "scroll-ml"],
        "scroll-mx": ["scroll-mr", "scroll-ml"],
        "scroll-my": ["scroll-mt", "scroll-mb"],
        "scroll-p": ["scroll-px", "scroll-py", "scroll-ps", "scroll-pe", "scroll-pbs", "scroll-pbe", "scroll-pt", "scroll-pr", "scroll-pb", "scroll-pl"],
        "scroll-px": ["scroll-pr", "scroll-pl"],
        "scroll-py": ["scroll-pt", "scroll-pb"],
        touch: ["touch-x", "touch-y", "touch-pz"],
        "touch-x": ["touch"],
        "touch-y": ["touch"],
        "touch-pz": ["touch"]
      },
      conflictingClassGroupModifiers: {
        "font-size": ["leading"]
      },
      orderSensitiveModifiers: ["*", "**", "after", "backdrop", "before", "details-content", "file", "first-letter", "first-line", "marker", "placeholder", "selection"]
    };
  };
  var twMerge = /* @__PURE__ */ createTailwindMerge(getDefaultConfig);

  // packages/gea-ui/src/utils/cn.ts
  function cn(...inputs) {
    return twMerge(clsx(inputs));
  }

  // node_modules/@zag-js/anatomy/dist/create-anatomy.mjs
  var createAnatomy = (name, parts4 = []) => ({
    parts: (...values) => {
      if (isEmpty(parts4)) {
        return createAnatomy(name, values);
      }
      throw new Error("createAnatomy().parts(...) should only be called once. Did you mean to use .extendWith(...) ?");
    },
    extendWith: (...values) => createAnatomy(name, [...parts4, ...values]),
    omit: (...values) => createAnatomy(name, parts4.filter((part) => !values.includes(part))),
    rename: (newName) => createAnatomy(newName, parts4),
    keys: () => parts4,
    build: () => [...new Set(parts4)].reduce(
      (prev, part) => Object.assign(prev, {
        [part]: {
          selector: [
            `&[data-scope="${toKebabCase(name)}"][data-part="${toKebabCase(part)}"]`,
            `& [data-scope="${toKebabCase(name)}"][data-part="${toKebabCase(part)}"]`
          ].join(", "),
          attrs: { "data-scope": toKebabCase(name), "data-part": toKebabCase(part) }
        }
      }),
      {}
    )
  });
  var toKebabCase = (value) => value.replace(/([A-Z])([A-Z])/g, "$1-$2").replace(/([a-z])([A-Z])/g, "$1-$2").replace(/[\s_]+/g, "-").toLowerCase();
  var isEmpty = (v) => v.length === 0;

  // node_modules/@zag-js/avatar/dist/avatar.anatomy.mjs
  var anatomy = createAnatomy("avatar").parts("root", "image", "fallback");
  var parts = anatomy.build();

  // node_modules/@zag-js/avatar/dist/avatar.dom.mjs
  var getRootId = (ctx) => ctx.ids?.root ?? `avatar:${ctx.id}`;
  var getImageId = (ctx) => ctx.ids?.image ?? `avatar:${ctx.id}:image`;
  var getFallbackId = (ctx) => ctx.ids?.fallback ?? `avatar:${ctx.id}:fallback`;
  var getRootEl = (ctx) => ctx.getById(getRootId(ctx));
  var getImageEl = (ctx) => ctx.getById(getImageId(ctx));

  // node_modules/@zag-js/avatar/dist/avatar.connect.mjs
  function connect(service, normalize) {
    const { state, send, prop, scope } = service;
    const loaded = state.matches("loaded");
    return {
      loaded,
      setSrc(src) {
        const img = getImageEl(scope);
        img?.setAttribute("src", src);
      },
      setLoaded() {
        send({ type: "img.loaded", src: "api" });
      },
      setError() {
        send({ type: "img.error", src: "api" });
      },
      getRootProps() {
        return normalize.element({
          ...parts.root.attrs,
          dir: prop("dir"),
          id: getRootId(scope)
        });
      },
      getImageProps() {
        return normalize.img({
          ...parts.image.attrs,
          hidden: !loaded,
          dir: prop("dir"),
          id: getImageId(scope),
          "data-state": loaded ? "visible" : "hidden",
          onLoad() {
            send({ type: "img.loaded", src: "element" });
          },
          onError() {
            send({ type: "img.error", src: "element" });
          }
        });
      },
      getFallbackProps() {
        return normalize.element({
          ...parts.fallback.attrs,
          dir: prop("dir"),
          id: getFallbackId(scope),
          hidden: loaded,
          "data-state": loaded ? "hidden" : "visible"
        });
      }
    };
  }

  // node_modules/@zag-js/avatar/dist/avatar.machine.mjs
  var machine = createMachine({
    initialState() {
      return "loading";
    },
    effects: ["trackImageRemoval", "trackSrcChange"],
    on: {
      "src.change": {
        target: "loading"
      },
      "img.unmount": {
        target: "error"
      }
    },
    states: {
      loading: {
        entry: ["checkImageStatus"],
        on: {
          "img.loaded": {
            target: "loaded",
            actions: ["invokeOnLoad"]
          },
          "img.error": {
            target: "error",
            actions: ["invokeOnError"]
          }
        }
      },
      error: {
        on: {
          "img.loaded": {
            target: "loaded",
            actions: ["invokeOnLoad"]
          }
        }
      },
      loaded: {
        on: {
          "img.error": {
            target: "error",
            actions: ["invokeOnError"]
          }
        }
      }
    },
    implementations: {
      actions: {
        invokeOnLoad({ prop }) {
          prop("onStatusChange")?.({ status: "loaded" });
        },
        invokeOnError({ prop }) {
          prop("onStatusChange")?.({ status: "error" });
        },
        checkImageStatus({ send, scope }) {
          const imageEl = getImageEl(scope);
          if (!imageEl?.complete) return;
          const type = hasLoaded(imageEl) ? "img.loaded" : "img.error";
          send({ type, src: "ssr" });
        }
      },
      effects: {
        trackImageRemoval({ send, scope }) {
          const rootEl = getRootEl(scope);
          return observeChildren(rootEl, {
            callback(records) {
              const removedNodes = Array.from(records[0].removedNodes);
              const removed = removedNodes.find(
                (node) => node.nodeType === Node.ELEMENT_NODE && node.matches("[data-scope=avatar][data-part=image]")
              );
              if (removed) {
                send({ type: "img.unmount" });
              }
            }
          });
        },
        trackSrcChange({ send, scope }) {
          const imageEl = getImageEl(scope);
          return observeAttributes(imageEl, {
            attributes: ["src", "srcset"],
            callback() {
              send({ type: "src.change" });
            }
          });
        }
      }
    }
  });
  function hasLoaded(image) {
    return image.complete && image.naturalWidth !== 0 && image.naturalHeight !== 0;
  }

  // packages/gea-ui/src/components/avatar.tsx
  var Avatar = class extends ZagComponent {
    constructor(...args) {
      super(...args);
      this.loaded = false;
      try {
        const props = this.props;
        this.__geaCond_0 = !!this.props.src;
      } catch {
      }
      this.__geaRegisterCond(0, "c0", () => {
        const props = this.props;
        return this.props.src;
      }, () => {
        const props = this.props;
        return `<img data-part="image"${this.props.src == null || props.src === false ? "" : ` src="${this.props.src}"`}${(this.props.name || "") == null || (props.name || "") === false ? "" : ` alt="${this.props.name || ""}"`} class="avatar-image absolute inset-0 h-full w-full object-cover" />`;
      }, () => {
        const props = this.props;
        return "";
      });
    }
    createMachine(_props) {
      return machine;
    }
    getMachineProps(props) {
      return {
        id: this.id,
        onStatusChange: props.onStatusChange
      };
    }
    connectApi(service) {
      return connect(service, normalizeProps);
    }
    getSpreadMap() {
      return {
        '[data-part="root"]': "getRootProps",
        '[data-part="image"]': "getImageProps",
        '[data-part="fallback"]': "getFallbackProps"
      };
    }
    syncState(api) {
      this.loaded = api.loaded;
    }
    template(props) {
      Component._register(ZagComponent);
      const initials = props.fallback || (props.name ? props.name.split(" ").map((n) => n[0]).join("").toUpperCase() : "?");
      return `<div id="${this.id}" data-part="root"${`avatar-root relative inline-flex h-10 w-10 shrink-0 overflow-hidden rounded-full ${props.class || ""}` == null ? "" : ` class="${`avatar-root relative inline-flex h-10 w-10 shrink-0 overflow-hidden rounded-full ${props.class || ""}`.trim()}"`}><!--${this.id + "-c0"}-->${(props.src ? `<img data-part="image"${props.src == null || props.src === false ? "" : ` src="${props.src}"`}${(props.name || "") == null || (props.name || "") === false ? "" : ` alt="${props.name || ""}"`} class="avatar-image absolute inset-0 h-full w-full object-cover" />` : "") || ""}<!--${this.id + "-c0-end"}--><div id="${this.id + "-b1"}" data-part="fallback"${`avatar-fallback flex h-full w-full items-center justify-center rounded-full bg-muted text-muted-foreground text-sm font-medium ${props.src ? "absolute inset-0" : ""}` == null ? "" : ` class="${`avatar-fallback flex h-full w-full items-center justify-center rounded-full bg-muted text-muted-foreground text-sm font-medium ${props.src ? "absolute inset-0" : ""}`.trim()}"`}>${initials}</div></div>`;
    }
    __onPropChange(key, value) {
      if (key === "class") try {
        const __el = this.$(":scope");
        const props = this.props;
        const __boundValue = `avatar-root relative inline-flex h-10 w-10 shrink-0 overflow-hidden rounded-full ${this.props.class || ""}`;
        if (__el) {
          const __newClass = __boundValue != null ? String(__boundValue).trim() : "";
          if (__el.className !== __newClass) __el.className = __newClass;
        }
      } catch {
      }
      if (key === "src") {
        try {
          const __el = document.getElementById(this.id + "-b1");
          const props = this.props;
          const __boundValue = `avatar-fallback flex h-full w-full items-center justify-center rounded-full bg-muted text-muted-foreground text-sm font-medium ${this.props.src ? "absolute inset-0" : ""}`;
          if (__el) {
            const __newClass = __boundValue != null ? String(__boundValue).trim() : "";
            if (__el.className !== __newClass) __el.className = __newClass;
          }
        } catch {
        }
        this.__geaPatchCond(0);
      }
      if (key === "fallback") try {
        const __el = document.getElementById(this.id + "-b1");
        const props = this.props;
        const initials = this.props.fallback || (this.props.name ? this.props.name.split(" ").map((n) => n[0]).join("").toUpperCase() : "?");
        const __boundValue = initials;
        if (__el) {
          if (__el.textContent !== __boundValue) __el.textContent = __boundValue;
        }
      } catch {
      }
      if (key === "name") try {
        const __el = document.getElementById(this.id + "-b1");
        const props = this.props;
        const initials = this.props.fallback || (this.props.name ? this.props.name.split(" ").map((n) => n[0]).join("").toUpperCase() : "?");
        const __boundValue = initials;
        if (__el) {
          if (__el.textContent !== __boundValue) __el.textContent = __boundValue;
        }
      } catch {
      }
    }
  };
  if (void 0) {
    const __moduleExports = {
      default: Avatar
    };
    registerHotModule("", __moduleExports);
    (void 0).accept((newModule) => {
      const __updatedModule = newModule || __moduleExports;
      registerHotModule("", __updatedModule);
      handleComponentUpdate("", __updatedModule);
    });
    (void 0).accept("../primitives/zag-component", () => (void 0).invalidate());
    const __origCreated = Avatar.prototype.created;
    Avatar.prototype.created = function(__geaProps) {
      registerComponentInstance(this.constructor.name, this);
      return __origCreated.call(this, __geaProps);
    };
    const __origDispose = Avatar.prototype.dispose;
    Avatar.prototype.dispose = function() {
      unregisterComponentInstance(this.constructor.name, this);
      return __origDispose.call(this);
    };
  }

  // node_modules/@zag-js/focus-visible/dist/index.mjs
  function isValidKey(e) {
    return !(e.metaKey || !isMac() && e.altKey || e.ctrlKey || e.key === "Control" || e.key === "Shift" || e.key === "Meta");
  }
  var nonTextInputTypes = /* @__PURE__ */ new Set(["checkbox", "radio", "range", "color", "file", "image", "button", "submit", "reset"]);
  function isKeyboardFocusEvent(isTextInput, modality, e) {
    const eventTarget = e ? getEventTarget(e) : null;
    const doc = getDocument(eventTarget);
    const win = getWindow(eventTarget);
    const activeElement = getActiveElement(doc);
    isTextInput = isTextInput || activeElement instanceof win.HTMLInputElement && !nonTextInputTypes.has(activeElement?.type) || activeElement instanceof win.HTMLTextAreaElement || activeElement instanceof win.HTMLElement && activeElement.isContentEditable;
    return !(isTextInput && modality === "keyboard" && e instanceof win.KeyboardEvent && !Reflect.has(FOCUS_VISIBLE_INPUT_KEYS, e.key));
  }
  var currentModality = null;
  var changeHandlers = /* @__PURE__ */ new Set();
  var listenerMap = /* @__PURE__ */ new Map();
  var hasEventBeforeFocus = false;
  var hasBlurredWindowRecently = false;
  var ignoreFocusEvent = false;
  var FOCUS_VISIBLE_INPUT_KEYS = {
    Tab: true,
    Escape: true
  };
  function triggerChangeHandlers(modality, e) {
    for (let handler of changeHandlers) {
      handler(modality, e);
    }
  }
  function handleKeyboardEvent(e) {
    hasEventBeforeFocus = true;
    if (isValidKey(e)) {
      currentModality = "keyboard";
      triggerChangeHandlers("keyboard", e);
    }
  }
  function handlePointerEvent(e) {
    currentModality = "pointer";
    if (e.type === "mousedown" || e.type === "pointerdown") {
      hasEventBeforeFocus = true;
      triggerChangeHandlers("pointer", e);
    }
  }
  function handleClickEvent(e) {
    if (isVirtualClick(e)) {
      hasEventBeforeFocus = true;
      currentModality = "virtual";
    }
  }
  function handleFocusEvent(e) {
    const target = getEventTarget(e);
    if (target === getWindow(target) || target === getDocument(target) || ignoreFocusEvent || !e.isTrusted) {
      return;
    }
    if (!hasEventBeforeFocus && !hasBlurredWindowRecently) {
      currentModality = "virtual";
      triggerChangeHandlers("virtual", e);
    }
    hasEventBeforeFocus = false;
    hasBlurredWindowRecently = false;
  }
  function handleWindowBlur() {
    if (ignoreFocusEvent) return;
    hasEventBeforeFocus = false;
    hasBlurredWindowRecently = true;
  }
  function setupGlobalFocusEvents(root) {
    if (typeof window === "undefined" || listenerMap.get(getWindow(root))) {
      return;
    }
    const win = getWindow(root);
    const doc = getDocument(root);
    let focus = win.HTMLElement.prototype.focus;
    function patchedFocus() {
      hasEventBeforeFocus = true;
      focus.apply(this, arguments);
    }
    try {
      Object.defineProperty(win.HTMLElement.prototype, "focus", {
        configurable: true,
        value: patchedFocus
      });
    } catch {
    }
    doc.addEventListener("keydown", handleKeyboardEvent, true);
    doc.addEventListener("keyup", handleKeyboardEvent, true);
    doc.addEventListener("click", handleClickEvent, true);
    win.addEventListener("focus", handleFocusEvent, true);
    win.addEventListener("blur", handleWindowBlur, false);
    if (typeof win.PointerEvent !== "undefined") {
      doc.addEventListener("pointerdown", handlePointerEvent, true);
      doc.addEventListener("pointermove", handlePointerEvent, true);
      doc.addEventListener("pointerup", handlePointerEvent, true);
    } else {
      doc.addEventListener("mousedown", handlePointerEvent, true);
      doc.addEventListener("mousemove", handlePointerEvent, true);
      doc.addEventListener("mouseup", handlePointerEvent, true);
    }
    win.addEventListener(
      "beforeunload",
      () => {
        tearDownWindowFocusTracking(root);
      },
      { once: true }
    );
    listenerMap.set(win, { focus });
  }
  var tearDownWindowFocusTracking = (root, loadListener) => {
    const win = getWindow(root);
    const doc = getDocument(root);
    if (loadListener) {
      doc.removeEventListener("DOMContentLoaded", loadListener);
    }
    const listenerData = listenerMap.get(win);
    if (!listenerData) {
      return;
    }
    try {
      Object.defineProperty(win.HTMLElement.prototype, "focus", {
        configurable: true,
        value: listenerData.focus
      });
    } catch {
    }
    doc.removeEventListener("keydown", handleKeyboardEvent, true);
    doc.removeEventListener("keyup", handleKeyboardEvent, true);
    doc.removeEventListener("click", handleClickEvent, true);
    win.removeEventListener("focus", handleFocusEvent, true);
    win.removeEventListener("blur", handleWindowBlur, false);
    if (typeof win.PointerEvent !== "undefined") {
      doc.removeEventListener("pointerdown", handlePointerEvent, true);
      doc.removeEventListener("pointermove", handlePointerEvent, true);
      doc.removeEventListener("pointerup", handlePointerEvent, true);
    } else {
      doc.removeEventListener("mousedown", handlePointerEvent, true);
      doc.removeEventListener("mousemove", handlePointerEvent, true);
      doc.removeEventListener("mouseup", handlePointerEvent, true);
    }
    listenerMap.delete(win);
  };
  function getInteractionModality() {
    return currentModality;
  }
  function setInteractionModality(modality) {
    currentModality = modality;
    triggerChangeHandlers(modality, null);
  }
  function isFocusVisible() {
    return currentModality === "keyboard" || currentModality === "virtual";
  }
  function trackFocusVisible(props = {}) {
    const { isTextInput, autoFocus, onChange, root } = props;
    setupGlobalFocusEvents(root);
    onChange?.({ isFocusVisible: autoFocus || isFocusVisible(), modality: currentModality });
    const handler = (modality, e) => {
      if (!isKeyboardFocusEvent(!!isTextInput, modality, e)) return;
      onChange?.({ isFocusVisible: isFocusVisible(), modality });
    };
    changeHandlers.add(handler);
    return () => {
      changeHandlers.delete(handler);
    };
  }

  // node_modules/@zag-js/collection/dist/chunk-QZ7TP4HQ.mjs
  var __defProp4 = Object.defineProperty;
  var __defNormalProp3 = (obj, key, value) => key in obj ? __defProp4(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField3 = (obj, key, value) => __defNormalProp3(obj, typeof key !== "symbol" ? key + "" : key, value);

  // node_modules/@zag-js/collection/dist/list-collection.mjs
  var fallback = {
    itemToValue(item) {
      if (typeof item === "string") return item;
      if (isObject(item) && hasProp(item, "value")) return item.value;
      return "";
    },
    itemToString(item) {
      if (typeof item === "string") return item;
      if (isObject(item) && hasProp(item, "label")) return item.label;
      return fallback.itemToValue(item);
    },
    isItemDisabled(item) {
      if (isObject(item) && hasProp(item, "disabled")) return !!item.disabled;
      return false;
    }
  };
  var ListCollection = class _ListCollection {
    constructor(options) {
      this.options = options;
      __publicField3(this, "items");
      __publicField3(this, "indexMap", null);
      __publicField3(this, "copy", (items) => {
        return new _ListCollection({ ...this.options, items: items ?? [...this.items] });
      });
      __publicField3(this, "isEqual", (other) => {
        return isEqual(this.items, other.items);
      });
      __publicField3(this, "setItems", (items) => {
        return this.copy(items);
      });
      __publicField3(this, "getValues", (items = this.items) => {
        const values = [];
        for (const item of items) {
          const value = this.getItemValue(item);
          if (value != null) values.push(value);
        }
        return values;
      });
      __publicField3(this, "find", (value) => {
        if (value == null) return null;
        const index = this.indexOf(value);
        return index !== -1 ? this.at(index) : null;
      });
      __publicField3(this, "findMany", (values) => {
        const result = [];
        for (const value of values) {
          const item = this.find(value);
          if (item != null) result.push(item);
        }
        return result;
      });
      __publicField3(this, "at", (index) => {
        if (!this.options.groupBy && !this.options.groupSort) {
          return this.items[index] ?? null;
        }
        let idx = 0;
        const groups = this.group();
        for (const [, items] of groups) {
          for (const item of items) {
            if (idx === index) return item;
            idx++;
          }
        }
        return null;
      });
      __publicField3(this, "sortFn", (valueA, valueB) => {
        const indexA = this.indexOf(valueA);
        const indexB = this.indexOf(valueB);
        return (indexA ?? 0) - (indexB ?? 0);
      });
      __publicField3(this, "sort", (values) => {
        return [...values].sort(this.sortFn.bind(this));
      });
      __publicField3(this, "getItemValue", (item) => {
        if (item == null) return null;
        return this.options.itemToValue?.(item) ?? fallback.itemToValue(item);
      });
      __publicField3(this, "getItemDisabled", (item) => {
        if (item == null) return false;
        return this.options.isItemDisabled?.(item) ?? fallback.isItemDisabled(item);
      });
      __publicField3(this, "stringifyItem", (item) => {
        if (item == null) return null;
        return this.options.itemToString?.(item) ?? fallback.itemToString(item);
      });
      __publicField3(this, "stringify", (value) => {
        if (value == null) return null;
        return this.stringifyItem(this.find(value));
      });
      __publicField3(this, "stringifyItems", (items, separator = ", ") => {
        const strs = [];
        for (const item of items) {
          const str = this.stringifyItem(item);
          if (str != null) strs.push(str);
        }
        return strs.join(separator);
      });
      __publicField3(this, "stringifyMany", (value, separator) => {
        return this.stringifyItems(this.findMany(value), separator);
      });
      __publicField3(this, "has", (value) => {
        return this.indexOf(value) !== -1;
      });
      __publicField3(this, "hasItem", (item) => {
        if (item == null) return false;
        return this.has(this.getItemValue(item));
      });
      __publicField3(this, "group", () => {
        const { groupBy, groupSort } = this.options;
        if (!groupBy) return [["", [...this.items]]];
        const groups = /* @__PURE__ */ new Map();
        this.items.forEach((item, index) => {
          const groupKey = groupBy(item, index);
          if (!groups.has(groupKey)) {
            groups.set(groupKey, []);
          }
          groups.get(groupKey).push(item);
        });
        let entries = Array.from(groups.entries());
        if (groupSort) {
          entries.sort(([a], [b]) => {
            if (typeof groupSort === "function") return groupSort(a, b);
            if (Array.isArray(groupSort)) {
              const indexA = groupSort.indexOf(a);
              const indexB = groupSort.indexOf(b);
              if (indexA === -1) return 1;
              if (indexB === -1) return -1;
              return indexA - indexB;
            }
            if (groupSort === "asc") return a.localeCompare(b);
            if (groupSort === "desc") return b.localeCompare(a);
            return 0;
          });
        }
        return entries;
      });
      __publicField3(this, "getNextValue", (value, step = 1, clamp2 = false) => {
        let index = this.indexOf(value);
        if (index === -1) return null;
        index = clamp2 ? Math.min(index + step, this.size - 1) : index + step;
        while (index <= this.size && this.getItemDisabled(this.at(index))) index++;
        return this.getItemValue(this.at(index));
      });
      __publicField3(this, "getPreviousValue", (value, step = 1, clamp2 = false) => {
        let index = this.indexOf(value);
        if (index === -1) return null;
        index = clamp2 ? Math.max(index - step, 0) : index - step;
        while (index >= 0 && this.getItemDisabled(this.at(index))) index--;
        return this.getItemValue(this.at(index));
      });
      __publicField3(this, "indexOf", (value) => {
        if (value == null) return -1;
        if (!this.options.groupBy && !this.options.groupSort) {
          return this.items.findIndex((item) => this.getItemValue(item) === value);
        }
        if (!this.indexMap) {
          this.indexMap = /* @__PURE__ */ new Map();
          let idx = 0;
          const groups = this.group();
          for (const [, items] of groups) {
            for (const item of items) {
              const itemValue = this.getItemValue(item);
              if (itemValue != null) {
                this.indexMap.set(itemValue, idx);
              }
              idx++;
            }
          }
        }
        return this.indexMap.get(value) ?? -1;
      });
      __publicField3(this, "getByText", (text, current) => {
        const currentIndex = current != null ? this.indexOf(current) : -1;
        const isSingleKey = text.length === 1;
        for (let i = 0; i < this.items.length; i++) {
          const item = this.items[(currentIndex + i + 1) % this.items.length];
          if (isSingleKey && this.getItemValue(item) === current) continue;
          if (this.getItemDisabled(item)) continue;
          if (match2(this.stringifyItem(item), text)) return item;
        }
        return void 0;
      });
      __publicField3(this, "search", (queryString, options2) => {
        const { state, currentValue, timeout = 350 } = options2;
        const search = state.keysSoFar + queryString;
        const isRepeated = search.length > 1 && Array.from(search).every((char) => char === search[0]);
        const query = isRepeated ? search[0] : search;
        const item = this.getByText(query, currentValue);
        const value = this.getItemValue(item);
        function cleanup() {
          clearTimeout(state.timer);
          state.timer = -1;
        }
        function update(value2) {
          state.keysSoFar = value2;
          cleanup();
          if (value2 !== "") {
            state.timer = +setTimeout(() => {
              update("");
              cleanup();
            }, timeout);
          }
        }
        update(search);
        return value;
      });
      __publicField3(this, "update", (value, item) => {
        let index = this.indexOf(value);
        if (index === -1) return this;
        return this.copy([...this.items.slice(0, index), item, ...this.items.slice(index + 1)]);
      });
      __publicField3(this, "upsert", (value, item, mode = "append") => {
        let index = this.indexOf(value);
        if (index === -1) {
          const fn = mode === "append" ? this.append : this.prepend;
          return fn(item);
        }
        return this.copy([...this.items.slice(0, index), item, ...this.items.slice(index + 1)]);
      });
      __publicField3(this, "insert", (index, ...items) => {
        return this.copy(insert(this.items, index, ...items));
      });
      __publicField3(this, "insertBefore", (value, ...items) => {
        let toIndex = this.indexOf(value);
        if (toIndex === -1) {
          if (this.items.length === 0) toIndex = 0;
          else return this;
        }
        return this.copy(insert(this.items, toIndex, ...items));
      });
      __publicField3(this, "insertAfter", (value, ...items) => {
        let toIndex = this.indexOf(value);
        if (toIndex === -1) {
          if (this.items.length === 0) toIndex = 0;
          else return this;
        }
        return this.copy(insert(this.items, toIndex + 1, ...items));
      });
      __publicField3(this, "prepend", (...items) => {
        return this.copy(insert(this.items, 0, ...items));
      });
      __publicField3(this, "append", (...items) => {
        return this.copy(insert(this.items, this.items.length, ...items));
      });
      __publicField3(this, "filter", (fn) => {
        const filteredItems = this.items.filter((item, index) => fn(this.stringifyItem(item), index, item));
        return this.copy(filteredItems);
      });
      __publicField3(this, "remove", (...itemsOrValues) => {
        const values = itemsOrValues.map(
          (itemOrValue) => typeof itemOrValue === "string" ? itemOrValue : this.getItemValue(itemOrValue)
        );
        return this.copy(
          this.items.filter((item) => {
            const value = this.getItemValue(item);
            if (value == null) return false;
            return !values.includes(value);
          })
        );
      });
      __publicField3(this, "move", (value, toIndex) => {
        const fromIndex = this.indexOf(value);
        if (fromIndex === -1) return this;
        return this.copy(move(this.items, [fromIndex], toIndex));
      });
      __publicField3(this, "moveBefore", (value, ...values) => {
        let toIndex = this.items.findIndex((item) => this.getItemValue(item) === value);
        if (toIndex === -1) return this;
        let indices = values.map((value2) => this.items.findIndex((item) => this.getItemValue(item) === value2)).sort((a, b) => a - b);
        return this.copy(move(this.items, indices, toIndex));
      });
      __publicField3(this, "moveAfter", (value, ...values) => {
        let toIndex = this.items.findIndex((item) => this.getItemValue(item) === value);
        if (toIndex === -1) return this;
        let indices = values.map((value2) => this.items.findIndex((item) => this.getItemValue(item) === value2)).sort((a, b) => a - b);
        return this.copy(move(this.items, indices, toIndex + 1));
      });
      __publicField3(this, "reorder", (fromIndex, toIndex) => {
        return this.copy(move(this.items, [fromIndex], toIndex));
      });
      __publicField3(this, "compareValue", (a, b) => {
        const indexA = this.indexOf(a);
        const indexB = this.indexOf(b);
        if (indexA < indexB) return -1;
        if (indexA > indexB) return 1;
        return 0;
      });
      __publicField3(this, "range", (from, to) => {
        let keys = [];
        let key = from;
        while (key != null) {
          let item = this.find(key);
          if (item) keys.push(key);
          if (key === to) return keys;
          key = this.getNextValue(key);
        }
        return [];
      });
      __publicField3(this, "getValueRange", (from, to) => {
        if (from && to) {
          if (this.compareValue(from, to) <= 0) {
            return this.range(from, to);
          }
          return this.range(to, from);
        }
        return [];
      });
      __publicField3(this, "toString", () => {
        let result = "";
        for (const item of this.items) {
          const value = this.getItemValue(item);
          const label = this.stringifyItem(item);
          const disabled = this.getItemDisabled(item);
          const itemString = [value, label, disabled].filter(Boolean).join(":");
          result += itemString + ",";
        }
        return result;
      });
      __publicField3(this, "toJSON", () => {
        return {
          size: this.size,
          first: this.firstValue,
          last: this.lastValue
        };
      });
      this.items = [...options.items];
    }
    /**
     * Returns the number of items in the collection
     */
    get size() {
      return this.items.length;
    }
    /**
     * Returns the first value in the collection
     */
    get firstValue() {
      let index = 0;
      while (this.getItemDisabled(this.at(index))) index++;
      return this.getItemValue(this.at(index));
    }
    /**
     * Returns the last value in the collection
     */
    get lastValue() {
      let index = this.size - 1;
      while (this.getItemDisabled(this.at(index))) index--;
      return this.getItemValue(this.at(index));
    }
    *[Symbol.iterator]() {
      yield* this.items;
    }
  };
  var match2 = (label, query) => {
    return !!label?.toLowerCase().startsWith(query.toLowerCase());
  };
  function insert(items, index, ...values) {
    return [...items.slice(0, index), ...values, ...items.slice(index)];
  }
  function move(items, indices, toIndex) {
    indices = [...indices].sort((a, b) => a - b);
    const itemsToMove = indices.map((i) => items[i]);
    for (let i = indices.length - 1; i >= 0; i--) {
      items = [...items.slice(0, indices[i]), ...items.slice(indices[i] + 1)];
    }
    toIndex = Math.max(0, toIndex - indices.filter((i) => i < toIndex).length);
    return [...items.slice(0, toIndex), ...itemsToMove, ...items.slice(toIndex)];
  }

  // node_modules/@zag-js/collection/dist/selection-map.mjs
  function resolveSelectedItems({
    values,
    collection: collection2,
    selectedItemMap
  }) {
    const result = [];
    for (const value of values) {
      const item = collection2.find(value) ?? selectedItemMap.get(value);
      if (item != null) result.push(item);
    }
    return result;
  }
  function updateSelectedItemMap({
    selectedItemMap,
    values,
    selectedItems,
    collection: collection2
  }) {
    const nextMap = new Map(selectedItemMap);
    for (const item of selectedItems) {
      const value = collection2.getItemValue(item);
      if (value != null) nextMap.set(value, item);
    }
    const allowedValues = new Set(values);
    for (const value of nextMap.keys()) {
      if (!allowedValues.has(value)) nextMap.delete(value);
    }
    return nextMap;
  }
  function deriveSelectionState({
    values,
    collection: collection2,
    selectedItemMap
  }) {
    const selectedItems = resolveSelectedItems({ values, collection: collection2, selectedItemMap });
    const nextSelectedItemMap = updateSelectedItemMap({
      selectedItemMap,
      values,
      selectedItems,
      collection: collection2
    });
    return { selectedItems, nextSelectedItemMap };
  }
  function createSelectedItemMap({
    selectedItems,
    collection: collection2
  }) {
    return updateSelectedItemMap({
      selectedItemMap: /* @__PURE__ */ new Map(),
      values: selectedItems.map((item) => collection2.getItemValue(item)).filter(Boolean),
      selectedItems,
      collection: collection2
    });
  }

  // node_modules/@floating-ui/utils/dist/floating-ui.utils.mjs
  var sides = ["top", "right", "bottom", "left"];
  var min = Math.min;
  var max = Math.max;
  var round = Math.round;
  var floor = Math.floor;
  var createCoords = (v) => ({
    x: v,
    y: v
  });
  var oppositeSideMap = {
    left: "right",
    right: "left",
    bottom: "top",
    top: "bottom"
  };
  function clamp(start, value, end) {
    return max(start, min(value, end));
  }
  function evaluate(value, param) {
    return typeof value === "function" ? value(param) : value;
  }
  function getSide(placement) {
    return placement.split("-")[0];
  }
  function getAlignment(placement) {
    return placement.split("-")[1];
  }
  function getOppositeAxis(axis) {
    return axis === "x" ? "y" : "x";
  }
  function getAxisLength(axis) {
    return axis === "y" ? "height" : "width";
  }
  function getSideAxis(placement) {
    const firstChar = placement[0];
    return firstChar === "t" || firstChar === "b" ? "y" : "x";
  }
  function getAlignmentAxis(placement) {
    return getOppositeAxis(getSideAxis(placement));
  }
  function getAlignmentSides(placement, rects, rtl) {
    if (rtl === void 0) {
      rtl = false;
    }
    const alignment = getAlignment(placement);
    const alignmentAxis = getAlignmentAxis(placement);
    const length = getAxisLength(alignmentAxis);
    let mainAlignmentSide = alignmentAxis === "x" ? alignment === (rtl ? "end" : "start") ? "right" : "left" : alignment === "start" ? "bottom" : "top";
    if (rects.reference[length] > rects.floating[length]) {
      mainAlignmentSide = getOppositePlacement(mainAlignmentSide);
    }
    return [mainAlignmentSide, getOppositePlacement(mainAlignmentSide)];
  }
  function getExpandedPlacements(placement) {
    const oppositePlacement = getOppositePlacement(placement);
    return [getOppositeAlignmentPlacement(placement), oppositePlacement, getOppositeAlignmentPlacement(oppositePlacement)];
  }
  function getOppositeAlignmentPlacement(placement) {
    return placement.includes("start") ? placement.replace("start", "end") : placement.replace("end", "start");
  }
  var lrPlacement = ["left", "right"];
  var rlPlacement = ["right", "left"];
  var tbPlacement = ["top", "bottom"];
  var btPlacement = ["bottom", "top"];
  function getSideList(side, isStart, rtl) {
    switch (side) {
      case "top":
      case "bottom":
        if (rtl) return isStart ? rlPlacement : lrPlacement;
        return isStart ? lrPlacement : rlPlacement;
      case "left":
      case "right":
        return isStart ? tbPlacement : btPlacement;
      default:
        return [];
    }
  }
  function getOppositeAxisPlacements(placement, flipAlignment, direction, rtl) {
    const alignment = getAlignment(placement);
    let list = getSideList(getSide(placement), direction === "start", rtl);
    if (alignment) {
      list = list.map((side) => side + "-" + alignment);
      if (flipAlignment) {
        list = list.concat(list.map(getOppositeAlignmentPlacement));
      }
    }
    return list;
  }
  function getOppositePlacement(placement) {
    const side = getSide(placement);
    return oppositeSideMap[side] + placement.slice(side.length);
  }
  function expandPaddingObject(padding) {
    return {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      ...padding
    };
  }
  function getPaddingObject(padding) {
    return typeof padding !== "number" ? expandPaddingObject(padding) : {
      top: padding,
      right: padding,
      bottom: padding,
      left: padding
    };
  }
  function rectToClientRect(rect) {
    const {
      x,
      y,
      width,
      height
    } = rect;
    return {
      width,
      height,
      top: y,
      left: x,
      right: x + width,
      bottom: y + height,
      x,
      y
    };
  }

  // node_modules/@floating-ui/core/dist/floating-ui.core.mjs
  function computeCoordsFromPlacement(_ref, placement, rtl) {
    let {
      reference,
      floating
    } = _ref;
    const sideAxis = getSideAxis(placement);
    const alignmentAxis = getAlignmentAxis(placement);
    const alignLength = getAxisLength(alignmentAxis);
    const side = getSide(placement);
    const isVertical = sideAxis === "y";
    const commonX = reference.x + reference.width / 2 - floating.width / 2;
    const commonY = reference.y + reference.height / 2 - floating.height / 2;
    const commonAlign = reference[alignLength] / 2 - floating[alignLength] / 2;
    let coords;
    switch (side) {
      case "top":
        coords = {
          x: commonX,
          y: reference.y - floating.height
        };
        break;
      case "bottom":
        coords = {
          x: commonX,
          y: reference.y + reference.height
        };
        break;
      case "right":
        coords = {
          x: reference.x + reference.width,
          y: commonY
        };
        break;
      case "left":
        coords = {
          x: reference.x - floating.width,
          y: commonY
        };
        break;
      default:
        coords = {
          x: reference.x,
          y: reference.y
        };
    }
    switch (getAlignment(placement)) {
      case "start":
        coords[alignmentAxis] -= commonAlign * (rtl && isVertical ? -1 : 1);
        break;
      case "end":
        coords[alignmentAxis] += commonAlign * (rtl && isVertical ? -1 : 1);
        break;
    }
    return coords;
  }
  async function detectOverflow(state, options) {
    var _await$platform$isEle;
    if (options === void 0) {
      options = {};
    }
    const {
      x,
      y,
      platform: platform2,
      rects,
      elements,
      strategy
    } = state;
    const {
      boundary = "clippingAncestors",
      rootBoundary = "viewport",
      elementContext = "floating",
      altBoundary = false,
      padding = 0
    } = evaluate(options, state);
    const paddingObject = getPaddingObject(padding);
    const altContext = elementContext === "floating" ? "reference" : "floating";
    const element = elements[altBoundary ? altContext : elementContext];
    const clippingClientRect = rectToClientRect(await platform2.getClippingRect({
      element: ((_await$platform$isEle = await (platform2.isElement == null ? void 0 : platform2.isElement(element))) != null ? _await$platform$isEle : true) ? element : element.contextElement || await (platform2.getDocumentElement == null ? void 0 : platform2.getDocumentElement(elements.floating)),
      boundary,
      rootBoundary,
      strategy
    }));
    const rect = elementContext === "floating" ? {
      x,
      y,
      width: rects.floating.width,
      height: rects.floating.height
    } : rects.reference;
    const offsetParent = await (platform2.getOffsetParent == null ? void 0 : platform2.getOffsetParent(elements.floating));
    const offsetScale = await (platform2.isElement == null ? void 0 : platform2.isElement(offsetParent)) ? await (platform2.getScale == null ? void 0 : platform2.getScale(offsetParent)) || {
      x: 1,
      y: 1
    } : {
      x: 1,
      y: 1
    };
    const elementClientRect = rectToClientRect(platform2.convertOffsetParentRelativeRectToViewportRelativeRect ? await platform2.convertOffsetParentRelativeRectToViewportRelativeRect({
      elements,
      rect,
      offsetParent,
      strategy
    }) : rect);
    return {
      top: (clippingClientRect.top - elementClientRect.top + paddingObject.top) / offsetScale.y,
      bottom: (elementClientRect.bottom - clippingClientRect.bottom + paddingObject.bottom) / offsetScale.y,
      left: (clippingClientRect.left - elementClientRect.left + paddingObject.left) / offsetScale.x,
      right: (elementClientRect.right - clippingClientRect.right + paddingObject.right) / offsetScale.x
    };
  }
  var MAX_RESET_COUNT = 50;
  var computePosition = async (reference, floating, config) => {
    const {
      placement = "bottom",
      strategy = "absolute",
      middleware = [],
      platform: platform2
    } = config;
    const platformWithDetectOverflow = platform2.detectOverflow ? platform2 : {
      ...platform2,
      detectOverflow
    };
    const rtl = await (platform2.isRTL == null ? void 0 : platform2.isRTL(floating));
    let rects = await platform2.getElementRects({
      reference,
      floating,
      strategy
    });
    let {
      x,
      y
    } = computeCoordsFromPlacement(rects, placement, rtl);
    let statefulPlacement = placement;
    let resetCount = 0;
    const middlewareData = {};
    for (let i = 0; i < middleware.length; i++) {
      const currentMiddleware = middleware[i];
      if (!currentMiddleware) {
        continue;
      }
      const {
        name,
        fn
      } = currentMiddleware;
      const {
        x: nextX,
        y: nextY,
        data,
        reset
      } = await fn({
        x,
        y,
        initialPlacement: placement,
        placement: statefulPlacement,
        strategy,
        middlewareData,
        rects,
        platform: platformWithDetectOverflow,
        elements: {
          reference,
          floating
        }
      });
      x = nextX != null ? nextX : x;
      y = nextY != null ? nextY : y;
      middlewareData[name] = {
        ...middlewareData[name],
        ...data
      };
      if (reset && resetCount < MAX_RESET_COUNT) {
        resetCount++;
        if (typeof reset === "object") {
          if (reset.placement) {
            statefulPlacement = reset.placement;
          }
          if (reset.rects) {
            rects = reset.rects === true ? await platform2.getElementRects({
              reference,
              floating,
              strategy
            }) : reset.rects;
          }
          ({
            x,
            y
          } = computeCoordsFromPlacement(rects, statefulPlacement, rtl));
        }
        i = -1;
      }
    }
    return {
      x,
      y,
      placement: statefulPlacement,
      strategy,
      middlewareData
    };
  };
  var arrow = (options) => ({
    name: "arrow",
    options,
    async fn(state) {
      const {
        x,
        y,
        placement,
        rects,
        platform: platform2,
        elements,
        middlewareData
      } = state;
      const {
        element,
        padding = 0
      } = evaluate(options, state) || {};
      if (element == null) {
        return {};
      }
      const paddingObject = getPaddingObject(padding);
      const coords = {
        x,
        y
      };
      const axis = getAlignmentAxis(placement);
      const length = getAxisLength(axis);
      const arrowDimensions = await platform2.getDimensions(element);
      const isYAxis = axis === "y";
      const minProp = isYAxis ? "top" : "left";
      const maxProp = isYAxis ? "bottom" : "right";
      const clientProp = isYAxis ? "clientHeight" : "clientWidth";
      const endDiff = rects.reference[length] + rects.reference[axis] - coords[axis] - rects.floating[length];
      const startDiff = coords[axis] - rects.reference[axis];
      const arrowOffsetParent = await (platform2.getOffsetParent == null ? void 0 : platform2.getOffsetParent(element));
      let clientSize = arrowOffsetParent ? arrowOffsetParent[clientProp] : 0;
      if (!clientSize || !await (platform2.isElement == null ? void 0 : platform2.isElement(arrowOffsetParent))) {
        clientSize = elements.floating[clientProp] || rects.floating[length];
      }
      const centerToReference = endDiff / 2 - startDiff / 2;
      const largestPossiblePadding = clientSize / 2 - arrowDimensions[length] / 2 - 1;
      const minPadding = min(paddingObject[minProp], largestPossiblePadding);
      const maxPadding = min(paddingObject[maxProp], largestPossiblePadding);
      const min$1 = minPadding;
      const max2 = clientSize - arrowDimensions[length] - maxPadding;
      const center = clientSize / 2 - arrowDimensions[length] / 2 + centerToReference;
      const offset3 = clamp(min$1, center, max2);
      const shouldAddOffset = !middlewareData.arrow && getAlignment(placement) != null && center !== offset3 && rects.reference[length] / 2 - (center < min$1 ? minPadding : maxPadding) - arrowDimensions[length] / 2 < 0;
      const alignmentOffset = shouldAddOffset ? center < min$1 ? center - min$1 : center - max2 : 0;
      return {
        [axis]: coords[axis] + alignmentOffset,
        data: {
          [axis]: offset3,
          centerOffset: center - offset3 - alignmentOffset,
          ...shouldAddOffset && {
            alignmentOffset
          }
        },
        reset: shouldAddOffset
      };
    }
  });
  var flip = function(options) {
    if (options === void 0) {
      options = {};
    }
    return {
      name: "flip",
      options,
      async fn(state) {
        var _middlewareData$arrow, _middlewareData$flip;
        const {
          placement,
          middlewareData,
          rects,
          initialPlacement,
          platform: platform2,
          elements
        } = state;
        const {
          mainAxis: checkMainAxis = true,
          crossAxis: checkCrossAxis = true,
          fallbackPlacements: specifiedFallbackPlacements,
          fallbackStrategy = "bestFit",
          fallbackAxisSideDirection = "none",
          flipAlignment = true,
          ...detectOverflowOptions
        } = evaluate(options, state);
        if ((_middlewareData$arrow = middlewareData.arrow) != null && _middlewareData$arrow.alignmentOffset) {
          return {};
        }
        const side = getSide(placement);
        const initialSideAxis = getSideAxis(initialPlacement);
        const isBasePlacement = getSide(initialPlacement) === initialPlacement;
        const rtl = await (platform2.isRTL == null ? void 0 : platform2.isRTL(elements.floating));
        const fallbackPlacements = specifiedFallbackPlacements || (isBasePlacement || !flipAlignment ? [getOppositePlacement(initialPlacement)] : getExpandedPlacements(initialPlacement));
        const hasFallbackAxisSideDirection = fallbackAxisSideDirection !== "none";
        if (!specifiedFallbackPlacements && hasFallbackAxisSideDirection) {
          fallbackPlacements.push(...getOppositeAxisPlacements(initialPlacement, flipAlignment, fallbackAxisSideDirection, rtl));
        }
        const placements2 = [initialPlacement, ...fallbackPlacements];
        const overflow = await platform2.detectOverflow(state, detectOverflowOptions);
        const overflows = [];
        let overflowsData = ((_middlewareData$flip = middlewareData.flip) == null ? void 0 : _middlewareData$flip.overflows) || [];
        if (checkMainAxis) {
          overflows.push(overflow[side]);
        }
        if (checkCrossAxis) {
          const sides2 = getAlignmentSides(placement, rects, rtl);
          overflows.push(overflow[sides2[0]], overflow[sides2[1]]);
        }
        overflowsData = [...overflowsData, {
          placement,
          overflows
        }];
        if (!overflows.every((side2) => side2 <= 0)) {
          var _middlewareData$flip2, _overflowsData$filter;
          const nextIndex = (((_middlewareData$flip2 = middlewareData.flip) == null ? void 0 : _middlewareData$flip2.index) || 0) + 1;
          const nextPlacement = placements2[nextIndex];
          if (nextPlacement) {
            const ignoreCrossAxisOverflow = checkCrossAxis === "alignment" ? initialSideAxis !== getSideAxis(nextPlacement) : false;
            if (!ignoreCrossAxisOverflow || // We leave the current main axis only if every placement on that axis
            // overflows the main axis.
            overflowsData.every((d) => getSideAxis(d.placement) === initialSideAxis ? d.overflows[0] > 0 : true)) {
              return {
                data: {
                  index: nextIndex,
                  overflows: overflowsData
                },
                reset: {
                  placement: nextPlacement
                }
              };
            }
          }
          let resetPlacement = (_overflowsData$filter = overflowsData.filter((d) => d.overflows[0] <= 0).sort((a, b) => a.overflows[1] - b.overflows[1])[0]) == null ? void 0 : _overflowsData$filter.placement;
          if (!resetPlacement) {
            switch (fallbackStrategy) {
              case "bestFit": {
                var _overflowsData$filter2;
                const placement2 = (_overflowsData$filter2 = overflowsData.filter((d) => {
                  if (hasFallbackAxisSideDirection) {
                    const currentSideAxis = getSideAxis(d.placement);
                    return currentSideAxis === initialSideAxis || // Create a bias to the `y` side axis due to horizontal
                    // reading directions favoring greater width.
                    currentSideAxis === "y";
                  }
                  return true;
                }).map((d) => [d.placement, d.overflows.filter((overflow2) => overflow2 > 0).reduce((acc, overflow2) => acc + overflow2, 0)]).sort((a, b) => a[1] - b[1])[0]) == null ? void 0 : _overflowsData$filter2[0];
                if (placement2) {
                  resetPlacement = placement2;
                }
                break;
              }
              case "initialPlacement":
                resetPlacement = initialPlacement;
                break;
            }
          }
          if (placement !== resetPlacement) {
            return {
              reset: {
                placement: resetPlacement
              }
            };
          }
        }
        return {};
      }
    };
  };
  function getSideOffsets(overflow, rect) {
    return {
      top: overflow.top - rect.height,
      right: overflow.right - rect.width,
      bottom: overflow.bottom - rect.height,
      left: overflow.left - rect.width
    };
  }
  function isAnySideFullyClipped(overflow) {
    return sides.some((side) => overflow[side] >= 0);
  }
  var hide = function(options) {
    if (options === void 0) {
      options = {};
    }
    return {
      name: "hide",
      options,
      async fn(state) {
        const {
          rects,
          platform: platform2
        } = state;
        const {
          strategy = "referenceHidden",
          ...detectOverflowOptions
        } = evaluate(options, state);
        switch (strategy) {
          case "referenceHidden": {
            const overflow = await platform2.detectOverflow(state, {
              ...detectOverflowOptions,
              elementContext: "reference"
            });
            const offsets = getSideOffsets(overflow, rects.reference);
            return {
              data: {
                referenceHiddenOffsets: offsets,
                referenceHidden: isAnySideFullyClipped(offsets)
              }
            };
          }
          case "escaped": {
            const overflow = await platform2.detectOverflow(state, {
              ...detectOverflowOptions,
              altBoundary: true
            });
            const offsets = getSideOffsets(overflow, rects.floating);
            return {
              data: {
                escapedOffsets: offsets,
                escaped: isAnySideFullyClipped(offsets)
              }
            };
          }
          default: {
            return {};
          }
        }
      }
    };
  };
  var originSides = /* @__PURE__ */ new Set(["left", "top"]);
  async function convertValueToCoords(state, options) {
    const {
      placement,
      platform: platform2,
      elements
    } = state;
    const rtl = await (platform2.isRTL == null ? void 0 : platform2.isRTL(elements.floating));
    const side = getSide(placement);
    const alignment = getAlignment(placement);
    const isVertical = getSideAxis(placement) === "y";
    const mainAxisMulti = originSides.has(side) ? -1 : 1;
    const crossAxisMulti = rtl && isVertical ? -1 : 1;
    const rawValue = evaluate(options, state);
    let {
      mainAxis,
      crossAxis,
      alignmentAxis
    } = typeof rawValue === "number" ? {
      mainAxis: rawValue,
      crossAxis: 0,
      alignmentAxis: null
    } : {
      mainAxis: rawValue.mainAxis || 0,
      crossAxis: rawValue.crossAxis || 0,
      alignmentAxis: rawValue.alignmentAxis
    };
    if (alignment && typeof alignmentAxis === "number") {
      crossAxis = alignment === "end" ? alignmentAxis * -1 : alignmentAxis;
    }
    return isVertical ? {
      x: crossAxis * crossAxisMulti,
      y: mainAxis * mainAxisMulti
    } : {
      x: mainAxis * mainAxisMulti,
      y: crossAxis * crossAxisMulti
    };
  }
  var offset = function(options) {
    if (options === void 0) {
      options = 0;
    }
    return {
      name: "offset",
      options,
      async fn(state) {
        var _middlewareData$offse, _middlewareData$arrow;
        const {
          x,
          y,
          placement,
          middlewareData
        } = state;
        const diffCoords = await convertValueToCoords(state, options);
        if (placement === ((_middlewareData$offse = middlewareData.offset) == null ? void 0 : _middlewareData$offse.placement) && (_middlewareData$arrow = middlewareData.arrow) != null && _middlewareData$arrow.alignmentOffset) {
          return {};
        }
        return {
          x: x + diffCoords.x,
          y: y + diffCoords.y,
          data: {
            ...diffCoords,
            placement
          }
        };
      }
    };
  };
  var shift = function(options) {
    if (options === void 0) {
      options = {};
    }
    return {
      name: "shift",
      options,
      async fn(state) {
        const {
          x,
          y,
          placement,
          platform: platform2
        } = state;
        const {
          mainAxis: checkMainAxis = true,
          crossAxis: checkCrossAxis = false,
          limiter = {
            fn: (_ref) => {
              let {
                x: x2,
                y: y2
              } = _ref;
              return {
                x: x2,
                y: y2
              };
            }
          },
          ...detectOverflowOptions
        } = evaluate(options, state);
        const coords = {
          x,
          y
        };
        const overflow = await platform2.detectOverflow(state, detectOverflowOptions);
        const crossAxis = getSideAxis(getSide(placement));
        const mainAxis = getOppositeAxis(crossAxis);
        let mainAxisCoord = coords[mainAxis];
        let crossAxisCoord = coords[crossAxis];
        if (checkMainAxis) {
          const minSide = mainAxis === "y" ? "top" : "left";
          const maxSide = mainAxis === "y" ? "bottom" : "right";
          const min2 = mainAxisCoord + overflow[minSide];
          const max2 = mainAxisCoord - overflow[maxSide];
          mainAxisCoord = clamp(min2, mainAxisCoord, max2);
        }
        if (checkCrossAxis) {
          const minSide = crossAxis === "y" ? "top" : "left";
          const maxSide = crossAxis === "y" ? "bottom" : "right";
          const min2 = crossAxisCoord + overflow[minSide];
          const max2 = crossAxisCoord - overflow[maxSide];
          crossAxisCoord = clamp(min2, crossAxisCoord, max2);
        }
        const limitedCoords = limiter.fn({
          ...state,
          [mainAxis]: mainAxisCoord,
          [crossAxis]: crossAxisCoord
        });
        return {
          ...limitedCoords,
          data: {
            x: limitedCoords.x - x,
            y: limitedCoords.y - y,
            enabled: {
              [mainAxis]: checkMainAxis,
              [crossAxis]: checkCrossAxis
            }
          }
        };
      }
    };
  };
  var limitShift = function(options) {
    if (options === void 0) {
      options = {};
    }
    return {
      options,
      fn(state) {
        const {
          x,
          y,
          placement,
          rects,
          middlewareData
        } = state;
        const {
          offset: offset3 = 0,
          mainAxis: checkMainAxis = true,
          crossAxis: checkCrossAxis = true
        } = evaluate(options, state);
        const coords = {
          x,
          y
        };
        const crossAxis = getSideAxis(placement);
        const mainAxis = getOppositeAxis(crossAxis);
        let mainAxisCoord = coords[mainAxis];
        let crossAxisCoord = coords[crossAxis];
        const rawOffset = evaluate(offset3, state);
        const computedOffset = typeof rawOffset === "number" ? {
          mainAxis: rawOffset,
          crossAxis: 0
        } : {
          mainAxis: 0,
          crossAxis: 0,
          ...rawOffset
        };
        if (checkMainAxis) {
          const len = mainAxis === "y" ? "height" : "width";
          const limitMin = rects.reference[mainAxis] - rects.floating[len] + computedOffset.mainAxis;
          const limitMax = rects.reference[mainAxis] + rects.reference[len] - computedOffset.mainAxis;
          if (mainAxisCoord < limitMin) {
            mainAxisCoord = limitMin;
          } else if (mainAxisCoord > limitMax) {
            mainAxisCoord = limitMax;
          }
        }
        if (checkCrossAxis) {
          var _middlewareData$offse, _middlewareData$offse2;
          const len = mainAxis === "y" ? "width" : "height";
          const isOriginSide = originSides.has(getSide(placement));
          const limitMin = rects.reference[crossAxis] - rects.floating[len] + (isOriginSide ? ((_middlewareData$offse = middlewareData.offset) == null ? void 0 : _middlewareData$offse[crossAxis]) || 0 : 0) + (isOriginSide ? 0 : computedOffset.crossAxis);
          const limitMax = rects.reference[crossAxis] + rects.reference[len] + (isOriginSide ? 0 : ((_middlewareData$offse2 = middlewareData.offset) == null ? void 0 : _middlewareData$offse2[crossAxis]) || 0) - (isOriginSide ? computedOffset.crossAxis : 0);
          if (crossAxisCoord < limitMin) {
            crossAxisCoord = limitMin;
          } else if (crossAxisCoord > limitMax) {
            crossAxisCoord = limitMax;
          }
        }
        return {
          [mainAxis]: mainAxisCoord,
          [crossAxis]: crossAxisCoord
        };
      }
    };
  };
  var size = function(options) {
    if (options === void 0) {
      options = {};
    }
    return {
      name: "size",
      options,
      async fn(state) {
        var _state$middlewareData, _state$middlewareData2;
        const {
          placement,
          rects,
          platform: platform2,
          elements
        } = state;
        const {
          apply = () => {
          },
          ...detectOverflowOptions
        } = evaluate(options, state);
        const overflow = await platform2.detectOverflow(state, detectOverflowOptions);
        const side = getSide(placement);
        const alignment = getAlignment(placement);
        const isYAxis = getSideAxis(placement) === "y";
        const {
          width,
          height
        } = rects.floating;
        let heightSide;
        let widthSide;
        if (side === "top" || side === "bottom") {
          heightSide = side;
          widthSide = alignment === (await (platform2.isRTL == null ? void 0 : platform2.isRTL(elements.floating)) ? "start" : "end") ? "left" : "right";
        } else {
          widthSide = side;
          heightSide = alignment === "end" ? "top" : "bottom";
        }
        const maximumClippingHeight = height - overflow.top - overflow.bottom;
        const maximumClippingWidth = width - overflow.left - overflow.right;
        const overflowAvailableHeight = min(height - overflow[heightSide], maximumClippingHeight);
        const overflowAvailableWidth = min(width - overflow[widthSide], maximumClippingWidth);
        const noShift = !state.middlewareData.shift;
        let availableHeight = overflowAvailableHeight;
        let availableWidth = overflowAvailableWidth;
        if ((_state$middlewareData = state.middlewareData.shift) != null && _state$middlewareData.enabled.x) {
          availableWidth = maximumClippingWidth;
        }
        if ((_state$middlewareData2 = state.middlewareData.shift) != null && _state$middlewareData2.enabled.y) {
          availableHeight = maximumClippingHeight;
        }
        if (noShift && !alignment) {
          const xMin = max(overflow.left, 0);
          const xMax = max(overflow.right, 0);
          const yMin = max(overflow.top, 0);
          const yMax = max(overflow.bottom, 0);
          if (isYAxis) {
            availableWidth = width - 2 * (xMin !== 0 || xMax !== 0 ? xMin + xMax : max(overflow.left, overflow.right));
          } else {
            availableHeight = height - 2 * (yMin !== 0 || yMax !== 0 ? yMin + yMax : max(overflow.top, overflow.bottom));
          }
        }
        await apply({
          ...state,
          availableWidth,
          availableHeight
        });
        const nextDimensions = await platform2.getDimensions(elements.floating);
        if (width !== nextDimensions.width || height !== nextDimensions.height) {
          return {
            reset: {
              rects: true
            }
          };
        }
        return {};
      }
    };
  };

  // node_modules/@floating-ui/utils/dist/floating-ui.utils.dom.mjs
  function hasWindow() {
    return typeof window !== "undefined";
  }
  function getNodeName2(node) {
    if (isNode2(node)) {
      return (node.nodeName || "").toLowerCase();
    }
    return "#document";
  }
  function getWindow2(node) {
    var _node$ownerDocument;
    return (node == null || (_node$ownerDocument = node.ownerDocument) == null ? void 0 : _node$ownerDocument.defaultView) || window;
  }
  function getDocumentElement2(node) {
    var _ref;
    return (_ref = (isNode2(node) ? node.ownerDocument : node.document) || window.document) == null ? void 0 : _ref.documentElement;
  }
  function isNode2(value) {
    if (!hasWindow()) {
      return false;
    }
    return value instanceof Node || value instanceof getWindow2(value).Node;
  }
  function isElement2(value) {
    if (!hasWindow()) {
      return false;
    }
    return value instanceof Element || value instanceof getWindow2(value).Element;
  }
  function isHTMLElement2(value) {
    if (!hasWindow()) {
      return false;
    }
    return value instanceof HTMLElement || value instanceof getWindow2(value).HTMLElement;
  }
  function isShadowRoot2(value) {
    if (!hasWindow() || typeof ShadowRoot === "undefined") {
      return false;
    }
    return value instanceof ShadowRoot || value instanceof getWindow2(value).ShadowRoot;
  }
  function isOverflowElement2(element) {
    const {
      overflow,
      overflowX,
      overflowY,
      display
    } = getComputedStyle3(element);
    return /auto|scroll|overlay|hidden|clip/.test(overflow + overflowY + overflowX) && display !== "inline" && display !== "contents";
  }
  function isTableElement(element) {
    return /^(table|td|th)$/.test(getNodeName2(element));
  }
  function isTopLayer(element) {
    try {
      if (element.matches(":popover-open")) {
        return true;
      }
    } catch (_e) {
    }
    try {
      return element.matches(":modal");
    } catch (_e) {
      return false;
    }
  }
  var willChangeRe = /transform|translate|scale|rotate|perspective|filter/;
  var containRe = /paint|layout|strict|content/;
  var isNotNone = (value) => !!value && value !== "none";
  var isWebKitValue;
  function isContainingBlock(elementOrCss) {
    const css = isElement2(elementOrCss) ? getComputedStyle3(elementOrCss) : elementOrCss;
    return isNotNone(css.transform) || isNotNone(css.translate) || isNotNone(css.scale) || isNotNone(css.rotate) || isNotNone(css.perspective) || !isWebKit() && (isNotNone(css.backdropFilter) || isNotNone(css.filter)) || willChangeRe.test(css.willChange || "") || containRe.test(css.contain || "");
  }
  function getContainingBlock(element) {
    let currentNode = getParentNode2(element);
    while (isHTMLElement2(currentNode) && !isLastTraversableNode(currentNode)) {
      if (isContainingBlock(currentNode)) {
        return currentNode;
      } else if (isTopLayer(currentNode)) {
        return null;
      }
      currentNode = getParentNode2(currentNode);
    }
    return null;
  }
  function isWebKit() {
    if (isWebKitValue == null) {
      isWebKitValue = typeof CSS !== "undefined" && CSS.supports && CSS.supports("-webkit-backdrop-filter", "none");
    }
    return isWebKitValue;
  }
  function isLastTraversableNode(node) {
    return /^(html|body|#document)$/.test(getNodeName2(node));
  }
  function getComputedStyle3(element) {
    return getWindow2(element).getComputedStyle(element);
  }
  function getNodeScroll(element) {
    if (isElement2(element)) {
      return {
        scrollLeft: element.scrollLeft,
        scrollTop: element.scrollTop
      };
    }
    return {
      scrollLeft: element.scrollX,
      scrollTop: element.scrollY
    };
  }
  function getParentNode2(node) {
    if (getNodeName2(node) === "html") {
      return node;
    }
    const result = (
      // Step into the shadow DOM of the parent of a slotted node.
      node.assignedSlot || // DOM Element detected.
      node.parentNode || // ShadowRoot detected.
      isShadowRoot2(node) && node.host || // Fallback.
      getDocumentElement2(node)
    );
    return isShadowRoot2(result) ? result.host : result;
  }
  function getNearestOverflowAncestor2(node) {
    const parentNode = getParentNode2(node);
    if (isLastTraversableNode(parentNode)) {
      return node.ownerDocument ? node.ownerDocument.body : node.body;
    }
    if (isHTMLElement2(parentNode) && isOverflowElement2(parentNode)) {
      return parentNode;
    }
    return getNearestOverflowAncestor2(parentNode);
  }
  function getOverflowAncestors(node, list, traverseIframes) {
    var _node$ownerDocument2;
    if (list === void 0) {
      list = [];
    }
    if (traverseIframes === void 0) {
      traverseIframes = true;
    }
    const scrollableAncestor = getNearestOverflowAncestor2(node);
    const isBody = scrollableAncestor === ((_node$ownerDocument2 = node.ownerDocument) == null ? void 0 : _node$ownerDocument2.body);
    const win = getWindow2(scrollableAncestor);
    if (isBody) {
      const frameElement = getFrameElement(win);
      return list.concat(win, win.visualViewport || [], isOverflowElement2(scrollableAncestor) ? scrollableAncestor : [], frameElement && traverseIframes ? getOverflowAncestors(frameElement) : []);
    } else {
      return list.concat(scrollableAncestor, getOverflowAncestors(scrollableAncestor, [], traverseIframes));
    }
  }
  function getFrameElement(win) {
    return win.parent && Object.getPrototypeOf(win.parent) ? win.frameElement : null;
  }

  // node_modules/@floating-ui/dom/dist/floating-ui.dom.mjs
  function getCssDimensions(element) {
    const css = getComputedStyle3(element);
    let width = parseFloat(css.width) || 0;
    let height = parseFloat(css.height) || 0;
    const hasOffset = isHTMLElement2(element);
    const offsetWidth = hasOffset ? element.offsetWidth : width;
    const offsetHeight = hasOffset ? element.offsetHeight : height;
    const shouldFallback = round(width) !== offsetWidth || round(height) !== offsetHeight;
    if (shouldFallback) {
      width = offsetWidth;
      height = offsetHeight;
    }
    return {
      width,
      height,
      $: shouldFallback
    };
  }
  function unwrapElement(element) {
    return !isElement2(element) ? element.contextElement : element;
  }
  function getScale(element) {
    const domElement = unwrapElement(element);
    if (!isHTMLElement2(domElement)) {
      return createCoords(1);
    }
    const rect = domElement.getBoundingClientRect();
    const {
      width,
      height,
      $
    } = getCssDimensions(domElement);
    let x = ($ ? round(rect.width) : rect.width) / width;
    let y = ($ ? round(rect.height) : rect.height) / height;
    if (!x || !Number.isFinite(x)) {
      x = 1;
    }
    if (!y || !Number.isFinite(y)) {
      y = 1;
    }
    return {
      x,
      y
    };
  }
  var noOffsets = /* @__PURE__ */ createCoords(0);
  function getVisualOffsets(element) {
    const win = getWindow2(element);
    if (!isWebKit() || !win.visualViewport) {
      return noOffsets;
    }
    return {
      x: win.visualViewport.offsetLeft,
      y: win.visualViewport.offsetTop
    };
  }
  function shouldAddVisualOffsets(element, isFixed, floatingOffsetParent) {
    if (isFixed === void 0) {
      isFixed = false;
    }
    if (!floatingOffsetParent || isFixed && floatingOffsetParent !== getWindow2(element)) {
      return false;
    }
    return isFixed;
  }
  function getBoundingClientRect(element, includeScale, isFixedStrategy, offsetParent) {
    if (includeScale === void 0) {
      includeScale = false;
    }
    if (isFixedStrategy === void 0) {
      isFixedStrategy = false;
    }
    const clientRect = element.getBoundingClientRect();
    const domElement = unwrapElement(element);
    let scale = createCoords(1);
    if (includeScale) {
      if (offsetParent) {
        if (isElement2(offsetParent)) {
          scale = getScale(offsetParent);
        }
      } else {
        scale = getScale(element);
      }
    }
    const visualOffsets = shouldAddVisualOffsets(domElement, isFixedStrategy, offsetParent) ? getVisualOffsets(domElement) : createCoords(0);
    let x = (clientRect.left + visualOffsets.x) / scale.x;
    let y = (clientRect.top + visualOffsets.y) / scale.y;
    let width = clientRect.width / scale.x;
    let height = clientRect.height / scale.y;
    if (domElement) {
      const win = getWindow2(domElement);
      const offsetWin = offsetParent && isElement2(offsetParent) ? getWindow2(offsetParent) : offsetParent;
      let currentWin = win;
      let currentIFrame = getFrameElement(currentWin);
      while (currentIFrame && offsetParent && offsetWin !== currentWin) {
        const iframeScale = getScale(currentIFrame);
        const iframeRect = currentIFrame.getBoundingClientRect();
        const css = getComputedStyle3(currentIFrame);
        const left = iframeRect.left + (currentIFrame.clientLeft + parseFloat(css.paddingLeft)) * iframeScale.x;
        const top = iframeRect.top + (currentIFrame.clientTop + parseFloat(css.paddingTop)) * iframeScale.y;
        x *= iframeScale.x;
        y *= iframeScale.y;
        width *= iframeScale.x;
        height *= iframeScale.y;
        x += left;
        y += top;
        currentWin = getWindow2(currentIFrame);
        currentIFrame = getFrameElement(currentWin);
      }
    }
    return rectToClientRect({
      width,
      height,
      x,
      y
    });
  }
  function getWindowScrollBarX(element, rect) {
    const leftScroll = getNodeScroll(element).scrollLeft;
    if (!rect) {
      return getBoundingClientRect(getDocumentElement2(element)).left + leftScroll;
    }
    return rect.left + leftScroll;
  }
  function getHTMLOffset(documentElement, scroll) {
    const htmlRect = documentElement.getBoundingClientRect();
    const x = htmlRect.left + scroll.scrollLeft - getWindowScrollBarX(documentElement, htmlRect);
    const y = htmlRect.top + scroll.scrollTop;
    return {
      x,
      y
    };
  }
  function convertOffsetParentRelativeRectToViewportRelativeRect(_ref) {
    let {
      elements,
      rect,
      offsetParent,
      strategy
    } = _ref;
    const isFixed = strategy === "fixed";
    const documentElement = getDocumentElement2(offsetParent);
    const topLayer = elements ? isTopLayer(elements.floating) : false;
    if (offsetParent === documentElement || topLayer && isFixed) {
      return rect;
    }
    let scroll = {
      scrollLeft: 0,
      scrollTop: 0
    };
    let scale = createCoords(1);
    const offsets = createCoords(0);
    const isOffsetParentAnElement = isHTMLElement2(offsetParent);
    if (isOffsetParentAnElement || !isOffsetParentAnElement && !isFixed) {
      if (getNodeName2(offsetParent) !== "body" || isOverflowElement2(documentElement)) {
        scroll = getNodeScroll(offsetParent);
      }
      if (isOffsetParentAnElement) {
        const offsetRect = getBoundingClientRect(offsetParent);
        scale = getScale(offsetParent);
        offsets.x = offsetRect.x + offsetParent.clientLeft;
        offsets.y = offsetRect.y + offsetParent.clientTop;
      }
    }
    const htmlOffset = documentElement && !isOffsetParentAnElement && !isFixed ? getHTMLOffset(documentElement, scroll) : createCoords(0);
    return {
      width: rect.width * scale.x,
      height: rect.height * scale.y,
      x: rect.x * scale.x - scroll.scrollLeft * scale.x + offsets.x + htmlOffset.x,
      y: rect.y * scale.y - scroll.scrollTop * scale.y + offsets.y + htmlOffset.y
    };
  }
  function getClientRects(element) {
    return Array.from(element.getClientRects());
  }
  function getDocumentRect(element) {
    const html = getDocumentElement2(element);
    const scroll = getNodeScroll(element);
    const body = element.ownerDocument.body;
    const width = max(html.scrollWidth, html.clientWidth, body.scrollWidth, body.clientWidth);
    const height = max(html.scrollHeight, html.clientHeight, body.scrollHeight, body.clientHeight);
    let x = -scroll.scrollLeft + getWindowScrollBarX(element);
    const y = -scroll.scrollTop;
    if (getComputedStyle3(body).direction === "rtl") {
      x += max(html.clientWidth, body.clientWidth) - width;
    }
    return {
      width,
      height,
      x,
      y
    };
  }
  var SCROLLBAR_MAX = 25;
  function getViewportRect(element, strategy) {
    const win = getWindow2(element);
    const html = getDocumentElement2(element);
    const visualViewport = win.visualViewport;
    let width = html.clientWidth;
    let height = html.clientHeight;
    let x = 0;
    let y = 0;
    if (visualViewport) {
      width = visualViewport.width;
      height = visualViewport.height;
      const visualViewportBased = isWebKit();
      if (!visualViewportBased || visualViewportBased && strategy === "fixed") {
        x = visualViewport.offsetLeft;
        y = visualViewport.offsetTop;
      }
    }
    const windowScrollbarX = getWindowScrollBarX(html);
    if (windowScrollbarX <= 0) {
      const doc = html.ownerDocument;
      const body = doc.body;
      const bodyStyles = getComputedStyle(body);
      const bodyMarginInline = doc.compatMode === "CSS1Compat" ? parseFloat(bodyStyles.marginLeft) + parseFloat(bodyStyles.marginRight) || 0 : 0;
      const clippingStableScrollbarWidth = Math.abs(html.clientWidth - body.clientWidth - bodyMarginInline);
      if (clippingStableScrollbarWidth <= SCROLLBAR_MAX) {
        width -= clippingStableScrollbarWidth;
      }
    } else if (windowScrollbarX <= SCROLLBAR_MAX) {
      width += windowScrollbarX;
    }
    return {
      width,
      height,
      x,
      y
    };
  }
  function getInnerBoundingClientRect(element, strategy) {
    const clientRect = getBoundingClientRect(element, true, strategy === "fixed");
    const top = clientRect.top + element.clientTop;
    const left = clientRect.left + element.clientLeft;
    const scale = isHTMLElement2(element) ? getScale(element) : createCoords(1);
    const width = element.clientWidth * scale.x;
    const height = element.clientHeight * scale.y;
    const x = left * scale.x;
    const y = top * scale.y;
    return {
      width,
      height,
      x,
      y
    };
  }
  function getClientRectFromClippingAncestor(element, clippingAncestor, strategy) {
    let rect;
    if (clippingAncestor === "viewport") {
      rect = getViewportRect(element, strategy);
    } else if (clippingAncestor === "document") {
      rect = getDocumentRect(getDocumentElement2(element));
    } else if (isElement2(clippingAncestor)) {
      rect = getInnerBoundingClientRect(clippingAncestor, strategy);
    } else {
      const visualOffsets = getVisualOffsets(element);
      rect = {
        x: clippingAncestor.x - visualOffsets.x,
        y: clippingAncestor.y - visualOffsets.y,
        width: clippingAncestor.width,
        height: clippingAncestor.height
      };
    }
    return rectToClientRect(rect);
  }
  function hasFixedPositionAncestor(element, stopNode) {
    const parentNode = getParentNode2(element);
    if (parentNode === stopNode || !isElement2(parentNode) || isLastTraversableNode(parentNode)) {
      return false;
    }
    return getComputedStyle3(parentNode).position === "fixed" || hasFixedPositionAncestor(parentNode, stopNode);
  }
  function getClippingElementAncestors(element, cache) {
    const cachedResult = cache.get(element);
    if (cachedResult) {
      return cachedResult;
    }
    let result = getOverflowAncestors(element, [], false).filter((el) => isElement2(el) && getNodeName2(el) !== "body");
    let currentContainingBlockComputedStyle = null;
    const elementIsFixed = getComputedStyle3(element).position === "fixed";
    let currentNode = elementIsFixed ? getParentNode2(element) : element;
    while (isElement2(currentNode) && !isLastTraversableNode(currentNode)) {
      const computedStyle = getComputedStyle3(currentNode);
      const currentNodeIsContaining = isContainingBlock(currentNode);
      if (!currentNodeIsContaining && computedStyle.position === "fixed") {
        currentContainingBlockComputedStyle = null;
      }
      const shouldDropCurrentNode = elementIsFixed ? !currentNodeIsContaining && !currentContainingBlockComputedStyle : !currentNodeIsContaining && computedStyle.position === "static" && !!currentContainingBlockComputedStyle && (currentContainingBlockComputedStyle.position === "absolute" || currentContainingBlockComputedStyle.position === "fixed") || isOverflowElement2(currentNode) && !currentNodeIsContaining && hasFixedPositionAncestor(element, currentNode);
      if (shouldDropCurrentNode) {
        result = result.filter((ancestor) => ancestor !== currentNode);
      } else {
        currentContainingBlockComputedStyle = computedStyle;
      }
      currentNode = getParentNode2(currentNode);
    }
    cache.set(element, result);
    return result;
  }
  function getClippingRect(_ref) {
    let {
      element,
      boundary,
      rootBoundary,
      strategy
    } = _ref;
    const elementClippingAncestors = boundary === "clippingAncestors" ? isTopLayer(element) ? [] : getClippingElementAncestors(element, this._c) : [].concat(boundary);
    const clippingAncestors = [...elementClippingAncestors, rootBoundary];
    const firstRect = getClientRectFromClippingAncestor(element, clippingAncestors[0], strategy);
    let top = firstRect.top;
    let right = firstRect.right;
    let bottom = firstRect.bottom;
    let left = firstRect.left;
    for (let i = 1; i < clippingAncestors.length; i++) {
      const rect = getClientRectFromClippingAncestor(element, clippingAncestors[i], strategy);
      top = max(rect.top, top);
      right = min(rect.right, right);
      bottom = min(rect.bottom, bottom);
      left = max(rect.left, left);
    }
    return {
      width: right - left,
      height: bottom - top,
      x: left,
      y: top
    };
  }
  function getDimensions(element) {
    const {
      width,
      height
    } = getCssDimensions(element);
    return {
      width,
      height
    };
  }
  function getRectRelativeToOffsetParent(element, offsetParent, strategy) {
    const isOffsetParentAnElement = isHTMLElement2(offsetParent);
    const documentElement = getDocumentElement2(offsetParent);
    const isFixed = strategy === "fixed";
    const rect = getBoundingClientRect(element, true, isFixed, offsetParent);
    let scroll = {
      scrollLeft: 0,
      scrollTop: 0
    };
    const offsets = createCoords(0);
    function setLeftRTLScrollbarOffset() {
      offsets.x = getWindowScrollBarX(documentElement);
    }
    if (isOffsetParentAnElement || !isOffsetParentAnElement && !isFixed) {
      if (getNodeName2(offsetParent) !== "body" || isOverflowElement2(documentElement)) {
        scroll = getNodeScroll(offsetParent);
      }
      if (isOffsetParentAnElement) {
        const offsetRect = getBoundingClientRect(offsetParent, true, isFixed, offsetParent);
        offsets.x = offsetRect.x + offsetParent.clientLeft;
        offsets.y = offsetRect.y + offsetParent.clientTop;
      } else if (documentElement) {
        setLeftRTLScrollbarOffset();
      }
    }
    if (isFixed && !isOffsetParentAnElement && documentElement) {
      setLeftRTLScrollbarOffset();
    }
    const htmlOffset = documentElement && !isOffsetParentAnElement && !isFixed ? getHTMLOffset(documentElement, scroll) : createCoords(0);
    const x = rect.left + scroll.scrollLeft - offsets.x - htmlOffset.x;
    const y = rect.top + scroll.scrollTop - offsets.y - htmlOffset.y;
    return {
      x,
      y,
      width: rect.width,
      height: rect.height
    };
  }
  function isStaticPositioned(element) {
    return getComputedStyle3(element).position === "static";
  }
  function getTrueOffsetParent(element, polyfill) {
    if (!isHTMLElement2(element) || getComputedStyle3(element).position === "fixed") {
      return null;
    }
    if (polyfill) {
      return polyfill(element);
    }
    let rawOffsetParent = element.offsetParent;
    if (getDocumentElement2(element) === rawOffsetParent) {
      rawOffsetParent = rawOffsetParent.ownerDocument.body;
    }
    return rawOffsetParent;
  }
  function getOffsetParent(element, polyfill) {
    const win = getWindow2(element);
    if (isTopLayer(element)) {
      return win;
    }
    if (!isHTMLElement2(element)) {
      let svgOffsetParent = getParentNode2(element);
      while (svgOffsetParent && !isLastTraversableNode(svgOffsetParent)) {
        if (isElement2(svgOffsetParent) && !isStaticPositioned(svgOffsetParent)) {
          return svgOffsetParent;
        }
        svgOffsetParent = getParentNode2(svgOffsetParent);
      }
      return win;
    }
    let offsetParent = getTrueOffsetParent(element, polyfill);
    while (offsetParent && isTableElement(offsetParent) && isStaticPositioned(offsetParent)) {
      offsetParent = getTrueOffsetParent(offsetParent, polyfill);
    }
    if (offsetParent && isLastTraversableNode(offsetParent) && isStaticPositioned(offsetParent) && !isContainingBlock(offsetParent)) {
      return win;
    }
    return offsetParent || getContainingBlock(element) || win;
  }
  var getElementRects = async function(data) {
    const getOffsetParentFn = this.getOffsetParent || getOffsetParent;
    const getDimensionsFn = this.getDimensions;
    const floatingDimensions = await getDimensionsFn(data.floating);
    return {
      reference: getRectRelativeToOffsetParent(data.reference, await getOffsetParentFn(data.floating), data.strategy),
      floating: {
        x: 0,
        y: 0,
        width: floatingDimensions.width,
        height: floatingDimensions.height
      }
    };
  };
  function isRTL(element) {
    return getComputedStyle3(element).direction === "rtl";
  }
  var platform = {
    convertOffsetParentRelativeRectToViewportRelativeRect,
    getDocumentElement: getDocumentElement2,
    getClippingRect,
    getOffsetParent,
    getElementRects,
    getClientRects,
    getDimensions,
    getScale,
    isElement: isElement2,
    isRTL
  };
  function rectsAreEqual(a, b) {
    return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
  }
  function observeMove(element, onMove) {
    let io = null;
    let timeoutId;
    const root = getDocumentElement2(element);
    function cleanup() {
      var _io;
      clearTimeout(timeoutId);
      (_io = io) == null || _io.disconnect();
      io = null;
    }
    function refresh(skip, threshold) {
      if (skip === void 0) {
        skip = false;
      }
      if (threshold === void 0) {
        threshold = 1;
      }
      cleanup();
      const elementRectForRootMargin = element.getBoundingClientRect();
      const {
        left,
        top,
        width,
        height
      } = elementRectForRootMargin;
      if (!skip) {
        onMove();
      }
      if (!width || !height) {
        return;
      }
      const insetTop = floor(top);
      const insetRight = floor(root.clientWidth - (left + width));
      const insetBottom = floor(root.clientHeight - (top + height));
      const insetLeft = floor(left);
      const rootMargin = -insetTop + "px " + -insetRight + "px " + -insetBottom + "px " + -insetLeft + "px";
      const options = {
        rootMargin,
        threshold: max(0, min(1, threshold)) || 1
      };
      let isFirstUpdate = true;
      function handleObserve(entries) {
        const ratio = entries[0].intersectionRatio;
        if (ratio !== threshold) {
          if (!isFirstUpdate) {
            return refresh();
          }
          if (!ratio) {
            timeoutId = setTimeout(() => {
              refresh(false, 1e-7);
            }, 1e3);
          } else {
            refresh(false, ratio);
          }
        }
        if (ratio === 1 && !rectsAreEqual(elementRectForRootMargin, element.getBoundingClientRect())) {
          refresh();
        }
        isFirstUpdate = false;
      }
      try {
        io = new IntersectionObserver(handleObserve, {
          ...options,
          // Handle <iframe>s
          root: root.ownerDocument
        });
      } catch (_e) {
        io = new IntersectionObserver(handleObserve, options);
      }
      io.observe(element);
    }
    refresh(true);
    return cleanup;
  }
  function autoUpdate(reference, floating, update, options) {
    if (options === void 0) {
      options = {};
    }
    const {
      ancestorScroll = true,
      ancestorResize = true,
      elementResize = typeof ResizeObserver === "function",
      layoutShift = typeof IntersectionObserver === "function",
      animationFrame = false
    } = options;
    const referenceEl = unwrapElement(reference);
    const ancestors = ancestorScroll || ancestorResize ? [...referenceEl ? getOverflowAncestors(referenceEl) : [], ...floating ? getOverflowAncestors(floating) : []] : [];
    ancestors.forEach((ancestor) => {
      ancestorScroll && ancestor.addEventListener("scroll", update, {
        passive: true
      });
      ancestorResize && ancestor.addEventListener("resize", update);
    });
    const cleanupIo = referenceEl && layoutShift ? observeMove(referenceEl, update) : null;
    let reobserveFrame = -1;
    let resizeObserver = null;
    if (elementResize) {
      resizeObserver = new ResizeObserver((_ref) => {
        let [firstEntry] = _ref;
        if (firstEntry && firstEntry.target === referenceEl && resizeObserver && floating) {
          resizeObserver.unobserve(floating);
          cancelAnimationFrame(reobserveFrame);
          reobserveFrame = requestAnimationFrame(() => {
            var _resizeObserver;
            (_resizeObserver = resizeObserver) == null || _resizeObserver.observe(floating);
          });
        }
        update();
      });
      if (referenceEl && !animationFrame) {
        resizeObserver.observe(referenceEl);
      }
      if (floating) {
        resizeObserver.observe(floating);
      }
    }
    let frameId;
    let prevRefRect = animationFrame ? getBoundingClientRect(reference) : null;
    if (animationFrame) {
      frameLoop();
    }
    function frameLoop() {
      const nextRefRect = getBoundingClientRect(reference);
      if (prevRefRect && !rectsAreEqual(prevRefRect, nextRefRect)) {
        update();
      }
      prevRefRect = nextRefRect;
      frameId = requestAnimationFrame(frameLoop);
    }
    update();
    return () => {
      var _resizeObserver2;
      ancestors.forEach((ancestor) => {
        ancestorScroll && ancestor.removeEventListener("scroll", update);
        ancestorResize && ancestor.removeEventListener("resize", update);
      });
      cleanupIo == null || cleanupIo();
      (_resizeObserver2 = resizeObserver) == null || _resizeObserver2.disconnect();
      resizeObserver = null;
      if (animationFrame) {
        cancelAnimationFrame(frameId);
      }
    };
  }
  var offset2 = offset;
  var shift2 = shift;
  var flip2 = flip;
  var size2 = size;
  var hide2 = hide;
  var arrow2 = arrow;
  var limitShift2 = limitShift;
  var computePosition2 = (reference, floating, options) => {
    const cache = /* @__PURE__ */ new Map();
    const mergedOptions = {
      platform,
      ...options
    };
    const platformWithCache = {
      ...mergedOptions.platform,
      _c: cache
    };
    return computePosition(reference, floating, {
      ...mergedOptions,
      platform: platformWithCache
    });
  };

  // node_modules/@zag-js/popper/dist/get-anchor.mjs
  function createDOMRect(x = 0, y = 0, width = 0, height = 0) {
    if (typeof DOMRect === "function") {
      return new DOMRect(x, y, width, height);
    }
    const rect = {
      x,
      y,
      width,
      height,
      top: y,
      right: x + width,
      bottom: y + height,
      left: x
    };
    return { ...rect, toJSON: () => rect };
  }
  function getDOMRect(anchorRect) {
    if (!anchorRect) return createDOMRect();
    const { x, y, width, height } = anchorRect;
    return createDOMRect(x, y, width, height);
  }
  function getAnchorElement(anchorElement, getAnchorRect) {
    return {
      contextElement: isHTMLElement(anchorElement) ? anchorElement : anchorElement?.contextElement,
      getBoundingClientRect: () => {
        const anchor = anchorElement;
        const anchorRect = getAnchorRect?.(anchor);
        if (anchorRect || !anchor) {
          return getDOMRect(anchorRect);
        }
        return anchor.getBoundingClientRect();
      }
    };
  }

  // node_modules/@zag-js/popper/dist/middleware.mjs
  var toVar = (value) => ({ variable: value, reference: `var(${value})` });
  var cssVars = {
    arrowSize: toVar("--arrow-size"),
    arrowSizeHalf: toVar("--arrow-size-half"),
    arrowBg: toVar("--arrow-background"),
    transformOrigin: toVar("--transform-origin"),
    arrowOffset: toVar("--arrow-offset")
  };
  var getSideAxis2 = (side) => side === "top" || side === "bottom" ? "y" : "x";
  function createTransformOriginMiddleware(opts, arrowEl) {
    return {
      name: "transformOrigin",
      fn(state) {
        const { elements, middlewareData, placement, rects, y } = state;
        const side = placement.split("-")[0];
        const axis = getSideAxis2(side);
        const arrowX = middlewareData.arrow?.x || 0;
        const arrowY = middlewareData.arrow?.y || 0;
        const arrowWidth = arrowEl?.clientWidth || 0;
        const arrowHeight = arrowEl?.clientHeight || 0;
        const transformX = arrowX + arrowWidth / 2;
        const transformY = arrowY + arrowHeight / 2;
        const shiftY = Math.abs(middlewareData.shift?.y || 0);
        const halfAnchorHeight = rects.reference.height / 2;
        const arrowOffset = arrowHeight / 2;
        const gutter = opts.offset?.mainAxis ?? opts.gutter;
        const sideOffsetValue = typeof gutter === "number" ? gutter + arrowOffset : gutter ?? arrowOffset;
        const isOverlappingAnchor = shiftY > sideOffsetValue;
        const adjacentTransformOrigin = {
          top: `${transformX}px calc(100% + ${sideOffsetValue}px)`,
          bottom: `${transformX}px ${-sideOffsetValue}px`,
          left: `calc(100% + ${sideOffsetValue}px) ${transformY}px`,
          right: `${-sideOffsetValue}px ${transformY}px`
        }[side];
        const overlapTransformOrigin = `${transformX}px ${rects.reference.y + halfAnchorHeight - y}px`;
        const useOverlap = Boolean(opts.overlap) && axis === "y" && isOverlappingAnchor;
        elements.floating.style.setProperty(
          cssVars.transformOrigin.variable,
          useOverlap ? overlapTransformOrigin : adjacentTransformOrigin
        );
        return {
          data: {
            transformOrigin: useOverlap ? overlapTransformOrigin : adjacentTransformOrigin
          }
        };
      }
    };
  }
  var rectMiddleware = {
    name: "rects",
    fn({ rects }) {
      return {
        data: rects
      };
    }
  };
  var shiftArrowMiddleware = (arrowEl) => {
    if (!arrowEl) return;
    return {
      name: "shiftArrow",
      fn({ placement, middlewareData }) {
        if (!middlewareData.arrow) return {};
        const { x, y } = middlewareData.arrow;
        const dir = placement.split("-")[0];
        Object.assign(arrowEl.style, {
          left: x != null ? `${x}px` : "",
          top: y != null ? `${y}px` : "",
          [dir]: `calc(100% + ${cssVars.arrowOffset.reference})`
        });
        return {};
      }
    };
  };

  // node_modules/@zag-js/popper/dist/placement.mjs
  function getPlacementDetails(placement) {
    const [side, align] = placement.split("-");
    return { side, align, hasAlign: align != null };
  }

  // node_modules/@zag-js/popper/dist/get-placement.mjs
  var defaultOptions = {
    strategy: "absolute",
    placement: "bottom",
    listeners: true,
    gutter: 8,
    flip: true,
    slide: true,
    overlap: false,
    sameWidth: false,
    fitViewport: false,
    overflowPadding: 8,
    arrowPadding: 4
  };
  function roundByDpr(win, value) {
    const dpr = win.devicePixelRatio || 1;
    return Math.round(value * dpr) / dpr;
  }
  function isApproximatelyEqual(a, b) {
    return a != null && Math.abs(a - b) < 0.5;
  }
  function resolveBoundaryOption(boundary) {
    if (typeof boundary === "function") return boundary();
    if (boundary === "clipping-ancestors") return "clippingAncestors";
    return boundary;
  }
  function getArrowMiddleware(arrowElement, doc, opts) {
    const element = arrowElement || doc.createElement("div");
    return arrow2({ element, padding: opts.arrowPadding });
  }
  function getOffsetMiddleware(arrowElement, opts) {
    if (isNull(opts.offset ?? opts.gutter)) return;
    return offset2(({ placement }) => {
      const arrowOffset = (arrowElement?.clientHeight || 0) / 2;
      const gutter = opts.offset?.mainAxis ?? opts.gutter;
      const mainAxis = typeof gutter === "number" ? gutter + arrowOffset : gutter ?? arrowOffset;
      const { hasAlign } = getPlacementDetails(placement);
      const shift22 = !hasAlign ? opts.shift : void 0;
      const crossAxis = opts.offset?.crossAxis ?? shift22;
      return compact({
        crossAxis,
        mainAxis,
        alignmentAxis: opts.shift
      });
    });
  }
  function getFlipMiddleware(opts) {
    if (!opts.flip) return;
    const boundary = resolveBoundaryOption(opts.boundary);
    return flip2({
      ...boundary ? { boundary } : void 0,
      padding: opts.overflowPadding,
      fallbackPlacements: opts.flip === true ? void 0 : opts.flip
    });
  }
  function getShiftMiddleware(opts) {
    if (!opts.slide && !opts.overlap) return;
    const boundary = resolveBoundaryOption(opts.boundary);
    return shift2({
      ...boundary ? { boundary } : void 0,
      mainAxis: opts.slide,
      crossAxis: opts.overlap,
      padding: opts.overflowPadding,
      limiter: limitShift2()
    });
  }
  function getSizeMiddleware(opts) {
    if (opts.sizeMiddleware === false && !opts.sameWidth && !opts.fitViewport) return;
    let lastReferenceWidth;
    let lastReferenceHeight;
    let lastAvailableWidth;
    let lastAvailableHeight;
    return size2({
      padding: opts.overflowPadding,
      apply({ elements, rects, availableHeight, availableWidth }) {
        const floating = elements.floating;
        const referenceWidth = Math.round(rects.reference.width);
        const referenceHeight = Math.round(rects.reference.height);
        availableWidth = Math.floor(availableWidth);
        availableHeight = Math.floor(availableHeight);
        if (!isApproximatelyEqual(lastReferenceWidth, referenceWidth)) {
          floating.style.setProperty("--reference-width", `${referenceWidth}px`);
          lastReferenceWidth = referenceWidth;
        }
        if (!isApproximatelyEqual(lastReferenceHeight, referenceHeight)) {
          floating.style.setProperty("--reference-height", `${referenceHeight}px`);
          lastReferenceHeight = referenceHeight;
        }
        if (!isApproximatelyEqual(lastAvailableWidth, availableWidth)) {
          floating.style.setProperty("--available-width", `${availableWidth}px`);
          lastAvailableWidth = availableWidth;
        }
        if (!isApproximatelyEqual(lastAvailableHeight, availableHeight)) {
          floating.style.setProperty("--available-height", `${availableHeight}px`);
          lastAvailableHeight = availableHeight;
        }
      }
    });
  }
  function hideWhenDetachedMiddleware(opts) {
    if (!opts.hideWhenDetached) return;
    return hide2({ strategy: "referenceHidden", boundary: resolveBoundaryOption(opts.boundary) ?? "clippingAncestors" });
  }
  function getAutoUpdateOptions(opts) {
    if (!opts) return {};
    if (opts === true) {
      return { ancestorResize: true, ancestorScroll: true, elementResize: true, layoutShift: true };
    }
    return opts;
  }
  function getPlacementImpl(referenceOrVirtual, floating, opts = {}) {
    const anchor = opts.getAnchorElement?.() ?? referenceOrVirtual;
    const reference = getAnchorElement(anchor, opts.getAnchorRect);
    if (!floating || !reference) return;
    const options = Object.assign({}, defaultOptions, opts);
    const arrowEl = floating.querySelector("[data-part=arrow]");
    const middleware = [
      getOffsetMiddleware(arrowEl, options),
      getFlipMiddleware(options),
      getShiftMiddleware(options),
      getArrowMiddleware(arrowEl, floating.ownerDocument, options),
      shiftArrowMiddleware(arrowEl),
      createTransformOriginMiddleware(
        { gutter: options.gutter, offset: options.offset, overlap: options.overlap },
        arrowEl
      ),
      getSizeMiddleware(options),
      hideWhenDetachedMiddleware(options),
      rectMiddleware
    ];
    const { placement, strategy, onComplete, onPositioned } = options;
    let lastX;
    let lastY;
    let zIndexComputed = false;
    const updatePosition = async () => {
      if (!reference || !floating) return;
      const pos = await computePosition2(reference, floating, {
        placement,
        middleware,
        strategy
      });
      onComplete?.(pos);
      const win = getWindow(floating);
      const x = roundByDpr(win, pos.x);
      const y = roundByDpr(win, pos.y);
      floating.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      if (!isApproximatelyEqual(lastX, x)) {
        floating.style.setProperty("--x", `${x}px`);
        lastX = x;
      }
      if (!isApproximatelyEqual(lastY, y)) {
        floating.style.setProperty("--y", `${y}px`);
        lastY = y;
      }
      if (options.hideWhenDetached) {
        const isHidden = pos.middlewareData.hide?.referenceHidden;
        if (isHidden) {
          floating.style.setProperty("visibility", "hidden");
          floating.style.setProperty("pointer-events", "none");
        } else {
          floating.style.removeProperty("visibility");
          floating.style.removeProperty("pointer-events");
        }
      }
      if (!zIndexComputed) {
        const contentEl = floating.firstElementChild;
        if (contentEl) {
          floating.style.setProperty("--z-index", getComputedStyle2(contentEl).zIndex);
          zIndexComputed = true;
        }
      }
    };
    const update = async () => {
      if (opts.updatePosition) {
        await opts.updatePosition({ updatePosition, floatingElement: floating });
        onPositioned?.({ placed: true });
      } else {
        await updatePosition();
      }
    };
    const autoUpdateOptions = getAutoUpdateOptions(options.listeners);
    const cancelAutoUpdate = options.listeners ? autoUpdate(reference, floating, update, autoUpdateOptions) : noop;
    update();
    return () => {
      cancelAutoUpdate?.();
      onPositioned?.({ placed: false });
    };
  }
  function getPlacement(referenceOrFn, floatingOrFn, opts = {}) {
    const { defer, ...options } = opts;
    const func = defer ? raf : (v) => v();
    const cleanups = [];
    cleanups.push(
      func(() => {
        const reference = typeof referenceOrFn === "function" ? referenceOrFn() : referenceOrFn;
        const floating = typeof floatingOrFn === "function" ? floatingOrFn() : floatingOrFn;
        cleanups.push(getPlacementImpl(reference, floating, options));
      })
    );
    return () => {
      cleanups.forEach((fn) => fn?.());
    };
  }

  // node_modules/@zag-js/popper/dist/get-styles.mjs
  var ARROW_FLOATING_STYLE = {
    bottom: "rotate(45deg)",
    left: "rotate(135deg)",
    top: "rotate(225deg)",
    right: "rotate(315deg)"
  };
  function getPlacementStyles(options = {}) {
    const { placement, sameWidth, fitViewport, strategy = "absolute" } = options;
    return {
      arrow: {
        position: "absolute",
        width: cssVars.arrowSize.reference,
        height: cssVars.arrowSize.reference,
        [cssVars.arrowSizeHalf.variable]: `calc(${cssVars.arrowSize.reference} / 2)`,
        [cssVars.arrowOffset.variable]: `calc(${cssVars.arrowSizeHalf.reference} * -1)`
      },
      arrowTip: {
        // @ts-expect-error - Fix this
        transform: placement ? ARROW_FLOATING_STYLE[placement.split("-")[0]] : void 0,
        background: cssVars.arrowBg.reference,
        top: "0",
        left: "0",
        width: "100%",
        height: "100%",
        position: "absolute",
        zIndex: "inherit"
      },
      floating: {
        position: strategy,
        isolation: "isolate",
        minWidth: sameWidth ? void 0 : "max-content",
        width: sameWidth ? "var(--reference-width)" : void 0,
        maxWidth: fitViewport ? "var(--available-width)" : void 0,
        maxHeight: fitViewport ? "var(--available-height)" : void 0,
        pointerEvents: !placement ? "none" : void 0,
        top: "0px",
        left: "0px",
        // move off-screen if placement is not defined
        transform: placement ? "translate3d(var(--x), var(--y), 0)" : "translate3d(0, -100vh, 0)",
        zIndex: "var(--z-index)"
      }
    };
  }

  // node_modules/@zag-js/interact-outside/dist/frame-utils.mjs
  function getWindowFrames(win) {
    const frames = {
      each(cb) {
        for (let i = 0; i < win.frames?.length; i += 1) {
          const frame = win.frames[i];
          if (frame) cb(frame);
        }
      },
      addEventListener(event, listener, options) {
        frames.each((frame) => {
          try {
            frame.document.addEventListener(event, listener, options);
          } catch {
          }
        });
        return () => {
          try {
            frames.removeEventListener(event, listener, options);
          } catch {
          }
        };
      },
      removeEventListener(event, listener, options) {
        frames.each((frame) => {
          try {
            frame.document.removeEventListener(event, listener, options);
          } catch {
          }
        });
      }
    };
    return frames;
  }
  function getParentWindow(win) {
    const parent = win.frameElement != null ? win.parent : null;
    return {
      addEventListener: (event, listener, options) => {
        try {
          parent?.addEventListener(event, listener, options);
        } catch {
        }
        return () => {
          try {
            parent?.removeEventListener(event, listener, options);
          } catch {
          }
        };
      },
      removeEventListener: (event, listener, options) => {
        try {
          parent?.removeEventListener(event, listener, options);
        } catch {
        }
      }
    };
  }

  // node_modules/@zag-js/interact-outside/dist/index.mjs
  var POINTER_OUTSIDE_EVENT = "pointerdown.outside";
  var FOCUS_OUTSIDE_EVENT = "focus.outside";
  function isComposedPathFocusable(composedPath) {
    for (const node of composedPath) {
      if (isHTMLElement(node) && isFocusable(node)) return true;
    }
    return false;
  }
  var isPointerEvent = (event) => "clientY" in event;
  function isEventPointWithin(node, event) {
    if (!isPointerEvent(event) || !node) return false;
    const rect = node.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    return rect.top <= event.clientY && event.clientY <= rect.top + rect.height && rect.left <= event.clientX && event.clientX <= rect.left + rect.width;
  }
  function isPointInRect(rect, point) {
    return rect.y <= point.y && point.y <= rect.y + rect.height && rect.x <= point.x && point.x <= rect.x + rect.width;
  }
  function isEventWithinScrollbar(event, ancestor) {
    if (!ancestor || !isPointerEvent(event)) return false;
    const isScrollableY = ancestor.scrollHeight > ancestor.clientHeight;
    const onScrollbarY = isScrollableY && event.clientX > ancestor.offsetLeft + ancestor.clientWidth;
    const isScrollableX = ancestor.scrollWidth > ancestor.clientWidth;
    const onScrollbarX = isScrollableX && event.clientY > ancestor.offsetTop + ancestor.clientHeight;
    const rect = {
      x: ancestor.offsetLeft,
      y: ancestor.offsetTop,
      width: ancestor.clientWidth + (isScrollableY ? 16 : 0),
      height: ancestor.clientHeight + (isScrollableX ? 16 : 0)
    };
    const point = {
      x: event.clientX,
      y: event.clientY
    };
    if (!isPointInRect(rect, point)) return false;
    return onScrollbarY || onScrollbarX;
  }
  function trackInteractOutsideImpl(node, options) {
    const {
      exclude,
      onFocusOutside,
      onPointerDownOutside,
      onInteractOutside,
      defer,
      followControlledElements = true
    } = options;
    if (!node) return;
    const doc = getDocument(node);
    const win = getWindow(node);
    const frames = getWindowFrames(win);
    const parentWin = getParentWindow(win);
    function isEventOutside(event, target) {
      if (!isHTMLElement(target)) return false;
      if (!target.isConnected) return false;
      if (contains(node, target)) return false;
      if (isEventPointWithin(node, event)) return false;
      if (followControlledElements && isControlledElement(node, target)) return false;
      const triggerEl = doc.querySelector(`[aria-controls="${node.id}"]`);
      if (triggerEl) {
        const triggerAncestor = getNearestOverflowAncestor(triggerEl);
        if (isEventWithinScrollbar(event, triggerAncestor)) return false;
      }
      const nodeAncestor = getNearestOverflowAncestor(node);
      if (isEventWithinScrollbar(event, nodeAncestor)) return false;
      return !exclude?.(target);
    }
    const pointerdownCleanups = /* @__PURE__ */ new Set();
    const isInShadowRoot = isShadowRoot(node?.getRootNode());
    function onPointerDown(event) {
      function handler(clickEvent) {
        const func = defer && !isTouchDevice() ? raf : (v) => v();
        const evt = clickEvent ?? event;
        const composedPath = evt?.composedPath?.() ?? [evt?.target];
        func(() => {
          const target = isInShadowRoot ? composedPath[0] : getEventTarget(event);
          if (!node || !isEventOutside(event, target)) return;
          if (onPointerDownOutside || onInteractOutside) {
            const handler2 = callAll(onPointerDownOutside, onInteractOutside);
            node.addEventListener(POINTER_OUTSIDE_EVENT, handler2, { once: true });
          }
          fireCustomEvent(node, POINTER_OUTSIDE_EVENT, {
            bubbles: false,
            cancelable: true,
            detail: {
              originalEvent: evt,
              contextmenu: isContextMenuEvent(evt),
              focusable: isComposedPathFocusable(composedPath),
              target
            }
          });
        });
      }
      if (event.pointerType === "touch") {
        pointerdownCleanups.forEach((fn) => fn());
        pointerdownCleanups.add(addDomEvent(doc, "click", handler, { once: true }));
        pointerdownCleanups.add(parentWin.addEventListener("click", handler, { once: true }));
        pointerdownCleanups.add(frames.addEventListener("click", handler, { once: true }));
      } else {
        handler();
      }
    }
    const cleanups = /* @__PURE__ */ new Set();
    const timer = setTimeout(() => {
      cleanups.add(addDomEvent(doc, "pointerdown", onPointerDown, true));
      cleanups.add(parentWin.addEventListener("pointerdown", onPointerDown, true));
      cleanups.add(frames.addEventListener("pointerdown", onPointerDown, true));
    }, 0);
    function onFocusin(event) {
      const func = defer ? raf : (v) => v();
      func(() => {
        const composedPath = event?.composedPath?.() ?? [event?.target];
        const target = isInShadowRoot ? composedPath[0] : getEventTarget(event);
        if (!node || !isEventOutside(event, target)) return;
        if (onFocusOutside || onInteractOutside) {
          const handler = callAll(onFocusOutside, onInteractOutside);
          node.addEventListener(FOCUS_OUTSIDE_EVENT, handler, { once: true });
        }
        fireCustomEvent(node, FOCUS_OUTSIDE_EVENT, {
          bubbles: false,
          cancelable: true,
          detail: {
            originalEvent: event,
            contextmenu: false,
            focusable: isFocusable(target),
            target
          }
        });
      });
    }
    if (!isTouchDevice()) {
      cleanups.add(addDomEvent(doc, "focusin", onFocusin, true));
      cleanups.add(parentWin.addEventListener("focusin", onFocusin, true));
      cleanups.add(frames.addEventListener("focusin", onFocusin, true));
    }
    return () => {
      clearTimeout(timer);
      pointerdownCleanups.forEach((fn) => fn());
      cleanups.forEach((fn) => fn());
    };
  }
  function trackInteractOutside(nodeOrFn, options) {
    const { defer } = options;
    const func = defer ? raf : (v) => v();
    const cleanups = [];
    cleanups.push(
      func(() => {
        const node = typeof nodeOrFn === "function" ? nodeOrFn() : nodeOrFn;
        cleanups.push(trackInteractOutsideImpl(node, options));
      })
    );
    return () => {
      cleanups.forEach((fn) => fn?.());
    };
  }
  function fireCustomEvent(el, type, init) {
    const win = el.ownerDocument.defaultView || window;
    const event = new win.CustomEvent(type, init);
    return el.dispatchEvent(event);
  }

  // node_modules/@zag-js/dismissable/dist/escape-keydown.mjs
  function trackEscapeKeydown(node, fn) {
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      if (event.isComposing) return;
      fn?.(event);
    };
    return addDomEvent(getDocument(node), "keydown", handleKeyDown, { capture: true });
  }

  // node_modules/@zag-js/dismissable/dist/layer-stack.mjs
  var LAYER_REQUEST_DISMISS_EVENT = "layer:request-dismiss";
  var layerStack = {
    layers: [],
    branches: [],
    recentlyRemoved: /* @__PURE__ */ new Set(),
    count() {
      return this.layers.length;
    },
    pointerBlockingLayers() {
      return this.layers.filter((layer) => layer.pointerBlocking);
    },
    topMostPointerBlockingLayer() {
      return [...this.pointerBlockingLayers()].slice(-1)[0];
    },
    hasPointerBlockingLayer() {
      return this.pointerBlockingLayers().length > 0;
    },
    isBelowPointerBlockingLayer(node) {
      const index = this.indexOf(node);
      const highestBlockingIndex = this.topMostPointerBlockingLayer() ? this.indexOf(this.topMostPointerBlockingLayer()?.node) : -1;
      return index < highestBlockingIndex;
    },
    isTopMost(node) {
      const layer = this.layers[this.count() - 1];
      return layer?.node === node;
    },
    getNestedLayers(node) {
      return Array.from(this.layers).slice(this.indexOf(node) + 1);
    },
    getLayersByType(type) {
      return this.layers.filter((layer) => layer.type === type);
    },
    getNestedLayersByType(node, type) {
      const index = this.indexOf(node);
      if (index === -1) return [];
      return this.layers.slice(index + 1).filter((layer) => layer.type === type);
    },
    getParentLayerOfType(node, type) {
      const index = this.indexOf(node);
      if (index <= 0) return void 0;
      return this.layers.slice(0, index).reverse().find((layer) => layer.type === type);
    },
    countNestedLayersOfType(node, type) {
      return this.getNestedLayersByType(node, type).length;
    },
    isInNestedLayer(node, target) {
      const inNested = this.getNestedLayers(node).some((layer) => contains(layer.node, target));
      if (inNested) return true;
      if (this.recentlyRemoved.size > 0) return true;
      return false;
    },
    isInBranch(target) {
      return Array.from(this.branches).some((branch) => contains(branch, target));
    },
    add(layer) {
      this.layers.push(layer);
      this.syncLayers();
    },
    addBranch(node) {
      this.branches.push(node);
    },
    remove(node) {
      const index = this.indexOf(node);
      if (index < 0) return;
      this.recentlyRemoved.add(node);
      nextTick(() => this.recentlyRemoved.delete(node));
      if (index < this.count() - 1) {
        const _layers = this.getNestedLayers(node);
        _layers.forEach((layer) => layerStack.dismiss(layer.node, node));
      }
      this.layers.splice(index, 1);
      this.syncLayers();
    },
    removeBranch(node) {
      const index = this.branches.indexOf(node);
      if (index >= 0) this.branches.splice(index, 1);
    },
    syncLayers() {
      this.layers.forEach((layer, index) => {
        layer.node.style.setProperty("--layer-index", `${index}`);
        layer.node.removeAttribute("data-nested");
        layer.node.removeAttribute("data-has-nested");
        const parentOfSameType = this.getParentLayerOfType(layer.node, layer.type);
        if (parentOfSameType) {
          layer.node.setAttribute("data-nested", layer.type);
        }
        const nestedCount = this.countNestedLayersOfType(layer.node, layer.type);
        if (nestedCount > 0) {
          layer.node.setAttribute("data-has-nested", layer.type);
        }
        layer.node.style.setProperty("--nested-layer-count", `${nestedCount}`);
      });
    },
    indexOf(node) {
      return this.layers.findIndex((layer) => layer.node === node);
    },
    dismiss(node, parent) {
      const index = this.indexOf(node);
      if (index === -1) return;
      const layer = this.layers[index];
      addListenerOnce(node, LAYER_REQUEST_DISMISS_EVENT, (event) => {
        layer.requestDismiss?.(event);
        if (!event.defaultPrevented) {
          layer?.dismiss();
        }
      });
      fireCustomEvent2(node, LAYER_REQUEST_DISMISS_EVENT, {
        originalLayer: node,
        targetLayer: parent,
        originalIndex: index,
        targetIndex: parent ? this.indexOf(parent) : -1
      });
      this.syncLayers();
    },
    clear() {
      this.remove(this.layers[0].node);
    }
  };
  function fireCustomEvent2(el, type, detail) {
    const win = el.ownerDocument.defaultView || window;
    const event = new win.CustomEvent(type, { cancelable: true, bubbles: true, detail });
    return el.dispatchEvent(event);
  }
  function addListenerOnce(el, type, callback) {
    el.addEventListener(type, callback, { once: true });
  }

  // node_modules/@zag-js/dismissable/dist/pointer-event-outside.mjs
  var originalBodyPointerEvents;
  function assignPointerEventToLayers() {
    layerStack.layers.forEach(({ node }) => {
      node.style.pointerEvents = layerStack.isBelowPointerBlockingLayer(node) ? "none" : "auto";
    });
  }
  function clearPointerEvent(node) {
    node.style.pointerEvents = "";
  }
  function disablePointerEventsOutside(node, persistentElements) {
    const doc = getDocument(node);
    const cleanups = [];
    if (layerStack.hasPointerBlockingLayer() && !doc.body.hasAttribute("data-inert")) {
      originalBodyPointerEvents = document.body.style.pointerEvents;
      queueMicrotask(() => {
        doc.body.style.pointerEvents = "none";
        doc.body.setAttribute("data-inert", "");
      });
    }
    persistentElements?.forEach((el) => {
      const [promise, abort] = waitForElement(
        () => {
          const node2 = el();
          return isHTMLElement(node2) ? node2 : null;
        },
        { timeout: 1e3 }
      );
      promise.then((el2) => cleanups.push(setStyle(el2, { pointerEvents: "auto" })));
      cleanups.push(abort);
    });
    return () => {
      if (layerStack.hasPointerBlockingLayer()) return;
      queueMicrotask(() => {
        doc.body.style.pointerEvents = originalBodyPointerEvents;
        doc.body.removeAttribute("data-inert");
        if (doc.body.style.length === 0) doc.body.removeAttribute("style");
      });
      cleanups.forEach((fn) => fn());
    };
  }

  // node_modules/@zag-js/dismissable/dist/dismissable-layer.mjs
  function trackDismissableElementImpl(node, options) {
    const { warnOnMissingNode = true } = options;
    if (warnOnMissingNode && !node) {
      warn("[@zag-js/dismissable] node is `null` or `undefined`");
      return;
    }
    if (!node) {
      return;
    }
    const { onDismiss, onRequestDismiss, pointerBlocking, exclude: excludeContainers, debug, type = "dialog" } = options;
    const layer = { dismiss: onDismiss, node, type, pointerBlocking, requestDismiss: onRequestDismiss };
    layerStack.add(layer);
    assignPointerEventToLayers();
    function onPointerDownOutside(event) {
      const target = getEventTarget(event.detail.originalEvent);
      if (layerStack.isBelowPointerBlockingLayer(node) || layerStack.isInBranch(target)) return;
      options.onPointerDownOutside?.(event);
      options.onInteractOutside?.(event);
      if (event.defaultPrevented) return;
      if (debug) {
        console.log("onPointerDownOutside:", event.detail.originalEvent);
      }
      onDismiss?.();
    }
    function onFocusOutside(event) {
      const target = getEventTarget(event.detail.originalEvent);
      if (layerStack.isInBranch(target)) return;
      options.onFocusOutside?.(event);
      options.onInteractOutside?.(event);
      if (event.defaultPrevented) return;
      if (debug) {
        console.log("onFocusOutside:", event.detail.originalEvent);
      }
      onDismiss?.();
    }
    function onEscapeKeyDown(event) {
      if (!layerStack.isTopMost(node)) return;
      options.onEscapeKeyDown?.(event);
      if (!event.defaultPrevented && onDismiss) {
        event.preventDefault();
        onDismiss();
      }
    }
    function exclude(target) {
      if (!node) return false;
      const containers = typeof excludeContainers === "function" ? excludeContainers() : excludeContainers;
      const _containers = Array.isArray(containers) ? containers : [containers];
      const persistentElements = options.persistentElements?.map((fn) => fn()).filter(isHTMLElement);
      if (persistentElements) _containers.push(...persistentElements);
      return _containers.some((node2) => contains(node2, target)) || layerStack.isInNestedLayer(node, target);
    }
    const cleanups = [
      pointerBlocking ? disablePointerEventsOutside(node, options.persistentElements) : void 0,
      trackEscapeKeydown(node, onEscapeKeyDown),
      trackInteractOutside(node, { exclude, onFocusOutside, onPointerDownOutside, defer: options.defer })
    ];
    return () => {
      layerStack.remove(node);
      assignPointerEventToLayers();
      clearPointerEvent(node);
      cleanups.forEach((fn) => fn?.());
    };
  }
  function trackDismissableElement(nodeOrFn, options) {
    const { defer } = options;
    const func = defer ? raf : (v) => v();
    const cleanups = [];
    cleanups.push(
      func(() => {
        const node = isFunction(nodeOrFn) ? nodeOrFn() : nodeOrFn;
        cleanups.push(trackDismissableElementImpl(node, options));
      })
    );
    return () => {
      cleanups.forEach((fn) => fn?.());
    };
  }

  // node_modules/@zag-js/dialog/dist/dialog.anatomy.mjs
  var anatomy2 = createAnatomy("dialog").parts(
    "trigger",
    "backdrop",
    "positioner",
    "content",
    "title",
    "description",
    "closeTrigger"
  );
  var parts2 = anatomy2.build();

  // node_modules/@zag-js/dialog/dist/dialog.dom.mjs
  var getPositionerId = (ctx) => ctx.ids?.positioner ?? `dialog:${ctx.id}:positioner`;
  var getBackdropId = (ctx) => ctx.ids?.backdrop ?? `dialog:${ctx.id}:backdrop`;
  var getContentId = (ctx) => ctx.ids?.content ?? `dialog:${ctx.id}:content`;
  var getTriggerId = (ctx) => ctx.ids?.trigger ?? `dialog:${ctx.id}:trigger`;
  var getTitleId = (ctx) => ctx.ids?.title ?? `dialog:${ctx.id}:title`;
  var getDescriptionId = (ctx) => ctx.ids?.description ?? `dialog:${ctx.id}:description`;
  var getCloseTriggerId = (ctx) => ctx.ids?.closeTrigger ?? `dialog:${ctx.id}:close`;
  var getContentEl = (ctx) => ctx.getById(getContentId(ctx));
  var getPositionerEl = (ctx) => ctx.getById(getPositionerId(ctx));
  var getBackdropEl = (ctx) => ctx.getById(getBackdropId(ctx));
  var getTriggerEl = (ctx) => ctx.getById(getTriggerId(ctx));
  var getTitleEl = (ctx) => ctx.getById(getTitleId(ctx));
  var getDescriptionEl = (ctx) => ctx.getById(getDescriptionId(ctx));
  var getCloseTriggerEl = (ctx) => ctx.getById(getCloseTriggerId(ctx));

  // node_modules/@zag-js/dialog/dist/dialog.connect.mjs
  function connect2(service, normalize) {
    const { state, send, context, prop, scope } = service;
    const ariaLabel = prop("aria-label");
    const open = state.matches("open");
    return {
      open,
      setOpen(nextOpen) {
        const open2 = state.matches("open");
        if (open2 === nextOpen) return;
        send({ type: nextOpen ? "OPEN" : "CLOSE" });
      },
      getTriggerProps() {
        return normalize.button({
          ...parts2.trigger.attrs,
          dir: prop("dir"),
          id: getTriggerId(scope),
          "aria-haspopup": "dialog",
          type: "button",
          "aria-expanded": open,
          "data-state": open ? "open" : "closed",
          "aria-controls": getContentId(scope),
          onClick(event) {
            if (event.defaultPrevented) return;
            send({ type: "TOGGLE" });
          }
        });
      },
      getBackdropProps() {
        return normalize.element({
          ...parts2.backdrop.attrs,
          dir: prop("dir"),
          hidden: !open,
          id: getBackdropId(scope),
          "data-state": open ? "open" : "closed"
        });
      },
      getPositionerProps() {
        return normalize.element({
          ...parts2.positioner.attrs,
          dir: prop("dir"),
          id: getPositionerId(scope),
          style: {
            pointerEvents: open ? void 0 : "none"
          }
        });
      },
      getContentProps() {
        const rendered = context.get("rendered");
        return normalize.element({
          ...parts2.content.attrs,
          dir: prop("dir"),
          role: prop("role"),
          hidden: !open,
          id: getContentId(scope),
          tabIndex: -1,
          "data-state": open ? "open" : "closed",
          "aria-modal": true,
          "aria-label": ariaLabel || void 0,
          "aria-labelledby": ariaLabel || !rendered.title ? void 0 : getTitleId(scope),
          "aria-describedby": rendered.description ? getDescriptionId(scope) : void 0
        });
      },
      getTitleProps() {
        return normalize.element({
          ...parts2.title.attrs,
          dir: prop("dir"),
          id: getTitleId(scope)
        });
      },
      getDescriptionProps() {
        return normalize.element({
          ...parts2.description.attrs,
          dir: prop("dir"),
          id: getDescriptionId(scope)
        });
      },
      getCloseTriggerProps() {
        return normalize.button({
          ...parts2.closeTrigger.attrs,
          dir: prop("dir"),
          id: getCloseTriggerId(scope),
          type: "button",
          onClick(event) {
            if (event.defaultPrevented) return;
            event.stopPropagation();
            send({ type: "CLOSE" });
          }
        });
      }
    };
  }

  // node_modules/@zag-js/aria-hidden/dist/walk-tree-outside.mjs
  var counterMap = /* @__PURE__ */ new WeakMap();
  var uncontrolledNodes = /* @__PURE__ */ new WeakMap();
  var markerMap = {};
  var lockCount = 0;
  var unwrapHost = (node) => node && (node.host || unwrapHost(node.parentNode));
  var correctTargets = (parent, targets) => targets.map((target) => {
    if (parent.contains(target)) return target;
    const correctedTarget = unwrapHost(target);
    if (correctedTarget && parent.contains(correctedTarget)) {
      return correctedTarget;
    }
    console.error("[zag-js > ariaHidden] target", target, "in not contained inside", parent, ". Doing nothing");
    return null;
  }).filter((x) => Boolean(x));
  var ignoreableNodes = /* @__PURE__ */ new Set(["script", "output", "status", "next-route-announcer"]);
  var isIgnoredNode = (node) => {
    if (ignoreableNodes.has(node.localName)) return true;
    if (node.role === "status") return true;
    if (node.hasAttribute("aria-live")) return true;
    return node.matches("[data-live-announcer]");
  };
  var walkTreeOutside = (originalTarget, props) => {
    const { parentNode, markerName, controlAttribute, explicitBooleanValue, followControlledElements = true } = props;
    const targets = correctTargets(parentNode, Array.isArray(originalTarget) ? originalTarget : [originalTarget]);
    markerMap[markerName] || (markerMap[markerName] = /* @__PURE__ */ new WeakMap());
    const markerCounter = markerMap[markerName];
    const hiddenNodes = [];
    const elementsToKeep = /* @__PURE__ */ new Set();
    const elementsToStop = new Set(targets);
    const keep = (el) => {
      if (!el || elementsToKeep.has(el)) return;
      elementsToKeep.add(el);
      keep(el.parentNode);
    };
    targets.forEach((target) => {
      keep(target);
      if (followControlledElements && isHTMLElement(target)) {
        findControlledElements(target, (controlledElement) => {
          keep(controlledElement);
        });
      }
    });
    const deep = (parent) => {
      if (!parent || elementsToStop.has(parent)) {
        return;
      }
      Array.prototype.forEach.call(parent.children, (node) => {
        if (elementsToKeep.has(node)) {
          deep(node);
        } else {
          try {
            if (isIgnoredNode(node)) return;
            const attr = node.getAttribute(controlAttribute);
            const alreadyHidden = explicitBooleanValue ? attr === "true" : attr !== null && attr !== "false";
            const counterValue = (counterMap.get(node) || 0) + 1;
            const markerValue = (markerCounter.get(node) || 0) + 1;
            counterMap.set(node, counterValue);
            markerCounter.set(node, markerValue);
            hiddenNodes.push(node);
            if (counterValue === 1 && alreadyHidden) {
              uncontrolledNodes.set(node, true);
            }
            if (markerValue === 1) {
              node.setAttribute(markerName, "");
            }
            if (!alreadyHidden) {
              node.setAttribute(controlAttribute, explicitBooleanValue ? "true" : "");
            }
          } catch (e) {
            console.error("[zag-js > ariaHidden] cannot operate on ", node, e);
          }
        }
      });
    };
    deep(parentNode);
    elementsToKeep.clear();
    lockCount++;
    return () => {
      hiddenNodes.forEach((node) => {
        const counterValue = counterMap.get(node) - 1;
        const markerValue = markerCounter.get(node) - 1;
        counterMap.set(node, counterValue);
        markerCounter.set(node, markerValue);
        if (!counterValue) {
          if (!uncontrolledNodes.has(node)) {
            node.removeAttribute(controlAttribute);
          }
          uncontrolledNodes.delete(node);
        }
        if (!markerValue) {
          node.removeAttribute(markerName);
        }
      });
      lockCount--;
      if (!lockCount) {
        counterMap = /* @__PURE__ */ new WeakMap();
        counterMap = /* @__PURE__ */ new WeakMap();
        uncontrolledNodes = /* @__PURE__ */ new WeakMap();
        markerMap = {};
      }
    };
  };

  // node_modules/@zag-js/aria-hidden/dist/aria-hidden.mjs
  var getParentNode3 = (originalTarget) => {
    const target = Array.isArray(originalTarget) ? originalTarget[0] : originalTarget;
    return target.ownerDocument.body;
  };
  var hideOthers = (originalTarget, parentNode = getParentNode3(originalTarget), markerName = "data-aria-hidden", followControlledElements = true) => {
    if (!parentNode) return;
    return walkTreeOutside(originalTarget, {
      parentNode,
      markerName,
      controlAttribute: "aria-hidden",
      explicitBooleanValue: true,
      followControlledElements
    });
  };

  // node_modules/@zag-js/aria-hidden/dist/index.mjs
  var raf2 = (fn) => {
    const frameId = requestAnimationFrame(() => fn());
    return () => cancelAnimationFrame(frameId);
  };
  function ariaHidden(targetsOrFn, options = {}) {
    const { defer = true } = options;
    const func = defer ? raf2 : (v) => v();
    const cleanups = [];
    cleanups.push(
      func(() => {
        const targets = typeof targetsOrFn === "function" ? targetsOrFn() : targetsOrFn;
        const elements = targets.filter(Boolean);
        if (elements.length === 0) return;
        cleanups.push(hideOthers(elements));
      })
    );
    return () => {
      cleanups.forEach((fn) => fn?.());
    };
  }

  // node_modules/@zag-js/focus-trap/dist/chunk-QZ7TP4HQ.mjs
  var __defProp5 = Object.defineProperty;
  var __defNormalProp4 = (obj, key, value) => key in obj ? __defProp5(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField4 = (obj, key, value) => __defNormalProp4(obj, typeof key !== "symbol" ? key + "" : key, value);

  // node_modules/@zag-js/focus-trap/dist/focus-trap.mjs
  var activeFocusTraps = {
    activateTrap(trapStack, trap) {
      if (trapStack.length > 0) {
        const activeTrap = trapStack[trapStack.length - 1];
        if (activeTrap !== trap) {
          activeTrap.pause();
        }
      }
      const trapIndex = trapStack.indexOf(trap);
      if (trapIndex === -1) {
        trapStack.push(trap);
      } else {
        trapStack.splice(trapIndex, 1);
        trapStack.push(trap);
      }
    },
    deactivateTrap(trapStack, trap) {
      const trapIndex = trapStack.indexOf(trap);
      if (trapIndex !== -1) {
        trapStack.splice(trapIndex, 1);
      }
      if (trapStack.length > 0) {
        trapStack[trapStack.length - 1].unpause();
      }
    }
  };
  var sharedTrapStack = [];
  var FocusTrap = class {
    constructor(elements, options) {
      __publicField4(this, "trapStack");
      __publicField4(this, "config");
      __publicField4(this, "doc");
      __publicField4(this, "state", {
        containers: [],
        containerGroups: [],
        tabbableGroups: [],
        nodeFocusedBeforeActivation: null,
        mostRecentlyFocusedNode: null,
        active: false,
        paused: false,
        delayInitialFocusTimer: void 0,
        recentNavEvent: void 0
      });
      __publicField4(this, "portalContainers", /* @__PURE__ */ new Set());
      __publicField4(this, "listenerCleanups", []);
      __publicField4(this, "handleFocus", (event) => {
        const target = getEventTarget(event);
        const targetContained = this.findContainerIndex(target, event) >= 0;
        if (targetContained || isDocument(target)) {
          if (targetContained) {
            this.state.mostRecentlyFocusedNode = target;
          }
        } else {
          event.stopImmediatePropagation();
          let nextNode;
          let navAcrossContainers = true;
          if (this.state.mostRecentlyFocusedNode) {
            if (getTabIndex(this.state.mostRecentlyFocusedNode) > 0) {
              const mruContainerIdx = this.findContainerIndex(this.state.mostRecentlyFocusedNode);
              const { tabbableNodes } = this.state.containerGroups[mruContainerIdx];
              if (tabbableNodes.length > 0) {
                const mruTabIdx = tabbableNodes.findIndex((node) => node === this.state.mostRecentlyFocusedNode);
                if (mruTabIdx >= 0) {
                  if (this.config.isKeyForward(this.state.recentNavEvent)) {
                    if (mruTabIdx + 1 < tabbableNodes.length) {
                      nextNode = tabbableNodes[mruTabIdx + 1];
                      navAcrossContainers = false;
                    }
                  } else {
                    if (mruTabIdx - 1 >= 0) {
                      nextNode = tabbableNodes[mruTabIdx - 1];
                      navAcrossContainers = false;
                    }
                  }
                }
              }
            } else {
              if (!this.state.containerGroups.some((g) => g.tabbableNodes.some((n) => getTabIndex(n) > 0))) {
                navAcrossContainers = false;
              }
            }
          } else {
            navAcrossContainers = false;
          }
          if (navAcrossContainers) {
            nextNode = this.findNextNavNode({
              // move FROM the MRU node, not event-related node (which will be the node that is
              //  outside the trap causing the focus escape we're trying to fix)
              target: this.state.mostRecentlyFocusedNode,
              isBackward: this.config.isKeyBackward(this.state.recentNavEvent)
            });
          }
          if (nextNode) {
            this.tryFocus(nextNode);
          } else {
            this.tryFocus(this.state.mostRecentlyFocusedNode || this.getInitialFocusNode());
          }
        }
        this.state.recentNavEvent = void 0;
      });
      __publicField4(this, "handlePointerDown", (event) => {
        const target = getEventTarget(event);
        if (this.findContainerIndex(target, event) >= 0) {
          return;
        }
        if (valueOrHandler(this.config.clickOutsideDeactivates, event)) {
          this.deactivate({ returnFocus: this.config.returnFocusOnDeactivate });
          return;
        }
        if (valueOrHandler(this.config.allowOutsideClick, event)) {
          return;
        }
        event.preventDefault();
      });
      __publicField4(this, "handleClick", (event) => {
        const target = getEventTarget(event);
        if (this.findContainerIndex(target, event) >= 0) {
          return;
        }
        if (valueOrHandler(this.config.clickOutsideDeactivates, event)) {
          return;
        }
        if (valueOrHandler(this.config.allowOutsideClick, event)) {
          return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
      });
      __publicField4(this, "handleTabKey", (event) => {
        if (this.config.isKeyForward(event) || this.config.isKeyBackward(event)) {
          this.state.recentNavEvent = event;
          const isBackward = this.config.isKeyBackward(event);
          const destinationNode = this.findNextNavNode({ event, isBackward });
          if (!destinationNode) return;
          if (isTabEvent(event)) {
            event.preventDefault();
          }
          this.tryFocus(destinationNode);
        }
      });
      __publicField4(this, "handleEscapeKey", (event) => {
        if (isEscapeEvent(event) && valueOrHandler(this.config.escapeDeactivates, event) !== false) {
          event.preventDefault();
          this.deactivate();
        }
      });
      __publicField4(this, "_mutationObserver");
      __publicField4(this, "setupMutationObserver", () => {
        const win = this.doc.defaultView || window;
        this._mutationObserver = new win.MutationObserver((mutations) => {
          const isFocusedNodeRemoved = mutations.some((mutation) => {
            const removedNodes = Array.from(mutation.removedNodes);
            return removedNodes.some((node) => node === this.state.mostRecentlyFocusedNode);
          });
          if (isFocusedNodeRemoved) {
            this.tryFocus(this.getInitialFocusNode());
          }
          const hasControlledChanges = mutations.some((mutation) => {
            if (mutation.type === "attributes" && (mutation.attributeName === "aria-controls" || mutation.attributeName === "aria-expanded")) {
              return true;
            }
            if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
              return Array.from(mutation.addedNodes).some((node) => {
                if (node.nodeType !== Node.ELEMENT_NODE) return false;
                const element = node;
                if (hasControllerElements(element)) {
                  return true;
                }
                if (element.id && !this.state.containers.some((c) => c.contains(element))) {
                  return isControlledByExpandedController(element);
                }
                return false;
              });
            }
            return false;
          });
          if (hasControlledChanges && this.state.active && !this.state.paused) {
            this.updateTabbableNodes();
            this.updatePortalContainers();
          }
        });
      });
      __publicField4(this, "updateObservedNodes", () => {
        this._mutationObserver?.disconnect();
        if (this.state.active && !this.state.paused) {
          this.state.containers.map((container) => {
            this._mutationObserver?.observe(container, {
              subtree: true,
              childList: true,
              attributes: true,
              attributeFilter: ["aria-controls", "aria-expanded"]
            });
          });
          this.portalContainers.forEach((portalContainer) => {
            this.observePortalContainer(portalContainer);
          });
        }
      });
      __publicField4(this, "getInitialFocusNode", () => {
        let node = this.getNodeForOption("initialFocus", { hasFallback: true });
        if (node === false) {
          return false;
        }
        if (node === void 0 || node && !isFocusable(node)) {
          const activeElement = getActiveElement(this.doc);
          if (activeElement && this.findContainerIndex(activeElement) >= 0) {
            node = activeElement;
          } else {
            const firstTabbableGroup = this.state.tabbableGroups[0];
            const firstTabbableNode = firstTabbableGroup && firstTabbableGroup.firstTabbableNode;
            node = firstTabbableNode || this.getNodeForOption("fallbackFocus");
          }
        } else if (node === null) {
          node = this.getNodeForOption("fallbackFocus");
        }
        if (!node) {
          throw new Error("Your focus-trap needs to have at least one focusable element");
        }
        if (!node.isConnected) {
          node = this.getNodeForOption("fallbackFocus");
        }
        return node;
      });
      __publicField4(this, "tryFocus", (node) => {
        if (node === false) return;
        if (node === getActiveElement(this.doc)) return;
        if (!node || !node.focus) {
          this.tryFocus(this.getInitialFocusNode());
          return;
        }
        node.focus({ preventScroll: !!this.config.preventScroll });
        this.state.mostRecentlyFocusedNode = node;
        if (isSelectableInput(node)) {
          node.select();
        }
      });
      __publicField4(this, "deactivate", (deactivateOptions) => {
        if (!this.state.active) return this;
        const options2 = {
          onDeactivate: this.config.onDeactivate,
          onPostDeactivate: this.config.onPostDeactivate,
          checkCanReturnFocus: this.config.checkCanReturnFocus,
          ...deactivateOptions
        };
        clearTimeout(this.state.delayInitialFocusTimer);
        this.state.delayInitialFocusTimer = void 0;
        this.removeListeners();
        this.state.active = false;
        this.state.paused = false;
        this.updateObservedNodes();
        activeFocusTraps.deactivateTrap(this.trapStack, this);
        this.portalContainers.clear();
        const onDeactivate = this.getOption(options2, "onDeactivate");
        const onPostDeactivate = this.getOption(options2, "onPostDeactivate");
        const checkCanReturnFocus = this.getOption(options2, "checkCanReturnFocus");
        const returnFocus = this.getOption(options2, "returnFocus", "returnFocusOnDeactivate");
        onDeactivate?.();
        const finishDeactivation = () => {
          delay(() => {
            if (returnFocus) {
              const returnFocusNode = this.getReturnFocusNode(this.state.nodeFocusedBeforeActivation);
              this.tryFocus(returnFocusNode);
            }
            onPostDeactivate?.();
          });
        };
        if (returnFocus && checkCanReturnFocus) {
          const returnFocusNode = this.getReturnFocusNode(this.state.nodeFocusedBeforeActivation);
          checkCanReturnFocus(returnFocusNode).then(finishDeactivation, finishDeactivation);
          return this;
        }
        finishDeactivation();
        return this;
      });
      __publicField4(this, "pause", (pauseOptions) => {
        if (this.state.paused || !this.state.active) {
          return this;
        }
        const onPause = this.getOption(pauseOptions, "onPause");
        const onPostPause = this.getOption(pauseOptions, "onPostPause");
        this.state.paused = true;
        onPause?.();
        this.removeListeners();
        this.updateObservedNodes();
        onPostPause?.();
        return this;
      });
      __publicField4(this, "unpause", (unpauseOptions) => {
        if (!this.state.paused || !this.state.active) {
          return this;
        }
        const onUnpause = this.getOption(unpauseOptions, "onUnpause");
        const onPostUnpause = this.getOption(unpauseOptions, "onPostUnpause");
        this.state.paused = false;
        onUnpause?.();
        this.updateTabbableNodes();
        this.addListeners();
        this.updateObservedNodes();
        onPostUnpause?.();
        return this;
      });
      __publicField4(this, "updateContainerElements", (containerElements) => {
        this.state.containers = Array.isArray(containerElements) ? containerElements.filter(Boolean) : [containerElements].filter(Boolean);
        if (this.state.active) {
          this.updateTabbableNodes();
        }
        this.updateObservedNodes();
        return this;
      });
      __publicField4(this, "getReturnFocusNode", (previousActiveElement) => {
        const node = this.getNodeForOption("setReturnFocus", {
          params: [previousActiveElement]
        });
        return node ? node : node === false ? false : previousActiveElement;
      });
      __publicField4(this, "getOption", (configOverrideOptions, optionName, configOptionName) => {
        return configOverrideOptions && configOverrideOptions[optionName] !== void 0 ? configOverrideOptions[optionName] : (
          // @ts-expect-error
          this.config[configOptionName || optionName]
        );
      });
      __publicField4(this, "getNodeForOption", (optionName, { hasFallback = false, params = [] } = {}) => {
        let optionValue = this.config[optionName];
        if (typeof optionValue === "function") optionValue = optionValue(...params);
        if (optionValue === true) optionValue = void 0;
        if (!optionValue) {
          if (optionValue === void 0 || optionValue === false) {
            return optionValue;
          }
          throw new Error(`\`${optionName}\` was specified but was not a node, or did not return a node`);
        }
        let node = optionValue;
        if (typeof optionValue === "string") {
          try {
            node = this.doc.querySelector(optionValue);
          } catch (err) {
            throw new Error(`\`${optionName}\` appears to be an invalid selector; error="${err.message}"`);
          }
          if (!node) {
            if (!hasFallback) {
              throw new Error(`\`${optionName}\` as selector refers to no known node`);
            }
          }
        }
        return node;
      });
      __publicField4(this, "findNextNavNode", (opts) => {
        const { event, isBackward = false } = opts;
        const target = opts.target || getEventTarget(event);
        this.updateTabbableNodes();
        let destinationNode = null;
        if (this.state.tabbableGroups.length > 0) {
          const containerIndex = this.findContainerIndex(target, event);
          const containerGroup = containerIndex >= 0 ? this.state.containerGroups[containerIndex] : void 0;
          if (containerIndex < 0) {
            if (isBackward) {
              destinationNode = this.state.tabbableGroups[this.state.tabbableGroups.length - 1].lastTabbableNode;
            } else {
              destinationNode = this.state.tabbableGroups[0].firstTabbableNode;
            }
          } else if (isBackward) {
            let startOfGroupIndex = this.state.tabbableGroups.findIndex(
              ({ firstTabbableNode }) => target === firstTabbableNode
            );
            if (startOfGroupIndex < 0 && (containerGroup?.container === target || isFocusable(target) && !isTabbable(target) && !containerGroup?.nextTabbableNode(target, false))) {
              startOfGroupIndex = containerIndex;
            }
            if (startOfGroupIndex >= 0) {
              const destinationGroupIndex = startOfGroupIndex === 0 ? this.state.tabbableGroups.length - 1 : startOfGroupIndex - 1;
              const destinationGroup = this.state.tabbableGroups[destinationGroupIndex];
              destinationNode = getTabIndex(target) >= 0 ? destinationGroup.lastTabbableNode : destinationGroup.lastDomTabbableNode;
            } else if (!isTabEvent(event)) {
              destinationNode = containerGroup?.nextTabbableNode(target, false);
            }
          } else {
            let lastOfGroupIndex = this.state.tabbableGroups.findIndex(
              ({ lastTabbableNode }) => target === lastTabbableNode
            );
            if (lastOfGroupIndex < 0 && (containerGroup?.container === target || isFocusable(target) && !isTabbable(target) && !containerGroup?.nextTabbableNode(target))) {
              lastOfGroupIndex = containerIndex;
            }
            if (lastOfGroupIndex >= 0) {
              const destinationGroupIndex = lastOfGroupIndex === this.state.tabbableGroups.length - 1 ? 0 : lastOfGroupIndex + 1;
              const destinationGroup = this.state.tabbableGroups[destinationGroupIndex];
              destinationNode = getTabIndex(target) >= 0 ? destinationGroup.firstTabbableNode : destinationGroup.firstDomTabbableNode;
            } else if (!isTabEvent(event)) {
              destinationNode = containerGroup?.nextTabbableNode(target);
            }
          }
        } else {
          destinationNode = this.getNodeForOption("fallbackFocus");
        }
        return destinationNode;
      });
      this.trapStack = options.trapStack || sharedTrapStack;
      const config = {
        returnFocusOnDeactivate: true,
        escapeDeactivates: true,
        delayInitialFocus: true,
        followControlledElements: true,
        isKeyForward,
        isKeyBackward,
        ...options
      };
      this.doc = config.document || getDocument(Array.isArray(elements) ? elements[0] : elements);
      this.config = config;
      this.updateContainerElements(elements);
      this.setupMutationObserver();
    }
    addPortalContainer(controlledElement) {
      const portalContainer = controlledElement.parentElement;
      if (portalContainer && !this.portalContainers.has(portalContainer)) {
        this.portalContainers.add(portalContainer);
        if (this.state.active && !this.state.paused) {
          this.observePortalContainer(portalContainer);
        }
      }
    }
    observePortalContainer(portalContainer) {
      this._mutationObserver?.observe(portalContainer, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["aria-controls", "aria-expanded"]
      });
    }
    updatePortalContainers() {
      if (!this.config.followControlledElements) return;
      this.state.containers.forEach((container) => {
        const controlledElements = getControlledElements(container);
        controlledElements.forEach((controlledElement) => {
          this.addPortalContainer(controlledElement);
        });
      });
    }
    get active() {
      return this.state.active;
    }
    get paused() {
      return this.state.paused;
    }
    findContainerIndex(element, event) {
      const composedPath = typeof event?.composedPath === "function" ? event.composedPath() : void 0;
      return this.state.containerGroups.findIndex(
        ({ container, tabbableNodes }) => container.contains(element) || composedPath?.includes(container) || tabbableNodes.find((node) => node === element) || this.isControlledElement(container, element)
      );
    }
    isControlledElement(container, element) {
      if (!this.config.followControlledElements) return false;
      return isControlledElement(container, element);
    }
    updateTabbableNodes() {
      this.state.containerGroups = this.state.containers.map((container) => {
        const tabbableNodes = getTabbables(container, { getShadowRoot: this.config.getShadowRoot });
        const focusableNodes = getFocusables(container, { getShadowRoot: this.config.getShadowRoot });
        const firstTabbableNode = tabbableNodes[0];
        const lastTabbableNode = tabbableNodes[tabbableNodes.length - 1];
        const firstDomTabbableNode = firstTabbableNode;
        const lastDomTabbableNode = lastTabbableNode;
        let posTabIndexesFound = false;
        for (let i = 0; i < tabbableNodes.length; i++) {
          if (getTabIndex(tabbableNodes[i]) > 0) {
            posTabIndexesFound = true;
            break;
          }
        }
        function nextTabbableNode(node, forward = true) {
          const nodeIdx = tabbableNodes.indexOf(node);
          if (nodeIdx >= 0) {
            return tabbableNodes[nodeIdx + (forward ? 1 : -1)];
          }
          const focusableIdx = focusableNodes.indexOf(node);
          if (focusableIdx < 0) return void 0;
          if (forward) {
            for (let i = focusableIdx + 1; i < focusableNodes.length; i++) {
              if (isTabbable(focusableNodes[i])) return focusableNodes[i];
            }
          } else {
            for (let i = focusableIdx - 1; i >= 0; i--) {
              if (isTabbable(focusableNodes[i])) return focusableNodes[i];
            }
          }
          return void 0;
        }
        return {
          container,
          tabbableNodes,
          focusableNodes,
          posTabIndexesFound,
          firstTabbableNode,
          lastTabbableNode,
          firstDomTabbableNode,
          lastDomTabbableNode,
          nextTabbableNode
        };
      });
      this.state.tabbableGroups = this.state.containerGroups.filter((group2) => group2.tabbableNodes.length > 0);
      if (this.state.tabbableGroups.length <= 0 && !this.getNodeForOption("fallbackFocus")) {
        throw new Error(
          "Your focus-trap must have at least one container with at least one tabbable node in it at all times"
        );
      }
      if (this.state.containerGroups.find((g) => g.posTabIndexesFound) && this.state.containerGroups.length > 1) {
        throw new Error(
          "At least one node with a positive tabindex was found in one of your focus-trap's multiple containers. Positive tabindexes are only supported in single-container focus-traps."
        );
      }
    }
    addListeners() {
      if (!this.state.active) return;
      activeFocusTraps.activateTrap(this.trapStack, this);
      this.state.delayInitialFocusTimer = this.config.delayInitialFocus ? delay(() => {
        this.tryFocus(this.getInitialFocusNode());
      }) : this.tryFocus(this.getInitialFocusNode());
      this.listenerCleanups.push(
        addDomEvent(this.doc, "focusin", this.handleFocus, true),
        addDomEvent(this.doc, "mousedown", this.handlePointerDown, { capture: true, passive: false }),
        addDomEvent(this.doc, "touchstart", this.handlePointerDown, { capture: true, passive: false }),
        addDomEvent(this.doc, "click", this.handleClick, { capture: true, passive: false }),
        addDomEvent(this.doc, "keydown", this.handleTabKey, { capture: true, passive: false }),
        addDomEvent(this.doc, "keydown", this.handleEscapeKey)
      );
      return this;
    }
    removeListeners() {
      if (!this.state.active) return;
      this.listenerCleanups.forEach((cleanup) => cleanup());
      this.listenerCleanups = [];
      return this;
    }
    activate(activateOptions) {
      if (this.state.active) {
        return this;
      }
      const onActivate = this.getOption(activateOptions, "onActivate");
      const onPostActivate = this.getOption(activateOptions, "onPostActivate");
      const checkCanFocusTrap = this.getOption(activateOptions, "checkCanFocusTrap");
      if (!checkCanFocusTrap) {
        this.updateTabbableNodes();
      }
      this.state.active = true;
      this.state.paused = false;
      this.state.nodeFocusedBeforeActivation = getActiveElement(this.doc);
      onActivate?.();
      const finishActivation = () => {
        if (checkCanFocusTrap) {
          this.updateTabbableNodes();
        }
        this.addListeners();
        this.updateObservedNodes();
        onPostActivate?.();
      };
      if (checkCanFocusTrap) {
        checkCanFocusTrap(this.state.containers.concat()).then(finishActivation, finishActivation);
        return this;
      }
      finishActivation();
      return this;
    }
  };
  var isKeyboardEvent = (event) => event?.type === "keydown";
  var isTabEvent = (event) => isKeyboardEvent(event) && event?.key === "Tab";
  var isKeyForward = (e) => isKeyboardEvent(e) && e.key === "Tab" && !e?.shiftKey;
  var isKeyBackward = (e) => isKeyboardEvent(e) && e.key === "Tab" && e?.shiftKey;
  var valueOrHandler = (value, ...params) => typeof value === "function" ? value(...params) : value;
  var isEscapeEvent = (event) => !event.isComposing && event.key === "Escape";
  var delay = (fn) => setTimeout(fn, 0);
  var isSelectableInput = (node) => node.localName === "input" && "select" in node && typeof node.select === "function";

  // node_modules/@zag-js/focus-trap/dist/index.mjs
  function trapFocus(el, options = {}) {
    let trap;
    const cleanup = raf(() => {
      const elements = Array.isArray(el) ? el : [el];
      const resolvedElements = elements.map((e) => typeof e === "function" ? e() : e).filter((e) => e != null);
      if (resolvedElements.length === 0) return;
      const primaryEl = resolvedElements[0];
      trap = new FocusTrap(resolvedElements, {
        escapeDeactivates: false,
        allowOutsideClick: true,
        preventScroll: true,
        returnFocusOnDeactivate: true,
        delayInitialFocus: false,
        fallbackFocus: primaryEl,
        ...options,
        document: getDocument(primaryEl)
      });
      try {
        trap.activate();
      } catch {
      }
    });
    return function destroy() {
      trap?.deactivate();
      cleanup();
    };
  }

  // node_modules/@zag-js/remove-scroll/dist/index.mjs
  var LOCK_CLASSNAME = "data-scroll-lock";
  function getPaddingProperty(documentElement) {
    const documentLeft = documentElement.getBoundingClientRect().left;
    const scrollbarX = Math.round(documentLeft) + documentElement.scrollLeft;
    return scrollbarX ? "paddingLeft" : "paddingRight";
  }
  function hasStableScrollbarGutter(element) {
    const styles = getComputedStyle2(element);
    const scrollbarGutter = styles?.scrollbarGutter;
    return scrollbarGutter === "stable" || scrollbarGutter?.startsWith("stable ") === true;
  }
  function preventBodyScroll(_document) {
    const doc = _document ?? document;
    const win = doc.defaultView ?? window;
    const { documentElement, body } = doc;
    const locked = body.hasAttribute(LOCK_CLASSNAME);
    if (locked) return;
    const hasStableGutter = hasStableScrollbarGutter(documentElement) || hasStableScrollbarGutter(body);
    const scrollbarWidth = win.innerWidth - documentElement.clientWidth;
    body.setAttribute(LOCK_CLASSNAME, "");
    const setScrollbarWidthProperty = () => setStyleProperty(documentElement, "--scrollbar-width", `${scrollbarWidth}px`);
    const paddingProperty = getPaddingProperty(documentElement);
    const setBodyStyle = () => {
      const styles = {
        overflow: "hidden"
      };
      if (!hasStableGutter && scrollbarWidth > 0) {
        styles[paddingProperty] = `${scrollbarWidth}px`;
      }
      return setStyle(body, styles);
    };
    const setBodyStyleIOS = () => {
      const { scrollX, scrollY, visualViewport } = win;
      const offsetLeft = visualViewport?.offsetLeft ?? 0;
      const offsetTop = visualViewport?.offsetTop ?? 0;
      const styles = {
        position: "fixed",
        overflow: "hidden",
        top: `${-(scrollY - Math.floor(offsetTop))}px`,
        left: `${-(scrollX - Math.floor(offsetLeft))}px`,
        right: "0"
      };
      if (!hasStableGutter && scrollbarWidth > 0) {
        styles[paddingProperty] = `${scrollbarWidth}px`;
      }
      const restoreStyle = setStyle(body, styles);
      return () => {
        restoreStyle?.();
        win.scrollTo({ left: scrollX, top: scrollY, behavior: "instant" });
      };
    };
    const cleanups = [setScrollbarWidthProperty(), isIos() ? setBodyStyleIOS() : setBodyStyle()];
    return () => {
      cleanups.forEach((fn) => fn?.());
      body.removeAttribute(LOCK_CLASSNAME);
    };
  }

  // node_modules/@zag-js/dialog/dist/dialog.machine.mjs
  var machine2 = createMachine({
    props({ props, scope }) {
      const alertDialog = props.role === "alertdialog";
      const initialFocusEl = alertDialog ? () => getCloseTriggerEl(scope) : void 0;
      const modal = typeof props.modal === "boolean" ? props.modal : true;
      return {
        role: "dialog",
        modal,
        trapFocus: modal,
        preventScroll: modal,
        closeOnInteractOutside: modal && !alertDialog,
        closeOnEscape: true,
        restoreFocus: true,
        initialFocusEl,
        ...props
      };
    },
    initialState({ prop }) {
      const open = prop("open") || prop("defaultOpen");
      return open ? "open" : "closed";
    },
    context({ bindable: bindable2 }) {
      return {
        rendered: bindable2(() => ({
          defaultValue: { title: true, description: true }
        }))
      };
    },
    watch({ track, action, prop }) {
      track([() => prop("open")], () => {
        action(["toggleVisibility"]);
      });
    },
    states: {
      open: {
        entry: ["checkRenderedElements", "syncZIndex"],
        effects: ["trackDismissableElement", "trapFocus", "preventScroll", "hideContentBelow"],
        on: {
          "CONTROLLED.CLOSE": {
            target: "closed"
          },
          CLOSE: [
            {
              guard: "isOpenControlled",
              actions: ["invokeOnClose"]
            },
            {
              target: "closed",
              actions: ["invokeOnClose"]
            }
          ],
          TOGGLE: [
            {
              guard: "isOpenControlled",
              actions: ["invokeOnClose"]
            },
            {
              target: "closed",
              actions: ["invokeOnClose"]
            }
          ]
        }
      },
      closed: {
        on: {
          "CONTROLLED.OPEN": {
            target: "open"
          },
          OPEN: [
            {
              guard: "isOpenControlled",
              actions: ["invokeOnOpen"]
            },
            {
              target: "open",
              actions: ["invokeOnOpen"]
            }
          ],
          TOGGLE: [
            {
              guard: "isOpenControlled",
              actions: ["invokeOnOpen"]
            },
            {
              target: "open",
              actions: ["invokeOnOpen"]
            }
          ]
        }
      }
    },
    implementations: {
      guards: {
        isOpenControlled: ({ prop }) => prop("open") != void 0
      },
      effects: {
        trackDismissableElement({ scope, send, prop }) {
          const getContentEl22 = () => getContentEl(scope);
          return trackDismissableElement(getContentEl22, {
            type: "dialog",
            defer: true,
            pointerBlocking: prop("modal"),
            exclude: [getTriggerEl(scope)],
            onInteractOutside(event) {
              prop("onInteractOutside")?.(event);
              if (!prop("closeOnInteractOutside")) {
                event.preventDefault();
              }
            },
            persistentElements: prop("persistentElements"),
            onFocusOutside: prop("onFocusOutside"),
            onPointerDownOutside: prop("onPointerDownOutside"),
            onRequestDismiss: prop("onRequestDismiss"),
            onEscapeKeyDown(event) {
              prop("onEscapeKeyDown")?.(event);
              if (!prop("closeOnEscape")) {
                event.preventDefault();
              }
            },
            onDismiss() {
              send({ type: "CLOSE", src: "interact-outside" });
            }
          });
        },
        preventScroll({ scope, prop }) {
          if (!prop("preventScroll")) return;
          return preventBodyScroll(scope.getDoc());
        },
        trapFocus({ scope, prop }) {
          if (!prop("trapFocus")) return;
          const contentEl = () => getContentEl(scope);
          return trapFocus(contentEl, {
            preventScroll: true,
            returnFocusOnDeactivate: !!prop("restoreFocus"),
            initialFocus: prop("initialFocusEl"),
            setReturnFocus: (el) => prop("finalFocusEl")?.() ?? getTriggerEl(scope) ?? el,
            getShadowRoot: true
          });
        },
        hideContentBelow({ scope, prop }) {
          if (!prop("modal")) return;
          const getElements = () => [getContentEl(scope)];
          return ariaHidden(getElements, { defer: true });
        }
      },
      actions: {
        checkRenderedElements({ context, scope }) {
          raf(() => {
            context.set("rendered", {
              title: !!getTitleEl(scope),
              description: !!getDescriptionEl(scope)
            });
          });
        },
        syncZIndex({ scope }) {
          raf(() => {
            const contentEl = getContentEl(scope);
            if (!contentEl) return;
            const styles = getComputedStyle2(contentEl);
            const elems = [getPositionerEl(scope), getBackdropEl(scope)];
            elems.forEach((node) => {
              node?.style.setProperty("--z-index", styles.zIndex);
              node?.style.setProperty("--layer-index", styles.getPropertyValue("--layer-index"));
            });
          });
        },
        invokeOnClose({ prop }) {
          prop("onOpenChange")?.({ open: false });
        },
        invokeOnOpen({ prop }) {
          prop("onOpenChange")?.({ open: true });
        },
        toggleVisibility({ prop, send, event }) {
          send({
            type: prop("open") ? "CONTROLLED.OPEN" : "CONTROLLED.CLOSE",
            previousEvent: event
          });
        }
      }
    }
  });

  // packages/gea-ui/src/components/dialog.tsx
  var Dialog = class extends ZagComponent {
    constructor(...args) {
      super(...args);
      try {
        const props = this.props;
        this.__geaCond_0 = !!this.props.triggerLabel;
        this.__geaCond_1 = !!this.props.title;
        this.__geaCond_2 = !!this.props.description;
      } catch {
      }
      this.__geaRegisterCond(0, "c0", () => {
        const props = this.props;
        return this.props.triggerLabel;
      }, () => {
        const props = this.props;
        return `<button data-part="trigger" class="dialog-trigger">${this.props.triggerLabel}</button>`;
      }, null);
      this.__geaRegisterCond(1, "c1", () => {
        const props = this.props;
        return this.props.title;
      }, () => {
        const props = this.props;
        return `<h2 data-part="title" class="dialog-title text-lg font-semibold mb-2">${this.props.title}</h2>`;
      }, null);
      this.__geaRegisterCond(2, "c2", () => {
        const props = this.props;
        return this.props.description;
      }, () => {
        const props = this.props;
        return `<p data-part="description" class="dialog-description text-sm text-gray-500 mb-4">${this.props.description}</p>`;
      }, null);
    }
    createMachine(_props) {
      return machine2;
    }
    getMachineProps(props) {
      return {
        id: this.id,
        open: props.open,
        defaultOpen: props.defaultOpen,
        modal: props.modal ?? true,
        closeOnInteractOutside: props.closeOnInteractOutside ?? true,
        closeOnEscape: props.closeOnEscape ?? true,
        trapFocus: props.trapFocus ?? true,
        preventScroll: props.preventScroll ?? true,
        role: props.role ?? "dialog",
        "aria-label": props["aria-label"],
        onOpenChange: (details) => {
          this.open = details.open;
          props.onOpenChange?.(details);
        }
      };
    }
    connectApi(service) {
      return connect2(service, normalizeProps);
    }
    getSpreadMap() {
      return {
        '[data-part="backdrop"]': "getBackdropProps",
        '[data-part="positioner"]': (api) => ({
          ...api.getPositionerProps(),
          hidden: !api.open
        }),
        '[data-part="content"]': "getContentProps",
        '[data-part="title"]': "getTitleProps",
        '[data-part="description"]': "getDescriptionProps",
        '[data-part="close-trigger"]': (api) => {
          const {
            id: _,
            ...props
          } = api.getCloseTriggerProps();
          return {
            ...props,
            // normalizeProps lowercases onClick → onclick; must match to override
            // Zag's default handler which calls stopPropagation()
            onclick: (e) => {
              if (e.defaultPrevented) return;
              api.setOpen(false);
            }
          };
        },
        '[data-part="trigger"]': (api) => {
          const props = api.getTriggerProps();
          const origOnClick = props.onclick;
          const preventTriggerFocus = (e) => {
            if ("button" in e && e.button !== 0) return;
            e.preventDefault();
          };
          return {
            ...props,
            onpointerdown: preventTriggerFocus,
            onmousedown: preventTriggerFocus,
            onclick: (e) => {
              ;
              e.currentTarget?.blur();
              origOnClick?.(e);
            }
          };
        }
      };
    }
    syncState(api) {
      this.open = api.open;
    }
    template(props) {
      Component._register(ZagComponent);
      return `<div id="${this.id}"${(props.class || "") == null || (props.class || "") === false ? "" : ` class="${(props.class || "").trim()}"`}><!--${this.id + "-c0"}-->${props.triggerLabel && `<button data-part="trigger" class="dialog-trigger">${props.triggerLabel}</button>` || ""}<!--${this.id + "-c0-end"}--><div data-part="backdrop" class="dialog-backdrop fixed inset-0 bg-black/50 z-50" hidden></div><div data-part="positioner" class="dialog-positioner fixed inset-0 flex items-center justify-center z-50" hidden><div data-part="content" class="dialog-content bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4"><!--${this.id + "-c1"}-->${props.title && `<h2 data-part="title" class="dialog-title text-lg font-semibold mb-2">${props.title}</h2>` || ""}<!--${this.id + "-c1-end"}--><!--${this.id + "-c2"}-->${props.description && `<p data-part="description" class="dialog-description text-sm text-gray-500 mb-4">${props.description}</p>` || ""}<!--${this.id + "-c2-end"}--><div id="${this.id + "-b1"}" class="dialog-body">${props.children}</div><button data-part="close-trigger" class="dialog-close-trigger absolute top-3 right-3 text-gray-400 hover:text-gray-600">\u2715</button></div></div></div>`;
    }
    __onPropChange(key, value) {
      if (key === "class") try {
        const __el = this.$(":scope");
        const props = this.props;
        const __boundValue = this.props.class || "";
        if (__el) {
          const __newClass = __boundValue != null ? String(__boundValue).trim() : "";
          if (__el.className !== __newClass) __el.className = __newClass;
        }
      } catch {
      }
      if (key === "children") try {
        const __el = document.getElementById(this.id + "-b1");
        if (__el) {
          if (__el.innerHTML !== value) __el.innerHTML = value;
        }
      } catch {
      }
      if (key === "triggerLabel") this.__geaPatchCond(0);
      if (key === "title") this.__geaPatchCond(1);
      if (key === "description") this.__geaPatchCond(2);
    }
  };
  if (void 0) {
    const __moduleExports = {
      default: Dialog
    };
    registerHotModule2("", __moduleExports);
    (void 0).accept((newModule) => {
      const __updatedModule = newModule || __moduleExports;
      registerHotModule2("", __updatedModule);
      handleComponentUpdate2("", __updatedModule);
    });
    (void 0).accept("../primitives/zag-component", () => (void 0).invalidate());
    const __origCreated = Dialog.prototype.created;
    Dialog.prototype.created = function(__geaProps) {
      registerComponentInstance2(this.constructor.name, this);
      return __origCreated.call(this, __geaProps);
    };
    const __origDispose = Dialog.prototype.dispose;
    Dialog.prototype.dispose = function() {
      unregisterComponentInstance2(this.constructor.name, this);
      return __origDispose.call(this);
    };
  }

  // node_modules/@zag-js/select/dist/select.anatomy.mjs
  var anatomy3 = createAnatomy("select").parts(
    "label",
    "positioner",
    "trigger",
    "indicator",
    "clearTrigger",
    "item",
    "itemText",
    "itemIndicator",
    "itemGroup",
    "itemGroupLabel",
    "list",
    "content",
    "root",
    "control",
    "valueText"
  );
  var parts3 = anatomy3.build();

  // node_modules/@zag-js/select/dist/select.collection.mjs
  var collection = (options) => {
    return new ListCollection(options);
  };
  collection.empty = () => {
    return new ListCollection({ items: [] });
  };

  // node_modules/@zag-js/select/dist/select.dom.mjs
  var getRootId2 = (ctx) => ctx.ids?.root ?? `select:${ctx.id}`;
  var getContentId2 = (ctx) => ctx.ids?.content ?? `select:${ctx.id}:content`;
  var getTriggerId2 = (ctx) => ctx.ids?.trigger ?? `select:${ctx.id}:trigger`;
  var getClearTriggerId = (ctx) => ctx.ids?.clearTrigger ?? `select:${ctx.id}:clear-trigger`;
  var getLabelId = (ctx) => ctx.ids?.label ?? `select:${ctx.id}:label`;
  var getControlId = (ctx) => ctx.ids?.control ?? `select:${ctx.id}:control`;
  var getItemId = (ctx, id) => ctx.ids?.item?.(id) ?? `select:${ctx.id}:option:${id}`;
  var getHiddenSelectId = (ctx) => ctx.ids?.hiddenSelect ?? `select:${ctx.id}:select`;
  var getPositionerId2 = (ctx) => ctx.ids?.positioner ?? `select:${ctx.id}:positioner`;
  var getItemGroupId = (ctx, id) => ctx.ids?.itemGroup?.(id) ?? `select:${ctx.id}:optgroup:${id}`;
  var getItemGroupLabelId = (ctx, id) => ctx.ids?.itemGroupLabel?.(id) ?? `select:${ctx.id}:optgroup-label:${id}`;
  var getHiddenSelectEl = (ctx) => ctx.getById(getHiddenSelectId(ctx));
  var getContentEl2 = (ctx) => ctx.getById(getContentId2(ctx));
  var getTriggerEl2 = (ctx) => ctx.getById(getTriggerId2(ctx));
  var getClearTriggerEl = (ctx) => ctx.getById(getClearTriggerId(ctx));
  var getPositionerEl2 = (ctx) => ctx.getById(getPositionerId2(ctx));
  var getItemEl = (ctx, id) => {
    if (id == null) return null;
    return ctx.getById(getItemId(ctx, id));
  };

  // node_modules/@zag-js/select/dist/select.connect.mjs
  function connect3(service, normalize) {
    const { context, prop, scope, state, computed, send } = service;
    const translations = prop("translations");
    const disabled = prop("disabled") || context.get("fieldsetDisabled");
    const invalid = !!prop("invalid");
    const required = !!prop("required");
    const readOnly = !!prop("readOnly");
    const composite = prop("composite");
    const collection2 = prop("collection");
    const open = state.hasTag("open");
    const focused = state.matches("focused");
    const highlightedValue = context.get("highlightedValue");
    const highlightedItem = context.get("highlightedItem");
    const selectedItems = computed("selectedItems");
    const currentPlacement = context.get("currentPlacement");
    const isTypingAhead = computed("isTypingAhead");
    const interactive = computed("isInteractive");
    const ariaActiveDescendant = highlightedValue ? getItemId(scope, highlightedValue) : void 0;
    function getItemState(props) {
      const _disabled = collection2.getItemDisabled(props.item);
      const value = collection2.getItemValue(props.item);
      ensure(value, () => `[zag-js] No value found for item ${JSON.stringify(props.item)}`);
      return {
        value,
        disabled: Boolean(disabled || _disabled),
        highlighted: highlightedValue === value,
        selected: context.get("value").includes(value)
      };
    }
    const popperStyles = getPlacementStyles({
      ...prop("positioning"),
      placement: currentPlacement
    });
    return {
      open,
      focused,
      empty: context.get("value").length === 0,
      highlightedItem,
      highlightedValue,
      selectedItems,
      hasSelectedItems: computed("hasSelectedItems"),
      value: context.get("value"),
      valueAsString: computed("valueAsString"),
      collection: collection2,
      multiple: !!prop("multiple"),
      disabled: !!disabled,
      reposition(options = {}) {
        send({ type: "POSITIONING.SET", options });
      },
      focus() {
        getTriggerEl2(scope)?.focus({ preventScroll: true });
      },
      setOpen(nextOpen) {
        const open2 = state.hasTag("open");
        if (open2 === nextOpen) return;
        send({ type: nextOpen ? "OPEN" : "CLOSE" });
      },
      selectValue(value) {
        send({ type: "ITEM.SELECT", value });
      },
      setValue(value) {
        send({ type: "VALUE.SET", value });
      },
      selectAll() {
        send({ type: "VALUE.SET", value: collection2.getValues() });
      },
      setHighlightValue(value) {
        send({ type: "HIGHLIGHTED_VALUE.SET", value });
      },
      clearHighlightValue() {
        send({ type: "HIGHLIGHTED_VALUE.CLEAR" });
      },
      clearValue(value) {
        if (value) {
          send({ type: "ITEM.CLEAR", value });
        } else {
          send({ type: "VALUE.CLEAR" });
        }
      },
      getItemState,
      getRootProps() {
        return normalize.element({
          ...parts3.root.attrs,
          dir: prop("dir"),
          id: getRootId2(scope),
          "data-invalid": dataAttr(invalid),
          "data-readonly": dataAttr(readOnly)
        });
      },
      getLabelProps() {
        return normalize.label({
          dir: prop("dir"),
          id: getLabelId(scope),
          ...parts3.label.attrs,
          "data-disabled": dataAttr(disabled),
          "data-invalid": dataAttr(invalid),
          "data-readonly": dataAttr(readOnly),
          "data-required": dataAttr(required),
          htmlFor: getHiddenSelectId(scope),
          onClick(event) {
            if (event.defaultPrevented) return;
            if (disabled) return;
            getTriggerEl2(scope)?.focus({ preventScroll: true });
          }
        });
      },
      getControlProps() {
        return normalize.element({
          ...parts3.control.attrs,
          dir: prop("dir"),
          id: getControlId(scope),
          "data-state": open ? "open" : "closed",
          "data-focus": dataAttr(focused),
          "data-disabled": dataAttr(disabled),
          "data-invalid": dataAttr(invalid)
        });
      },
      getValueTextProps() {
        return normalize.element({
          ...parts3.valueText.attrs,
          dir: prop("dir"),
          "data-disabled": dataAttr(disabled),
          "data-invalid": dataAttr(invalid),
          "data-focus": dataAttr(focused)
        });
      },
      getTriggerProps() {
        return normalize.button({
          id: getTriggerId2(scope),
          disabled,
          dir: prop("dir"),
          type: "button",
          role: "combobox",
          "aria-controls": getContentId2(scope),
          "aria-expanded": open,
          "aria-haspopup": "listbox",
          "data-state": open ? "open" : "closed",
          "aria-invalid": invalid,
          "aria-required": required,
          "aria-labelledby": getLabelId(scope),
          ...parts3.trigger.attrs,
          "data-disabled": dataAttr(disabled),
          "data-invalid": dataAttr(invalid),
          "data-readonly": dataAttr(readOnly),
          "data-placement": currentPlacement,
          "data-placeholder-shown": dataAttr(!computed("hasSelectedItems")),
          onClick(event) {
            if (!interactive) return;
            if (event.defaultPrevented) return;
            send({ type: "TRIGGER.CLICK" });
          },
          onFocus() {
            send({ type: "TRIGGER.FOCUS" });
          },
          onBlur() {
            send({ type: "TRIGGER.BLUR" });
          },
          onKeyDown(event) {
            if (event.defaultPrevented) return;
            if (!interactive) return;
            const keyMap2 = {
              ArrowUp() {
                send({ type: "TRIGGER.ARROW_UP" });
              },
              ArrowDown(event2) {
                send({ type: event2.altKey ? "OPEN" : "TRIGGER.ARROW_DOWN" });
              },
              ArrowLeft() {
                send({ type: "TRIGGER.ARROW_LEFT" });
              },
              ArrowRight() {
                send({ type: "TRIGGER.ARROW_RIGHT" });
              },
              Home() {
                send({ type: "TRIGGER.HOME" });
              },
              End() {
                send({ type: "TRIGGER.END" });
              },
              Enter() {
                send({ type: "TRIGGER.ENTER" });
              },
              Space(event2) {
                if (isTypingAhead) {
                  send({ type: "TRIGGER.TYPEAHEAD", key: event2.key });
                } else {
                  send({ type: "TRIGGER.ENTER" });
                }
              }
            };
            const exec = keyMap2[getEventKey(event, {
              dir: prop("dir"),
              orientation: "vertical"
            })];
            if (exec) {
              exec(event);
              event.preventDefault();
              return;
            }
            if (getByTypeahead.isValidEvent(event)) {
              send({ type: "TRIGGER.TYPEAHEAD", key: event.key });
              event.preventDefault();
            }
          }
        });
      },
      getIndicatorProps() {
        return normalize.element({
          ...parts3.indicator.attrs,
          dir: prop("dir"),
          "aria-hidden": true,
          "data-state": open ? "open" : "closed",
          "data-disabled": dataAttr(disabled),
          "data-invalid": dataAttr(invalid),
          "data-readonly": dataAttr(readOnly)
        });
      },
      getItemProps(props) {
        const itemState = getItemState(props);
        return normalize.element({
          id: getItemId(scope, itemState.value),
          role: "option",
          ...parts3.item.attrs,
          dir: prop("dir"),
          "data-value": itemState.value,
          "aria-selected": itemState.selected,
          "data-state": itemState.selected ? "checked" : "unchecked",
          "data-highlighted": dataAttr(itemState.highlighted),
          "data-disabled": dataAttr(itemState.disabled),
          "aria-disabled": ariaAttr(itemState.disabled),
          onPointerMove(event) {
            if (itemState.disabled || event.pointerType !== "mouse") return;
            if (itemState.value === highlightedValue) return;
            send({ type: "ITEM.POINTER_MOVE", value: itemState.value });
          },
          onClick(event) {
            if (event.defaultPrevented) return;
            if (itemState.disabled) return;
            send({ type: "ITEM.CLICK", src: "pointerup", value: itemState.value });
          },
          onPointerLeave(event) {
            if (itemState.disabled) return;
            if (props.persistFocus) return;
            if (event.pointerType !== "mouse") return;
            const pointerMoved = service.event.previous()?.type.includes("POINTER");
            if (!pointerMoved) return;
            send({ type: "ITEM.POINTER_LEAVE" });
          }
        });
      },
      getItemTextProps(props) {
        const itemState = getItemState(props);
        return normalize.element({
          ...parts3.itemText.attrs,
          "data-state": itemState.selected ? "checked" : "unchecked",
          "data-disabled": dataAttr(itemState.disabled),
          "data-highlighted": dataAttr(itemState.highlighted)
        });
      },
      getItemIndicatorProps(props) {
        const itemState = getItemState(props);
        return normalize.element({
          "aria-hidden": true,
          ...parts3.itemIndicator.attrs,
          "data-state": itemState.selected ? "checked" : "unchecked",
          hidden: !itemState.selected
        });
      },
      getItemGroupLabelProps(props) {
        const { htmlFor } = props;
        return normalize.element({
          ...parts3.itemGroupLabel.attrs,
          id: getItemGroupLabelId(scope, htmlFor),
          dir: prop("dir"),
          role: "presentation"
        });
      },
      getItemGroupProps(props) {
        const { id } = props;
        return normalize.element({
          ...parts3.itemGroup.attrs,
          "data-disabled": dataAttr(disabled),
          id: getItemGroupId(scope, id),
          "aria-labelledby": getItemGroupLabelId(scope, id),
          role: "group",
          dir: prop("dir")
        });
      },
      getClearTriggerProps() {
        return normalize.button({
          ...parts3.clearTrigger.attrs,
          id: getClearTriggerId(scope),
          type: "button",
          "aria-label": translations.clearTriggerLabel,
          "data-invalid": dataAttr(invalid),
          disabled,
          hidden: !computed("hasSelectedItems"),
          dir: prop("dir"),
          onClick(event) {
            if (event.defaultPrevented) return;
            send({ type: "CLEAR.CLICK" });
          }
        });
      },
      getHiddenSelectProps() {
        const value = context.get("value");
        const defaultValue = prop("multiple") ? value : value?.[0];
        const handleChange = (e) => {
          const evt = getNativeEvent(e);
          if (isInternalChangeEvent(evt)) return;
          send({ type: "VALUE.SET", value: getSelectedValues(e.currentTarget) });
        };
        return normalize.select({
          name: prop("name"),
          form: prop("form"),
          disabled,
          multiple: prop("multiple"),
          required: prop("required"),
          "aria-hidden": true,
          id: getHiddenSelectId(scope),
          defaultValue,
          style: visuallyHiddenStyle,
          tabIndex: -1,
          autoComplete: prop("autoComplete"),
          onChange: handleChange,
          onInput: handleChange,
          // Some browser extensions will focus the hidden select.
          // Let's forward the focus to the trigger.
          onFocus() {
            getTriggerEl2(scope)?.focus({ preventScroll: true });
          },
          "aria-labelledby": getLabelId(scope)
        });
      },
      getPositionerProps() {
        return normalize.element({
          ...parts3.positioner.attrs,
          dir: prop("dir"),
          id: getPositionerId2(scope),
          style: popperStyles.floating
        });
      },
      getContentProps() {
        return normalize.element({
          hidden: !open,
          dir: prop("dir"),
          id: getContentId2(scope),
          role: composite ? "listbox" : "dialog",
          ...parts3.content.attrs,
          "data-state": open ? "open" : "closed",
          "data-placement": currentPlacement,
          "data-activedescendant": ariaActiveDescendant,
          "aria-activedescendant": composite ? ariaActiveDescendant : void 0,
          "aria-multiselectable": prop("multiple") && composite ? true : void 0,
          "aria-labelledby": getLabelId(scope),
          tabIndex: 0,
          onKeyDown(event) {
            if (!interactive) return;
            if (!contains(event.currentTarget, getEventTarget(event))) return;
            if (event.key === "Tab") {
              const valid = isValidTabEvent(event);
              if (!valid) {
                event.preventDefault();
                return;
              }
            }
            const keyMap2 = {
              ArrowUp() {
                send({ type: "CONTENT.ARROW_UP" });
              },
              ArrowDown() {
                send({ type: "CONTENT.ARROW_DOWN" });
              },
              Home() {
                send({ type: "CONTENT.HOME" });
              },
              End() {
                send({ type: "CONTENT.END" });
              },
              Enter() {
                send({ type: "ITEM.CLICK", src: "keydown.enter" });
              },
              Space(event2) {
                if (isTypingAhead) {
                  send({ type: "CONTENT.TYPEAHEAD", key: event2.key });
                } else {
                  keyMap2.Enter?.(event2);
                }
              }
            };
            const exec = keyMap2[getEventKey(event)];
            if (exec) {
              exec(event);
              event.preventDefault();
              return;
            }
            const target = getEventTarget(event);
            if (isEditableElement(target)) {
              return;
            }
            if (getByTypeahead.isValidEvent(event)) {
              send({ type: "CONTENT.TYPEAHEAD", key: event.key });
              event.preventDefault();
            }
          }
        });
      },
      getListProps() {
        return normalize.element({
          ...parts3.list.attrs,
          tabIndex: 0,
          role: !composite ? "listbox" : void 0,
          "aria-labelledby": getTriggerId2(scope),
          "aria-activedescendant": !composite ? ariaActiveDescendant : void 0,
          "aria-multiselectable": !composite && prop("multiple") ? true : void 0
        });
      }
    };
  }
  var getSelectedValues = (el) => {
    return el.multiple ? Array.from(el.selectedOptions, (o) => o.value) : el.value ? [el.value] : [];
  };

  // node_modules/@zag-js/select/dist/select.machine.mjs
  var { and, not, or } = createGuards();
  var machine3 = createMachine({
    props({ props }) {
      return {
        loopFocus: false,
        closeOnSelect: !props.multiple,
        composite: true,
        defaultValue: [],
        ...props,
        collection: props.collection ?? collection.empty(),
        translations: {
          clearTriggerLabel: "Clear value",
          ...props.translations
        },
        positioning: {
          placement: "bottom-start",
          gutter: 8,
          ...props.positioning
        }
      };
    },
    context({ prop, bindable: bindable2, getContext }) {
      const initialValue = prop("value") ?? prop("defaultValue") ?? [];
      const initialSelectedItems = prop("collection").findMany(initialValue);
      return {
        value: bindable2(() => ({
          defaultValue: prop("defaultValue"),
          value: prop("value"),
          isEqual,
          onChange(value) {
            const context = getContext();
            const collection2 = prop("collection");
            const selectedItemMap = context.get("selectedItemMap");
            const proposed = deriveSelectionState({
              values: value,
              collection: collection2,
              selectedItemMap
            });
            const effectiveValue = prop("value") ?? value;
            const effective = effectiveValue === value ? proposed : deriveSelectionState({
              values: effectiveValue,
              collection: collection2,
              selectedItemMap: proposed.nextSelectedItemMap
            });
            context.set("selectedItemMap", effective.nextSelectedItemMap);
            return prop("onValueChange")?.({ value, items: proposed.selectedItems });
          }
        })),
        highlightedValue: bindable2(() => ({
          defaultValue: prop("defaultHighlightedValue") || null,
          value: prop("highlightedValue"),
          onChange(value) {
            prop("onHighlightChange")?.({
              highlightedValue: value,
              highlightedItem: prop("collection").find(value),
              highlightedIndex: prop("collection").indexOf(value)
            });
          }
        })),
        currentPlacement: bindable2(() => ({
          defaultValue: void 0
        })),
        fieldsetDisabled: bindable2(() => ({
          defaultValue: false
        })),
        highlightedItem: bindable2(() => ({
          defaultValue: null
        })),
        selectedItemMap: bindable2(() => {
          return {
            defaultValue: createSelectedItemMap({
              selectedItems: initialSelectedItems,
              collection: prop("collection")
            })
          };
        })
      };
    },
    refs() {
      return {
        typeahead: { ...getByTypeahead.defaultOptions }
      };
    },
    computed: {
      hasSelectedItems: ({ context }) => context.get("value").length > 0,
      isTypingAhead: ({ refs }) => refs.get("typeahead").keysSoFar !== "",
      isDisabled: ({ prop, context }) => !!prop("disabled") || !!context.get("fieldsetDisabled"),
      isInteractive: ({ prop }) => !(prop("disabled") || prop("readOnly")),
      selectedItems: ({ context, prop }) => resolveSelectedItems({
        values: context.get("value"),
        collection: prop("collection"),
        selectedItemMap: context.get("selectedItemMap")
      }),
      valueAsString: ({ computed, prop }) => prop("collection").stringifyItems(computed("selectedItems"))
    },
    initialState({ prop }) {
      const open = prop("open") || prop("defaultOpen");
      return open ? "open" : "idle";
    },
    entry: ["syncSelectElement"],
    watch({ context, prop, track, action }) {
      track([() => context.get("value").toString()], () => {
        action(["syncSelectedItems", "syncSelectElement", "dispatchChangeEvent"]);
      });
      track([() => prop("open")], () => {
        action(["toggleVisibility"]);
      });
      track([() => context.get("highlightedValue")], () => {
        action(["syncHighlightedItem"]);
      });
      track([() => prop("collection").toString()], () => {
        action(["syncCollection"]);
      });
    },
    on: {
      "HIGHLIGHTED_VALUE.SET": {
        actions: ["setHighlightedItem"]
      },
      "HIGHLIGHTED_VALUE.CLEAR": {
        actions: ["clearHighlightedItem"]
      },
      "ITEM.SELECT": {
        actions: ["selectItem"]
      },
      "ITEM.CLEAR": {
        actions: ["clearItem"]
      },
      "VALUE.SET": {
        actions: ["setSelectedItems"]
      },
      "VALUE.CLEAR": {
        actions: ["clearSelectedItems"]
      },
      "CLEAR.CLICK": {
        actions: ["clearSelectedItems", "focusTriggerEl"]
      }
    },
    effects: ["trackFormControlState"],
    states: {
      idle: {
        tags: ["closed"],
        on: {
          "CONTROLLED.OPEN": [
            {
              guard: "isTriggerClickEvent",
              target: "open",
              actions: ["setInitialFocus", "highlightFirstSelectedItem"]
            },
            {
              target: "open",
              actions: ["setInitialFocus"]
            }
          ],
          "TRIGGER.CLICK": [
            {
              guard: "isOpenControlled",
              actions: ["invokeOnOpen"]
            },
            {
              target: "open",
              actions: ["invokeOnOpen", "setInitialFocus", "highlightFirstSelectedItem"]
            }
          ],
          "TRIGGER.FOCUS": {
            target: "focused"
          },
          OPEN: [
            {
              guard: "isOpenControlled",
              actions: ["invokeOnOpen"]
            },
            {
              target: "open",
              actions: ["setInitialFocus", "invokeOnOpen"]
            }
          ]
        }
      },
      focused: {
        tags: ["closed"],
        on: {
          "CONTROLLED.OPEN": [
            {
              guard: "isTriggerClickEvent",
              target: "open",
              actions: ["setInitialFocus", "highlightFirstSelectedItem"]
            },
            {
              guard: "isTriggerArrowUpEvent",
              target: "open",
              actions: ["setInitialFocus", "highlightComputedLastItem"]
            },
            {
              guard: or("isTriggerArrowDownEvent", "isTriggerEnterEvent"),
              target: "open",
              actions: ["setInitialFocus", "highlightComputedFirstItem"]
            },
            {
              target: "open",
              actions: ["setInitialFocus"]
            }
          ],
          OPEN: [
            {
              guard: "isOpenControlled",
              actions: ["invokeOnOpen"]
            },
            {
              target: "open",
              actions: ["setInitialFocus", "invokeOnOpen"]
            }
          ],
          "TRIGGER.BLUR": {
            target: "idle"
          },
          "TRIGGER.CLICK": [
            {
              guard: "isOpenControlled",
              actions: ["invokeOnOpen"]
            },
            {
              target: "open",
              actions: ["setInitialFocus", "invokeOnOpen", "highlightFirstSelectedItem"]
            }
          ],
          "TRIGGER.ENTER": [
            {
              guard: "isOpenControlled",
              actions: ["invokeOnOpen"]
            },
            {
              target: "open",
              actions: ["setInitialFocus", "invokeOnOpen", "highlightComputedFirstItem"]
            }
          ],
          "TRIGGER.ARROW_UP": [
            {
              guard: "isOpenControlled",
              actions: ["invokeOnOpen"]
            },
            {
              target: "open",
              actions: ["setInitialFocus", "invokeOnOpen", "highlightComputedLastItem"]
            }
          ],
          "TRIGGER.ARROW_DOWN": [
            {
              guard: "isOpenControlled",
              actions: ["invokeOnOpen"]
            },
            {
              target: "open",
              actions: ["setInitialFocus", "invokeOnOpen", "highlightComputedFirstItem"]
            }
          ],
          "TRIGGER.ARROW_LEFT": [
            {
              guard: and(not("multiple"), "hasSelectedItems"),
              actions: ["selectPreviousItem"]
            },
            {
              guard: not("multiple"),
              actions: ["selectLastItem"]
            }
          ],
          "TRIGGER.ARROW_RIGHT": [
            {
              guard: and(not("multiple"), "hasSelectedItems"),
              actions: ["selectNextItem"]
            },
            {
              guard: not("multiple"),
              actions: ["selectFirstItem"]
            }
          ],
          "TRIGGER.HOME": {
            guard: not("multiple"),
            actions: ["selectFirstItem"]
          },
          "TRIGGER.END": {
            guard: not("multiple"),
            actions: ["selectLastItem"]
          },
          "TRIGGER.TYPEAHEAD": {
            guard: not("multiple"),
            actions: ["selectMatchingItem"]
          }
        }
      },
      open: {
        tags: ["open"],
        exit: ["scrollContentToTop"],
        effects: ["trackDismissableElement", "trackFocusVisible", "computePlacement", "scrollToHighlightedItem"],
        on: {
          "CONTROLLED.CLOSE": [
            {
              guard: "restoreFocus",
              target: "focused",
              actions: ["focusTriggerEl", "clearHighlightedItem"]
            },
            {
              target: "idle",
              actions: ["clearHighlightedItem"]
            }
          ],
          CLOSE: [
            {
              guard: "isOpenControlled",
              actions: ["invokeOnClose"]
            },
            {
              guard: "restoreFocus",
              target: "focused",
              actions: ["invokeOnClose", "focusTriggerEl", "clearHighlightedItem"]
            },
            {
              target: "idle",
              actions: ["invokeOnClose", "clearHighlightedItem"]
            }
          ],
          "TRIGGER.CLICK": [
            {
              guard: "isOpenControlled",
              actions: ["invokeOnClose"]
            },
            {
              target: "focused",
              actions: ["invokeOnClose", "clearHighlightedItem"]
            }
          ],
          "ITEM.CLICK": [
            {
              guard: and("closeOnSelect", "isOpenControlled"),
              actions: ["selectHighlightedItem", "invokeOnClose"]
            },
            {
              guard: "closeOnSelect",
              target: "focused",
              actions: ["selectHighlightedItem", "invokeOnClose", "focusTriggerEl", "clearHighlightedItem"]
            },
            {
              actions: ["selectHighlightedItem"]
            }
          ],
          "CONTENT.HOME": {
            actions: ["highlightFirstItem"]
          },
          "CONTENT.END": {
            actions: ["highlightLastItem"]
          },
          "CONTENT.ARROW_DOWN": [
            {
              guard: and("hasHighlightedItem", "loop", "isLastItemHighlighted"),
              actions: ["highlightFirstItem"]
            },
            {
              guard: "hasHighlightedItem",
              actions: ["highlightNextItem"]
            },
            {
              actions: ["highlightFirstItem"]
            }
          ],
          "CONTENT.ARROW_UP": [
            {
              guard: and("hasHighlightedItem", "loop", "isFirstItemHighlighted"),
              actions: ["highlightLastItem"]
            },
            {
              guard: "hasHighlightedItem",
              actions: ["highlightPreviousItem"]
            },
            {
              actions: ["highlightLastItem"]
            }
          ],
          "CONTENT.TYPEAHEAD": {
            actions: ["highlightMatchingItem"]
          },
          "ITEM.POINTER_MOVE": {
            actions: ["highlightItem"]
          },
          "ITEM.POINTER_LEAVE": {
            actions: ["clearHighlightedItem"]
          },
          "POSITIONING.SET": {
            actions: ["reposition"]
          }
        }
      }
    },
    implementations: {
      guards: {
        loop: ({ prop }) => !!prop("loopFocus"),
        multiple: ({ prop }) => !!prop("multiple"),
        hasSelectedItems: ({ computed }) => !!computed("hasSelectedItems"),
        hasHighlightedItem: ({ context }) => context.get("highlightedValue") != null,
        isFirstItemHighlighted: ({ context, prop }) => context.get("highlightedValue") === prop("collection").firstValue,
        isLastItemHighlighted: ({ context, prop }) => context.get("highlightedValue") === prop("collection").lastValue,
        closeOnSelect: ({ prop, event }) => !!(event.closeOnSelect ?? prop("closeOnSelect")),
        restoreFocus: ({ event }) => restoreFocusFn(event),
        // guard assertions (for controlled mode)
        isOpenControlled: ({ prop }) => prop("open") !== void 0,
        isTriggerClickEvent: ({ event }) => event.previousEvent?.type === "TRIGGER.CLICK",
        isTriggerEnterEvent: ({ event }) => event.previousEvent?.type === "TRIGGER.ENTER",
        isTriggerArrowUpEvent: ({ event }) => event.previousEvent?.type === "TRIGGER.ARROW_UP",
        isTriggerArrowDownEvent: ({ event }) => event.previousEvent?.type === "TRIGGER.ARROW_DOWN"
      },
      effects: {
        trackFocusVisible({ scope }) {
          return trackFocusVisible({ root: scope.getRootNode?.() });
        },
        trackFormControlState({ context, scope }) {
          return trackFormControl(getHiddenSelectEl(scope), {
            onFieldsetDisabledChange(disabled) {
              context.set("fieldsetDisabled", disabled);
            },
            onFormReset() {
              const value = context.initial("value");
              context.set("value", value);
            }
          });
        },
        trackDismissableElement({ scope, send, prop }) {
          const contentEl = () => getContentEl2(scope);
          let restoreFocus = true;
          return trackDismissableElement(contentEl, {
            type: "listbox",
            defer: true,
            exclude: [getTriggerEl2(scope), getClearTriggerEl(scope)],
            onFocusOutside: prop("onFocusOutside"),
            onPointerDownOutside: prop("onPointerDownOutside"),
            onInteractOutside(event) {
              prop("onInteractOutside")?.(event);
              restoreFocus = !(event.detail.focusable || event.detail.contextmenu);
            },
            onDismiss() {
              send({ type: "CLOSE", src: "interact-outside", restoreFocus });
            }
          });
        },
        computePlacement({ context, prop, scope }) {
          const positioning = prop("positioning");
          context.set("currentPlacement", positioning.placement);
          const triggerEl = () => getTriggerEl2(scope);
          const positionerEl = () => getPositionerEl2(scope);
          return getPlacement(triggerEl, positionerEl, {
            defer: true,
            ...positioning,
            onComplete(data) {
              context.set("currentPlacement", data.placement);
            }
          });
        },
        scrollToHighlightedItem({ context, prop, scope }) {
          const exec = (immediate) => {
            const highlightedValue = context.get("highlightedValue");
            if (highlightedValue == null) return;
            const modality = getInteractionModality();
            if (modality === "pointer") return;
            const contentEl2 = getContentEl2(scope);
            const scrollToIndexFn = prop("scrollToIndexFn");
            if (scrollToIndexFn) {
              const highlightedIndex = prop("collection").indexOf(highlightedValue);
              scrollToIndexFn?.({
                index: highlightedIndex,
                immediate,
                getElement: () => getItemEl(scope, highlightedValue)
              });
              return;
            }
            const itemEl = getItemEl(scope, highlightedValue);
            scrollIntoView(itemEl, { rootEl: contentEl2, block: "nearest" });
          };
          raf(() => {
            setInteractionModality("virtual");
            exec(true);
          });
          const contentEl = () => getContentEl2(scope);
          return observeAttributes(contentEl, {
            defer: true,
            attributes: ["data-activedescendant"],
            callback() {
              exec(false);
            }
          });
        }
      },
      actions: {
        reposition({ context, prop, scope, event }) {
          const positionerEl = () => getPositionerEl2(scope);
          getPlacement(getTriggerEl2(scope), positionerEl, {
            ...prop("positioning"),
            ...event.options,
            defer: true,
            listeners: false,
            onComplete(data) {
              context.set("currentPlacement", data.placement);
            }
          });
        },
        toggleVisibility({ send, prop, event }) {
          send({ type: prop("open") ? "CONTROLLED.OPEN" : "CONTROLLED.CLOSE", previousEvent: event });
        },
        highlightPreviousItem({ context, prop }) {
          const highlightedValue = context.get("highlightedValue");
          if (highlightedValue == null) return;
          const value = prop("collection").getPreviousValue(highlightedValue, 1, prop("loopFocus"));
          if (value == null) return;
          context.set("highlightedValue", value);
        },
        highlightNextItem({ context, prop }) {
          const highlightedValue = context.get("highlightedValue");
          if (highlightedValue == null) return;
          const value = prop("collection").getNextValue(highlightedValue, 1, prop("loopFocus"));
          if (value == null) return;
          context.set("highlightedValue", value);
        },
        highlightFirstItem({ context, prop }) {
          const value = prop("collection").firstValue;
          context.set("highlightedValue", value);
        },
        highlightLastItem({ context, prop }) {
          const value = prop("collection").lastValue;
          context.set("highlightedValue", value);
        },
        setInitialFocus({ scope }) {
          raf(() => {
            const element = getInitialFocus({
              root: getContentEl2(scope)
            });
            element?.focus({ preventScroll: true });
          });
        },
        focusTriggerEl({ event, scope }) {
          if (!restoreFocusFn(event)) return;
          raf(() => {
            const element = getTriggerEl2(scope);
            element?.focus({ preventScroll: true });
          });
        },
        selectHighlightedItem({ context, prop, event }) {
          let value = event.value ?? context.get("highlightedValue");
          if (value == null || !prop("collection").has(value)) return;
          prop("onSelect")?.({ value });
          const nullable = prop("deselectable") && !prop("multiple") && context.get("value").includes(value);
          value = nullable ? null : value;
          context.set("value", (prev) => {
            if (value == null) return [];
            if (prop("multiple")) return addOrRemove(prev, value);
            return [value];
          });
        },
        highlightComputedFirstItem({ context, prop, computed }) {
          const collection2 = prop("collection");
          const value = computed("hasSelectedItems") ? collection2.sort(context.get("value"))[0] : collection2.firstValue;
          context.set("highlightedValue", value);
        },
        highlightComputedLastItem({ context, prop, computed }) {
          const collection2 = prop("collection");
          const value = computed("hasSelectedItems") ? collection2.sort(context.get("value"))[0] : collection2.lastValue;
          context.set("highlightedValue", value);
        },
        highlightFirstSelectedItem({ context, prop, computed }) {
          if (!computed("hasSelectedItems")) return;
          const value = prop("collection").sort(context.get("value"))[0];
          context.set("highlightedValue", value);
        },
        highlightItem({ context, event }) {
          context.set("highlightedValue", event.value);
        },
        highlightMatchingItem({ context, prop, event, refs }) {
          const value = prop("collection").search(event.key, {
            state: refs.get("typeahead"),
            currentValue: context.get("highlightedValue")
          });
          if (value == null) return;
          context.set("highlightedValue", value);
        },
        setHighlightedItem({ context, event }) {
          context.set("highlightedValue", event.value);
        },
        clearHighlightedItem({ context }) {
          context.set("highlightedValue", null);
        },
        selectItem({ context, prop, event }) {
          prop("onSelect")?.({ value: event.value });
          const nullable = prop("deselectable") && !prop("multiple") && context.get("value").includes(event.value);
          const value = nullable ? null : event.value;
          context.set("value", (prev) => {
            if (value == null) return [];
            if (prop("multiple")) return addOrRemove(prev, value);
            return [value];
          });
        },
        clearItem({ context, event }) {
          context.set("value", (prev) => prev.filter((v) => v !== event.value));
        },
        setSelectedItems({ context, event }) {
          context.set("value", event.value);
        },
        clearSelectedItems({ context }) {
          context.set("value", []);
        },
        selectPreviousItem({ context, prop }) {
          const [firstItem] = context.get("value");
          const value = prop("collection").getPreviousValue(firstItem);
          if (value) context.set("value", [value]);
        },
        selectNextItem({ context, prop }) {
          const [firstItem] = context.get("value");
          const value = prop("collection").getNextValue(firstItem);
          if (value) context.set("value", [value]);
        },
        selectFirstItem({ context, prop }) {
          const value = prop("collection").firstValue;
          if (value) context.set("value", [value]);
        },
        selectLastItem({ context, prop }) {
          const value = prop("collection").lastValue;
          if (value) context.set("value", [value]);
        },
        selectMatchingItem({ context, prop, event, refs }) {
          const value = prop("collection").search(event.key, {
            state: refs.get("typeahead"),
            currentValue: context.get("value")[0]
          });
          if (value == null) return;
          context.set("value", [value]);
        },
        scrollContentToTop({ prop, scope }) {
          if (prop("scrollToIndexFn")) {
            const firstValue = prop("collection").firstValue;
            prop("scrollToIndexFn")?.({
              index: 0,
              immediate: true,
              getElement: () => getItemEl(scope, firstValue)
            });
          } else {
            getContentEl2(scope)?.scrollTo(0, 0);
          }
        },
        invokeOnOpen({ prop, context }) {
          prop("onOpenChange")?.({ open: true, value: context.get("value") });
        },
        invokeOnClose({ prop, context }) {
          prop("onOpenChange")?.({ open: false, value: context.get("value") });
        },
        syncSelectElement({ context, prop, scope }) {
          const selectEl = getHiddenSelectEl(scope);
          if (!selectEl) return;
          if (context.get("value").length === 0 && !prop("multiple")) {
            selectEl.selectedIndex = -1;
            return;
          }
          for (const option of selectEl.options) {
            option.selected = context.get("value").includes(option.value);
          }
        },
        syncCollection({ context, prop }) {
          const collection2 = prop("collection");
          const highlightedItem = collection2.find(context.get("highlightedValue"));
          if (highlightedItem) context.set("highlightedItem", highlightedItem);
          const next = deriveSelectionState({
            values: context.get("value"),
            collection: collection2,
            selectedItemMap: context.get("selectedItemMap")
          });
          context.set("selectedItemMap", next.nextSelectedItemMap);
        },
        syncSelectedItems({ context, prop }) {
          const next = deriveSelectionState({
            values: context.get("value"),
            collection: prop("collection"),
            selectedItemMap: context.get("selectedItemMap")
          });
          context.set("selectedItemMap", next.nextSelectedItemMap);
        },
        syncHighlightedItem({ context, prop }) {
          const collection2 = prop("collection");
          const highlightedValue = context.get("highlightedValue");
          const highlightedItem = highlightedValue ? collection2.find(highlightedValue) : null;
          context.set("highlightedItem", highlightedItem);
        },
        dispatchChangeEvent({ scope }) {
          queueMicrotask(() => {
            const node = getHiddenSelectEl(scope);
            if (!node) return;
            const win = scope.getWin();
            const evt = new win.Event("change", { bubbles: true, composed: true });
            node.dispatchEvent(markAsInternalChangeEvent(evt));
          });
        }
      }
    }
  });
  function restoreFocusFn(event) {
    const v = event.restoreFocus ?? event.previousEvent?.restoreFocus;
    return v == null || !!v;
  }

  // packages/gea-ui/src/components/select.tsx
  var Select = class extends ZagComponent {
    constructor(...args) {
      super(...args);
      try {
        const props = this.props;
        this.__geaCond_0 = !!this.props.label;
      } catch {
      }
      this.__geaRegisterCond(0, "c0", () => {
        const props = this.props;
        return this.props.label;
      }, () => {
        const props = this.props;
        return `<label data-part="label" class="select-label text-sm font-medium mb-1 block">${this.props.label}</label>`;
      }, null);
    }
    createMachine(_props) {
      return machine3;
    }
    getMachineProps(props) {
      const items = props.items || [];
      const col = props.collection || collection({
        items,
        itemToValue: (item) => item.value,
        itemToString: (item) => item.label || item.value
      });
      return {
        id: this.id,
        collection: col,
        value: props.value,
        defaultValue: props.defaultValue,
        open: props.open,
        defaultOpen: props.defaultOpen,
        multiple: props.multiple,
        disabled: props.disabled,
        invalid: props.invalid,
        readOnly: props.readOnly,
        required: props.required,
        name: props.name,
        form: props.form,
        closeOnSelect: props.closeOnSelect ?? true,
        positioning: props.positioning,
        loopFocus: props.loopFocus ?? false,
        onValueChange: (details) => {
          this.value = details.value;
          this.valueAsString = details.items.map((i) => i.label || i.value).join(", ");
          props.onValueChange?.(details);
        },
        onOpenChange: (details) => {
          this.open = details.open;
          props.onOpenChange?.(details);
        }
      };
    }
    connectApi(service) {
      return connect3(service, normalizeProps);
    }
    getSpreadMap() {
      return {
        '[data-part="root"]': "getRootProps",
        '[data-part="label"]': "getLabelProps",
        '[data-part="control"]': "getControlProps",
        '[data-part="trigger"]': "getTriggerProps",
        '[data-part="indicator"]': "getIndicatorProps",
        '[data-part="clear-trigger"]': "getClearTriggerProps",
        '[data-part="value-text"]': "getValueTextProps",
        '[data-part="positioner"]': "getPositionerProps",
        '[data-part="content"]': "getContentProps",
        '[data-part="list"]': "getListProps",
        '[data-part="item"]': (api, el) => {
          const value = el.dataset.value;
          const label = el.dataset.label || value;
          return api.getItemProps({
            item: {
              value,
              label
            }
          });
        },
        '[data-part="item-text"]': (api, el) => {
          const value = el.dataset.value;
          const label = el.dataset.label || value;
          return api.getItemTextProps({
            item: {
              value,
              label
            }
          });
        },
        '[data-part="item-indicator"]': (api, el) => {
          const value = el.dataset.value;
          const label = el.dataset.label || value;
          return api.getItemIndicatorProps({
            item: {
              value,
              label
            }
          });
        }
      };
    }
    syncState(api) {
      this.open = api.open;
      this.value = api.value;
      this.valueAsString = api.valueAsString;
    }
    template(props) {
      Component._register(ZagComponent);
      const items = props.items || [];
      return `<div id="${this.id}" data-part="root"${(props.class || "") == null || (props.class || "") === false ? "" : ` class="${(props.class || "").trim()}"`}><!--${this.id + "-c0"}-->${props.label && `<label data-part="label" class="select-label text-sm font-medium mb-1 block">${props.label}</label>` || ""}<!--${this.id + "-c0-end"}--><div data-part="control" class="select-control"><button data-part="trigger" class="select-trigger flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"><span id="${this.id + "-b1"}" data-part="value-text" class="select-value-text">${this.valueAsString || props.placeholder || "Select..."}</span><span data-part="indicator" class="select-indicator">\u25BC</span></button></div><div data-part="positioner" class="select-positioner"><div data-part="content" class="select-content z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"><div id="${this.id + "-b2"}" data-part="list">${items.map((item) => `<div id="${this.id + "-b2-" + String(String(item))}" data-gea-item-id="${String(item)}" data-part="item"${item.value == null || item.value === false ? "" : ` data-value="${item.value}"`}${item.label == null || item.label === false ? "" : ` data-label="${item.label}"`} class="select-item relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"><span data-part="item-text"${item.value == null || item.value === false ? "" : ` data-value="${item.value}"`}${item.label == null || item.label === false ? "" : ` data-label="${item.label}"`}>${item.label}</span><span data-part="item-indicator"${item.value == null || item.value === false ? "" : ` data-value="${item.value}"`}${item.label == null || item.label === false ? "" : ` data-label="${item.label}"`} class="select-item-indicator ml-auto">\u2713</span></div>`).join("") + "<!---->"}</div></div></div></div>`;
    }
    render__unresolved_0Item(item, __geaIdx) {
      const __v = (v) => v != null && typeof v === "object" ? v.valueOf() : v;
      return `<div id="${this.id + "-b2-" + String(__geaIdx)}" data-gea-item-id="${__geaIdx}" data-part="item"${__v(item.value) == __v(null) || __v(item.value) === __v(false) ? "" : ` data-value="${item.value}"`}${__v(item.label) == __v(null) || __v(item.label) === __v(false) ? "" : ` data-label="${item.label}"`} class="select-item relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"><span data-part="item-text"${__v(item.value) == __v(null) || __v(item.value) === __v(false) ? "" : ` data-value="${item.value}"`}${__v(item.label) == __v(null) || __v(item.label) === __v(false) ? "" : ` data-label="${item.label}"`}>${item.label}</span><span data-part="item-indicator"${__v(item.value) == __v(null) || __v(item.value) === __v(false) ? "" : ` data-value="${item.value}"`}${__v(item.label) == __v(null) || __v(item.label) === __v(false) ? "" : ` data-label="${item.label}"`} class="select-item-indicator ml-auto">\u2713</span></div>`;
    }
    create__unresolved_0Item(item) {
      var __c = this.____unresolved_0_container;
      if (!__c.__geaTpl) {
        try {
          var __tw = __c.cloneNode(false);
          __tw.innerHTML = this.render__unresolved_0Item("__dummy__");
          __c.__geaTpl = __tw.firstElementChild;
        } catch {
        }
      }
      if (!__c.__geaIdPfx) __c.__geaIdPfx = this.id_ + "-b2-";
      if (__c.__geaTpl) {
        var el = __c.__geaTpl.cloneNode(true);
      } else {
        var __fw = __c.cloneNode(false);
        __fw.innerHTML = this.render__unresolved_0Item(item);
        var el = __fw.firstElementChild;
      }
      var __av = item.value;
      if (__av == null || __av === false) el.removeAttribute("data-value");
      else el.setAttribute("data-value", String(__av));
      var __av = item.label;
      if (__av == null || __av === false) el.removeAttribute("data-label");
      else el.setAttribute("data-label", String(__av));
      var __av = item.value;
      if (__av == null || __av === false) el.firstElementChild.removeAttribute("data-value");
      else el.firstElementChild.setAttribute("data-value", String(__av));
      var __av = item.label;
      if (__av == null || __av === false) el.firstElementChild.removeAttribute("data-label");
      else el.firstElementChild.setAttribute("data-label", String(__av));
      el.firstElementChild.textContent = `
                    ${item.label}
                  `;
      var __av = item.value;
      if (__av == null || __av === false) el.firstElementChild.nextElementSibling.removeAttribute("data-value");
      else el.firstElementChild.nextElementSibling.setAttribute("data-value", String(__av));
      var __av = item.label;
      if (__av == null || __av === false) el.firstElementChild.nextElementSibling.removeAttribute("data-label");
      else el.firstElementChild.nextElementSibling.setAttribute("data-label", String(__av));
      el.setAttribute("data-gea-item-id", String(item));
      el.id = __c.__geaIdPfx + String(item);
      el.__geaItem = item;
      return el;
    }
    __onPropChange(key, value) {
      if (key === "class") try {
        const __el = this.$(":scope");
        const props = this.props;
        const __boundValue = this.props.class || "";
        if (__el) {
          const __newClass = __boundValue != null ? String(__boundValue).trim() : "";
          if (__el.className !== __newClass) __el.className = __newClass;
        }
      } catch {
      }
      if (key === "placeholder") try {
        const __el = document.getElementById(this.id + "-b1");
        const props = this.props;
        const __boundValue = this.valueAsString || this.props.placeholder || "Select...";
        if (__el) {
          if (__el.textContent !== __boundValue) __el.textContent = __boundValue;
        }
      } catch {
      }
      if (key === "label") this.__geaPatchCond(0);
      if (key === "items") this.__geaSyncMap(0);
    }
    __observe_local_valueAsString(value, change) {
      if (this.rendered_) {
        const __el = document.getElementById(this.id + "-b1");
        const props = this.props;
        const __boundValue = this.valueAsString || this.props.placeholder || "Select...";
        if (__el) {
          if (__el.textContent !== __boundValue) __el.textContent = __boundValue;
        }
      }
    }
    __observe_local_props(__v, __c) {
      this.__geaSyncMap(0);
    }
    createdHooks() {
      if (!this.__observer_removers__) {
        this.__observer_removers__ = [];
      }
      if (!this.__stores) {
        this.__stores = {};
      }
      this.__observer_removers__.forEach((fn) => fn());
      this.__observer_removers__ = [];
      if (typeof this.__ensureArrayConfigs === "function") {
        this.__ensureArrayConfigs();
      }
      this.__geaRegisterMap(0, "____unresolved_0_container", () => document.getElementById(this.id + "-b2"), () => {
        return this.props.items || [];
      }, (__item) => this.create__unresolved_0Item(__item));
    }
    __setupLocalStateObservers() {
      if (typeof this.__ensureArrayConfigs === "function") {
        this.__ensureArrayConfigs();
      }
      if (!this.__store) {
        return;
      }
      this.__observer_removers__.push(this.__store.observe(["valueAsString"], (__v, __c) => this.__observe_local_valueAsString(__v, __c)));
    }
    dispose() {
      if (this.__observer_removers__) {
        this.__observer_removers__.forEach((fn) => fn());
      }
      super.dispose();
    }
  };
  if (void 0) {
    const __moduleExports = {
      default: Select
    };
    registerHotModule3("", __moduleExports);
    (void 0).accept((newModule) => {
      const __updatedModule = newModule || __moduleExports;
      registerHotModule3("", __updatedModule);
      handleComponentUpdate3("", __updatedModule);
    });
    (void 0).accept("../primitives/zag-component", () => (void 0).invalidate());
    const __origCreated = Select.prototype.created;
    Select.prototype.created = function(__geaProps) {
      registerComponentInstance3(this.constructor.name, this);
      return __origCreated.call(this, __geaProps);
    };
    const __origDispose = Select.prototype.dispose;
    Select.prototype.dispose = function() {
      unregisterComponentInstance3(this.constructor.name, this);
      return __origDispose.call(this);
    };
  }

  // node_modules/@zag-js/toast/dist/toast.store.mjs
  var withDefaults = (options, defaults) => {
    return { ...defaults, ...compact(options) };
  };
  function createToastStore(props = {}) {
    const attrs = withDefaults(props, {
      placement: "bottom",
      overlap: false,
      max: 24,
      gap: 16,
      offsets: "1rem",
      hotkey: ["altKey", "KeyT"],
      removeDelay: 200,
      pauseOnPageIdle: true
    });
    let subscribers = [];
    let toasts = [];
    let dismissedToasts = /* @__PURE__ */ new Set();
    let toastQueue = [];
    const subscribe2 = (subscriber) => {
      subscribers.push(subscriber);
      return () => {
        const index = subscribers.indexOf(subscriber);
        subscribers.splice(index, 1);
      };
    };
    const publish = (data) => {
      subscribers.forEach((subscriber) => subscriber(data));
      return data;
    };
    const addToast = (data) => {
      if (toasts.length >= attrs.max) {
        toastQueue.push(data);
        return;
      }
      publish(data);
      toasts.unshift(data);
    };
    const processQueue = () => {
      while (toastQueue.length > 0 && toasts.length < attrs.max) {
        const nextToast = toastQueue.shift();
        if (nextToast) {
          publish(nextToast);
          toasts.unshift(nextToast);
        }
      }
    };
    const create = (data) => {
      const id = data.id ?? `toast:${uuid()}`;
      const exists = toasts.find((toast) => toast.id === id);
      if (dismissedToasts.has(id)) dismissedToasts.delete(id);
      if (exists) {
        toasts = toasts.map((toast) => {
          if (toast.id === id) {
            return publish({ ...toast, ...data, id });
          }
          return toast;
        });
      } else {
        addToast({
          id,
          duration: attrs.duration,
          removeDelay: attrs.removeDelay,
          type: "info",
          ...data,
          stacked: !attrs.overlap,
          gap: attrs.gap
        });
      }
      return id;
    };
    const remove2 = (id) => {
      dismissedToasts.add(id);
      if (!id) {
        toasts.forEach((toast) => {
          subscribers.forEach((subscriber) => subscriber({ id: toast.id, dismiss: true }));
        });
        toasts = [];
        toastQueue = [];
      } else {
        subscribers.forEach((subscriber) => subscriber({ id, dismiss: true }));
        toasts = toasts.filter((toast) => toast.id !== id);
        processQueue();
      }
      return id;
    };
    const error = (data) => {
      return create({ ...data, type: "error" });
    };
    const success = (data) => {
      return create({ ...data, type: "success" });
    };
    const info = (data) => {
      return create({ ...data, type: "info" });
    };
    const warning = (data) => {
      return create({ ...data, type: "warning" });
    };
    const loading = (data) => {
      return create({ ...data, type: "loading" });
    };
    const getVisibleToasts = () => {
      return toasts.filter((toast) => !dismissedToasts.has(toast.id));
    };
    const getCount = () => {
      return toasts.length;
    };
    const promise = (promise2, options, shared = {}) => {
      if (!options || !options.loading) {
        warn("[zag-js > toast] toaster.promise() requires at least a 'loading' option to be specified");
        return;
      }
      const id = create({
        ...shared,
        ...options.loading,
        promise: promise2,
        type: "loading"
      });
      let removable = true;
      let result;
      const prom = runIfFn(promise2).then(async (response) => {
        result = ["resolve", response];
        if (isHttpResponse(response) && !response.ok) {
          removable = false;
          const errorOptions = runIfFn(options.error, `HTTP Error! status: ${response.status}`);
          create({ ...shared, ...errorOptions, id, type: "error" });
        } else if (options.success !== void 0) {
          removable = false;
          const successOptions = runIfFn(options.success, response);
          create({ ...shared, ...successOptions, id, type: "success" });
        }
      }).catch(async (error2) => {
        result = ["reject", error2];
        if (options.error !== void 0) {
          removable = false;
          const errorOptions = runIfFn(options.error, error2);
          create({ ...shared, ...errorOptions, id, type: "error" });
        }
      }).finally(() => {
        if (removable) {
          remove2(id);
        }
        options.finally?.();
      });
      const unwrap = () => new Promise(
        (resolve, reject) => prom.then(() => result[0] === "reject" ? reject(result[1]) : resolve(result[1])).catch(reject)
      );
      return { id, unwrap };
    };
    const update = (id, data) => {
      return create({ id, ...data });
    };
    const pause = (id) => {
      if (id != null) {
        toasts = toasts.map((toast) => {
          if (toast.id === id) return publish({ ...toast, message: "PAUSE" });
          return toast;
        });
      } else {
        toasts = toasts.map((toast) => publish({ ...toast, message: "PAUSE" }));
      }
    };
    const resume = (id) => {
      if (id != null) {
        toasts = toasts.map((toast) => {
          if (toast.id === id) return publish({ ...toast, message: "RESUME" });
          return toast;
        });
      } else {
        toasts = toasts.map((toast) => publish({ ...toast, message: "RESUME" }));
      }
    };
    const dismiss = (id) => {
      if (id != null) {
        toasts = toasts.map((toast) => {
          if (toast.id === id) return publish({ ...toast, message: "DISMISS" });
          return toast;
        });
      } else {
        toasts = toasts.map((toast) => publish({ ...toast, message: "DISMISS" }));
      }
    };
    const isVisible = (id) => {
      return !dismissedToasts.has(id) && !!toasts.find((toast) => toast.id === id);
    };
    const isDismissed = (id) => {
      return dismissedToasts.has(id);
    };
    const expand = () => {
      toasts = toasts.map((toast) => publish({ ...toast, stacked: true }));
    };
    const collapse = () => {
      toasts = toasts.map((toast) => publish({ ...toast, stacked: false }));
    };
    return {
      attrs,
      subscribe: subscribe2,
      create,
      update,
      remove: remove2,
      dismiss,
      error,
      success,
      info,
      warning,
      loading,
      getVisibleToasts,
      getCount,
      promise,
      pause,
      resume,
      isVisible,
      isDismissed,
      expand,
      collapse
    };
  }
  var isHttpResponse = (data) => {
    return data && typeof data === "object" && "ok" in data && typeof data.ok === "boolean" && "status" in data && typeof data.status === "number";
  };

  // packages/gea-ui/src/components/toast.tsx
  var _store = null;
  function getStore(props) {
    if (!_store) {
      _store = createToastStore({
        placement: "bottom-end",
        duration: 5e3,
        removeDelay: 200,
        max: 5,
        ...props
      });
    }
    return _store;
  }
  var ToastStore = class {
    static {
      this.getStore = getStore;
    }
    static create(options) {
      return getStore().create(options);
    }
    static success(options) {
      return getStore().create({
        ...options,
        type: "success"
      });
    }
    static error(options) {
      return getStore().create({
        ...options,
        type: "error"
      });
    }
    static info(options) {
      return getStore().create({
        ...options,
        type: "info"
      });
    }
    static loading(options) {
      return getStore().create({
        ...options,
        type: "loading"
      });
    }
    static dismiss(id) {
      if (id) getStore().dismiss(id);
      else getStore().dismiss();
    }
  };
  if (void 0) {
    const __moduleExports = {
      Toaster
    };
    registerHotModule4("", __moduleExports);
    (void 0).accept((newModule) => {
      const __updatedModule = newModule || __moduleExports;
      registerHotModule4("", __updatedModule);
      handleComponentUpdate4("", __updatedModule);
    });
    const __origCreated = Toaster.prototype.created;
    Toaster.prototype.created = function(__geaProps) {
      registerComponentInstance4(this.constructor.name, this);
      return __origCreated.call(this, __geaProps);
    };
    const __origDispose = Toaster.prototype.dispose;
    Toaster.prototype.dispose = function() {
      unregisterComponentInstance4(this.constructor.name, this);
      return __origDispose.call(this);
    };
  }

  // packages/gea-ui/src/components/button.tsx
  var variants = {
    default: "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
    destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
    outline: "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
    secondary: "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
    ghost: "hover:bg-accent hover:text-accent-foreground",
    link: "text-primary underline-offset-4 hover:underline"
  };
  var sizes = {
    default: "h-9 px-4 py-2",
    sm: "h-8 rounded-md px-3 text-xs",
    lg: "h-10 rounded-md px-8",
    icon: "h-9 w-9"
  };
  var Button = class extends Component {
    template(props) {
      const variant = variants[props.variant || "default"] || variants.default;
      const size3 = sizes[props.size || "default"] || sizes.default;
      return `<button id="${this.id}"${cn("inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50", variant, size3, props.class) == null || cn("inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50", variant, size3, props.class) === false ? "" : ` class="${cn("inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50", variant, size3, props.class).trim()}"`}${(props.type || "button") == null || (props.type || "button") === false ? "" : ` type="${props.type || "button"}"`}${props.disabled == null || props.disabled === false ? "" : ` disabled="${props.disabled}"`}>${props.children}</button>`;
    }
    get events() {
      return {
        click: {
          [`#${this.id}`]: this.__event_click_0
        }
      };
    }
    __event_click_0(e, targetComponent) {
      const handleClick = this.props.click || this.props.onClick;
      handleClick?.(e);
    }
    __onPropChange(key, value) {
      if (key === "variant") try {
        const __el = this.$(":scope");
        const props = this.props;
        const variant = variants[props.variant || "default"] || variants.default;
        const size3 = sizes[props.size || "default"] || sizes.default;
        const __boundValue = cn("inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50", variant, size3, this.props.class);
        if (__el) {
          const __newClass = __boundValue != null ? String(__boundValue).trim() : "";
          if (__el.className !== __newClass) __el.className = __newClass;
        }
      } catch {
      }
      if (key === "size") try {
        const __el = this.$(":scope");
        const props = this.props;
        const variant = variants[props.variant || "default"] || variants.default;
        const size3 = sizes[props.size || "default"] || sizes.default;
        const __boundValue = cn("inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50", variant, size3, this.props.class);
        if (__el) {
          const __newClass = __boundValue != null ? String(__boundValue).trim() : "";
          if (__el.className !== __newClass) __el.className = __newClass;
        }
      } catch {
      }
      if (key === "class") try {
        const __el = this.$(":scope");
        const props = this.props;
        const variant = variants[props.variant || "default"] || variants.default;
        const size3 = sizes[props.size || "default"] || sizes.default;
        const __boundValue = cn("inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50", variant, size3, this.props.class);
        if (__el) {
          const __newClass = __boundValue != null ? String(__boundValue).trim() : "";
          if (__el.className !== __newClass) __el.className = __newClass;
        }
      } catch {
      }
      if (key === "type") try {
        const __el = this.$(":scope");
        const props = this.props;
        const __boundValue = this.props.type || "button";
        if (__el) if (__boundValue === null || __boundValue === void 0) __el.removeAttribute("type");
        else __el.setAttribute("type", String(__boundValue));
      } catch {
      }
      if (key === "disabled") try {
        const __el = this.$(":scope");
        if (__el) if (!value) __el.removeAttribute("disabled");
        else __el.setAttribute("disabled", "");
      } catch {
      }
      if (key === "children") try {
        const __el = this.$(":scope");
        if (__el) {
          if (__el.innerHTML !== value) __el.innerHTML = value;
        }
      } catch {
      }
    }
  };
  if (void 0) {
    const __moduleExports = {
      default: Button
    };
    registerHotModule5("", __moduleExports);
    (void 0).accept((newModule) => {
      const __updatedModule = newModule || __moduleExports;
      registerHotModule5("", __updatedModule);
      handleComponentUpdate5("", __updatedModule);
    });
    (void 0).accept("../utils/cn", () => (void 0).invalidate());
    const __origCreated = Button.prototype.created;
    Button.prototype.created = function(__geaProps) {
      registerComponentInstance5(this.constructor.name, this);
      return __origCreated.call(this, __geaProps);
    };
    const __origDispose = Button.prototype.dispose;
    Button.prototype.dispose = function() {
      unregisterComponentInstance5(this.constructor.name, this);
      return __origDispose.call(this);
    };
  }

  // jira_clone_gea/src/utils/authToken.ts
  var getStoredAuthToken = () => localStorage.getItem("authToken");
  var storeAuthToken = (token) => localStorage.setItem("authToken", token);
  var removeStoredAuthToken = () => localStorage.removeItem("authToken");

  // jira_clone_gea/src/utils/api.ts
  var BASE_URL = "/api";
  var defaultError = {
    code: "INTERNAL_ERROR",
    message: "Something went wrong. Please check your internet connection or contact our support.",
    status: 503,
    data: {}
  };
  function objectToQueryString(obj) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(obj)) {
      if (value !== void 0 && value !== null) {
        if (Array.isArray(value)) {
          value.forEach((v) => params.append(`${key}[]`, String(v)));
        } else {
          params.append(key, String(value));
        }
      }
    }
    return params.toString();
  }
  async function apiRequest(method, url, variables) {
    const headers = { "Content-Type": "application/json" };
    const token = getStoredAuthToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
    let fullUrl = `${BASE_URL}${url}`;
    const options = { method: method.toUpperCase(), headers };
    if (method === "get" && variables) {
      const qs = objectToQueryString(variables);
      if (qs) fullUrl += `?${qs}`;
    } else if (method !== "get" && variables) {
      options.body = JSON.stringify(variables);
    }
    const response = await fetch(fullUrl, options);
    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch {
        throw defaultError;
      }
      if (errorData?.error?.code === "INVALID_TOKEN") {
        removeStoredAuthToken();
        router.push("/authenticate");
        throw errorData.error;
      }
      throw errorData?.error || defaultError;
    }
    return response.json();
  }
  async function optimisticUpdate(url, {
    updatedFields,
    currentFields,
    setLocalData
  }) {
    try {
      setLocalData(updatedFields);
      await apiRequest("put", url, updatedFields);
    } catch {
      setLocalData(currentFields);
    }
  }
  var api_default = {
    get: (url, variables) => apiRequest("get", url, variables),
    post: (url, variables) => apiRequest("post", url, variables),
    put: (url, variables) => apiRequest("put", url, variables),
    patch: (url, variables) => apiRequest("patch", url, variables),
    delete: (url, variables) => apiRequest("delete", url, variables),
    optimisticUpdate
  };

  // jira_clone_gea/src/utils/javascript.ts
  function updateArrayItemById(arr, itemId, fields) {
    for (let i = 0; i < arr.length; i++) {
      const item = arr[i];
      if (item.id === itemId) {
        Object.assign(item, fields);
        return true;
      }
    }
    return false;
  }
  function sortByNewest(items, sortField) {
    return [...items].sort((a, b) => -a[sortField].localeCompare(b[sortField]));
  }

  // jira_clone_gea/src/stores/project-store.ts
  var ProjectStore = class extends Store {
    project = null;
    isLoading = true;
    error = null;
    async fetchProject() {
      this.isLoading = true;
      try {
        const data = await api_default.get("/project");
        this.project = data.project;
        this.error = null;
      } catch (e) {
        this.error = e;
      } finally {
        this.isLoading = false;
      }
    }
    async updateProject(fields) {
      try {
        await api_default.put("/project", fields);
        await this.fetchProject();
      } catch (e) {
        throw e;
      }
    }
    updateLocalProjectIssues(issueId, fields) {
      if (!this.project) return;
      updateArrayItemById(this.project.issues, issueId, fields);
    }
    async moveIssueToColumn(issueId, newStatus) {
      if (!this.project) return;
      const issue2 = this.project.issues.find((i) => i.id === issueId);
      if (!issue2 || issue2.status === newStatus) return;
      const inTarget = this.project.issues.filter((i) => i.status === newStatus && i.id !== issueId);
      const nextPosition = inTarget.length > 0 ? Math.max(...inTarget.map((i) => Number(i.listPosition) || 0)) + 1 : 1;
      const fields = { status: newStatus, listPosition: nextPosition };
      this.updateLocalProjectIssues(issueId, fields);
      try {
        await api_default.put(`/issues/${issueId}`, fields);
      } catch {
        await this.fetchProject();
      }
    }
    async createIssue(data) {
      await api_default.post("/issues", data);
      await this.fetchProject();
    }
    async deleteIssue(issueId) {
      await api_default.delete(`/issues/${issueId}`);
      await this.fetchProject();
    }
  };
  var project_store_default = new ProjectStore();

  // jira_clone_gea/src/stores/issue-store.ts
  var IssueStore = class extends Store {
    issue = null;
    isLoading = false;
    async fetchIssue(issueId) {
      this.isLoading = true;
      try {
        const data = await api_default.get(`/issues/${issueId}`);
        this.issue = data.issue;
      } catch (e) {
        console.error("Failed to fetch issue:", e);
      } finally {
        this.isLoading = false;
      }
    }
    async updateIssue(fields) {
      if (!this.issue) return;
      const currentFields = { ...this.issue };
      Object.assign(this.issue, fields);
      project_store_default.updateLocalProjectIssues(this.issue.id, fields);
      try {
        await api_default.put(`/issues/${this.issue.id}`, fields);
      } catch {
        Object.assign(this.issue, currentFields);
        project_store_default.updateLocalProjectIssues(this.issue.id, currentFields);
      }
    }
    async createComment(issueId, body) {
      await api_default.post("/comments", { issueId, body });
      await this.fetchIssue(issueId);
    }
    async updateComment(commentId, body, issueId) {
      await api_default.put(`/comments/${commentId}`, { body });
      await this.fetchIssue(issueId);
    }
    async deleteComment(commentId, issueId) {
      await api_default.delete(`/comments/${commentId}`);
      await this.fetchIssue(issueId);
    }
    clear() {
      this.issue = null;
      this.isLoading = false;
    }
  };
  var issue_store_default = new IssueStore();

  // jira_clone_gea/src/views/NavbarLeft.tsx
  var NavbarLeft = class extends Component {
    template({
      onSearchClick,
      onCreateClick
    }) {
      return `<div id="${this.id}" class="navbar-left"><div class="navbar-left-logo"><svg viewBox="0 0 28 28" width="28" height="28" style="fill: #fff"><path d="M26.5 14c0 6.904-5.596 12.5-12.5 12.5S1.5 20.904 1.5 14 7.096 1.5 14 1.5 26.5 7.096 26.5 14z"></path><path d="M14 7l7 7-7 7-7-7 7-7z" style="fill: #0052cc"></path></svg></div><div class="navbar-left-item" id="${this.id + "-ev0"}"><i class="icon icon-search"></i><span class="navbar-left-item-text">Search issues</span></div><div class="navbar-left-item" id="${this.id + "-ev1"}"><i class="icon icon-plus"></i><span class="navbar-left-item-text">Create Issue</span></div><div class="navbar-left-bottom"><div class="navbar-left-item"><i class="icon icon-help"></i><span class="navbar-left-item-text">About</span></div></div></div>`;
    }
    get events() {
      return {
        click: {
          [`#${this.id}-ev0`]: this.__event_click_0,
          [`#${this.id}-ev1`]: this.__event_click_1
        }
      };
    }
    __event_click_0(e, targetComponent) {
      this.props.onSearchClick(e);
    }
    __event_click_1(e, targetComponent) {
      this.props.onCreateClick(e);
    }
  };
  if (void 0) {
    const __moduleExports = {
      default: NavbarLeft
    };
    registerHotModule6("", __moduleExports);
    (void 0).accept((newModule) => {
      const __updatedModule = newModule || __moduleExports;
      registerHotModule6("", __updatedModule);
      handleComponentUpdate6("", __updatedModule);
    });
    const __origCreated = NavbarLeft.prototype.created;
    NavbarLeft.prototype.created = function(__geaProps) {
      registerComponentInstance6(this.constructor.name, this);
      return __origCreated.call(this, __geaProps);
    };
    const __origDispose = NavbarLeft.prototype.dispose;
    NavbarLeft.prototype.dispose = function() {
      unregisterComponentInstance6(this.constructor.name, this);
      return __origDispose.call(this);
    };
  }

  // jira_clone_gea/src/components/Icon.tsx
  var Icon = class extends Component {
    template({
      type,
      size: size3 = 16,
      left = 0,
      top = 0
    }) {
      const transform = left || top ? `transform:translate(${left}px,${top}px)` : "";
      return `<i id="${this.id}"${`icon icon-${type}` == null ? "" : ` class="${`icon icon-${type}`.trim()}"`}${`font-size:${size3}px;${transform}` == null ? "" : ` style="${`font-size:${size3}px;${transform}`}"`}></i>`;
    }
    __onPropChange(key, value) {
      if (key === "type") try {
        const __el = this.$(":scope");
        const __boundValue = `icon icon-${this.props.type}`;
        if (__el) {
          const __newClass = __boundValue != null ? String(__boundValue).trim() : "";
          if (__el.className !== __newClass) __el.className = __newClass;
        }
      } catch {
      }
      if (key === "left") try {
        const __el = this.$(":scope");
        const transform = (this.props.left ?? 0) || (this.props.top ?? 0) ? `transform:translate(${this.props.left ?? 0}px,${this.props.top ?? 0}px)` : "";
        const __boundValue = `font-size:${this.props.size ?? 16}px;${transform}`;
        if (__el) if (__boundValue === null || __boundValue === void 0) __el.removeAttribute("style");
        else __el.setAttribute("style", String(__boundValue));
      } catch {
      }
      if (key === "top") try {
        const __el = this.$(":scope");
        const transform = (this.props.left ?? 0) || (this.props.top ?? 0) ? `transform:translate(${this.props.left ?? 0}px,${this.props.top ?? 0}px)` : "";
        const __boundValue = `font-size:${this.props.size ?? 16}px;${transform}`;
        if (__el) if (__boundValue === null || __boundValue === void 0) __el.removeAttribute("style");
        else __el.setAttribute("style", String(__boundValue));
      } catch {
      }
      if (key === "size") try {
        const __el = this.$(":scope");
        const transform = (this.props.left ?? 0) || (this.props.top ?? 0) ? `transform:translate(${this.props.left ?? 0}px,${this.props.top ?? 0}px)` : "";
        const __boundValue = `font-size:${this.props.size ?? 16}px;${transform}`;
        if (__el) if (__boundValue === null || __boundValue === void 0) __el.removeAttribute("style");
        else __el.setAttribute("style", String(__boundValue));
      } catch {
      }
    }
  };
  if (void 0) {
    const __moduleExports = {
      default: Icon
    };
    registerHotModule7("", __moduleExports);
    (void 0).accept((newModule) => {
      const __updatedModule = newModule || __moduleExports;
      registerHotModule7("", __updatedModule);
      handleComponentUpdate7("", __updatedModule);
    });
    const __origCreated = Icon.prototype.created;
    Icon.prototype.created = function(__geaProps) {
      registerComponentInstance7(this.constructor.name, this);
      return __origCreated.call(this, __geaProps);
    };
    const __origDispose = Icon.prototype.dispose;
    Icon.prototype.dispose = function() {
      unregisterComponentInstance7(this.constructor.name, this);
      return __origDispose.call(this);
    };
  }

  // jira_clone_gea/src/views/Sidebar.tsx
  var Sidebar = class extends Component {
    constructor(...args) {
      super(...args);
      this._icon7 = null;
      this._icon6 = null;
      this._icon5 = null;
      this._icon4 = null;
      this._icon3 = null;
      this._icon2 = null;
      this._icon = null;
    }
    template() {
      const project = project_store_default.project;
      if (!project) return `<div id="${this.id}" class="sidebar"></div>`;
      const currentPath = router.path;
      return `<div id="${this.id}" class="sidebar"><div class="sidebar-project-info"><div id="${this.id + "-b3"}" class="sidebar-project-avatar">${project.name?.charAt(0) || "P"}</div><div class="sidebar-project-texts"><div id="${this.id + "-b1"}" class="sidebar-project-name">${project.name}</div><div id="${this.id + "-b2"}" class="sidebar-project-category">${project.category} project</div></div></div><div id="${this.id + "-b4"}"${`sidebar-link ${currentPath.includes("/board") ? "active" : ""}` == null ? "" : ` class="${`sidebar-link ${currentPath.includes("/board") ? "active" : ""}`.trim()}"`}>${this.__ensureChild_icon()}<span class="sidebar-link-text">Kanban Board</span></div><div id="${this.id + "-b5"}"${`sidebar-link ${currentPath.includes("/settings") ? "active" : ""}` == null ? "" : ` class="${`sidebar-link ${currentPath.includes("/settings") ? "active" : ""}`.trim()}"`}>${this.__ensureChild_icon2()}<span class="sidebar-link-text">Project Settings</span></div><div class="sidebar-divider"></div><div class="sidebar-link sidebar-link-not-implemented">${this.__ensureChild_icon3()}<span class="sidebar-link-text">Releases</span><span class="sidebar-not-implemented">Not implemented</span></div><div class="sidebar-link sidebar-link-not-implemented">${this.__ensureChild_icon4()}<span class="sidebar-link-text">Issues and filters</span><span class="sidebar-not-implemented">Not implemented</span></div><div class="sidebar-link sidebar-link-not-implemented">${this.__ensureChild_icon5()}<span class="sidebar-link-text">Pages</span><span class="sidebar-not-implemented">Not implemented</span></div><div class="sidebar-link sidebar-link-not-implemented">${this.__ensureChild_icon6()}<span class="sidebar-link-text">Reports</span><span class="sidebar-not-implemented">Not implemented</span></div><div class="sidebar-link sidebar-link-not-implemented">${this.__ensureChild_icon7()}<span class="sidebar-link-text">Components</span><span class="sidebar-not-implemented">Not implemented</span></div></div>`;
    }
    get events() {
      return {
        click: {
          [`#${this.id}-b4`]: this.__event_click_0,
          [`#${this.id}-b5`]: this.__event_click_1
        }
      };
    }
    __event_click_0(e, targetComponent) {
      router.push("/project/board");
    }
    __event_click_1(e, targetComponent) {
      router.push("/project/settings");
    }
    __buildProps_icon() {
      return {
        type: "board",
        size: 20
      };
    }
    __refreshChildProps_icon() {
      const child = this._icon;
      if (!child) {
        return;
      }
      child.__geaUpdateProps(this.__buildProps_icon());
    }
    __ensureChild_icon() {
      if (!this._icon) {
        this._icon = new Icon(this.__buildProps_icon());
        this._icon.parentComponent = this;
        this._icon.__geaCompiledChild = true;
      } else {
        this._icon.props = this.__buildProps_icon();
      }
      return this._icon;
    }
    __buildProps_icon2() {
      return {
        type: "settings",
        size: 20
      };
    }
    __refreshChildProps_icon2() {
      const child = this._icon2;
      if (!child) {
        return;
      }
      child.__geaUpdateProps(this.__buildProps_icon2());
    }
    __ensureChild_icon2() {
      if (!this._icon2) {
        this._icon2 = new Icon(this.__buildProps_icon2());
        this._icon2.parentComponent = this;
        this._icon2.__geaCompiledChild = true;
      } else {
        this._icon2.props = this.__buildProps_icon2();
      }
      return this._icon2;
    }
    __buildProps_icon3() {
      return {
        type: "shipping",
        size: 20
      };
    }
    __refreshChildProps_icon3() {
      const child = this._icon3;
      if (!child) {
        return;
      }
      child.__geaUpdateProps(this.__buildProps_icon3());
    }
    __ensureChild_icon3() {
      if (!this._icon3) {
        this._icon3 = new Icon(this.__buildProps_icon3());
        this._icon3.parentComponent = this;
        this._icon3.__geaCompiledChild = true;
      } else {
        this._icon3.props = this.__buildProps_icon3();
      }
      return this._icon3;
    }
    __buildProps_icon4() {
      return {
        type: "issues",
        size: 20
      };
    }
    __refreshChildProps_icon4() {
      const child = this._icon4;
      if (!child) {
        return;
      }
      child.__geaUpdateProps(this.__buildProps_icon4());
    }
    __ensureChild_icon4() {
      if (!this._icon4) {
        this._icon4 = new Icon(this.__buildProps_icon4());
        this._icon4.parentComponent = this;
        this._icon4.__geaCompiledChild = true;
      } else {
        this._icon4.props = this.__buildProps_icon4();
      }
      return this._icon4;
    }
    __buildProps_icon5() {
      return {
        type: "page",
        size: 20
      };
    }
    __refreshChildProps_icon5() {
      const child = this._icon5;
      if (!child) {
        return;
      }
      child.__geaUpdateProps(this.__buildProps_icon5());
    }
    __ensureChild_icon5() {
      if (!this._icon5) {
        this._icon5 = new Icon(this.__buildProps_icon5());
        this._icon5.parentComponent = this;
        this._icon5.__geaCompiledChild = true;
      } else {
        this._icon5.props = this.__buildProps_icon5();
      }
      return this._icon5;
    }
    __buildProps_icon6() {
      return {
        type: "reports",
        size: 20
      };
    }
    __refreshChildProps_icon6() {
      const child = this._icon6;
      if (!child) {
        return;
      }
      child.__geaUpdateProps(this.__buildProps_icon6());
    }
    __ensureChild_icon6() {
      if (!this._icon6) {
        this._icon6 = new Icon(this.__buildProps_icon6());
        this._icon6.parentComponent = this;
        this._icon6.__geaCompiledChild = true;
      } else {
        this._icon6.props = this.__buildProps_icon6();
      }
      return this._icon6;
    }
    __buildProps_icon7() {
      return {
        type: "component",
        size: 20
      };
    }
    __refreshChildProps_icon7() {
      const child = this._icon7;
      if (!child) {
        return;
      }
      child.__geaUpdateProps(this.__buildProps_icon7());
    }
    __ensureChild_icon7() {
      if (!this._icon7) {
        this._icon7 = new Icon(this.__buildProps_icon7());
        this._icon7.parentComponent = this;
        this._icon7.__geaCompiledChild = true;
      } else {
        this._icon7.props = this.__buildProps_icon7();
      }
      return this._icon7;
    }
    dispose() {
      if (this.__observer_removers__) {
        this.__observer_removers__.forEach((fn) => fn());
      }
      this._icon?.dispose?.();
      this._icon2?.dispose?.();
      this._icon3?.dispose?.();
      this._icon4?.dispose?.();
      this._icon5?.dispose?.();
      this._icon6?.dispose?.();
      this._icon7?.dispose?.();
      super.dispose();
    }
    __observe_projectStore_project__name(name, change) {
      if (document.getElementById(this.id + "-b1")) {
        document.getElementById(this.id + "-b1").textContent = name;
      }
    }
    __observe_projectStore_project__category(category, change) {
      if (document.getElementById(this.id + "-b2")) {
        document.getElementById(this.id + "-b2").textContent = `${this.__stores.project.category} project`;
      }
    }
    __observe_projectStore_project(value, change) {
      if (this.rendered_) {
        const __el = document.getElementById(this.id + "-b3");
        const project = project_store_default.project;
        const __boundValue = project.name?.charAt(0) || "P";
        if (__el) {
          if (__el.textContent !== __boundValue) __el.textContent = __boundValue;
        }
      }
    }
    __observe_router_path(value, change) {
      if (this.rendered_) {
        {
          const __el = document.getElementById(this.id + "-b4");
          const currentPath = router.path;
          const __boundValue = `sidebar-link ${currentPath.includes("/board") ? "active" : ""}`;
          if (__el) {
            const __newClass = __boundValue != null ? String(__boundValue).trim() : "";
            if (__el.className !== __newClass) __el.className = __newClass;
          }
        }
        {
          const __el = document.getElementById(this.id + "-b5");
          const currentPath = router.path;
          const __boundValue = `sidebar-link ${currentPath.includes("/settings") ? "active" : ""}`;
          if (__el) {
            const __newClass = __boundValue != null ? String(__boundValue).trim() : "";
            if (__el.className !== __newClass) __el.className = __newClass;
          }
        }
      }
    }
    createdHooks() {
      if (!this.__observer_removers__) {
        this.__observer_removers__ = [];
      }
      if (!this.__stores) {
        this.__stores = {};
      }
      this.__observer_removers__.forEach((fn) => fn());
      this.__observer_removers__ = [];
      if (typeof this.__ensureArrayConfigs === "function") {
        this.__ensureArrayConfigs();
      }
      this.__stores.projectStore = project_store_default.__store;
      this.__observer_removers__.push(this.__stores.projectStore.observe(["project", "name"], (__v, __c) => this.__observe_projectStore_project__name(__v, __c)));
      this.__observer_removers__.push(this.__stores.projectStore.observe(["project", "category"], (__v, __c) => this.__observe_projectStore_project__category(__v, __c)));
      this.__observer_removers__.push(this.__stores.projectStore.observe(["project"], (__v, __c) => this.__observe_projectStore_project(__v, __c)));
      this.__stores.router = router.__store;
      this.__observer_removers__.push(this.__stores.router.observe(["path"], (__v, __c) => this.__observe_router_path(__v, __c)));
    }
  };
  if (void 0) {
    const __moduleExports = {
      default: Sidebar
    };
    registerHotModule8("", __moduleExports);
    (void 0).accept((newModule) => {
      const __updatedModule = newModule || __moduleExports;
      registerHotModule8("", __updatedModule);
      handleComponentUpdate8("", __updatedModule);
    });
    (void 0).accept("../stores/project-store", () => (void 0).invalidate());
    (void 0).accept("../components/Icon", () => (void 0).invalidate());
    const __origCreated = Sidebar.prototype.created;
    Sidebar.prototype.created = function(__geaProps) {
      registerComponentInstance8(this.constructor.name, this);
      return __origCreated.call(this, __geaProps);
    };
    const __origDispose = Sidebar.prototype.dispose;
    Sidebar.prototype.dispose = function() {
      unregisterComponentInstance8(this.constructor.name, this);
      return __origDispose.call(this);
    };
  }

  // jira_clone_gea/src/stores/filters-store.ts
  var FiltersStore = class extends Store {
    searchTerm = "";
    userIds = [];
    myOnly = false;
    recentOnly = false;
    get areFiltersCleared() {
      return !this.searchTerm && this.userIds.length === 0 && !this.myOnly && !this.recentOnly;
    }
    setSearchTerm(val) {
      this.searchTerm = val;
    }
    toggleUserId(id) {
      const idx = this.userIds.indexOf(id);
      if (idx >= 0) {
        this.userIds.splice(idx, 1);
      } else {
        this.userIds.push(id);
      }
    }
    toggleMyOnly() {
      this.myOnly = !this.myOnly;
    }
    toggleRecentOnly() {
      this.recentOnly = !this.recentOnly;
    }
    clearAll() {
      this.searchTerm = "";
      this.userIds = [];
      this.myOnly = false;
      this.recentOnly = false;
    }
  };
  var filters_store_default = new FiltersStore();

  // jira_clone_gea/src/stores/auth-store.ts
  var AuthStore = class extends Store {
    token = getStoredAuthToken();
    currentUser = null;
    isAuthenticating = false;
    get isAuthenticated() {
      return !!this.token;
    }
    async authenticate() {
      this.isAuthenticating = true;
      try {
        const data = await api_default.post("/authentication/guest");
        this.token = data.authToken;
        storeAuthToken(data.authToken);
        const userData = await api_default.get("/currentUser");
        this.currentUser = userData.currentUser;
      } catch (e) {
        console.error("Auth failed:", e);
      } finally {
        this.isAuthenticating = false;
      }
    }
    async fetchCurrentUser() {
      try {
        const data = await api_default.get("/currentUser");
        this.currentUser = data.currentUser;
      } catch (e) {
        console.error("Failed to fetch user:", e);
      }
    }
  };
  var auth_store_default = new AuthStore();

  // jira_clone_gea/src/constants/issues.ts
  var IssueType = {
    TASK: "task",
    BUG: "bug",
    STORY: "story"
  };
  var IssueStatus = {
    BACKLOG: "backlog",
    SELECTED: "selected",
    INPROGRESS: "inprogress",
    DONE: "done"
  };
  var IssuePriority = {
    HIGHEST: "5",
    HIGH: "4",
    MEDIUM: "3",
    LOW: "2",
    LOWEST: "1"
  };
  var IssueTypeCopy = {
    [IssueType.TASK]: "Task",
    [IssueType.BUG]: "Bug",
    [IssueType.STORY]: "Story"
  };
  var IssueStatusCopy = {
    [IssueStatus.BACKLOG]: "Backlog",
    [IssueStatus.SELECTED]: "Selected for development",
    [IssueStatus.INPROGRESS]: "In progress",
    [IssueStatus.DONE]: "Done"
  };
  var IssuePriorityCopy = {
    [IssuePriority.HIGHEST]: "Highest",
    [IssuePriority.HIGH]: "High",
    [IssuePriority.MEDIUM]: "Medium",
    [IssuePriority.LOW]: "Low",
    [IssuePriority.LOWEST]: "Lowest"
  };

  // jira_clone_gea/src/components/Breadcrumbs.tsx
  var Breadcrumbs = class extends Component {
    template({
      items = []
    }) {
      return `<div id="${this.id}" class="breadcrumbs">${items.map((item, i) => `<span data-gea-item-id="${String(item)}">${i > 0 && `<span class="breadcrumbs-separator">/</span>` || ""}<span class="breadcrumbs-item">${item}</span></span>`).join("") + "<!---->"}</div>`;
    }
    render__unresolved_0Item(item, i) {
      const __v = (v) => v != null && typeof v === "object" ? v.valueOf() : v;
      return `<span data-gea-item-id="${i}">${i > 0 && `<span class="breadcrumbs-separator">/</span>` || ""}<span class="breadcrumbs-item">${item}</span></span>`;
    }
    create__unresolved_0Item(item, __idx) {
      var __tw = this.____unresolved_0_container.cloneNode(false);
      __tw.innerHTML = this.render__unresolved_0Item(item, __idx);
      var el = __tw.firstElementChild;
      return el;
    }
    __onPropChange(key, value) {
      if (key === "items") this.__geaSyncMap(0);
    }
    __observe_local_props__items(__v, __c) {
      this.__geaSyncMap(0);
    }
    __observe_local_props(__v, __c) {
      this.__geaSyncMap(0);
    }
    createdHooks() {
      if (!this.__observer_removers__) {
        this.__observer_removers__ = [];
      }
      if (!this.__stores) {
        this.__stores = {};
      }
      this.__observer_removers__.forEach((fn) => fn());
      this.__observer_removers__ = [];
      if (typeof this.__ensureArrayConfigs === "function") {
        this.__ensureArrayConfigs();
      }
      this.__geaRegisterMap(0, "____unresolved_0_container", () => this.$(":scope"), () => {
        const {
          items = []
        } = this.props;
        return this.props.items ?? [];
      }, (__item, __idx) => this.create__unresolved_0Item(__item, __idx));
    }
    dispose() {
      if (this.__observer_removers__) {
        this.__observer_removers__.forEach((fn) => fn());
      }
      super.dispose();
    }
  };
  if (void 0) {
    const __moduleExports = {
      default: Breadcrumbs
    };
    registerHotModule9("", __moduleExports);
    (void 0).accept((newModule) => {
      const __updatedModule = newModule || __moduleExports;
      registerHotModule9("", __updatedModule);
      handleComponentUpdate9("", __updatedModule);
    });
    const __origCreated = Breadcrumbs.prototype.created;
    Breadcrumbs.prototype.created = function(__geaProps) {
      registerComponentInstance9(this.constructor.name, this);
      return __origCreated.call(this, __geaProps);
    };
    const __origDispose = Breadcrumbs.prototype.dispose;
    Breadcrumbs.prototype.dispose = function() {
      unregisterComponentInstance9(this.constructor.name, this);
      return __origDispose.call(this);
    };
  }

  // jira_clone_gea/src/components/IssueTypeIcon.tsx
  var typeColors = {
    task: "#4FADE6",
    bug: "#E44D42",
    story: "#65BA43"
  };
  var typeIcons = {
    task: "task",
    bug: "bug",
    story: "story"
  };
  var IssueTypeIcon = class extends Component {
    template({
      type,
      size: size3 = 18,
      top = 0,
      left = 0
    }) {
      const color = typeColors[type] || "#4FADE6";
      const transform = left || top ? `transform:translate(${left}px,${top}px)` : "";
      return `<i id="${this.id}"${`icon icon-${typeIcons[type] || "task"}` == null ? "" : ` class="${`icon icon-${typeIcons[type] || "task"}`.trim()}"`}${`font-size:${size3}px;color:${color};${transform}` == null ? "" : ` style="${`font-size:${size3}px;color:${color};${transform}`}"`}></i>`;
    }
    __onPropChange(key, value) {
      if (key === "type") try {
        {
          const __el = this.$(":scope");
          const {
            type
          } = this.props;
          const __boundValue = `icon icon-${typeIcons[type] || "task"}`;
          if (__el) {
            const __newClass = __boundValue != null ? String(__boundValue).trim() : "";
            if (__el.className !== __newClass) __el.className = __newClass;
          }
        }
        {
          const __el = this.$(":scope");
          const {
            type
          } = this.props;
          const color = typeColors[type] || "#4FADE6";
          const transform = (this.props.left ?? 0) || (this.props.top ?? 0) ? `transform:translate(${this.props.left ?? 0}px,${this.props.top ?? 0}px)` : "";
          const __boundValue = `font-size:${this.props.size ?? 18}px;color:${color};${transform}`;
          if (__el) if (__boundValue === null || __boundValue === void 0) __el.removeAttribute("style");
          else __el.setAttribute("style", String(__boundValue));
        }
      } catch {
      }
      if (key === "left") try {
        const __el = this.$(":scope");
        const {
          type
        } = this.props;
        const color = typeColors[type] || "#4FADE6";
        const transform = (this.props.left ?? 0) || (this.props.top ?? 0) ? `transform:translate(${this.props.left ?? 0}px,${this.props.top ?? 0}px)` : "";
        const __boundValue = `font-size:${this.props.size ?? 18}px;color:${color};${transform}`;
        if (__el) if (__boundValue === null || __boundValue === void 0) __el.removeAttribute("style");
        else __el.setAttribute("style", String(__boundValue));
      } catch {
      }
      if (key === "top") try {
        const __el = this.$(":scope");
        const {
          type
        } = this.props;
        const color = typeColors[type] || "#4FADE6";
        const transform = (this.props.left ?? 0) || (this.props.top ?? 0) ? `transform:translate(${this.props.left ?? 0}px,${this.props.top ?? 0}px)` : "";
        const __boundValue = `font-size:${this.props.size ?? 18}px;color:${color};${transform}`;
        if (__el) if (__boundValue === null || __boundValue === void 0) __el.removeAttribute("style");
        else __el.setAttribute("style", String(__boundValue));
      } catch {
      }
      if (key === "size") try {
        const __el = this.$(":scope");
        const {
          type
        } = this.props;
        const color = typeColors[type] || "#4FADE6";
        const transform = (this.props.left ?? 0) || (this.props.top ?? 0) ? `transform:translate(${this.props.left ?? 0}px,${this.props.top ?? 0}px)` : "";
        const __boundValue = `font-size:${this.props.size ?? 18}px;color:${color};${transform}`;
        if (__el) if (__boundValue === null || __boundValue === void 0) __el.removeAttribute("style");
        else __el.setAttribute("style", String(__boundValue));
      } catch {
      }
    }
  };
  if (void 0) {
    const __moduleExports = {
      default: IssueTypeIcon
    };
    registerHotModule10("", __moduleExports);
    (void 0).accept((newModule) => {
      const __updatedModule = newModule || __moduleExports;
      registerHotModule10("", __updatedModule);
      handleComponentUpdate10("", __updatedModule);
    });
    const __origCreated = IssueTypeIcon.prototype.created;
    IssueTypeIcon.prototype.created = function(__geaProps) {
      registerComponentInstance10(this.constructor.name, this);
      return __origCreated.call(this, __geaProps);
    };
    const __origDispose = IssueTypeIcon.prototype.dispose;
    IssueTypeIcon.prototype.dispose = function() {
      unregisterComponentInstance10(this.constructor.name, this);
      return __origDispose.call(this);
    };
  }

  // jira_clone_gea/src/components/IssuePriorityIcon.tsx
  var priorityIcons = {
    "5": {
      icon: "arrow_up",
      color: "#CD1317"
    },
    "4": {
      icon: "arrow_up",
      color: "#E9494A"
    },
    "3": {
      icon: "arrow_up",
      color: "#E97F33"
    },
    "2": {
      icon: "arrow_down",
      color: "#2D8738"
    },
    "1": {
      icon: "arrow_down",
      color: "#57A55A"
    }
  };
  var IssuePriorityIcon = class extends Component {
    template({
      priority,
      top = 0,
      left = 0
    }) {
      const info = priorityIcons[priority] || priorityIcons["3"];
      const transform = left || top ? `transform:translate(${left}px,${top}px)` : "";
      return `<span id="${this.id}" class="issue-priority-icon"${`color:${info.color};${transform}` == null ? "" : ` style="${`color:${info.color};${transform}`}"`}><i id="${this.id + "-b1"}"${`icon icon-${info.icon}` == null ? "" : ` class="${`icon icon-${info.icon}`.trim()}"`}></i></span>`;
    }
    __onPropChange(key, value) {
      if (key === "priority") try {
        {
          const __el = this.$(":scope");
          const {
            priority
          } = this.props;
          const info = priorityIcons[priority] || priorityIcons["3"];
          const transform = (this.props.left ?? 0) || (this.props.top ?? 0) ? `transform:translate(${this.props.left ?? 0}px,${this.props.top ?? 0}px)` : "";
          const __boundValue = `color:${info.color};${transform}`;
          if (__el) if (__boundValue === null || __boundValue === void 0) __el.removeAttribute("style");
          else __el.setAttribute("style", String(__boundValue));
        }
        {
          const __el = document.getElementById(this.id + "-b1");
          const {
            priority
          } = this.props;
          const info = priorityIcons[priority] || priorityIcons["3"];
          const __boundValue = `icon icon-${info.icon}`;
          if (__el) {
            const __newClass = __boundValue != null ? String(__boundValue).trim() : "";
            if (__el.className !== __newClass) __el.className = __newClass;
          }
        }
      } catch {
      }
      if (key === "left") try {
        const __el = this.$(":scope");
        const {
          priority
        } = this.props;
        const info = priorityIcons[priority] || priorityIcons["3"];
        const transform = (this.props.left ?? 0) || (this.props.top ?? 0) ? `transform:translate(${this.props.left ?? 0}px,${this.props.top ?? 0}px)` : "";
        const __boundValue = `color:${info.color};${transform}`;
        if (__el) if (__boundValue === null || __boundValue === void 0) __el.removeAttribute("style");
        else __el.setAttribute("style", String(__boundValue));
      } catch {
      }
      if (key === "top") try {
        const __el = this.$(":scope");
        const {
          priority
        } = this.props;
        const info = priorityIcons[priority] || priorityIcons["3"];
        const transform = (this.props.left ?? 0) || (this.props.top ?? 0) ? `transform:translate(${this.props.left ?? 0}px,${this.props.top ?? 0}px)` : "";
        const __boundValue = `color:${info.color};${transform}`;
        if (__el) if (__boundValue === null || __boundValue === void 0) __el.removeAttribute("style");
        else __el.setAttribute("style", String(__boundValue));
      } catch {
      }
    }
  };
  if (void 0) {
    const __moduleExports = {
      default: IssuePriorityIcon
    };
    registerHotModule11("", __moduleExports);
    (void 0).accept((newModule) => {
      const __updatedModule = newModule || __moduleExports;
      registerHotModule11("", __updatedModule);
      handleComponentUpdate11("", __updatedModule);
    });
    const __origCreated = IssuePriorityIcon.prototype.created;
    IssuePriorityIcon.prototype.created = function(__geaProps) {
      registerComponentInstance11(this.constructor.name, this);
      return __origCreated.call(this, __geaProps);
    };
    const __origDispose = IssuePriorityIcon.prototype.dispose;
    IssuePriorityIcon.prototype.dispose = function() {
      unregisterComponentInstance11(this.constructor.name, this);
      return __origDispose.call(this);
    };
  }

  // jira_clone_gea/src/components/IssueCard.tsx
  var IssueCard = class extends Component {
    constructor(...args) {
      super(...args);
      this._issuePriorityIcon = null;
      this._issueTypeIcon = null;
      this._buildAssigneesItems();
    }
    _didDrag = false;
    handleClick() {
      if (this._didDrag) return;
      router.push(`/project/board/issues/${this.props.issueId}`);
    }
    onDragStart(e) {
      this._didDrag = true;
      const id = this.props.issueId;
      e.dataTransfer?.setData("text/plain", id);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
      e.currentTarget.classList.add("dragging");
    }
    onDragEnd(e) {
      ;
      e.currentTarget.classList.remove("dragging");
      queueMicrotask(() => {
        this._didDrag = false;
      });
    }
    template({
      issueId,
      title,
      type,
      priority,
      assignees = []
    }) {
      Component._register(IssueTypeIcon);
      Component._register(IssuePriorityIcon);
      return `<div id="${this.id}" class="issue-card"${false ? "" : ` draggable="${true}"`}><p id="${this.id + "-b1"}" class="issue-card-title">${title}</p><div class="issue-card-footer"><div class="issue-card-footer-left">${this.__ensureChild_issueTypeIcon()}${this.__ensureChild_issuePriorityIcon()}</div><div id="${this.id + "-b2"}" class="issue-card-footer-right">${this._assigneesItems.join("")}</div></div></div>`;
    }
    get events() {
      return {
        dragstart: {
          [`#${this.id}`]: this.__event_dragstart_0
        },
        dragend: {
          [`#${this.id}`]: this.__event_dragend_1
        },
        click: {
          [`#${this.id}`]: this.__event_click_2
        }
      };
    }
    __event_dragstart_0(e, targetComponent) {
      this.onDragStart(e);
    }
    __event_dragend_1(e, targetComponent) {
      this.onDragEnd(e);
    }
    __event_click_2(e, targetComponent) {
      this.handleClick();
    }
    __ensureChild_issueTypeIcon() {
      if (!this._issueTypeIcon) {
        this._issueTypeIcon = new IssueTypeIcon({
          type: this.props.type
        });
        this._issueTypeIcon.parentComponent = this;
        this._issueTypeIcon.__geaCompiledChild = true;
      }
      return this._issueTypeIcon;
    }
    __buildProps_issuePriorityIcon() {
      const {
        priority
      } = this.props;
      return {
        priority,
        top: -1,
        left: 4
      };
    }
    __refreshChildProps_issuePriorityIcon() {
      const child = this._issuePriorityIcon;
      if (!child) {
        return;
      }
      child.__geaUpdateProps(this.__buildProps_issuePriorityIcon());
    }
    __ensureChild_issuePriorityIcon() {
      if (!this._issuePriorityIcon) {
        this._issuePriorityIcon = new IssuePriorityIcon(this.__buildProps_issuePriorityIcon());
        this._issuePriorityIcon.parentComponent = this;
        this._issuePriorityIcon.__geaCompiledChild = true;
      } else {
        this._issuePriorityIcon.props = this.__buildProps_issuePriorityIcon();
      }
      return this._issuePriorityIcon;
    }
    dispose() {
      this._assigneesItems?.forEach?.((item) => item?.dispose?.());
      this._issueTypeIcon?.dispose?.();
      this._issuePriorityIcon?.dispose?.();
      super.dispose();
    }
    __itemProps_assignees(opt) {
      return {
        src: opt.avatarUrl,
        name: opt.name,
        class: "!h-6 !w-6"
      };
    }
    _buildAssigneesItems() {
      const {
        assignees = []
      } = this.props;
      const arr = this.props.assignees ?? [];
      this._assigneesItems = arr.map((opt) => {
        const item = new Avatar(this.__itemProps_assignees(opt));
        item.parentComponent = this;
        item.__geaCompiledChild = true;
        return item;
      });
    }
    __mountAssigneesItems() {
      if (!this.__assigneesItemsContainer) {
        this.__assigneesItemsContainer = document.getElementById(this.id + "-b2");
      }
      if (!this.__assigneesItemsContainer) return;
      this.__assigneesItemsContainer.textContent = "";
      for (let i = 0; i < (this._assigneesItems?.length ?? 0); i++) {
        const item = this._assigneesItems[i];
        if (!item) continue;
        if (!this.__childComponents.includes(item)) {
          this.__childComponents.push(item);
        }
        item.render(this.__assigneesItemsContainer, i);
      }
    }
    __refreshAssigneesItems() {
      const {
        assignees = []
      } = this.props;
      const arr = this.props.assignees ?? [];
      const __old = this._assigneesItems ?? [];
      const __oldLen = __old.length;
      const __newLen = arr.length;
      if (__oldLen !== __newLen) {
        if (__newLen > __oldLen) {
          for (let __k = 0; __k < __oldLen; __k++) {
            const opt = arr[__k];
            __old[__k].__geaUpdateProps(this.__itemProps_assignees(opt));
          }
          if (!this.__assigneesItemsContainer && this.rendered_) {
            this.__assigneesItemsContainer = document.getElementById(this.id + "-b2");
          }
          for (let __k = __oldLen; __k < __newLen; __k++) {
            const opt = arr[__k];
            const __item = new Avatar(this.__itemProps_assignees(opt));
            __item.parentComponent = this;
            __item.__geaCompiledChild = true;
            this._assigneesItems.push(__item);
            if (!this.__childComponents.includes(__item)) {
              this.__childComponents.push(__item);
            }
            if (this.rendered_ && this.__assigneesItemsContainer) {
              __item.render(this.__assigneesItemsContainer, __k);
            }
          }
          return;
        }
        if (__newLen < __oldLen) {
          for (let __k = __newLen; __k < __oldLen; __k++) {
            __old[__k]?.dispose?.();
          }
          this._assigneesItems.length = __newLen;
          this.__childComponents = (this.__childComponents || []).filter((child) => !__old.slice(__newLen).includes(child));
          for (let __k = 0; __k < __newLen; __k++) {
            const opt = arr[__k];
            this._assigneesItems[__k].__geaUpdateProps(this.__itemProps_assignees(opt));
          }
          return;
        }
      }
      for (let i = 0; i < arr.length; i++) {
        const opt = arr[i];
        this._assigneesItems[i].__geaUpdateProps(this.__itemProps_assignees(opt));
      }
    }
    __onPropChange(key, value) {
      if (key === "type") this._issueTypeIcon.__geaUpdateProps({
        [key]: value
      });
      if (key === "priority") this.__refreshChildProps_issuePriorityIcon();
      if (key === "assignees") this.__refreshAssigneesItems();
      if (key === "title") try {
        const __el = document.getElementById(this.id + "-b1");
        if (__el) {
          if (__el.textContent !== value) __el.textContent = value;
        }
      } catch {
      }
    }
  };
  if (void 0) {
    const __moduleExports = {
      default: IssueCard
    };
    registerHotModule12("", __moduleExports);
    (void 0).accept((newModule) => {
      const __updatedModule = newModule || __moduleExports;
      registerHotModule12("", __updatedModule);
      handleComponentUpdate12("", __updatedModule);
    });
    (void 0).accept("./IssueTypeIcon", () => (void 0).invalidate());
    (void 0).accept("./IssuePriorityIcon", () => (void 0).invalidate());
    const __origCreated = IssueCard.prototype.created;
    IssueCard.prototype.created = function(__geaProps) {
      registerComponentInstance12(this.constructor.name, this);
      return __origCreated.call(this, __geaProps);
    };
    const __origDispose = IssueCard.prototype.dispose;
    IssueCard.prototype.dispose = function() {
      unregisterComponentInstance12(this.constructor.name, this);
      return __origDispose.call(this);
    };
  }

  // jira_clone_gea/src/components/BoardColumn.tsx
  function resolveAssignees(issue2, users) {
    return (issue2.userIds || []).map((uid) => users.find((u) => u.id === uid)).filter(Boolean);
  }
  var BoardColumn = class extends Component {
    constructor(...args) {
      super(...args);
      this._buildIssuesItems();
    }
    template({
      status,
      issues = []
    }) {
      Component._register(IssueCard);
      const project = project_store_default.project;
      const users = project ? project.users : [];
      return `<div id="${this.id}" class="board-list"><div id="${this.id + "-b1"}" class="board-list-title">${IssueStatusCopy[status]} <span id="${this.id + "-b2"}" class="board-list-issues-count">${issues.length}</span></div><div id="${this.id + "-b3"}" class="board-list-issues">${this._issuesItems.join("")}</div></div>`;
    }
    get events() {
      return {
        dragover: {
          [`#${this.id}-b3`]: this.__event_dragover_0
        },
        dragleave: {
          [`#${this.id}-b3`]: this.__event_dragleave_1
        },
        drop: {
          [`#${this.id}-b3`]: this.__event_drop_2
        }
      };
    }
    __event_dragover_0(e, targetComponent) {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      e.currentTarget.classList.add("board-list--drag-over");
    }
    __event_dragleave_1(e, targetComponent) {
      const el = e.currentTarget;
      const related = e.relatedTarget;
      if (!related || !el.contains(related)) el.classList.remove("board-list--drag-over");
    }
    __event_drop_2(e, targetComponent) {
      e.preventDefault();
      const el = e.currentTarget;
      el.classList.remove("board-list--drag-over");
      const id = e.dataTransfer?.getData("text/plain");
      if (id) project_store_default.moveIssueToColumn(id, this.props.status);
    }
    __itemProps_issues(opt) {
      const project = project_store_default.project;
      const users = project ? project.users : [];
      return {
        issueId: opt.id,
        title: opt.title,
        type: opt.type,
        priority: opt.priority,
        assignees: resolveAssignees(opt, users)
      };
    }
    _buildIssuesItems() {
      const {
        issues = []
      } = this.props;
      const arr = this.props.issues ?? [];
      this._issuesItems = arr.map((opt) => {
        const item = new IssueCard(this.__itemProps_issues(opt));
        item.parentComponent = this;
        item.__geaCompiledChild = true;
        return item;
      });
    }
    __mountIssuesItems() {
      if (!this.__issuesItemsContainer) {
        this.__issuesItemsContainer = document.getElementById(this.id + "-b3");
      }
      if (!this.__issuesItemsContainer) return;
      this.__issuesItemsContainer.textContent = "";
      for (let i = 0; i < (this._issuesItems?.length ?? 0); i++) {
        const item = this._issuesItems[i];
        if (!item) continue;
        if (!this.__childComponents.includes(item)) {
          this.__childComponents.push(item);
        }
        item.render(this.__issuesItemsContainer, i);
      }
    }
    __refreshIssuesItems() {
      const {
        issues = []
      } = this.props;
      const arr = this.props.issues ?? [];
      const __old = this._issuesItems ?? [];
      const __oldLen = __old.length;
      const __newLen = arr.length;
      if (__oldLen !== __newLen) {
        if (__newLen > __oldLen) {
          for (let __k = 0; __k < __oldLen; __k++) {
            const opt = arr[__k];
            __old[__k].__geaUpdateProps(this.__itemProps_issues(opt));
          }
          if (!this.__issuesItemsContainer && this.rendered_) {
            this.__issuesItemsContainer = document.getElementById(this.id + "-b3");
          }
          for (let __k = __oldLen; __k < __newLen; __k++) {
            const opt = arr[__k];
            const __item = new IssueCard(this.__itemProps_issues(opt));
            __item.parentComponent = this;
            __item.__geaCompiledChild = true;
            this._issuesItems.push(__item);
            if (!this.__childComponents.includes(__item)) {
              this.__childComponents.push(__item);
            }
            if (this.rendered_ && this.__issuesItemsContainer) {
              __item.render(this.__issuesItemsContainer, __k);
            }
          }
          return;
        }
        if (__newLen < __oldLen) {
          for (let __k = __newLen; __k < __oldLen; __k++) {
            __old[__k]?.dispose?.();
          }
          this._issuesItems.length = __newLen;
          this.__childComponents = (this.__childComponents || []).filter((child) => !__old.slice(__newLen).includes(child));
          for (let __k = 0; __k < __newLen; __k++) {
            const opt = arr[__k];
            this._issuesItems[__k].__geaUpdateProps(this.__itemProps_issues(opt));
          }
          return;
        }
      }
      for (let i = 0; i < arr.length; i++) {
        const opt = arr[i];
        this._issuesItems[i].__geaUpdateProps(this.__itemProps_issues(opt));
      }
    }
    dispose() {
      if (this.__observer_removers__) {
        this.__observer_removers__.forEach((fn) => fn());
      }
      this._issuesItems?.forEach?.((item) => item?.dispose?.());
      super.dispose();
    }
    __onPropChange(key, value) {
      if (key === "issues") {
        this.__refreshIssuesItems();
        try {
          const __el = document.getElementById(this.id + "-b2");
          const __boundValue = (this.props.issues ?? []).length;
          if (__el) {
            if (__el.textContent !== __boundValue) __el.textContent = __boundValue;
          }
        } catch {
        }
      }
      if (key === "status") try {
        const __el = document.getElementById(this.id + "-b1");
        const {
          status
        } = this.props;
        const __boundValue = IssueStatusCopy[status];
        if (__el) {
          if (__el.textContent !== __boundValue) __el.textContent = __boundValue;
        }
      } catch {
      }
    }
    __observe_projectStore_project(value, change) {
      if (value === this.__geaPrev___observe_projectStore_project) return;
      this.__geaPrev___observe_projectStore_project = value;
      if (this.rendered_ && typeof this.__geaRequestRender === "function") {
        this.__geaRequestRender();
      }
    }
    __observe_projectStore_project__users(value, change) {
      if (value === this.__geaPrev___observe_projectStore_project__users) return;
      this.__geaPrev___observe_projectStore_project__users = value;
      if (this.rendered_ && typeof this.__geaRequestRender === "function") {
        this.__geaRequestRender();
      }
    }
    createdHooks() {
      if (!this.__observer_removers__) {
        this.__observer_removers__ = [];
      }
      if (!this.__stores) {
        this.__stores = {};
      }
      this.__observer_removers__.forEach((fn) => fn());
      this.__observer_removers__ = [];
      if (typeof this.__ensureArrayConfigs === "function") {
        this.__ensureArrayConfigs();
      }
      this.__stores.projectStore = project_store_default.__store;
      this.__observer_removers__.push(this.__stores.projectStore.observe(["project"], (__v, __c) => this.__observe_projectStore_project(__v, __c)));
      this.__observer_removers__.push(this.__stores.projectStore.observe(["project", "users"], (__v, __c) => this.__observe_projectStore_project__users(__v, __c)));
    }
  };
  if (void 0) {
    const __moduleExports = {
      default: BoardColumn
    };
    registerHotModule13("", __moduleExports);
    (void 0).accept((newModule) => {
      const __updatedModule = newModule || __moduleExports;
      registerHotModule13("", __updatedModule);
      handleComponentUpdate13("", __updatedModule);
    });
    (void 0).accept("../constants/issues", () => (void 0).invalidate());
    (void 0).accept("../stores/project-store", () => (void 0).invalidate());
    (void 0).accept("./IssueCard", () => (void 0).invalidate());
    const __origCreated = BoardColumn.prototype.created;
    BoardColumn.prototype.created = function(__geaProps) {
      registerComponentInstance13(this.constructor.name, this);
      return __origCreated.call(this, __geaProps);
    };
    const __origDispose = BoardColumn.prototype.dispose;
    BoardColumn.prototype.dispose = function() {
      unregisterComponentInstance13(this.constructor.name, this);
      return __origDispose.call(this);
    };
  }

  // jira_clone_gea/src/views/Board.tsx
  var statusList = [{
    id: IssueStatus.BACKLOG,
    label: "Backlog"
  }, {
    id: IssueStatus.SELECTED,
    label: "Selected"
  }, {
    id: IssueStatus.INPROGRESS,
    label: "In Progress"
  }, {
    id: IssueStatus.DONE,
    label: "Done"
  }];
  function filterIssues(issues, status, searchTerm, userIds, myOnly, recentOnly, currentUser) {
    let result = issues.filter((i) => i.status === status);
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter((i) => i.title.toLowerCase().includes(term) || i.description?.toLowerCase().includes(term));
    }
    if (userIds.length > 0) {
      result = result.filter((i) => i.userIds.some((uid) => userIds.includes(uid)));
    }
    if (myOnly && currentUser) {
      result = result.filter((i) => i.userIds.includes(currentUser.id));
    }
    if (recentOnly) {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1e3).toISOString();
      result = result.filter((i) => i.updatedAt > threeDaysAgo);
    }
    return result.sort((a, b) => a.listPosition - b.listPosition);
  }
  var Board = class extends Component {
    __getMapItemFromEvent_projectStore_project_users(e) {
      const __el = e.target.closest("[data-gea-item-id]");
      if (!__el) return null;
      if (__el.__geaItem) return __el.__geaItem;
      const __itemId = __el.getAttribute("data-gea-item-id");
      if (__itemId == null) return null;
      const __items = (this.__stores.projectStore?.project).users;
      const __arr = Array.isArray(__items) ? __items : Array.isArray(__items?.__getTarget) ? __items.__getTarget : [];
      return __arr.find((__candidate) => String(__candidate?.id) === __itemId) || __itemId;
    }
    constructor(...args) {
      super(...args);
      this._breadcrumbs = null;
      this._buildStatusListItems();
      try {
        this.__geaCond_0 = !!!filters_store_default.areFiltersCleared;
      } catch {
      }
      this.__geaRegisterCond(0, "c0", () => {
        return !filters_store_default.areFiltersCleared;
      }, () => `<div class="board-filters-clear" id="${this.id + "-ev0"}">Clear all</div>`, null);
    }
    template() {
      Component._register(BoardColumn);
      const project = project_store_default.project;
      if (!project) return `<div id="${this.id}"></div>`;
      return `<div id="${this.id}" class="board">${this.__ensureChild_breadcrumbs()}<div class="board-header"><h1 class="board-header-title">Kanban board</h1><a href="https://github.com/oldboyxx/jira_clone" target="_blank" rel="noreferrer noopener"><button class="button button--secondary"><i class="icon icon-github" style="margin-right:7px;font-size:18px"></i>Github Repo</button></a></div><div class="board-filters"><div class="board-filters-search"><i class="icon icon-search board-filters-search-icon"></i><input id="${this.id + "-b1"}" type="text" placeholder="Search"${filters_store_default.searchTerm == null || filters_store_default.searchTerm === false ? "" : ` value="${filters_store_default.searchTerm}"`} /></div><div id="${this.id + "-b5"}" class="board-filters-avatars">${project.users.map((user) => this.renderProjectusersItem(user)).join("") + "<!---->"}</div><button id="${this.id + "-b2"}"${`board-filters-button ${filters_store_default.myOnly ? "active" : ""}` == null ? "" : ` class="${`board-filters-button ${filters_store_default.myOnly ? "active" : ""}`.trim()}"`}>Only My Issues</button><button id="${this.id + "-b3"}"${`board-filters-button ${filters_store_default.recentOnly ? "active" : ""}` == null ? "" : ` class="${`board-filters-button ${filters_store_default.recentOnly ? "active" : ""}`.trim()}"`}>Recently Updated</button><!--${this.id + "-c0"}-->${!filters_store_default.areFiltersCleared && `<div class="board-filters-clear" id="${this.id + "-ev0"}">Clear all</div>` || ""}<!--${this.id + "-c0-end"}--></div><div id="${this.id + "-b4"}" class="board-lists">${this._statusListItems.join("")}</div></div>`;
    }
    get events() {
      return {
        input: {
          [`#${this.id}-b1`]: this.__event_input_0
        },
        click: {
          [`#${this.id}-b2`]: this.__event_click_1,
          [`#${this.id}-b3`]: this.__event_click_2,
          [`#${this.id}-ev0`]: this.__event_click_3,
          '[data-gea-event="ev1"]': this.__event_click_0
        }
      };
    }
    __event_input_0(e, targetComponent) {
      filters_store_default.setSearchTerm(e.target.value);
    }
    __event_click_1(e, targetComponent) {
      filters_store_default.toggleMyOnly();
    }
    __event_click_2(e, targetComponent) {
      filters_store_default.toggleRecentOnly();
    }
    __event_click_3(e, targetComponent) {
      filters_store_default.clearAll();
    }
    __buildProps_breadcrumbs() {
      const project = project_store_default.project;
      if (!project) return {};
      return {
        items: ["Projects", project.name, "Kanban Board"]
      };
    }
    __refreshChildProps_breadcrumbs() {
      const child = this._breadcrumbs;
      if (!child) {
        return;
      }
      child.__geaUpdateProps(this.__buildProps_breadcrumbs());
    }
    __ensureChild_breadcrumbs() {
      if (!this._breadcrumbs) {
        this._breadcrumbs = new Breadcrumbs(this.__buildProps_breadcrumbs());
        this._breadcrumbs.parentComponent = this;
        this._breadcrumbs.__geaCompiledChild = true;
      } else {
        this._breadcrumbs.props = this.__buildProps_breadcrumbs();
      }
      return this._breadcrumbs;
    }
    dispose() {
      if (this.__observer_removers__) {
        this.__observer_removers__.forEach((fn) => fn());
      }
      this._statusListItems?.forEach?.((item) => item?.dispose?.());
      this._breadcrumbs?.dispose?.();
      super.dispose();
    }
    __itemProps_statusList(opt) {
      const project = project_store_default.project;
      return {
        status: opt.id,
        issues: filterIssues(project.issues, opt.id, filters_store_default.searchTerm, filters_store_default.userIds, filters_store_default.myOnly, filters_store_default.recentOnly, auth_store_default.currentUser)
      };
    }
    _buildStatusListItems() {
      const arr = statusList ?? [];
      this._statusListItems = arr.map((opt) => {
        const item = new BoardColumn(this.__itemProps_statusList(opt));
        item.parentComponent = this;
        item.__geaCompiledChild = true;
        return item;
      });
    }
    __mountStatusListItems() {
      if (!this.__statusListItemsContainer) {
        this.__statusListItemsContainer = document.getElementById(this.id + "-b4");
      }
      if (!this.__statusListItemsContainer) return;
      this.__statusListItemsContainer.textContent = "";
      for (let i = 0; i < (this._statusListItems?.length ?? 0); i++) {
        const item = this._statusListItems[i];
        if (!item) continue;
        if (!this.__childComponents.includes(item)) {
          this.__childComponents.push(item);
        }
        item.render(this.__statusListItemsContainer, i);
      }
    }
    __refreshStatusListItems() {
      const arr = statusList ?? [];
      const __old = this._statusListItems ?? [];
      const __oldLen = __old.length;
      const __newLen = arr.length;
      if (__oldLen !== __newLen) {
        if (__newLen > __oldLen) {
          for (let __k = 0; __k < __oldLen; __k++) {
            const opt = arr[__k];
            __old[__k].__geaUpdateProps(this.__itemProps_statusList(opt));
          }
          if (!this.__statusListItemsContainer && this.rendered_) {
            this.__statusListItemsContainer = document.getElementById(this.id + "-b4");
          }
          for (let __k = __oldLen; __k < __newLen; __k++) {
            const opt = arr[__k];
            const __item = new BoardColumn(this.__itemProps_statusList(opt));
            __item.parentComponent = this;
            __item.__geaCompiledChild = true;
            this._statusListItems.push(__item);
            if (!this.__childComponents.includes(__item)) {
              this.__childComponents.push(__item);
            }
            if (this.rendered_ && this.__statusListItemsContainer) {
              __item.render(this.__statusListItemsContainer, __k);
            }
          }
          return;
        }
        if (__newLen < __oldLen) {
          for (let __k = __newLen; __k < __oldLen; __k++) {
            __old[__k]?.dispose?.();
          }
          this._statusListItems.length = __newLen;
          this.__childComponents = (this.__childComponents || []).filter((child) => !__old.slice(__newLen).includes(child));
          for (let __k = 0; __k < __newLen; __k++) {
            const opt = arr[__k];
            this._statusListItems[__k].__geaUpdateProps(this.__itemProps_statusList(opt));
          }
          return;
        }
      }
      for (let i = 0; i < arr.length; i++) {
        const opt = arr[i];
        this._statusListItems[i].__geaUpdateProps(this.__itemProps_statusList(opt));
      }
    }
    __observe_projectStore_project__issues(value, change) {
      this.__refreshStatusListItems();
    }
    __observe_filtersStore_searchTerm(value, change) {
      this.__refreshStatusListItems();
      if (this.rendered_) {
        const __el = document.getElementById(this.id + "-b1");
        const __boundValue = filters_store_default.searchTerm;
        if (__el) __el.value = __boundValue === null || __boundValue === void 0 ? "" : String(__boundValue);
      }
    }
    __observe_filtersStore_userIds(value, change) {
      this.__refreshStatusListItems();
    }
    __observe_filtersStore_myOnly(value, change) {
      this.__refreshStatusListItems();
      if (this.rendered_) {
        const __el = document.getElementById(this.id + "-b2");
        const __boundValue = `board-filters-button ${filters_store_default.myOnly ? "active" : ""}`;
        if (__el) {
          const __newClass = __boundValue != null ? String(__boundValue).trim() : "";
          if (__el.className !== __newClass) __el.className = __newClass;
        }
      }
    }
    __observe_filtersStore_recentOnly(value, change) {
      this.__refreshStatusListItems();
      if (this.rendered_) {
        const __el = document.getElementById(this.id + "-b3");
        const __boundValue = `board-filters-button ${filters_store_default.recentOnly ? "active" : ""}`;
        if (__el) {
          const __newClass = __boundValue != null ? String(__boundValue).trim() : "";
          if (__el.className !== __newClass) __el.className = __newClass;
        }
      }
    }
    __observe_authStore_currentUser(value, change) {
      this.__refreshStatusListItems();
    }
    __onPropChange(key, value) {
      this.__geaPatchCond(0);
    }
    __observe_filtersStore_userIds__includes(value, change) {
      {
        if (!this.__project_users_container) {
          this.__project_users_container = document.getElementById(this.id + "-b5");
        }
        if (!this.__project_users_container) return;
        const __arr = Array.isArray(this.__stores.projectStore.project.users.__getTarget || this.__stores.projectStore.project.users) ? this.__stores.projectStore.project.users.__getTarget || this.__stores.projectStore.project.users : [];
        for (let __i = 0; __i < __arr.length; __i++) {
          const item = __arr[__i], row = this.__project_users_container.children[__i];
          if (!row) continue;
          const __target_0 = row;
          if (!__target_0) continue;
          __target_0.className = (filters_store_default.userIds.includes(item.id) ? "active" : "").trim();
        }
      }
    }
    __observe_filtersStore_areFiltersCleared(value, change) {
      if (this.rendered_) {
        this.__geaCondPatched_0 = this.__geaPatchCond(0);
        if (this.__geaCondPatched_0) return;
      }
    }
    __observe_projectStore_project(value, change) {
      this.__refreshChildProps_breadcrumbs();
    }
    __observe_projectStore_project__name(value, change) {
      this.__refreshChildProps_breadcrumbs();
    }
    renderProjectusersItem(user) {
      const __v = (v) => v != null && typeof v === "object" ? v.valueOf() : v;
      return `<div id="${this.id + "-b5-" + String(user.id)}" data-gea-item-id="${user.id}" data-gea-event="ev1"${__v(`board-filters-avatar ${filters_store_default.userIds.includes(user.id) ? "active" : ""}`) == __v(null) ? "" : ` class="${`board-filters-avatar ${filters_store_default.userIds.includes(user.id) ? "active" : ""}`.trim()}"`}>${new Avatar({
        src: user.avatarUrl,
        name: user.name,
        class: "!h-8 !w-8"
      })}</div>`;
    }
    createProjectusersItem(item) {
      var __c = this.__project_users_container;
      if (!__c.__geaTpl) {
        try {
          var __tw = __c.cloneNode(false);
          __tw.innerHTML = this.renderProjectusersItem({
            id: 0,
            avatarUrl: "",
            name: ""
          });
          __c.__geaTpl = __tw.firstElementChild;
        } catch {
        }
      }
      if (!__c.__geaIdPfx) __c.__geaIdPfx = this.id_ + "-b5-";
      if (__c.__geaTpl) {
        var el = __c.__geaTpl.cloneNode(true);
      } else {
        var __fw = __c.cloneNode(false);
        __fw.innerHTML = this.renderProjectusersItem(item);
        var el = __fw.firstElementChild;
      }
      el.className = `board-filters-avatar ${filters_store_default.userIds.includes(item.id) ? "active" : ""}`;
      var __av = item.avatarUrl;
      if (__av == null || __av === false) el.firstElementChild.removeAttribute("src");
      else el.firstElementChild.setAttribute("src", String(__av));
      var __av = item.name;
      if (__av == null || __av === false) el.firstElementChild.removeAttribute("name");
      else el.firstElementChild.setAttribute("name", String(__av));
      el.setAttribute("data-gea-item-id", item.id);
      el.id = __c.__geaIdPfx + item.id;
      el.__geaItem = item;
      return el;
    }
    __observe_projectStore_project__users(users, change) {
      if (!this.__project_users_container) {
        this.__project_users_container = document.getElementById(this.id + "-b5");
      }
      if (!this.__project_users_container) return;
      if (Array.isArray(users) && users.length === 0 && this.__project_users_container.children.length > 0) {
        this.__project_users_container.textContent = "";
        return;
      }
      if (typeof this.__ensureArrayConfigs === "function") this.__ensureArrayConfigs();
      this.__applyListChanges(this.__project_users_container, users, change, this.__project_usersListConfig);
    }
    __ensureArrayConfigs() {
      if (!this.__project_usersListConfig) {
        this.__project_usersListConfig = {
          arrayPathParts: ["project", "users"],
          render: (item) => this.renderProjectusersItem(item),
          create: (item) => this.createProjectusersItem(item),
          propPatchers: {
            "id": [(row, value, item) => {
              const __target = row;
              if (!__target) return;
              __target.className = `board-filters-avatar ${filters_store_default.userIds.includes(item.id) ? "active" : ""}`.trim();
            }],
            "avatarUrl": [(row, value, item) => {
              const __target = row.firstElementChild;
              if (!__target) return;
              const __attrValue = item.avatarUrl;
              if (__attrValue == null || __attrValue === false) {
                __target.removeAttribute("src");
              } else {
                __target.setAttribute("src", String(__attrValue));
              }
            }, (row, value) => row.classList.toggle("avatarUrl", value)],
            "name": [(row, value, item) => {
              const __target = row.firstElementChild;
              if (!__target) return;
              const __attrValue = item.name;
              if (__attrValue == null || __attrValue === false) {
                __target.removeAttribute("name");
              } else {
                __target.setAttribute("name", String(__attrValue));
              }
            }, (row, value) => row.classList.toggle("name", value)]
          }
        };
      }
    }
    __event_click_0(e, targetComponent) {
      const user = this.__getMapItemFromEvent_projectStore_project_users(e);
      if (!user) {
        return;
      }
      filters_store_default.toggleUserId(user.id);
    }
    __observe_filtersStore_areFiltersCleared__via(_v, change) {
      this.__observe_filtersStore_areFiltersCleared(filters_store_default.areFiltersCleared, change);
    }
    createdHooks() {
      if (!this.__observer_removers__) {
        this.__observer_removers__ = [];
      }
      if (!this.__stores) {
        this.__stores = {};
      }
      this.__observer_removers__.forEach((fn) => fn());
      this.__observer_removers__ = [];
      if (typeof this.__ensureArrayConfigs === "function") {
        this.__ensureArrayConfigs();
      }
      this.__stores.projectStore = project_store_default.__store;
      this.__observer_removers__.push(this.__stores.projectStore.observe(["project", "issues"], (__v, __c) => this.__observe_projectStore_project__issues(__v, __c)));
      this.__observer_removers__.push(this.__stores.projectStore.observe(["project"], (__v, __c) => this.__observe_projectStore_project(__v, __c)));
      this.__observer_removers__.push(this.__stores.projectStore.observe(["project", "name"], (__v, __c) => this.__observe_projectStore_project__name(__v, __c)));
      this.__observer_removers__.push(this.__stores.projectStore.observe(["project", "users"], (__v, __c) => this.__observe_projectStore_project__users(__v, __c)));
      this.__stores.filtersStore = filters_store_default.__store;
      this.__observer_removers__.push(this.__stores.filtersStore.observe(["searchTerm"], (__v, __c) => this.__observe_filtersStore_searchTerm(__v, __c)));
      this.__observer_removers__.push(this.__stores.filtersStore.observe(["userIds"], (__v, __c) => this.__observe_filtersStore_userIds(__v, __c)));
      this.__observer_removers__.push(this.__stores.filtersStore.observe(["myOnly"], (__v, __c) => this.__observe_filtersStore_myOnly(__v, __c)));
      this.__observer_removers__.push(this.__stores.filtersStore.observe(["recentOnly"], (__v, __c) => this.__observe_filtersStore_recentOnly(__v, __c)));
      this.__observer_removers__.push(this.__stores.filtersStore.observe(["userIds", "includes"], (__v, __c) => this.__observe_filtersStore_userIds__includes(__v, __c)));
      this.__observer_removers__.push(this.__stores.filtersStore.observe(["searchTerm"], (__v, __c) => this.__observe_filtersStore_areFiltersCleared__via(__v, __c)));
      this.__observer_removers__.push(this.__stores.filtersStore.observe(["userIds"], (__v, __c) => this.__observe_filtersStore_areFiltersCleared__via(__v, __c)));
      this.__observer_removers__.push(this.__stores.filtersStore.observe(["myOnly"], (__v, __c) => this.__observe_filtersStore_areFiltersCleared__via(__v, __c)));
      this.__observer_removers__.push(this.__stores.filtersStore.observe(["recentOnly"], (__v, __c) => this.__observe_filtersStore_areFiltersCleared__via(__v, __c)));
      this.__stores.authStore = auth_store_default.__store;
      this.__observer_removers__.push(this.__stores.authStore.observe(["currentUser"], (__v, __c) => this.__observe_authStore_currentUser(__v, __c)));
    }
  };
  if (void 0) {
    const __moduleExports = {
      default: Board
    };
    registerHotModule14("", __moduleExports);
    (void 0).accept((newModule) => {
      const __updatedModule = newModule || __moduleExports;
      registerHotModule14("", __updatedModule);
      handleComponentUpdate14("", __updatedModule);
    });
    (void 0).accept("../stores/project-store", () => (void 0).invalidate());
    (void 0).accept("../stores/filters-store", () => (void 0).invalidate());
    (void 0).accept("../stores/auth-store", () => (void 0).invalidate());
    (void 0).accept("../constants/issues", () => (void 0).invalidate());
    (void 0).accept("../components/Breadcrumbs", () => (void 0).invalidate());
    (void 0).accept("../components/BoardColumn", () => (void 0).invalidate());
    const __origCreated = Board.prototype.created;
    Board.prototype.created = function(__geaProps) {
      registerComponentInstance14(this.constructor.name, this);
      return __origCreated.call(this, __geaProps);
    };
    const __origDispose = Board.prototype.dispose;
    Board.prototype.dispose = function() {
      unregisterComponentInstance14(this.constructor.name, this);
      return __origDispose.call(this);
    };
  }

  // jira_clone_gea/src/stores/toast-store.ts
  var toastStore = {
    success(title) {
      ToastStore.success({ title });
    },
    error(err) {
      ToastStore.error({
        title: "Error",
        description: typeof err === "string" ? err : err?.message || String(err)
      });
    }
  };
  var toast_store_default = toastStore;

  // jira_clone_gea/src/constants/projects.ts
  var ProjectCategory = {
    SOFTWARE: "software",
    MARKETING: "marketing",
    BUSINESS: "business"
  };
  var ProjectCategoryCopy = {
    [ProjectCategory.SOFTWARE]: "Software",
    [ProjectCategory.MARKETING]: "Marketing",
    [ProjectCategory.BUSINESS]: "Business"
  };

  // jira_clone_gea/src/utils/validation.ts
  function isNilOrEmpty(value) {
    return value === void 0 || value === null || value === "";
  }
  var is = {
    required: () => (value) => isNilOrEmpty(value) && "This field is required",
    minLength: (min2) => (value) => !!value && value.length < min2 && `Must be at least ${min2} characters`,
    maxLength: (max2) => (value) => !!value && value.length > max2 && `Must be at most ${max2} characters`,
    url: () => (value) => !!value && !/^(?:https?:\/\/)?[\w.-]+(?:\.[\w.-]+)+[\w\-._~:/?#[\]@!$&'()*+,;=.]+$/.test(value) && "Must be a valid URL"
  };
  function generateErrors(fieldValues, fieldValidators) {
    const errors = {};
    for (const [name, validators] of Object.entries(fieldValidators)) {
      const list = Array.isArray(validators) ? validators : [validators];
      for (const validator of list) {
        const msg = validator(fieldValues[name], fieldValues);
        if (msg && !errors[name]) {
          errors[name] = msg;
        }
      }
    }
    return errors;
  }

  // jira_clone_gea/src/components/Spinner.tsx
  var Spinner = class extends Component {
    template({
      size: size3 = 32
    }) {
      return `<div id="${this.id}" class="spinner"${`width:${size3}px;height:${size3}px` == null ? "" : ` style="${`width:${size3}px;height:${size3}px`}"`}></div>`;
    }
    __onPropChange(key, value) {
      if (key === "size") try {
        const __el = this.$(":scope");
        const __boundValue = `width:${this.props.size ?? 32}px;height:${this.props.size ?? 32}px`;
        if (__el) if (__boundValue === null || __boundValue === void 0) __el.removeAttribute("style");
        else __el.setAttribute("style", String(__boundValue));
      } catch {
      }
    }
  };
  if (void 0) {
    const __moduleExports = {
      default: Spinner
    };
    registerHotModule15("", __moduleExports);
    (void 0).accept((newModule) => {
      const __updatedModule = newModule || __moduleExports;
      registerHotModule15("", __updatedModule);
      handleComponentUpdate15("", __updatedModule);
    });
    const __origCreated = Spinner.prototype.created;
    Spinner.prototype.created = function(__geaProps) {
      registerComponentInstance15(this.constructor.name, this);
      return __origCreated.call(this, __geaProps);
    };
    const __origDispose = Spinner.prototype.dispose;
    Spinner.prototype.dispose = function() {
      unregisterComponentInstance15(this.constructor.name, this);
      return __origDispose.call(this);
    };
  }

  // jira_clone_gea/src/views/ProjectSettings.tsx
  var ProjectSettings = class extends Component {
    constructor(...args) {
      super(...args);
      this._spinner = null;
      this._button = null;
      this._select = null;
      this._breadcrumbs = null;
      try {
        this.__geaCond_0 = !!this.errors.name;
        this.__geaCond_1 = !!this.errors.url;
        this.__geaCond_2 = !!this.errors.category;
        this.__geaCond_3 = !!this.isUpdating;
      } catch {
      }
      this.__geaRegisterCond(0, "c0", () => {
        return this.errors.name;
      }, () => `<div class="form-error">${this.errors.name}</div>`, null);
      this.__geaRegisterCond(1, "c1", () => {
        return this.errors.url;
      }, () => `<div class="form-error">${this.errors.url}</div>`, null);
      this.__geaRegisterCond(2, "c2", () => {
        return this.errors.category;
      }, () => `<div class="form-error">${this.errors.category}</div>`, null);
      this.__geaRegisterCond(3, "c3", () => {
        return this.isUpdating;
      }, () => `<span class="inline-flex items-center gap-2">${this.__ensureChild_spinner()}Save changes</span>`, () => "Save changes");
    }
    name = "";
    url = "";
    category = "";
    description = "";
    isUpdating = false;
    errors = {};
    created() {
      this.loadFromProject();
    }
    loadFromProject() {
      const p = project_store_default.project;
      if (!p) return;
      this.name = p.name || "";
      this.url = p.url || "";
      this.category = p.category || "";
      this.description = p.description || "";
    }
    async handleSubmit() {
      this.errors = generateErrors({
        name: this.name,
        url: this.url,
        category: this.category
      }, {
        name: [is.required(), is.maxLength(100)],
        url: is.url(),
        category: is.required()
      });
      if (Object.keys(this.errors).length > 0) return;
      this.isUpdating = true;
      try {
        await project_store_default.updateProject({
          name: this.name,
          url: this.url,
          category: this.category,
          description: this.description
        });
        toast_store_default.success("Changes have been saved successfully.");
      } catch (e) {
        toast_store_default.error(e);
      } finally {
        this.isUpdating = false;
      }
    }
    template() {
      const project = project_store_default.project;
      if (!project) return `<div id="${this.id}"></div>`;
      return `<div id="${this.id}" class="project-settings"><div class="project-settings-form">${this.__ensureChild_breadcrumbs()}<h1 class="project-settings-heading">Project Details</h1><div class="form-field"><label class="form-label">Name</label><input id="${this.id + "-b1"}"${`input ${this.errors.name ? "input-error" : ""}` == null ? "" : ` class="${`input ${this.errors.name ? "input-error" : ""}`.trim()}"`} type="text"${this.name == null || this.name === false ? "" : ` value="${this.name}"`} /><!--${this.id + "-c0"}-->${this.errors.name && `<div class="form-error">${this.errors.name}</div>` || ""}<!--${this.id + "-c0-end"}--></div><div class="form-field"><label class="form-label">URL</label><input id="${this.id + "-b2"}"${`input ${this.errors.url ? "input-error" : ""}` == null ? "" : ` class="${`input ${this.errors.url ? "input-error" : ""}`.trim()}"`} type="text"${this.url == null || this.url === false ? "" : ` value="${this.url}"`} /><!--${this.id + "-c1"}-->${this.errors.url && `<div class="form-error">${this.errors.url}</div>` || ""}<!--${this.id + "-c1-end"}--></div><div class="form-field"><label class="form-label">Description</label><textarea id="${this.id + "-b3"}" class="textarea"${this.description == null || this.description === false ? "" : ` value="${this.description}"`}></textarea></div><div class="form-field"><label class="form-label">Project Category</label>${this.__ensureChild_select()}<!--${this.id + "-c2"}-->${this.errors.category && `<div class="form-error">${this.errors.category}</div>` || ""}<!--${this.id + "-c2-end"}--></div>${this.__ensureChild_button()}</div></div>`;
    }
    get events() {
      return {
        input: {
          [`#${this.id}-b1`]: this.__event_input_0,
          [`#${this.id}-b2`]: this.__event_input_1,
          [`#${this.id}-b3`]: this.__event_input_2
        }
      };
    }
    __event_input_0(e, targetComponent) {
      this.name = e.target.value;
    }
    __event_input_1(e, targetComponent) {
      this.url = e.target.value;
    }
    __event_input_2(e, targetComponent) {
      this.description = e.target.value;
    }
    __buildProps_breadcrumbs() {
      const project = project_store_default.project;
      if (!project) return {};
      return {
        items: ["Projects", project.name, "Project Details"]
      };
    }
    __refreshChildProps_breadcrumbs() {
      const child = this._breadcrumbs;
      if (!child) {
        return;
      }
      child.__geaUpdateProps(this.__buildProps_breadcrumbs());
    }
    __ensureChild_breadcrumbs() {
      if (!this._breadcrumbs) {
        this._breadcrumbs = new Breadcrumbs(this.__buildProps_breadcrumbs());
        this._breadcrumbs.parentComponent = this;
        this._breadcrumbs.__geaCompiledChild = true;
      } else {
        this._breadcrumbs.props = this.__buildProps_breadcrumbs();
      }
      return this._breadcrumbs;
    }
    __buildProps_select() {
      const categoryOptions = Object.values(ProjectCategory).map((c) => ({
        value: c,
        label: ProjectCategoryCopy[c]
      }));
      return {
        class: "w-full",
        items: categoryOptions,
        value: this.category ? [this.category] : [],
        onValueChange: (d) => {
          const v = d.value[0];
          if (v !== void 0) this.category = v;
        },
        placeholder: "Category"
      };
    }
    __refreshChildProps_select() {
      const child = this._select;
      if (!child) {
        return;
      }
      child.__geaUpdateProps(this.__buildProps_select());
    }
    __ensureChild_select() {
      if (!this._select) {
        this._select = new Select(this.__buildProps_select());
        this._select.parentComponent = this;
        this._select.__geaCompiledChild = true;
      } else {
        this._select.props = this.__buildProps_select();
      }
      return this._select;
    }
    __buildProps_button() {
      return {
        variant: "default",
        disabled: this.isUpdating,
        click: () => this.handleSubmit(),
        children: `<!--${this.id + "-c3"}-->${(this.isUpdating ? `<span class="inline-flex items-center gap-2">${this.__ensureChild_spinner()}Save changes</span>` : "Save changes") || ""}<!--${this.id + "-c3-end"}-->`
      };
    }
    __refreshChildProps_button() {
      const child = this._button;
      if (!child) {
        return;
      }
      child.__geaUpdateProps(this.__buildProps_button());
    }
    __ensureChild_button() {
      if (!this._button) {
        this._button = new Button(this.__buildProps_button());
        this._button.parentComponent = this;
        this._button.__geaCompiledChild = true;
      } else {
        this._button.props = this.__buildProps_button();
      }
      return this._button;
    }
    __buildProps_spinner() {
      return {
        size: 16
      };
    }
    __refreshChildProps_spinner() {
      const child = this._spinner;
      if (!child) {
        return;
      }
      child.__geaUpdateProps(this.__buildProps_spinner());
    }
    __ensureChild_spinner() {
      if (!this._spinner) {
        this._spinner = new Spinner(this.__buildProps_spinner());
        this._spinner.parentComponent = this;
        this._spinner.__geaCompiledChild = true;
      } else {
        this._spinner.props = this.__buildProps_spinner();
      }
      return this._spinner;
    }
    dispose() {
      if (this.__observer_removers__) {
        this.__observer_removers__.forEach((fn) => fn());
      }
      this._breadcrumbs?.dispose?.();
      this._select?.dispose?.();
      this._button?.dispose?.();
      this._spinner?.dispose?.();
      super.dispose();
    }
    __onPropChange(key, value) {
      this.__geaPatchCond(0);
      this.__geaPatchCond(1);
      this.__geaPatchCond(2);
      this.__geaPatchCond(3);
    }
    __observe_local_errors__name(value, change) {
      if (this.rendered_) {
        const __el = document.getElementById(this.id + "-b1");
        const __boundValue = `input ${this.errors.name ? "input-error" : ""}`;
        if (__el) {
          const __newClass = __boundValue != null ? String(__boundValue).trim() : "";
          if (__el.className !== __newClass) __el.className = __newClass;
        }
      }
      if (this.rendered_) {
        this.__geaCondPatched_0 = this.__geaPatchCond(0);
      }
    }
    __observe_local_errors(value, change) {
      if (this.rendered_) {
        {
          const __el = document.getElementById(this.id + "-b1");
          const __boundValue = `input ${this.errors.name ? "input-error" : ""}`;
          if (__el) {
            const __newClass = __boundValue != null ? String(__boundValue).trim() : "";
            if (__el.className !== __newClass) __el.className = __newClass;
          }
        }
        {
          const __el = document.getElementById(this.id + "-b2");
          const __boundValue = `input ${this.errors.url ? "input-error" : ""}`;
          if (__el) {
            const __newClass = __boundValue != null ? String(__boundValue).trim() : "";
            if (__el.className !== __newClass) __el.className = __newClass;
          }
        }
      }
    }
    __observe_local_name(value, change) {
      if (this.rendered_) {
        const __el = document.getElementById(this.id + "-b1");
        const __boundValue = this.name;
        if (__el) __el.value = __boundValue === null || __boundValue === void 0 ? "" : String(__boundValue);
      }
    }
    __observe_local_errors__url(value, change) {
      if (this.rendered_) {
        const __el = document.getElementById(this.id + "-b2");
        const __boundValue = `input ${this.errors.url ? "input-error" : ""}`;
        if (__el) {
          const __newClass = __boundValue != null ? String(__boundValue).trim() : "";
          if (__el.className !== __newClass) __el.className = __newClass;
        }
      }
      if (this.rendered_) {
        this.__geaCondPatched_1 = this.__geaPatchCond(1);
      }
    }
    __observe_local_url(value, change) {
      if (this.rendered_) {
        const __el = document.getElementById(this.id + "-b2");
        const __boundValue = this.url;
        if (__el) __el.value = __boundValue === null || __boundValue === void 0 ? "" : String(__boundValue);
      }
    }
    __observe_local_description(value, change) {
      if (this.rendered_) {
        const __el = document.getElementById(this.id + "-b3");
        const __boundValue = this.description;
        if (__el) __el.value = __boundValue === null || __boundValue === void 0 ? "" : String(__boundValue);
      }
    }
    __observe_local_errors__category(value, change) {
      if (this.rendered_) {
        this.__geaCondPatched_2 = this.__geaPatchCond(2);
        if (this.__geaCondPatched_2) return;
      }
    }
    __observe_local_isUpdating(value, change) {
      if (this.rendered_) {
        this.__geaCondPatched_3 = this.__geaPatchCond(3);
        if (this.__geaCondPatched_3) return;
      }
      this.__refreshChildProps_button();
    }
    __observe_projectStore_project(value, change) {
      this.__refreshChildProps_breadcrumbs();
    }
    __observe_projectStore_project__name(value, change) {
      this.__refreshChildProps_breadcrumbs();
    }
    __observe_local_category(value, change) {
      this.__refreshChildProps_select();
    }
    __observe_local_handleSubmit(value, change) {
      this.__refreshChildProps_button();
    }
    __observe_local_id(value, change) {
      this.__refreshChildProps_button();
    }
    __observe_local___ensureChild_spinner(value, change) {
      this.__refreshChildProps_button();
    }
    createdHooks() {
      if (!this.__observer_removers__) {
        this.__observer_removers__ = [];
      }
      if (!this.__stores) {
        this.__stores = {};
      }
      this.__observer_removers__.forEach((fn) => fn());
      this.__observer_removers__ = [];
      if (typeof this.__ensureArrayConfigs === "function") {
        this.__ensureArrayConfigs();
      }
      this.__stores.projectStore = project_store_default.__store;
      this.__observer_removers__.push(this.__stores.projectStore.observe(["project"], (__v, __c) => this.__observe_projectStore_project(__v, __c)));
      this.__observer_removers__.push(this.__stores.projectStore.observe(["project", "name"], (__v, __c) => this.__observe_projectStore_project__name(__v, __c)));
    }
    __setupLocalStateObservers() {
      if (typeof this.__ensureArrayConfigs === "function") {
        this.__ensureArrayConfigs();
      }
      if (!this.__store) {
        return;
      }
      this.__observer_removers__.push(this.__store.observe(["errors", "name"], (__v, __c) => this.__observe_local_errors__name(__v, __c)));
      this.__observer_removers__.push(this.__store.observe(["errors"], (__v, __c) => this.__observe_local_errors(__v, __c)));
      this.__observer_removers__.push(this.__store.observe(["name"], (__v, __c) => this.__observe_local_name(__v, __c)));
      this.__observer_removers__.push(this.__store.observe(["errors", "url"], (__v, __c) => this.__observe_local_errors__url(__v, __c)));
      this.__observer_removers__.push(this.__store.observe(["url"], (__v, __c) => this.__observe_local_url(__v, __c)));
      this.__observer_removers__.push(this.__store.observe(["description"], (__v, __c) => this.__observe_local_description(__v, __c)));
      this.__observer_removers__.push(this.__store.observe(["errors", "category"], (__v, __c) => this.__observe_local_errors__category(__v, __c)));
      this.__observer_removers__.push(this.__store.observe(["isUpdating"], (__v, __c) => this.__observe_local_isUpdating(__v, __c)));
      this.__observer_removers__.push(this.__store.observe(["category"], (__v, __c) => this.__observe_local_category(__v, __c)));
      this.__observer_removers__.push(this.__store.observe(["id"], (__v, __c) => this.__observe_local_id(__v, __c)));
    }
  };
  if (void 0) {
    const __moduleExports = {
      default: ProjectSettings
    };
    registerHotModule16("", __moduleExports);
    (void 0).accept((newModule) => {
      const __updatedModule = newModule || __moduleExports;
      registerHotModule16("", __updatedModule);
      handleComponentUpdate16("", __updatedModule);
    });
    (void 0).accept("../stores/project-store", () => (void 0).invalidate());
    (void 0).accept("../stores/toast-store", () => (void 0).invalidate());
    (void 0).accept("../constants/projects", () => (void 0).invalidate());
    (void 0).accept("../utils/validation", () => (void 0).invalidate());
    (void 0).accept("../components/Breadcrumbs", () => (void 0).invalidate());
    (void 0).accept("../components/Spinner", () => (void 0).invalidate());
    const __origCreated = ProjectSettings.prototype.created;
    ProjectSettings.prototype.created = function(__geaProps) {
      registerComponentInstance16(this.constructor.name, this);
      return __origCreated.call(this, __geaProps);
    };
    const __origDispose = ProjectSettings.prototype.dispose;
    ProjectSettings.prototype.dispose = function() {
      unregisterComponentInstance16(this.constructor.name, this);
      return __origDispose.call(this);
    };
  }

  // jira_clone_gea/src/utils/dateTime.ts
  function formatDate(date, format) {
    if (!date) return "";
    const d = new Date(date);
    return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  }
  function formatDateTimeConversational(date) {
    if (!date) return "";
    const d = new Date(date);
    const now = /* @__PURE__ */ new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffSec = Math.floor(diffMs / 1e3);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);
    if (diffSec < 60) return "a few seconds ago";
    if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
    if (diffHour < 24) return `${diffHour} hour${diffHour === 1 ? "" : "s"} ago`;
    if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
    return formatDate(date);
  }

  // jira_clone_gea/src/views/CommentCreate.tsx
  var CommentCreate = class extends Component {
    constructor(...args) {
      super(...args);
      this._button2 = null;
      this._spinner = null;
      this._button = null;
      this._avatar = null;
      try {
        this.__geaCond_0 = !!!this.isFormOpen;
        this.__geaCond_1 = !!this.isFormOpen;
      } catch {
      }
      this.__geaRegisterCond(0, "c0", () => {
        return !this.isFormOpen;
      }, () => `<div class="comment-create-collapsed"><div class="comment-create-fake" id="${this.id + "-ev0"}">${this.__ensureChild_avatar()}<span class="comment-create-placeholder">Add a comment...</span></div><p class="comment-pro-tip"><strong>Pro tip:</strong> press <strong>M</strong> to comment</p></div>`, null);
      this.__geaRegisterCond(1, "c1", () => {
        return this.isFormOpen;
      }, () => `<div class="comment-create-form"><textarea class="textarea" placeholder="Add a comment..." autofocus${this.body == null || this.body === false ? "" : ` value="${this.body}"`} id="${this.id + "-ev1"}"></textarea><div class="comment-create-actions">${this.__ensureChild_button()}${this.__ensureChild_button2()}</div></div>`, null);
    }
    isFormOpen = false;
    body = "";
    isCreating = false;
    _onKey = null;
    created() {
      this._onKey = (e) => {
        const tag = e.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable) return;
        if (e.key === "m" || e.key === "M") {
          e.preventDefault();
          this.openForm();
        }
      };
      document.addEventListener("keydown", this._onKey);
    }
    dispose() {
      if (this.__observer_removers__) {
        this.__observer_removers__.forEach((fn) => fn());
      }
      this._avatar?.dispose?.();
      this._button?.dispose?.();
      this._button2?.dispose?.();
      this._spinner?.dispose?.();
      if (this._onKey) document.removeEventListener("keydown", this._onKey);
      super.dispose();
    }
    openForm() {
      if (this.isFormOpen) return;
      this.isFormOpen = true;
    }
    async handleSubmit() {
      if (!this.body.trim()) return;
      this.isCreating = true;
      try {
        await issue_store_default.createComment(this.props.issueId, this.body);
        this.body = "";
        this.isFormOpen = false;
      } catch (e) {
        console.error(e);
      } finally {
        this.isCreating = false;
      }
    }
    template({
      issueId
    }) {
      Component._register(Spinner);
      return `<div id="${this.id}" class="comment-create"><!--${this.id + "-c0"}-->${!this.isFormOpen && `<div class="comment-create-collapsed"><div class="comment-create-fake" id="${this.id + "-ev0"}">${this.__ensureChild_avatar()}<span class="comment-create-placeholder">Add a comment...</span></div><p class="comment-pro-tip"><strong>Pro tip:</strong> press <strong>M</strong> to comment</p></div>` || ""}<!--${this.id + "-c0-end"}--><!--${this.id + "-c1"}-->${this.isFormOpen && `<div class="comment-create-form"><textarea class="textarea" placeholder="Add a comment..." autofocus${this.body == null || this.body === false ? "" : ` value="${this.body}"`} id="${this.id + "-ev1"}"></textarea><div class="comment-create-actions">${this.__ensureChild_button()}${this.__ensureChild_button2()}</div></div>` || ""}<!--${this.id + "-c1-end"}--></div>`;
    }
    get events() {
      return {
        click: {
          [`#${this.id}-ev0`]: this.__event_click_0
        },
        input: {
          [`#${this.id}-ev1`]: this.__event_input_1
        }
      };
    }
    __event_click_0(e, targetComponent) {
      this.openForm();
    }
    __event_input_1(e, targetComponent) {
      this.body = e.target.value;
    }
    __buildProps_avatar() {
      const user = auth_store_default.currentUser;
      return {
        src: user?.avatarUrl,
        name: user?.name || "",
        class: "!h-8 !w-8"
      };
    }
    __refreshChildProps_avatar() {
      const child = this._avatar;
      if (!child) {
        return;
      }
      child.__geaUpdateProps(this.__buildProps_avatar());
    }
    __ensureChild_avatar() {
      if (!this._avatar) {
        this._avatar = new Avatar(this.__buildProps_avatar());
        this._avatar.parentComponent = this;
        this._avatar.__geaCompiledChild = true;
      } else {
        this._avatar.props = this.__buildProps_avatar();
      }
      return this._avatar;
    }
    __buildProps_button() {
      return {
        variant: "default",
        disabled: this.isCreating,
        click: () => this.handleSubmit(),
        children: `${(this.isCreating ? `<span class="inline-flex items-center gap-2">${this.__ensureChild_spinner()}Save</span>` : "Save") || ""}`
      };
    }
    __refreshChildProps_button() {
      const child = this._button;
      if (!child) {
        return;
      }
      child.__geaUpdateProps(this.__buildProps_button());
    }
    __ensureChild_button() {
      if (!this._button) {
        this._button = new Button(this.__buildProps_button());
        this._button.parentComponent = this;
        this._button.__geaCompiledChild = true;
      } else {
        this._button.props = this.__buildProps_button();
      }
      return this._button;
    }
    __buildProps_button2() {
      return {
        variant: "ghost",
        click: () => {
          this.isFormOpen = false;
          this.body = "";
        },
        children: `Cancel`
      };
    }
    __refreshChildProps_button2() {
      const child = this._button2;
      if (!child) {
        return;
      }
      child.__geaUpdateProps(this.__buildProps_button2());
    }
    __ensureChild_button2() {
      if (!this._button2) {
        this._button2 = new Button(this.__buildProps_button2());
        this._button2.parentComponent = this;
        this._button2.__geaCompiledChild = true;
      } else {
        this._button2.props = this.__buildProps_button2();
      }
      return this._button2;
    }
    __buildProps_spinner() {
      return {
        size: 16
      };
    }
    __refreshChildProps_spinner() {
      const child = this._spinner;
      if (!child) {
        return;
      }
      child.__geaUpdateProps(this.__buildProps_spinner());
    }
    __ensureChild_spinner() {
      if (!this._spinner) {
        this._spinner = new Spinner(this.__buildProps_spinner());
        this._spinner.parentComponent = this;
        this._spinner.__geaCompiledChild = true;
      } else {
        this._spinner.props = this.__buildProps_spinner();
      }
      return this._spinner;
    }
    __onPropChange(key, value) {
      this.__geaPatchCond(0);
      this.__geaPatchCond(1);
    }
    __observe_local_isFormOpen(value, change) {
      if (this.rendered_) {
        this.__geaCondPatched_0 = this.__geaPatchCond(0);
        this.__geaCondPatched_1 = this.__geaPatchCond(1);
        if (this.__geaCondPatched_0 || this.__geaCondPatched_1) return;
      }
      this.__refreshChildProps_button2();
    }
    __observe_local_body(value, change) {
      if (this.rendered_) {
        this.__geaCondPatched_1 = this.__geaPatchCond(1);
        if (this.__geaCondPatched_1) return;
      }
      this.__refreshChildProps_button2();
    }
    __observe_authStore_currentUser(value, change) {
      this.__refreshChildProps_avatar();
    }
    __observe_local_isCreating(value, change) {
      this.__refreshChildProps_button();
    }
    __observe_local_handleSubmit(value, change) {
      this.__refreshChildProps_button();
    }
    __observe_local___ensureChild_spinner(value, change) {
      this.__refreshChildProps_button();
    }
    createdHooks() {
      if (!this.__observer_removers__) {
        this.__observer_removers__ = [];
      }
      if (!this.__stores) {
        this.__stores = {};
      }
      this.__observer_removers__.forEach((fn) => fn());
      this.__observer_removers__ = [];
      if (typeof this.__ensureArrayConfigs === "function") {
        this.__ensureArrayConfigs();
      }
      this.__stores.authStore = auth_store_default.__store;
      this.__observer_removers__.push(this.__stores.authStore.observe(["currentUser"], (__v, __c) => this.__observe_authStore_currentUser(__v, __c)));
    }
    __setupLocalStateObservers() {
      if (typeof this.__ensureArrayConfigs === "function") {
        this.__ensureArrayConfigs();
      }
      if (!this.__store) {
        return;
      }
      this.__observer_removers__.push(this.__store.observe(["isFormOpen"], (__v, __c) => this.__observe_local_isFormOpen(__v, __c)));
      this.__observer_removers__.push(this.__store.observe(["body"], (__v, __c) => this.__observe_local_body(__v, __c)));
      this.__observer_removers__.push(this.__store.observe(["isCreating"], (__v, __c) => this.__observe_local_isCreating(__v, __c)));
    }
  };
  if (void 0) {
    const __moduleExports = {
      default: CommentCreate
    };
    registerHotModule17("", __moduleExports);
    (void 0).accept((newModule) => {
      const __updatedModule = newModule || __moduleExports;
      registerHotModule17("", __updatedModule);
      handleComponentUpdate17("", __updatedModule);
    });
    (void 0).accept("../stores/issue-store", () => (void 0).invalidate());
    (void 0).accept("../stores/auth-store", () => (void 0).invalidate());
    (void 0).accept("../components/Spinner", () => (void 0).invalidate());
    const __origCreated = CommentCreate.prototype.created;
    CommentCreate.prototype.created = function(__geaProps) {
      registerComponentInstance17(this.constructor.name, this);
      return __origCreated.call(this, __geaProps);
    };
    const __origDispose = CommentCreate.prototype.dispose;
    CommentCreate.prototype.dispose = function() {
      unregisterComponentInstance17(this.constructor.name, this);
      return __origDispose.call(this);
    };
  }

  // jira_clone_gea/src/views/CommentItem.tsx
  var CommentItem = class extends Component {
    constructor(...args) {
      super(...args);
      this._button2 = null;
      this._button = null;
      this._avatar = null;
      try {
        this.__geaCond_0 = !!!this.isEditing;
        this.__geaCond_1 = !!this.isEditing;
        this.__geaCond_2 = !!!this.isEditing;
      } catch {
      }
      this.__geaRegisterCond(0, "c0", () => {
        return !this.isEditing;
      }, () => `<div class="comment-body">${this.props.body}</div>`, null);
      this.__geaRegisterCond(1, "c1", () => {
        return this.isEditing;
      }, () => `<div class="comment-edit-form"><textarea class="textarea"${this.editBody == null || this.editBody === false ? "" : ` value="${this.editBody}"`} id="${this.id + "-ev0"}"></textarea><div class="comment-edit-actions">${this.__ensureChild_button()}${this.__ensureChild_button2()}</div></div>`, null);
      this.__geaRegisterCond(2, "c2", () => {
        return !this.isEditing;
      }, () => `<div class="comment-actions"><span class="comment-action" id="${this.id + "-ev1"}">Edit</span><span class="comment-action" id="${this.id + "-ev2"}">Delete</span></div>`, null);
    }
    isEditing = false;
    editBody = "";
    get user() {
      const project = project_store_default.project;
      const users = project ? project.users : [];
      return users.find((u) => u.id === this.props.userId);
    }
    get userName() {
      return this.user ? this.user.name : "Unknown";
    }
    get userAvatar() {
      return this.user ? this.user.avatarUrl : "";
    }
    get dateText() {
      return formatDateTimeConversational(this.props.createdAt);
    }
    startEditing() {
      this.isEditing = true;
      this.editBody = this.props.body || "";
    }
    async saveEdit() {
      if (!this.editBody.trim()) return;
      await issue_store_default.updateComment(this.props.commentId, this.editBody, this.props.issueId);
      this.isEditing = false;
    }
    async handleDelete() {
      await issue_store_default.deleteComment(this.props.commentId, this.props.issueId);
    }
    template({
      commentId,
      body,
      userId,
      createdAt,
      issueId
    }) {
      return `<div id="${this.id}" class="comment">${this.__ensureChild_avatar()}<div class="comment-content"><div class="comment-header"><span id="${this.id + "-b1"}" class="comment-user-name">${this.userName}</span><span id="${this.id + "-b2"}" class="comment-date">${this.dateText}</span></div><!--${this.id + "-c0"}-->${!this.isEditing && `<div class="comment-body">${body}</div>` || ""}<!--${this.id + "-c0-end"}--><!--${this.id + "-c1"}-->${this.isEditing && `<div class="comment-edit-form"><textarea class="textarea"${this.editBody == null || this.editBody === false ? "" : ` value="${this.editBody}"`} id="${this.id + "-ev0"}"></textarea><div class="comment-edit-actions">${this.__ensureChild_button()}${this.__ensureChild_button2()}</div></div>` || ""}<!--${this.id + "-c1-end"}--><!--${this.id + "-c2"}-->${!this.isEditing && `<div class="comment-actions"><span class="comment-action" id="${this.id + "-ev1"}">Edit</span><span class="comment-action" id="${this.id + "-ev2"}">Delete</span></div>` || ""}<!--${this.id + "-c2-end"}--></div></div>`;
    }
    get events() {
      return {
        input: {
          [`#${this.id}-ev0`]: this.__event_input_0
        },
        click: {
          [`#${this.id}-ev1`]: this.__event_click_1,
          [`#${this.id}-ev2`]: this.__event_click_2
        }
      };
    }
    __event_input_0(e, targetComponent) {
      this.editBody = e.target.value;
    }
    __event_click_1(e, targetComponent) {
      this.startEditing();
    }
    __event_click_2(e, targetComponent) {
      this.handleDelete();
    }
    __buildProps_avatar() {
      return {
        src: this.userAvatar,
        name: this.userName,
        class: "!h-8 !w-8"
      };
    }
    __refreshChildProps_avatar() {
      const child = this._avatar;
      if (!child) {
        return;
      }
      child.__geaUpdateProps(this.__buildProps_avatar());
    }
    __ensureChild_avatar() {
      if (!this._avatar) {
        this._avatar = new Avatar(this.__buildProps_avatar());
        this._avatar.parentComponent = this;
        this._avatar.__geaCompiledChild = true;
      } else {
        this._avatar.props = this.__buildProps_avatar();
      }
      return this._avatar;
    }
    __buildProps_button() {
      return {
        variant: "default",
        click: () => this.saveEdit(),
        children: `Save`
      };
    }
    __refreshChildProps_button() {
      const child = this._button;
      if (!child) {
        return;
      }
      child.__geaUpdateProps(this.__buildProps_button());
    }
    __ensureChild_button() {
      if (!this._button) {
        this._button = new Button(this.__buildProps_button());
        this._button.parentComponent = this;
        this._button.__geaCompiledChild = true;
      } else {
        this._button.props = this.__buildProps_button();
      }
      return this._button;
    }
    __buildProps_button2() {
      return {
        variant: "ghost",
        click: () => {
          this.isEditing = false;
        },
        children: `Cancel`
      };
    }
    __refreshChildProps_button2() {
      const child = this._button2;
      if (!child) {
        return;
      }
      child.__geaUpdateProps(this.__buildProps_button2());
    }
    __ensureChild_button2() {
      if (!this._button2) {
        this._button2 = new Button(this.__buildProps_button2());
        this._button2.parentComponent = this;
        this._button2.__geaCompiledChild = true;
      } else {
        this._button2.props = this.__buildProps_button2();
      }
      return this._button2;
    }
    dispose() {
      if (this.__observer_removers__) {
        this.__observer_removers__.forEach((fn) => fn());
      }
      this._avatar?.dispose?.();
      this._button?.dispose?.();
      this._button2?.dispose?.();
      super.dispose();
    }
    __observe_local_userName(userName, change) {
      if (document.getElementById(this.id + "-b1")) {
        document.getElementById(this.id + "-b1").textContent = userName;
      }
      this.__refreshChildProps_avatar();
    }
    __onPropChange(key, value) {
      if (key === "createdAt") try {
        const __el = document.getElementById(this.id + "-b2");
        const __boundValue = this.dateText;
        if (__el) {
          if (__el.textContent !== __boundValue) __el.textContent = __boundValue;
        }
      } catch {
      }
      this.__geaPatchCond(0);
      this.__geaPatchCond(1);
      this.__geaPatchCond(2);
    }
    __observe_local_isEditing(value, change) {
      if (this.rendered_) {
        this.__geaCondPatched_0 = this.__geaPatchCond(0);
        this.__geaCondPatched_1 = this.__geaPatchCond(1);
        this.__geaCondPatched_2 = this.__geaPatchCond(2);
        if (this.__geaCondPatched_0 || this.__geaCondPatched_1 || this.__geaCondPatched_2) return;
      }
      this.__refreshChildProps_button2();
    }
    __observe_local_editBody(value, change) {
      if (this.rendered_) {
        this.__geaCondPatched_1 = this.__geaPatchCond(1);
        if (this.__geaCondPatched_1) return;
      }
    }
    __observe_local_userAvatar(value, change) {
      this.__refreshChildProps_avatar();
    }
    __observe_local_saveEdit(value, change) {
      this.__refreshChildProps_button();
    }
    __observe_local_userName__via(_v, change) {
      this.__observe_local_userName(this.userName, change);
    }
    __observe_local_userAvatar__via(_v, change) {
      this.__observe_local_userAvatar(this.userAvatar, change);
    }
    createdHooks() {
      if (!this.__observer_removers__) {
        this.__observer_removers__ = [];
      }
      if (!this.__stores) {
        this.__stores = {};
      }
      this.__observer_removers__.forEach((fn) => fn());
      this.__observer_removers__ = [];
      if (typeof this.__ensureArrayConfigs === "function") {
        this.__ensureArrayConfigs();
      }
      this.__stores.projectStore = project_store_default.__store;
      this.__observer_removers__.push(this.__stores.projectStore.observe(["project"], (__v, __c) => this.__observe_local_userName__via(__v, __c)));
      this.__observer_removers__.push(this.__stores.projectStore.observe(["project"], (__v, __c) => this.__observe_local_userAvatar__via(__v, __c)));
    }
    __setupLocalStateObservers() {
      if (typeof this.__ensureArrayConfigs === "function") {
        this.__ensureArrayConfigs();
      }
      if (!this.__store) {
        return;
      }
      this.__observer_removers__.push(this.__store.observe(["isEditing"], (__v, __c) => this.__observe_local_isEditing(__v, __c)));
      this.__observer_removers__.push(this.__store.observe(["editBody"], (__v, __c) => this.__observe_local_editBody(__v, __c)));
    }
  };
  if (void 0) {
    const __moduleExports = {
      default: CommentItem
    };
    registerHotModule18("", __moduleExports);
    (void 0).accept((newModule) => {
      const __updatedModule = newModule || __moduleExports;
      registerHotModule18("", __updatedModule);
      handleComponentUpdate18("", __updatedModule);
    });
    (void 0).accept("../stores/issue-store", () => (void 0).invalidate());
    (void 0).accept("../stores/project-store", () => (void 0).invalidate());
    (void 0).accept("../utils/dateTime", () => (void 0).invalidate());
    const __origCreated = CommentItem.prototype.created;
    CommentItem.prototype.created = function(__geaProps) {
      registerComponentInstance18(this.constructor.name, this);
      return __origCreated.call(this, __geaProps);
    };
    const __origDispose = CommentItem.prototype.dispose;
    CommentItem.prototype.dispose = function() {
      unregisterComponentInstance18(this.constructor.name, this);
      return __origDispose.call(this);
    };
  }

  // jira_clone_gea/src/views/IssueDetails.tsx
  function getTrackingPercent(spent, remaining) {
    const total = spent + remaining;
    return total > 0 ? Math.min(100, Math.round(spent / total * 100)) : 0;
  }
  var statusOptions = Object.values(IssueStatus).map((s) => ({
    value: s,
    label: IssueStatusCopy[s]
  }));
  var priorityOptions = Object.values(IssuePriority).map((p) => ({
    value: p,
    label: IssuePriorityCopy[p]
  }));
  var statusColors = {
    backlog: {
      bg: "var(--color-bg-medium)",
      color: "var(--color-text-darkest)"
    },
    selected: {
      bg: "var(--color-bg-light-primary)",
      color: "var(--color-primary)"
    },
    inprogress: {
      bg: "var(--color-primary)",
      color: "#fff"
    },
    done: {
      bg: "var(--color-success)",
      color: "#fff"
    }
  };
  var IssueDetails = class extends Component {
    __getMapItemFromEvent_store___unresolved_4(e) {
      const __el = e.target.closest("[data-gea-item-id]");
      if (!__el) return null;
      if (__el.__geaItem) return __el.__geaItem;
      const __itemId = __el.getAttribute("data-gea-item-id");
      if (__itemId == null) return null;
      const __items = this.__geaMaps[4].getItems();
      const __arr = Array.isArray(__items) ? __items : Array.isArray(__items?.__getTarget) ? __items.__getTarget : [];
      return __arr.find((_, __i) => String(__i) === __itemId) || __itemId;
    }
    __getMapItemFromEvent_store___unresolved_3(e) {
      const __el = e.target.closest("[data-gea-item-id]");
      if (!__el) return null;
      if (__el.__geaItem) return __el.__geaItem;
      const __itemId = __el.getAttribute("data-gea-item-id");
      if (__itemId == null) return null;
      const __items = this.__geaMaps[3].getItems();
      const __arr = Array.isArray(__items) ? __items : Array.isArray(__items?.__getTarget) ? __items.__getTarget : [];
      return __arr.find((_, __i) => String(__i) === __itemId) || __itemId;
    }
    __getMapItemFromEvent_store___unresolved_2(e) {
      const __el = e.target.closest("[data-gea-item-id]");
      if (!__el) return null;
      if (__el.__geaItem) return __el.__geaItem;
      const __itemId = __el.getAttribute("data-gea-item-id");
      if (__itemId == null) return null;
      const __items = this.__geaMaps[2].getItems();
      const __arr = Array.isArray(__items) ? __items : Array.isArray(__items?.__getTarget) ? __items.__getTarget : [];
      return __arr.find((_, __i) => String(__i) === __itemId) || __itemId;
    }
    __getMapItemFromEvent_store___unresolved_1(e) {
      const __el = e.target.closest("[data-gea-item-id]");
      if (!__el) return null;
      if (__el.__geaItem) return __el.__geaItem;
      const __itemId = __el.getAttribute("data-gea-item-id");
      if (__itemId == null) return null;
      const __items = this.__geaMaps[1].getItems();
      const __arr = Array.isArray(__items) ? __items : Array.isArray(__items?.__getTarget) ? __items.__getTarget : [];
      return __arr.find((_, __i) => String(__i) === __itemId) || __itemId;
    }
    __getMapItemFromEvent_store___unresolved_0(e) {
      const __el = e.target.closest("[data-gea-item-id]");
      if (!__el) return null;
      if (__el.__geaItem) return __el.__geaItem;
      const __itemId = __el.getAttribute("data-gea-item-id");
      if (__itemId == null) return null;
      const __items = this.__geaMaps[0].getItems();
      const __arr = Array.isArray(__items) ? __items : Array.isArray(__items?.__getTarget) ? __items.__getTarget : [];
      return __arr.find((_, __i) => String(__i) === __itemId) || __itemId;
    }
    constructor(...args) {
      super(...args);
      this._button3 = null;
      this._icon7 = null;
      this._icon6 = null;
      this._dialog = null;
      this._icon5 = null;
      this._issuePriorityIcon = null;
      this._commentCreate = null;
      this._button2 = null;
      this._button = null;
      this._icon4 = null;
      this._icon3 = null;
      this._icon2 = null;
      this._icon = null;
      this._issueTypeIcon = null;
      try {
        const {
          isLoading,
          issue: issue2
        } = issue_store_default;
        const issueDescription = issue2.description || "";
        const project = project_store_default.project;
        const users = project ? project.users : [];
        const issueReporterId2 = issue2.reporterId || "";
        const reporter = users.find((u) => u.id === issueReporterId2);
        this.__geaCond_0 = !!this.confirmingDelete;
        this.__geaCond_1 = !!!this.isEditingTitle;
        this.__geaCond_2 = !!this.isEditingTitle;
        this.__geaCond_3 = !!issueDescription;
        this.__geaCond_4 = !!!issueDescription;
        this.__geaCond_5 = !!this.openDropdown;
        this.__geaCond_6 = !!(this.openDropdown === "status");
        this.__geaCond_7 = !!(this.openDropdown === "assignees");
        this.__geaCond_8 = !!reporter;
        this.__geaCond_9 = !!(this.openDropdown === "reporter");
        this.__geaCond_10 = !!(this.openDropdown === "priority");
        this.__geaCond_11 = !!this.isEditingTracking;
      } catch {
      }
      this.__geaRegisterCond(0, "c0", () => {
        const {
          isLoading,
          issue: issue2
        } = issue_store_default;
        const issueDescription = issue2.description || "";
        const project = project_store_default.project;
        const users = project ? project.users : [];
        const issueReporterId2 = issue2.reporterId || "";
        const reporter = users.find((u) => u.id === issueReporterId2);
        return this.confirmingDelete;
      }, () => {
        const {
          isLoading,
          issue: issue2
        } = issue_store_default;
        const issueDescription = issue2.description || "";
        const project = project_store_default.project;
        const users = project ? project.users : [];
        const issueReporterId2 = issue2.reporterId || "";
        const reporter = users.find((u) => u.id === issueReporterId2);
        return `<div class="confirm-inline"><p>Are you sure you want to delete this issue?</p><div class="confirm-inline-actions">${this.__ensureChild_button()}${this.__ensureChild_button2()}</div></div>`;
      }, null);
      this.__geaRegisterCond(1, "c1", () => {
        const {
          isLoading,
          issue: issue2
        } = issue_store_default;
        const issueDescription = issue2.description || "";
        const project = project_store_default.project;
        const users = project ? project.users : [];
        const issueReporterId2 = issue2.reporterId || "";
        const reporter = users.find((u) => u.id === issueReporterId2);
        return !this.isEditingTitle;
      }, () => {
        const {
          isLoading,
          issue: issue2
        } = issue_store_default;
        const issueTitle = issue2.title || "";
        return `<h2 class="issue-title-text" id="${this.id + "-ev2"}">${issueTitle}</h2>`;
      }, null);
      this.__geaRegisterCond(2, "c2", () => {
        const {
          isLoading,
          issue: issue2
        } = issue_store_default;
        const issueDescription = issue2.description || "";
        const project = project_store_default.project;
        const users = project ? project.users : [];
        const issueReporterId2 = issue2.reporterId || "";
        const reporter = users.find((u) => u.id === issueReporterId2);
        return this.isEditingTitle;
      }, () => {
        const {
          isLoading,
          issue: issue2
        } = issue_store_default;
        const issueDescription = issue2.description || "";
        const project = project_store_default.project;
        const users = project ? project.users : [];
        const issueReporterId2 = issue2.reporterId || "";
        const reporter = users.find((u) => u.id === issueReporterId2);
        return `<textarea class="issue-title-input"${this.editTitle == null || this.editTitle === false ? "" : ` value="${this.editTitle}"`} id="${this.id + "-ev3"}"></textarea>`;
      }, null);
      this.__geaRegisterCond(3, "c3", () => {
        const {
          isLoading,
          issue: issue2
        } = issue_store_default;
        const issueDescription = issue2.description || "";
        const project = project_store_default.project;
        const users = project ? project.users : [];
        const issueReporterId2 = issue2.reporterId || "";
        const reporter = users.find((u) => u.id === issueReporterId2);
        return issueDescription;
      }, () => {
        const {
          isLoading,
          issue: issue2
        } = issue_store_default;
        const issueDescription = issue2.description || "";
        return `<div class="text-edited-content">${issueDescription}</div>`;
      }, null);
      this.__geaRegisterCond(4, "c4", () => {
        const {
          isLoading,
          issue: issue2
        } = issue_store_default;
        const issueDescription = issue2.description || "";
        const project = project_store_default.project;
        const users = project ? project.users : [];
        const issueReporterId2 = issue2.reporterId || "";
        const reporter = users.find((u) => u.id === issueReporterId2);
        return !issueDescription;
      }, () => {
        const {
          isLoading,
          issue: issue2
        } = issue_store_default;
        const issueDescription = issue2.description || "";
        const project = project_store_default.project;
        const users = project ? project.users : [];
        const issueReporterId2 = issue2.reporterId || "";
        const reporter = users.find((u) => u.id === issueReporterId2);
        return `<p class="issue-description-placeholder">Add a description...</p>`;
      }, null);
      this.__geaRegisterCond(5, "c5", () => {
        const {
          isLoading,
          issue: issue2
        } = issue_store_default;
        const issueDescription = issue2.description || "";
        const project = project_store_default.project;
        const users = project ? project.users : [];
        const issueReporterId2 = issue2.reporterId || "";
        const reporter = users.find((u) => u.id === issueReporterId2);
        return this.openDropdown;
      }, () => {
        const {
          isLoading,
          issue: issue2
        } = issue_store_default;
        const issueDescription = issue2.description || "";
        const project = project_store_default.project;
        const users = project ? project.users : [];
        const issueReporterId2 = issue2.reporterId || "";
        const reporter = users.find((u) => u.id === issueReporterId2);
        return `<div class="dropdown-overlay" id="${this.id + "-ev4"}"></div>`;
      }, null);
      this.__geaRegisterCond(6, "c6", () => {
        const {
          isLoading,
          issue: issue2
        } = issue_store_default;
        const issueDescription = issue2.description || "";
        const project = project_store_default.project;
        const users = project ? project.users : [];
        const issueReporterId2 = issue2.reporterId || "";
        const reporter = users.find((u) => u.id === issueReporterId2);
        return this.openDropdown === "status";
      }, () => {
        const {
          isLoading,
          issue: issue2
        } = issue_store_default;
        const issueDescription = issue2.description || "";
        const project = project_store_default.project;
        const users = project ? project.users : [];
        const issueReporterId2 = issue2.reporterId || "";
        const reporter = users.find((u) => u.id === issueReporterId2);
        return `<div class="custom-dropdown">${statusOptions.map((opt, __geaIdx) => this.render__unresolved_0Item(opt, __geaIdx)).join("") + "<!---->"}</div>`;
      }, null);
      this.__geaRegisterCond(7, "c7", () => {
        const {
          isLoading,
          issue: issue2
        } = issue_store_default;
        const issueDescription = issue2.description || "";
        const project = project_store_default.project;
        const users = project ? project.users : [];
        const issueReporterId2 = issue2.reporterId || "";
        const reporter = users.find((u) => u.id === issueReporterId2);
        return this.openDropdown === "assignees";
      }, () => {
        const {
          isLoading,
          issue: issue2
        } = issue_store_default;
        const project = project_store_default.project;
        const users = project ? project.users : [];
        const issueUserIds = issue2.userIds || [];
        return `<div class="custom-dropdown"><div class="custom-dropdown-search"><input class="custom-dropdown-search-input" type="text" placeholder="Search"${this.assigneeSearch == null || this.assigneeSearch === false ? "" : ` value="${this.assigneeSearch}"`} id="${this.id + "-ev6"}" /><span class="custom-dropdown-search-clear" id="${this.id + "-ev7"}">\xD7</span></div>${users.filter((u) => !issueUserIds.includes(u.id) && u.name.toLowerCase().includes(this.assigneeSearch.toLowerCase())).map((u, __geaIdx) => this.render__unresolved_2Item(u, __geaIdx)).join("") + "<!---->"}${users.filter((u) => !issueUserIds.includes(u.id) && u.name.toLowerCase().includes(this.assigneeSearch.toLowerCase())).length === 0 && `<div class="custom-dropdown-empty">No users available</div>` || ""}</div>`;
      }, null);
      this.__geaRegisterCond(8, "c8", () => {
        const {
          isLoading,
          issue: issue2
        } = issue_store_default;
        const issueDescription = issue2.description || "";
        const project = project_store_default.project;
        const users = project ? project.users : [];
        const issueReporterId2 = issue2.reporterId || "";
        const reporter = users.find((u) => u.id === issueReporterId2);
        return reporter;
      }, () => {
        const {
          isLoading,
          issue: issue2
        } = issue_store_default;
        const project = project_store_default.project;
        const users = project ? project.users : [];
        const issueReporterId2 = issue2.reporterId || "";
        const reporter = users.find((u) => u.id === issueReporterId2);
        return `<img class="reporter-avatar"${reporter.avatarUrl == null || reporter.avatarUrl === false ? "" : ` src="${reporter.avatarUrl}"`}${reporter.name == null || reporter.name === false ? "" : ` alt="${reporter.name}"`} />`;
      }, null);
      this.__geaRegisterCond(9, "c9", () => {
        const {
          isLoading,
          issue: issue2
        } = issue_store_default;
        const issueDescription = issue2.description || "";
        const project = project_store_default.project;
        const users = project ? project.users : [];
        const issueReporterId2 = issue2.reporterId || "";
        const reporter = users.find((u) => u.id === issueReporterId2);
        return this.openDropdown === "reporter";
      }, () => {
        const project = project_store_default.project;
        const users = project ? project.users : [];
        return `<div class="custom-dropdown">${users.map((u, __geaIdx) => this.render__unresolved_3Item(u, __geaIdx)).join("") + "<!---->"}</div>`;
      }, null);
      this.__geaRegisterCond(10, "c10", () => {
        const {
          isLoading,
          issue: issue2
        } = issue_store_default;
        const issueDescription = issue2.description || "";
        const project = project_store_default.project;
        const users = project ? project.users : [];
        const issueReporterId2 = issue2.reporterId || "";
        const reporter = users.find((u) => u.id === issueReporterId2);
        return this.openDropdown === "priority";
      }, () => {
        const {
          isLoading,
          issue: issue2
        } = issue_store_default;
        const issueDescription = issue2.description || "";
        const project = project_store_default.project;
        const users = project ? project.users : [];
        const issueReporterId2 = issue2.reporterId || "";
        const reporter = users.find((u) => u.id === issueReporterId2);
        return `<div class="custom-dropdown">${priorityOptions.map((opt, __geaIdx) => this.render__unresolved_4Item(opt, __geaIdx)).join("") + "<!---->"}</div>`;
      }, null);
      this.__geaRegisterCond(11, "c11", () => {
        const {
          isLoading,
          issue: issue2
        } = issue_store_default;
        const issueDescription = issue2.description || "";
        const project = project_store_default.project;
        const users = project ? project.users : [];
        const issueReporterId2 = issue2.reporterId || "";
        const reporter = users.find((u) => u.id === issueReporterId2);
        return this.isEditingTracking;
      }, () => {
        const {
          isLoading,
          issue: issue2
        } = issue_store_default;
        const issueDescription = issue2.description || "";
        const project = project_store_default.project;
        const users = project ? project.users : [];
        const issueReporterId2 = issue2.reporterId || "";
        const reporter = users.find((u) => u.id === issueReporterId2);
        return `${this.__ensureChild_dialog()}`;
      }, null);
    }
    isEditingTitle = false;
    editTitle = "";
    confirmingDelete = false;
    isEditingTracking = false;
    editTimeSpent = 0;
    editTimeRemaining = 0;
    openDropdown = null;
    assigneeSearch = "";
    created(props) {
      if (props.issueId) {
        issue_store_default.fetchIssue(props.issueId);
      }
    }
    startEditTitle() {
      this.editTitle = issue_store_default.issue?.title || "";
      this.isEditingTitle = true;
    }
    saveTitle() {
      this.isEditingTitle = false;
      if (this.editTitle.trim() && this.editTitle !== issue_store_default.issue?.title) {
        issue_store_default.updateIssue({
          title: this.editTitle.trim()
        });
      }
    }
    toggleDropdown(name) {
      this.openDropdown = this.openDropdown === name ? null : name;
      this.assigneeSearch = "";
    }
    closeDropdown() {
      this.openDropdown = null;
      this.assigneeSearch = "";
    }
    removeAssignee(userId) {
      const issue2 = issue_store_default.issue;
      if (!issue2) return;
      const newIds = (issue2.userIds || []).filter((id) => id !== userId);
      issue_store_default.updateIssue({
        userIds: newIds,
        users: newIds.map((id) => ({
          id
        }))
      });
    }
    addAssignee(userId) {
      const issue2 = issue_store_default.issue;
      if (!issue2) return;
      const currentIds = issue2.userIds || [];
      if (currentIds.includes(userId)) return;
      const newIds = [...currentIds, userId];
      issue_store_default.updateIssue({
        userIds: newIds,
        users: newIds.map((id) => ({
          id
        }))
      });
    }
    startEditTracking() {
      const issue2 = issue_store_default.issue;
      this.editTimeSpent = issue2?.timeSpent || 0;
      this.editTimeRemaining = issue2?.timeRemaining || issue2?.estimate || 0;
      this.isEditingTracking = true;
    }
    saveTracking() {
      this.isEditingTracking = false;
      issue_store_default.updateIssue({
        timeSpent: this.editTimeSpent,
        timeRemaining: this.editTimeRemaining
      });
    }
    handleDeleteIssue() {
      const issue2 = issue_store_default.issue;
      if (!issue2) return;
      project_store_default.deleteIssue(issue2.id);
      this.props.onClose?.();
      toast_store_default.success("Issue has been successfully deleted.");
    }
    template({
      onClose
    }) {
      Component._register(CommentCreate);
      Component._register(CommentItem);
      const {
        isLoading,
        issue: issue2
      } = issue_store_default;
      const project = project_store_default.project;
      const users = project ? project.users : [];
      if (isLoading || !issue2) {
        return `<div id="${this.id}" class="issue-details-loader">${new Spinner({
          size: 40
        })}</div>`;
      }
      const issueTitle = issue2.title || "";
      const issueDescription = issue2.description || "";
      const issueType2 = issue2.type || "task";
      const issueStatus2 = issue2.status || "backlog";
      const issuePriority2 = issue2.priority || "3";
      const issueEstimate = issue2.estimate || 0;
      const issueUserIds = issue2.userIds || [];
      const issueReporterId2 = issue2.reporterId || "";
      const timeSpent = issue2.timeSpent || 0;
      const timeRemaining = issue2.timeRemaining || issue2.estimate || 0;
      const trackPercent = getTrackingPercent(timeSpent, timeRemaining);
      const createdAgo = formatDateTimeConversational(issue2.createdAt);
      const updatedAgo = formatDateTimeConversational(issue2.updatedAt);
      const reporter = users.find((u) => u.id === issueReporterId2);
      return `<div id="${this.id}" class="issue-details"><div class="issue-details-top-actions"><div class="issue-details-type">${this.__ensureChild_issueTypeIcon()}<span id="${this.id + "-b1"}" class="issue-details-type-label">${(IssueTypeCopy[issueType2] || "Task").toUpperCase()}-${issue2.id}</span></div><div class="issue-details-top-right"><button class="issue-details-action-btn">${this.__ensureChild_icon()}<span>Give feedback</span></button><button class="issue-details-action-btn">${this.__ensureChild_icon2()}<span>Copy link</span></button><button class="issue-details-action-btn" id="${this.id + "-ev0"}">${this.__ensureChild_icon3()}</button><button class="issue-details-action-btn" id="${this.id + "-ev1"}">${this.__ensureChild_icon4()}</button></div></div><!--${this.id + "-c0"}-->${this.confirmingDelete && `<div class="confirm-inline"><p>Are you sure you want to delete this issue?</p><div class="confirm-inline-actions">${this.__ensureChild_button()}${this.__ensureChild_button2()}</div></div>` || ""}<!--${this.id + "-c0-end"}--><div class="issue-details-body"><div class="issue-details-left"><div class="issue-details-title"><!--${this.id + "-c1"}-->${!this.isEditingTitle && `<h2 class="issue-title-text" id="${this.id + "-ev2"}">${issueTitle}</h2>` || ""}<!--${this.id + "-c1-end"}--><!--${this.id + "-c2"}-->${this.isEditingTitle && `<textarea class="issue-title-input"${this.editTitle == null || this.editTitle === false ? "" : ` value="${this.editTitle}"`} id="${this.id + "-ev3"}"></textarea>` || ""}<!--${this.id + "-c2-end"}--></div><div class="issue-details-description"><h4 class="issue-details-section-title">Description</h4><!--${this.id + "-c3"}-->${issueDescription && `<div class="text-edited-content">${issueDescription}</div>` || ""}<!--${this.id + "-c3-end"}--><!--${this.id + "-c4"}-->${!issueDescription && `<p class="issue-description-placeholder">Add a description...</p>` || ""}<!--${this.id + "-c4-end"}--></div><div id="${this.id + "-b16"}" class="issue-details-comments"><h4 class="issue-details-section-title">Comments</h4>${this.__ensureChild_commentCreate()}${issue2.comments && issue2.comments.map((comment) => this.renderIssuecommentsItem(comment)).join("") + "<!----><!---->" || ""}</div></div><div class="issue-details-right"><!--${this.id + "-c5"}-->${this.openDropdown && `<div class="dropdown-overlay" id="${this.id + "-ev4"}"></div>` || ""}<!--${this.id + "-c5-end"}--><div id="${this.id + "-b11"}" class="issue-details-field issue-details-field--relative"><label class="issue-details-field-label">Status</label><button id="${this.id + "-b2"}" class="status-badge"${`background:${statusColors[issueStatus2]?.bg};color:${statusColors[issueStatus2]?.color}` == null ? "" : ` style="${`background:${statusColors[issueStatus2]?.bg};color:${statusColors[issueStatus2]?.color}`}"`}>${(IssueStatusCopy[issueStatus2] || "Backlog").toUpperCase()}<span class="status-badge-arrow">\u25BC</span></button><!--${this.id + "-c6"}-->${this.openDropdown === "status" && `<div class="custom-dropdown">${statusOptions.map((opt, __geaIdx) => this.render__unresolved_0Item(opt, __geaIdx)).join("") + "<!---->"}</div>` || ""}<!--${this.id + "-c6-end"}--></div><div id="${this.id + "-b13"}" class="issue-details-field issue-details-field--relative"><label class="issue-details-field-label">Assignees</label><div id="${this.id + "-b12"}" class="assignee-chips">${issueUserIds.map((uid) => {
        const u = users.find((usr) => usr.id === uid);
        if (!u) return null;
        return `<div id="${this.id + "-b12-" + String(String(uid))}" data-gea-item-id="${String(uid)}" data-gea-event="ev15" class="assignee-chip"><img class="assignee-chip-avatar"${u.avatarUrl == null || u.avatarUrl === false ? "" : ` src="${u.avatarUrl}"`}${u.name == null || u.name === false ? "" : ` alt="${u.name}"`} /><span class="assignee-chip-name">${u.name}</span><span class="assignee-chip-remove">\xD7</span></div>`;
      }).join("") + "<!---->"}<span class="assignee-add-more" id="${this.id + "-ev5"}">+ Add more</span></div><!--${this.id + "-c7"}-->${this.openDropdown === "assignees" && `<div class="custom-dropdown"><div class="custom-dropdown-search"><input class="custom-dropdown-search-input" type="text" placeholder="Search"${this.assigneeSearch == null || this.assigneeSearch === false ? "" : ` value="${this.assigneeSearch}"`} id="${this.id + "-ev6"}" /><span class="custom-dropdown-search-clear" id="${this.id + "-ev7"}">\xD7</span></div>${users.filter((u) => !issueUserIds.includes(u.id) && u.name.toLowerCase().includes(this.assigneeSearch.toLowerCase())).map((u, __geaIdx) => this.render__unresolved_2Item(u, __geaIdx)).join("") + "<!---->"}${users.filter((u) => !issueUserIds.includes(u.id) && u.name.toLowerCase().includes(this.assigneeSearch.toLowerCase())).length === 0 && `<div class="custom-dropdown-empty">No users available</div>` || ""}</div>` || ""}<!--${this.id + "-c7-end"}--></div><div id="${this.id + "-b14"}" class="issue-details-field issue-details-field--relative"><label class="issue-details-field-label">Reporter</label><div class="reporter-display" id="${this.id + "-ev8"}"><!--${this.id + "-c8"}-->${reporter && `<img class="reporter-avatar"${reporter.avatarUrl == null || reporter.avatarUrl === false ? "" : ` src="${reporter.avatarUrl}"`}${reporter.name == null || reporter.name === false ? "" : ` alt="${reporter.name}"`} />` || ""}<!--${this.id + "-c8-end"}--><span id="${this.id + "-b3"}" class="reporter-name">${(reporter ? reporter.name : "Unassigned") || ""}</span></div><!--${this.id + "-c9"}-->${this.openDropdown === "reporter" && `<div class="custom-dropdown">${users.map((u, __geaIdx) => this.render__unresolved_3Item(u, __geaIdx)).join("") + "<!---->"}</div>` || ""}<!--${this.id + "-c9-end"}--></div><div id="${this.id + "-b15"}" class="issue-details-field issue-details-field--relative"><label class="issue-details-field-label">Priority</label><div class="priority-display" id="${this.id + "-ev9"}">${this.__ensureChild_issuePriorityIcon()}<span id="${this.id + "-b4"}" class="priority-name">${IssuePriorityCopy[issuePriority2] || "Medium"}</span></div><!--${this.id + "-c10"}-->${this.openDropdown === "priority" && `<div class="custom-dropdown">${priorityOptions.map((opt, __geaIdx) => this.render__unresolved_4Item(opt, __geaIdx)).join("") + "<!---->"}</div>` || ""}<!--${this.id + "-c10-end"}--></div><div class="issue-details-field"><label class="issue-details-field-label">Original Estimate (hours)</label><input id="${this.id + "-b5"}" class="input" type="number"${issueEstimate == null || issueEstimate === false ? "" : ` value="${issueEstimate}"`} /></div><div class="issue-details-field"><label class="issue-details-field-label">Time Tracking</label><div class="tracking-widget tracking-widget--clickable" id="${this.id + "-ev10"}"><div class="tracking-bar-container">${this.__ensureChild_icon5()}<div class="tracking-bar"><div id="${this.id + "-b6"}" class="tracking-bar-fill"${`width:${trackPercent}%` == null ? "" : ` style="${`width:${trackPercent}%`}"`}></div></div></div><div class="tracking-values"><span id="${this.id + "-b7"}">${(timeSpent ? `${timeSpent}h logged` : "No time logged") || ""}</span><span id="${this.id + "-b8"}">${timeRemaining}h remaining</span></div></div><!--${this.id + "-c11"}-->${this.isEditingTracking && `${this.__ensureChild_dialog()}` || ""}<!--${this.id + "-c11-end"}--></div><div class="issue-details-dates"><div id="${this.id + "-b9"}" class="issue-details-date">Created at ${createdAgo}</div><div id="${this.id + "-b10"}" class="issue-details-date">Updated at ${updatedAgo}</div></div></div></div></div>`;
    }
    get events() {
      return {
        click: {
          [`#${this.id}-ev0`]: this.__event_click_0,
          [`#${this.id}-ev1`]: this.__event_click_1,
          [`#${this.id}-ev2`]: this.__event_click_2,
          [`#${this.id}-ev4`]: this.__event_click_6,
          [`#${this.id}-b2`]: this.__event_click_7,
          [`#${this.id}-ev5`]: this.__event_click_8,
          [`#${this.id}-ev7`]: this.__event_click_10,
          [`#${this.id}-ev8`]: this.__event_click_11,
          [`#${this.id}-ev9`]: this.__event_click_12,
          [`#${this.id}-ev10`]: this.__event_click_14,
          '[data-gea-event="ev11"]': this.__event_click_15,
          '[data-gea-event="ev14"]': this.__event_click_0_1,
          '[data-gea-event="ev15"]': this.__event_click_1_1,
          '[data-gea-event="ev16"]': this.__event_click_2_1,
          '[data-gea-event="ev17"]': this.__event_click_3,
          '[data-gea-event="ev18"]': this.__event_click_4
        },
        input: {
          [`#${this.id}-ev3`]: this.__event_input_3,
          [`#${this.id}-ev6`]: this.__event_input_9,
          '[data-gea-event="ev12"]': this.__event_input_16,
          '[data-gea-event="ev13"]': this.__event_input_17
        },
        blur: {
          [`#${this.id}-ev3`]: this.__event_blur_4
        },
        keydown: {
          [`#${this.id}-ev3`]: this.__event_keydown_5
        },
        change: {
          [`#${this.id}-b5`]: this.__event_change_13
        }
      };
    }
    __event_click_0(e, targetComponent) {
      this.confirmingDelete = true;
    }
    __event_click_1(e, targetComponent) {
      this.props.onClose(e);
    }
    __event_click_2(e, targetComponent) {
      this.startEditTitle();
    }
    __event_input_3(e, targetComponent) {
      this.editTitle = e.target.value;
    }
    __event_blur_4(e, targetComponent) {
      this.saveTitle();
    }
    __event_keydown_5(e, targetComponent) {
      if (e.key === "Enter") {
        e.preventDefault();
        this.saveTitle();
      }
    }
    __event_click_6(e, targetComponent) {
      this.closeDropdown();
    }
    __event_click_7(e, targetComponent) {
      this.toggleDropdown("status");
    }
    __event_click_8(e, targetComponent) {
      this.toggleDropdown("assignees");
    }
    __event_input_9(e, targetComponent) {
      this.assigneeSearch = e.target.value;
    }
    __event_click_10(e, targetComponent) {
      this.closeDropdown();
    }
    __event_click_11(e, targetComponent) {
      this.toggleDropdown("reporter");
    }
    __event_click_12(e, targetComponent) {
      this.toggleDropdown("priority");
    }
    __event_change_13(e, targetComponent) {
      issue_store_default.updateIssue({
        estimate: Number(e.target.value) || null
      });
    }
    __event_click_14(e, targetComponent) {
      this.startEditTracking();
    }
    __event_click_15(e, targetComponent) {
      this.isEditingTracking = false;
    }
    __event_input_16(e, targetComponent) {
      this.editTimeSpent = Number(e.target.value) || 0;
    }
    __event_input_17(e, targetComponent) {
      this.editTimeRemaining = Number(e.target.value) || 0;
    }
    __buildProps_issueTypeIcon() {
      const {
        isLoading,
        issue: issue2
      } = issue_store_default;
      if (isLoading || !issue2) return {};
      const issueType2 = issue2.type || "task";
      return {
        type: issueType2,
        size: 16
      };
    }
    __refreshChildProps_issueTypeIcon() {
      const child = this._issueTypeIcon;
      if (!child) {
        return;
      }
      child.__geaUpdateProps(this.__buildProps_issueTypeIcon());
    }
    __ensureChild_issueTypeIcon() {
      if (!this._issueTypeIcon) {
        this._issueTypeIcon = new IssueTypeIcon(this.__buildProps_issueTypeIcon());
        this._issueTypeIcon.parentComponent = this;
        this._issueTypeIcon.__geaCompiledChild = true;
      } else {
        this._issueTypeIcon.props = this.__buildProps_issueTypeIcon();
      }
      return this._issueTypeIcon;
    }
    __buildProps_icon() {
      return {
        type: "feedback",
        size: 14
      };
    }
    __refreshChildProps_icon() {
      const child = this._icon;
      if (!child) {
        return;
      }
      child.__geaUpdateProps(this.__buildProps_icon());
    }
    __ensureChild_icon() {
      if (!this._icon) {
        this._icon = new Icon(this.__buildProps_icon());
        this._icon.parentComponent = this;
        this._icon.__geaCompiledChild = true;
      } else {
        this._icon.props = this.__buildProps_icon();
      }
      return this._icon;
    }
    __buildProps_icon2() {
      return {
        type: "link",
        size: 14
      };
    }
    __refreshChildProps_icon2() {
      const child = this._icon2;
      if (!child) {
        return;
      }
      child.__geaUpdateProps(this.__buildProps_icon2());
    }
    __ensureChild_icon2() {
      if (!this._icon2) {
        this._icon2 = new Icon(this.__buildProps_icon2());
        this._icon2.parentComponent = this;
        this._icon2.__geaCompiledChild = true;
      } else {
        this._icon2.props = this.__buildProps_icon2();
      }
      return this._icon2;
    }
    __buildProps_icon3() {
      return {
        type: "trash",
        size: 16
      };
    }
    __refreshChildProps_icon3() {
      const child = this._icon3;
      if (!child) {
        return;
      }
      child.__geaUpdateProps(this.__buildProps_icon3());
    }
    __ensureChild_icon3() {
      if (!this._icon3) {
        this._icon3 = new Icon(this.__buildProps_icon3());
        this._icon3.parentComponent = this;
        this._icon3.__geaCompiledChild = true;
      } else {
        this._icon3.props = this.__buildProps_icon3();
      }
      return this._icon3;
    }
    __buildProps_icon4() {
      return {
        type: "close",
        size: 20
      };
    }
    __refreshChildProps_icon4() {
      const child = this._icon4;
      if (!child) {
        return;
      }
      child.__geaUpdateProps(this.__buildProps_icon4());
    }
    __ensureChild_icon4() {
      if (!this._icon4) {
        this._icon4 = new Icon(this.__buildProps_icon4());
        this._icon4.parentComponent = this;
        this._icon4.__geaCompiledChild = true;
      } else {
        this._icon4.props = this.__buildProps_icon4();
      }
      return this._icon4;
    }
    __buildProps_icon5() {
      return {
        type: "stopwatch",
        size: 20
      };
    }
    __refreshChildProps_icon5() {
      const child = this._icon5;
      if (!child) {
        return;
      }
      child.__geaUpdateProps(this.__buildProps_icon5());
    }
    __ensureChild_icon5() {
      if (!this._icon5) {
        this._icon5 = new Icon(this.__buildProps_icon5());
        this._icon5.parentComponent = this;
        this._icon5.__geaCompiledChild = true;
      } else {
        this._icon5.props = this.__buildProps_icon5();
      }
      return this._icon5;
    }
    __buildProps_icon6() {
      return {
        type: "close",
        size: 20
      };
    }
    __refreshChildProps_icon6() {
      const child = this._icon6;
      if (!child) {
        return;
      }
      child.__geaUpdateProps(this.__buildProps_icon6());
    }
    __ensureChild_icon6() {
      if (!this._icon6) {
        this._icon6 = new Icon(this.__buildProps_icon6());
        this._icon6.parentComponent = this;
        this._icon6.__geaCompiledChild = true;
      } else {
        this._icon6.props = this.__buildProps_icon6();
      }
      return this._icon6;
    }
    __buildProps_icon7() {
      return {
        type: "stopwatch",
        size: 22
      };
    }
    __refreshChildProps_icon7() {
      const child = this._icon7;
      if (!child) {
        return;
      }
      child.__geaUpdateProps(this.__buildProps_icon7());
    }
    __ensureChild_icon7() {
      if (!this._icon7) {
        this._icon7 = new Icon(this.__buildProps_icon7());
        this._icon7.parentComponent = this;
        this._icon7.__geaCompiledChild = true;
      } else {
        this._icon7.props = this.__buildProps_icon7();
      }
      return this._icon7;
    }
    __buildProps_button() {
      return {
        variant: "destructive",
        click: () => this.handleDeleteIssue(),
        children: `Delete`
      };
    }
    __refreshChildProps_button() {
      const child = this._button;
      if (!child) {
        return;
      }
      child.__geaUpdateProps(this.__buildProps_button());
    }
    __ensureChild_button() {
      if (!this._button) {
        this._button = new Button(this.__buildProps_button());
        this._button.parentComponent = this;
        this._button.__geaCompiledChild = true;
      } else {
        this._button.props = this.__buildProps_button();
      }
      return this._button;
    }
    __buildProps_button2() {
      return {
        variant: "ghost",
        click: () => {
          this.confirmingDelete = false;
        },
        children: `Cancel`
      };
    }
    __refreshChildProps_button2() {
      const child = this._button2;
      if (!child) {
        return;
      }
      child.__geaUpdateProps(this.__buildProps_button2());
    }
    __ensureChild_button2() {
      if (!this._button2) {
        this._button2 = new Button(this.__buildProps_button2());
        this._button2.parentComponent = this;
        this._button2.__geaCompiledChild = true;
      } else {
        this._button2.props = this.__buildProps_button2();
      }
      return this._button2;
    }
    __buildProps_button3() {
      return {
        variant: "default",
        click: () => this.saveTracking(),
        children: `Done`
      };
    }
    __refreshChildProps_button3() {
      const child = this._button3;
      if (!child) {
        return;
      }
      child.__geaUpdateProps(this.__buildProps_button3());
    }
    __ensureChild_button3() {
      if (!this._button3) {
        this._button3 = new Button(this.__buildProps_button3());
        this._button3.parentComponent = this;
        this._button3.__geaCompiledChild = true;
      } else {
        this._button3.props = this.__buildProps_button3();
      }
      return this._button3;
    }
    __buildProps_commentCreate() {
      const {
        isLoading,
        issue: issue2
      } = issue_store_default;
      if (isLoading || !issue2) return {};
      return {
        issueId: issue2.id
      };
    }
    __refreshChildProps_commentCreate() {
      const child = this._commentCreate;
      if (!child) {
        return;
      }
      child.__geaUpdateProps(this.__buildProps_commentCreate());
    }
    __ensureChild_commentCreate() {
      if (!this._commentCreate) {
        this._commentCreate = new CommentCreate(this.__buildProps_commentCreate());
        this._commentCreate.parentComponent = this;
        this._commentCreate.__geaCompiledChild = true;
      } else {
        this._commentCreate.props = this.__buildProps_commentCreate();
      }
      return this._commentCreate;
    }
    __buildProps_issuePriorityIcon() {
      const {
        isLoading,
        issue: issue2
      } = issue_store_default;
      if (isLoading || !issue2) return {};
      const issuePriority2 = issue2.priority || "3";
      return {
        priority: issuePriority2
      };
    }
    __refreshChildProps_issuePriorityIcon() {
      const child = this._issuePriorityIcon;
      if (!child) {
        return;
      }
      child.__geaUpdateProps(this.__buildProps_issuePriorityIcon());
    }
    __ensureChild_issuePriorityIcon() {
      if (!this._issuePriorityIcon) {
        this._issuePriorityIcon = new IssuePriorityIcon(this.__buildProps_issuePriorityIcon());
        this._issuePriorityIcon.parentComponent = this;
        this._issuePriorityIcon.__geaCompiledChild = true;
      } else {
        this._issuePriorityIcon.props = this.__buildProps_issuePriorityIcon();
      }
      return this._issuePriorityIcon;
    }
    __buildProps_dialog() {
      return {
        open: true,
        onOpenChange: (d) => {
          if (!d.open) this.isEditingTracking = false;
        },
        class: "dialog-tracking",
        children: `<div class="tracking-dialog"><div class="tracking-dialog-header"><h3 class="tracking-dialog-title">Time tracking</h3><button class="tracking-dialog-close" data-gea-event="ev11">${this.__ensureChild_icon6()}</button></div><div class="tracking-bar-container">${this.__ensureChild_icon7()}<div class="tracking-bar"><div class="tracking-bar-fill"${`width:${getTrackingPercent(this.editTimeSpent, this.editTimeRemaining)}%` == null ? "" : ` style="${`width:${getTrackingPercent(this.editTimeSpent, this.editTimeRemaining)}%`}"`}></div></div></div><div class="tracking-values"><span>${(this.editTimeSpent ? `${this.editTimeSpent}h logged` : "No time logged") || ""}</span><span>${this.editTimeRemaining}h remaining</span></div><div class="tracking-edit-fields"><div class="tracking-edit-field"><label class="tracking-edit-label">Time spent (hours)</label><input class="input" type="number" min="0"${this.editTimeSpent == null || this.editTimeSpent === false ? "" : ` value="${this.editTimeSpent}"`} data-gea-event="ev12" /></div><div class="tracking-edit-field"><label class="tracking-edit-label">Time remaining (hours)</label><input class="input" type="number" min="0"${this.editTimeRemaining == null || this.editTimeRemaining === false ? "" : ` value="${this.editTimeRemaining}"`} data-gea-event="ev13" /></div></div><div class="tracking-edit-actions">${this.__ensureChild_button3()}</div></div>`
      };
    }
    __refreshChildProps_dialog() {
      const child = this._dialog;
      if (!child) {
        return;
      }
      child.__geaUpdateProps(this.__buildProps_dialog());
    }
    __ensureChild_dialog() {
      if (!this._dialog) {
        this._dialog = new Dialog(this.__buildProps_dialog());
        this._dialog.parentComponent = this;
        this._dialog.__geaCompiledChild = true;
      } else {
        this._dialog.props = this.__buildProps_dialog();
      }
      return this._dialog;
    }
    dispose() {
      if (this.__observer_removers__) {
        this.__observer_removers__.forEach((fn) => fn());
      }
      this._issueTypeIcon?.dispose?.();
      this._icon?.dispose?.();
      this._icon2?.dispose?.();
      this._icon3?.dispose?.();
      this._icon4?.dispose?.();
      this._icon5?.dispose?.();
      this._icon6?.dispose?.();
      this._icon7?.dispose?.();
      this._button?.dispose?.();
      this._button2?.dispose?.();
      this._button3?.dispose?.();
      this._commentCreate?.dispose?.();
      this._issuePriorityIcon?.dispose?.();
      this._dialog?.dispose?.();
      super.dispose();
    }
    __observe_issueStore_issue__id(id, change) {
      if (document.getElementById(this.id + "-b1")) {
        document.getElementById(this.id + "-b1").textContent = `
              ${(IssueTypeCopy[issueType] || "Task").toUpperCase()}-${this.__stores.issue.id}
            `;
      }
      this.__refreshChildProps_commentCreate();
    }
    render__unresolved_0Item(opt, __geaIdx) {
      const {
        isLoading,
        issue: issue2
      } = issue_store_default;
      const issueStatus2 = issue2.status || "backlog";
      const __v = (v) => v != null && typeof v === "object" ? v.valueOf() : v;
      return `<div id="${this.id + "-b11-" + String(__geaIdx)}" data-gea-item-id="${__geaIdx}" data-gea-event="ev14"${__v(`custom-dropdown-item ${issueStatus2 === opt.value ? "active" : ""}`) == __v(null) ? "" : ` class="${`custom-dropdown-item ${issueStatus2 === opt.value ? "active" : ""}`.trim()}"`}><span class="status-dot"${__v(`background:${statusColors[opt.value]?.bg}`) == __v(null) ? "" : ` style="${`background:${statusColors[opt.value]?.bg}`}"`}></span><span>${opt.label}</span></div>`;
    }
    create__unresolved_0Item(item) {
      var __c = this.____unresolved_0_container;
      if (!__c.__geaTpl) {
        try {
          var __tw = __c.cloneNode(false);
          __tw.innerHTML = this.render__unresolved_0Item("__dummy__");
          __c.__geaTpl = __tw.firstElementChild;
        } catch {
        }
      }
      if (!__c.__geaIdPfx) __c.__geaIdPfx = this.id_ + "-b11-";
      if (__c.__geaTpl) {
        var el = __c.__geaTpl.cloneNode(true);
      } else {
        var __fw = __c.cloneNode(false);
        __fw.innerHTML = this.render__unresolved_0Item(item);
        var el = __fw.firstElementChild;
      }
      el.className = `custom-dropdown-item ${issueStatus === item.value ? "active" : ""}`;
      var __av = `background:${statusColors[item.value]?.bg}`;
      if (__av == null || __av === false) el.firstElementChild.removeAttribute("style");
      else el.firstElementChild.setAttribute("style", String(__av));
      el.firstElementChild.nextElementSibling.textContent = `${item.label}`;
      el.setAttribute("data-gea-item-id", String(item));
      el.id = __c.__geaIdPfx + String(item);
      el.__geaItem = item;
      return el;
    }
    render__unresolved_1Item(uid, __geaIdx) {
      const project = project_store_default.project;
      const users = project ? project.users : [];
      const __v = (v) => v != null && typeof v === "object" ? v.valueOf() : v;
      const u = users.find((usr) => usr.id === uid);
      if (!u) return "";
      return `<div id="${this.id + "-b12-" + String(__geaIdx)}" data-gea-item-id="${__geaIdx}" class="assignee-chip"><img class="assignee-chip-avatar"${__v(u.avatarUrl) == __v(null) || __v(u.avatarUrl) === __v(false) ? "" : ` src="${u.avatarUrl}"`}${__v(u.name) == __v(null) || __v(u.name) === __v(false) ? "" : ` alt="${u.name}"`} /><span class="assignee-chip-name">${u.name}</span><span class="assignee-chip-remove" data-gea-event="ev15">\xD7</span></div>`;
    }
    create__unresolved_1Item(item) {
      var __tw = this.____unresolved_1_container.cloneNode(false);
      __tw.innerHTML = this.render__unresolved_1Item(item);
      var el = __tw.firstElementChild;
      return el;
    }
    render__unresolved_2Item(u, __geaIdx) {
      const __v = (v) => v != null && typeof v === "object" ? v.valueOf() : v;
      return `<div id="${this.id + "-b13-" + String(__geaIdx)}" data-gea-item-id="${__geaIdx}" data-gea-event="ev16" class="custom-dropdown-item"><img class="custom-dropdown-avatar"${__v(u.avatarUrl) == __v(null) || __v(u.avatarUrl) === __v(false) ? "" : ` src="${u.avatarUrl}"`}${__v(u.name) == __v(null) || __v(u.name) === __v(false) ? "" : ` alt="${u.name}"`} /><span>${u.name}</span></div>`;
    }
    create__unresolved_2Item(item) {
      var __c = this.____unresolved_2_container;
      if (!__c.__geaTpl) {
        try {
          var __tw = __c.cloneNode(false);
          __tw.innerHTML = this.render__unresolved_2Item("__dummy__");
          __c.__geaTpl = __tw.firstElementChild;
        } catch {
        }
      }
      if (!__c.__geaIdPfx) __c.__geaIdPfx = this.id_ + "-b13-";
      if (__c.__geaTpl) {
        var el = __c.__geaTpl.cloneNode(true);
      } else {
        var __fw = __c.cloneNode(false);
        __fw.innerHTML = this.render__unresolved_2Item(item);
        var el = __fw.firstElementChild;
      }
      var __av = item.avatarUrl;
      if (__av == null || __av === false) el.firstElementChild.removeAttribute("src");
      else el.firstElementChild.setAttribute("src", String(__av));
      var __av = item.name;
      if (__av == null || __av === false) el.firstElementChild.removeAttribute("alt");
      else el.firstElementChild.setAttribute("alt", String(__av));
      el.firstElementChild.nextElementSibling.textContent = `${item.name}`;
      el.setAttribute("data-gea-item-id", String(item));
      el.id = __c.__geaIdPfx + String(item);
      el.__geaItem = item;
      return el;
    }
    render__unresolved_3Item(u, __geaIdx) {
      const {
        isLoading,
        issue: issue2
      } = issue_store_default;
      const issueReporterId2 = issue2.reporterId || "";
      const __v = (v) => v != null && typeof v === "object" ? v.valueOf() : v;
      return `<div id="${this.id + "-b14-" + String(__geaIdx)}" data-gea-item-id="${__geaIdx}" data-gea-event="ev17"${__v(`custom-dropdown-item ${issueReporterId2 === u.id ? "active" : ""}`) == __v(null) ? "" : ` class="${`custom-dropdown-item ${issueReporterId2 === u.id ? "active" : ""}`.trim()}"`}><img class="custom-dropdown-avatar"${__v(u.avatarUrl) == __v(null) || __v(u.avatarUrl) === __v(false) ? "" : ` src="${u.avatarUrl}"`}${__v(u.name) == __v(null) || __v(u.name) === __v(false) ? "" : ` alt="${u.name}"`} /><span>${u.name}</span></div>`;
    }
    create__unresolved_3Item(item) {
      var __c = this.____unresolved_3_container;
      if (!__c.__geaTpl) {
        try {
          var __tw = __c.cloneNode(false);
          __tw.innerHTML = this.render__unresolved_3Item("__dummy__");
          __c.__geaTpl = __tw.firstElementChild;
        } catch {
        }
      }
      if (!__c.__geaIdPfx) __c.__geaIdPfx = this.id_ + "-b14-";
      if (__c.__geaTpl) {
        var el = __c.__geaTpl.cloneNode(true);
      } else {
        var __fw = __c.cloneNode(false);
        __fw.innerHTML = this.render__unresolved_3Item(item);
        var el = __fw.firstElementChild;
      }
      el.className = `custom-dropdown-item ${issueReporterId === item.id ? "active" : ""}`;
      var __av = item.avatarUrl;
      if (__av == null || __av === false) el.firstElementChild.removeAttribute("src");
      else el.firstElementChild.setAttribute("src", String(__av));
      var __av = item.name;
      if (__av == null || __av === false) el.firstElementChild.removeAttribute("alt");
      else el.firstElementChild.setAttribute("alt", String(__av));
      el.firstElementChild.nextElementSibling.textContent = `${item.name}`;
      el.setAttribute("data-gea-item-id", String(item));
      el.id = __c.__geaIdPfx + String(item);
      el.__geaItem = item;
      return el;
    }
    render__unresolved_4Item(opt, __geaIdx) {
      const {
        isLoading,
        issue: issue2
      } = issue_store_default;
      const issuePriority2 = issue2.priority || "3";
      const __v = (v) => v != null && typeof v === "object" ? v.valueOf() : v;
      return `<div id="${this.id + "-b15-" + String(__geaIdx)}" data-gea-item-id="${__geaIdx}" data-gea-event="ev18"${__v(`custom-dropdown-item ${issuePriority2 === opt.value ? "active" : ""}`) == __v(null) ? "" : ` class="${`custom-dropdown-item ${issuePriority2 === opt.value ? "active" : ""}`.trim()}"`}>${new IssuePriorityIcon({
        priority: opt.value
      })}<span>${opt.label}</span></div>`;
    }
    create__unresolved_4Item(item) {
      var __c = this.____unresolved_4_container;
      if (!__c.__geaTpl) {
        try {
          var __tw = __c.cloneNode(false);
          __tw.innerHTML = this.render__unresolved_4Item("__dummy__");
          __c.__geaTpl = __tw.firstElementChild;
        } catch {
        }
      }
      if (!__c.__geaIdPfx) __c.__geaIdPfx = this.id_ + "-b15-";
      if (__c.__geaTpl) {
        var el = __c.__geaTpl.cloneNode(true);
      } else {
        var __fw = __c.cloneNode(false);
        __fw.innerHTML = this.render__unresolved_4Item(item);
        var el = __fw.firstElementChild;
      }
      el.className = `custom-dropdown-item ${issuePriority === item.value ? "active" : ""}`;
      var __av = item.value;
      if (__av == null || __av === false) el.firstElementChild.removeAttribute("priority");
      else el.firstElementChild.setAttribute("priority", String(__av));
      el.firstElementChild.nextElementSibling.textContent = `${item.label}`;
      el.setAttribute("data-gea-item-id", String(item));
      el.id = __c.__geaIdPfx + String(item);
      el.__geaItem = item;
      return el;
    }
    __onPropChange(key, value) {
      this.__geaPatchCond(0);
      this.__geaPatchCond(1);
      this.__geaPatchCond(2);
      this.__geaPatchCond(3);
      this.__geaPatchCond(4);
      this.__geaPatchCond(5);
      this.__geaPatchCond(6);
      this.__geaPatchCond(7);
      this.__geaPatchCond(8);
      this.__geaPatchCond(9);
      this.__geaPatchCond(10);
      this.__geaPatchCond(11);
    }
    __observe_issueStore_isLoading(value, change) {
      if (value === this.__geaPrev___observe_issueStore_isLoading) return;
      this.__geaPrev___observe_issueStore_isLoading = value;
      if (this.rendered_ && typeof this.__geaRequestRender === "function") {
        this.__geaRequestRender();
      }
    }
    __observe_issueStore_issue(value, change) {
      if (this.rendered_) {
        {
          const __el = document.getElementById(this.id + "-b1");
          const {
            isLoading,
            issue: issue2
          } = issue_store_default;
          const issueType2 = issue2.type || "task";
          const __boundValue = `
              ${(IssueTypeCopy[issueType2] || "Task").toUpperCase()}-${issue2.id}
            `;
          if (__el) {
            if (__el.textContent !== __boundValue) __el.textContent = __boundValue;
          }
        }
        {
          const __el = document.getElementById(this.id + "-b2");
          const {
            isLoading,
            issue: issue2
          } = issue_store_default;
          const issueStatus2 = issue2.status || "backlog";
          const __boundValue = `background:${statusColors[issueStatus2]?.bg};color:${statusColors[issueStatus2]?.color}`;
          if (__el) if (__boundValue === null || __boundValue === void 0) __el.removeAttribute("style");
          else __el.setAttribute("style", String(__boundValue));
        }
        {
          const __el = document.getElementById(this.id + "-b2");
          const {
            isLoading,
            issue: issue2
          } = issue_store_default;
          const issueStatus2 = issue2.status || "backlog";
          const __boundValue = (IssueStatusCopy[issueStatus2] || "Backlog").toUpperCase();
          if (__el) {
            if (__el.textContent !== __boundValue) __el.textContent = __boundValue;
          }
        }
        {
          const __el = document.getElementById(this.id + "-b3");
          const {
            isLoading,
            issue: issue2
          } = issue_store_default;
          const project = project_store_default.project;
          const users = project ? project.users : [];
          const issueReporterId2 = issue2.reporterId || "";
          const reporter = users.find((u) => u.id === issueReporterId2);
          const __boundValue = reporter ? reporter.name : "Unassigned";
          if (__el) {
            if (__el.textContent !== __boundValue) __el.textContent = __boundValue;
          }
        }
        {
          const __el = document.getElementById(this.id + "-b4");
          const {
            isLoading,
            issue: issue2
          } = issue_store_default;
          const issuePriority2 = issue2.priority || "3";
          const __boundValue = IssuePriorityCopy[issuePriority2] || "Medium";
          if (__el) {
            if (__el.textContent !== __boundValue) __el.textContent = __boundValue;
          }
        }
        {
          const __el = document.getElementById(this.id + "-b5");
          const {
            isLoading,
            issue: issue2
          } = issue_store_default;
          const issueEstimate = issue2.estimate || 0;
          const __boundValue = issueEstimate;
          if (__el) __el.value = __boundValue === null || __boundValue === void 0 ? "" : String(__boundValue);
        }
        {
          const __el = document.getElementById(this.id + "-b6");
          const {
            isLoading,
            issue: issue2
          } = issue_store_default;
          const timeSpent = issue2.timeSpent || 0;
          const timeRemaining = issue2.timeRemaining || issue2.estimate || 0;
          const trackPercent = getTrackingPercent(timeSpent, timeRemaining);
          const __boundValue = `width:${trackPercent}%`;
          if (__el) if (__boundValue === null || __boundValue === void 0) __el.removeAttribute("style");
          else __el.setAttribute("style", String(__boundValue));
        }
        {
          const __el = document.getElementById(this.id + "-b8");
          const {
            isLoading,
            issue: issue2
          } = issue_store_default;
          const timeRemaining = issue2.timeRemaining || issue2.estimate || 0;
          const __boundValue = `${timeRemaining}h remaining`;
          if (__el) {
            if (__el.textContent !== __boundValue) __el.textContent = __boundValue;
          }
        }
        {
          const __el = document.getElementById(this.id + "-b7");
          const {
            isLoading,
            issue: issue2
          } = issue_store_default;
          const timeSpent = issue2.timeSpent || 0;
          const __boundValue = timeSpent ? `${timeSpent}h logged` : "No time logged";
          if (__el) {
            if (__el.textContent !== __boundValue) __el.textContent = __boundValue;
          }
        }
        {
          const __el = document.getElementById(this.id + "-b9");
          const {
            isLoading,
            issue: issue2
          } = issue_store_default;
          const createdAgo = formatDateTimeConversational(issue2.createdAt);
          const __boundValue = `Created at ${createdAgo}`;
          if (__el) {
            if (__el.textContent !== __boundValue) __el.textContent = __boundValue;
          }
        }
        {
          const __el = document.getElementById(this.id + "-b10");
          const {
            isLoading,
            issue: issue2
          } = issue_store_default;
          const updatedAgo = formatDateTimeConversational(issue2.updatedAt);
          const __boundValue = `Updated at ${updatedAgo}`;
          if (__el) {
            if (__el.textContent !== __boundValue) __el.textContent = __boundValue;
          }
        }
      }
      this.__refreshChildProps_commentCreate();
    }
    __observe_projectStore_project(value, change) {
      if (this.rendered_) {
        const __el = document.getElementById(this.id + "-b3");
        const {
          isLoading,
          issue: issue2
        } = issue_store_default;
        const project = project_store_default.project;
        const users = project ? project.users : [];
        const issueReporterId2 = issue2.reporterId || "";
        const reporter = users.find((u) => u.id === issueReporterId2);
        const __boundValue = reporter ? reporter.name : "Unassigned";
        if (__el) {
          if (__el.textContent !== __boundValue) __el.textContent = __boundValue;
        }
      }
      if (this.rendered_) {
        this.__geaCondPatched_8 = this.__geaPatchCond(8);
      }
    }
    __observe_projectStore_project__users(value, change) {
      if (this.rendered_) {
        const __el = document.getElementById(this.id + "-b3");
        const {
          isLoading,
          issue: issue2
        } = issue_store_default;
        const project = project_store_default.project;
        const users = project ? project.users : [];
        const issueReporterId2 = issue2.reporterId || "";
        const reporter = users.find((u) => u.id === issueReporterId2);
        const __boundValue = reporter ? reporter.name : "Unassigned";
        if (__el) {
          if (__el.textContent !== __boundValue) __el.textContent = __boundValue;
        }
      }
      if (this.rendered_) {
        this.__geaCondPatched_8 = this.__geaPatchCond(8);
      }
    }
    __observe_issueStore_issue__description(value, change) {
      if (this.rendered_) {
        this.__geaCondPatched_3 = this.__geaPatchCond(3);
        this.__geaCondPatched_4 = this.__geaPatchCond(4);
        if (this.__geaCondPatched_3 || this.__geaCondPatched_4) return;
      }
    }
    __observe_issueStore_issue__type(value, change) {
      if (this.rendered_) {
        const __el = document.getElementById(this.id + "-b1");
        const {
          isLoading,
          issue: issue2
        } = issue_store_default;
        const issueType2 = issue2.type || "task";
        const __boundValue = `
              ${(IssueTypeCopy[issueType2] || "Task").toUpperCase()}-${issue2.id}
            `;
        if (__el) {
          if (__el.textContent !== __boundValue) __el.textContent = __boundValue;
        }
      }
      this.__refreshChildProps_issueTypeIcon();
    }
    __observe_issueStore_issue__status(value, change) {
      if (this.rendered_) {
        {
          const __el = document.getElementById(this.id + "-b2");
          const {
            isLoading,
            issue: issue2
          } = issue_store_default;
          const issueStatus2 = issue2.status || "backlog";
          const __boundValue = `background:${statusColors[issueStatus2]?.bg};color:${statusColors[issueStatus2]?.color}`;
          if (__el) if (__boundValue === null || __boundValue === void 0) __el.removeAttribute("style");
          else __el.setAttribute("style", String(__boundValue));
        }
        {
          const __el = document.getElementById(this.id + "-b2");
          const {
            isLoading,
            issue: issue2
          } = issue_store_default;
          const issueStatus2 = issue2.status || "backlog";
          const __boundValue = (IssueStatusCopy[issueStatus2] || "Backlog").toUpperCase();
          if (__el) {
            if (__el.textContent !== __boundValue) __el.textContent = __boundValue;
          }
        }
      }
    }
    __observe_issueStore_issue__priority(value, change) {
      if (this.rendered_) {
        const __el = document.getElementById(this.id + "-b4");
        const {
          isLoading,
          issue: issue2
        } = issue_store_default;
        const issuePriority2 = issue2.priority || "3";
        const __boundValue = IssuePriorityCopy[issuePriority2] || "Medium";
        if (__el) {
          if (__el.textContent !== __boundValue) __el.textContent = __boundValue;
        }
      }
      this.__refreshChildProps_issuePriorityIcon();
    }
    __observe_issueStore_issue__estimate(value, change) {
      if (this.rendered_) {
        {
          const __el = document.getElementById(this.id + "-b5");
          const {
            isLoading,
            issue: issue2
          } = issue_store_default;
          const issueEstimate = issue2.estimate || 0;
          const __boundValue = issueEstimate;
          if (__el) __el.value = __boundValue === null || __boundValue === void 0 ? "" : String(__boundValue);
        }
        {
          const __el = document.getElementById(this.id + "-b6");
          const {
            isLoading,
            issue: issue2
          } = issue_store_default;
          const timeSpent = issue2.timeSpent || 0;
          const timeRemaining = issue2.timeRemaining || issue2.estimate || 0;
          const trackPercent = getTrackingPercent(timeSpent, timeRemaining);
          const __boundValue = `width:${trackPercent}%`;
          if (__el) if (__boundValue === null || __boundValue === void 0) __el.removeAttribute("style");
          else __el.setAttribute("style", String(__boundValue));
        }
        {
          const __el = document.getElementById(this.id + "-b8");
          const {
            isLoading,
            issue: issue2
          } = issue_store_default;
          const timeRemaining = issue2.timeRemaining || issue2.estimate || 0;
          const __boundValue = `${timeRemaining}h remaining`;
          if (__el) {
            if (__el.textContent !== __boundValue) __el.textContent = __boundValue;
          }
        }
      }
    }
    __observe_issueStore_issue__reporterId(value, change) {
      if (this.rendered_) {
        const __el = document.getElementById(this.id + "-b3");
        const {
          isLoading,
          issue: issue2
        } = issue_store_default;
        const project = project_store_default.project;
        const users = project ? project.users : [];
        const issueReporterId2 = issue2.reporterId || "";
        const reporter = users.find((u) => u.id === issueReporterId2);
        const __boundValue = reporter ? reporter.name : "Unassigned";
        if (__el) {
          if (__el.textContent !== __boundValue) __el.textContent = __boundValue;
        }
      }
      if (this.rendered_) {
        this.__geaCondPatched_8 = this.__geaPatchCond(8);
      }
    }
    __observe_issueStore_issue__timeSpent(value, change) {
      if (this.rendered_) {
        {
          const __el = document.getElementById(this.id + "-b6");
          const {
            isLoading,
            issue: issue2
          } = issue_store_default;
          const timeSpent = issue2.timeSpent || 0;
          const timeRemaining = issue2.timeRemaining || issue2.estimate || 0;
          const trackPercent = getTrackingPercent(timeSpent, timeRemaining);
          const __boundValue = `width:${trackPercent}%`;
          if (__el) if (__boundValue === null || __boundValue === void 0) __el.removeAttribute("style");
          else __el.setAttribute("style", String(__boundValue));
        }
        {
          const __el = document.getElementById(this.id + "-b7");
          const {
            isLoading,
            issue: issue2
          } = issue_store_default;
          const timeSpent = issue2.timeSpent || 0;
          const __boundValue = timeSpent ? `${timeSpent}h logged` : "No time logged";
          if (__el) {
            if (__el.textContent !== __boundValue) __el.textContent = __boundValue;
          }
        }
      }
    }
    __observe_issueStore_issue__timeRemaining(value, change) {
      if (this.rendered_) {
        {
          const __el = document.getElementById(this.id + "-b6");
          const {
            isLoading,
            issue: issue2
          } = issue_store_default;
          const timeSpent = issue2.timeSpent || 0;
          const timeRemaining = issue2.timeRemaining || issue2.estimate || 0;
          const trackPercent = getTrackingPercent(timeSpent, timeRemaining);
          const __boundValue = `width:${trackPercent}%`;
          if (__el) if (__boundValue === null || __boundValue === void 0) __el.removeAttribute("style");
          else __el.setAttribute("style", String(__boundValue));
        }
        {
          const __el = document.getElementById(this.id + "-b8");
          const {
            isLoading,
            issue: issue2
          } = issue_store_default;
          const timeRemaining = issue2.timeRemaining || issue2.estimate || 0;
          const __boundValue = `${timeRemaining}h remaining`;
          if (__el) {
            if (__el.textContent !== __boundValue) __el.textContent = __boundValue;
          }
        }
      }
    }
    __observe_issueStore_issue__createdAt(value, change) {
      if (this.rendered_) {
        const __el = document.getElementById(this.id + "-b9");
        const {
          isLoading,
          issue: issue2
        } = issue_store_default;
        const createdAgo = formatDateTimeConversational(issue2.createdAt);
        const __boundValue = `Created at ${createdAgo}`;
        if (__el) {
          if (__el.textContent !== __boundValue) __el.textContent = __boundValue;
        }
      }
    }
    __observe_issueStore_issue__updatedAt(value, change) {
      if (this.rendered_) {
        const __el = document.getElementById(this.id + "-b10");
        const {
          isLoading,
          issue: issue2
        } = issue_store_default;
        const updatedAgo = formatDateTimeConversational(issue2.updatedAt);
        const __boundValue = `Updated at ${updatedAgo}`;
        if (__el) {
          if (__el.textContent !== __boundValue) __el.textContent = __boundValue;
        }
      }
    }
    __observe_local_confirmingDelete(value, change) {
      if (this.rendered_) {
        this.__geaCondPatched_0 = this.__geaPatchCond(0);
        if (this.__geaCondPatched_0) return;
      }
      this.__refreshChildProps_button2();
    }
    __observe_local_isEditingTitle(value, change) {
      if (this.rendered_) {
        this.__geaCondPatched_1 = this.__geaPatchCond(1);
        this.__geaCondPatched_2 = this.__geaPatchCond(2);
        if (this.__geaCondPatched_1 || this.__geaCondPatched_2) return;
      }
    }
    __observe_local_editTitle(value, change) {
      if (this.rendered_) {
        this.__geaCondPatched_2 = this.__geaPatchCond(2);
        if (this.__geaCondPatched_2) return;
      }
    }
    __observe_local_openDropdown(value, change) {
      if (this.rendered_) {
        this.__geaCondPatched_5 = this.__geaPatchCond(5);
        this.__geaCondPatched_6 = this.__geaPatchCond(6);
        this.__geaCondPatched_7 = this.__geaPatchCond(7);
        this.__geaCondPatched_9 = this.__geaPatchCond(9);
        this.__geaCondPatched_10 = this.__geaPatchCond(10);
        if (this.__geaCondPatched_5 || this.__geaCondPatched_6 || this.__geaCondPatched_7 || this.__geaCondPatched_9 || this.__geaCondPatched_10) return;
      }
    }
    __observe_local_assigneeSearch(value, change) {
      if (this.rendered_) {
        this.__geaCondPatched_7 = this.__geaPatchCond(7);
        if (this.__geaCondPatched_7) return;
      }
    }
    __observe_local_isEditingTracking(value, change) {
      if (this.rendered_) {
        this.__geaCondPatched_11 = this.__geaPatchCond(11);
        if (this.__geaCondPatched_11) return;
      }
      this.__refreshChildProps_dialog();
    }
    __observe_local_handleDeleteIssue(value, change) {
      this.__refreshChildProps_button();
    }
    __observe_local_saveTracking(value, change) {
      this.__refreshChildProps_button3();
    }
    __observe_local___ensureChild_icon6(value, change) {
      this.__refreshChildProps_dialog();
    }
    __observe_local___ensureChild_icon7(value, change) {
      this.__refreshChildProps_dialog();
    }
    __observe_local_editTimeSpent(value, change) {
      this.__refreshChildProps_dialog();
    }
    __observe_local_editTimeRemaining(value, change) {
      this.__refreshChildProps_dialog();
    }
    __observe_local___ensureChild_button3(value, change) {
      this.__refreshChildProps_dialog();
    }
    __geaSyncMapDelegate_1() {
      this.__geaSyncMap(1);
    }
    __geaSyncMapDelegate_2() {
      this.__geaSyncMap(2);
    }
    __observe_local_assigneeSearch__toLowerCase(__v, __c) {
      this.__geaSyncMap(2);
    }
    __geaSyncMapDelegate_3() {
      this.__geaSyncMap(3);
    }
    renderIssuecommentsItem(comment) {
      const {
        isLoading,
        issue: issue2
      } = issue_store_default;
      const __v = (v) => v != null && typeof v === "object" ? v.valueOf() : v;
      return `<comment-item id="${this.id + "-b16-" + String(comment.id)}" data-gea-item-id="${comment.id}"${__v(comment.id) == __v(null) || __v(comment.id) === __v(false) ? "" : ` data-prop-comment-id="${comment.id}"`}${__v(comment.body) == __v(null) || __v(comment.body) === __v(false) ? "" : ` data-prop-body="${comment.body}"`}${__v(comment.userId) == __v(null) || __v(comment.userId) === __v(false) ? "" : ` data-prop-user-id="${comment.userId}"`}${__v(comment.createdAt) == __v(null) || __v(comment.createdAt) === __v(false) ? "" : ` data-prop-created-at="${comment.createdAt}"`}${__v(issue2.id) == __v(null) || __v(issue2.id) === __v(false) ? "" : ` data-prop-issue-id="${issue2.id}"`}></comment-item>`;
    }
    createIssuecommentsItem(item) {
      var __c = this.__issue_comments_container;
      if (!__c.__geaTpl) {
        try {
          var __tw = __c.cloneNode(false);
          __tw.innerHTML = this.renderIssuecommentsItem({
            id: 0,
            body: "",
            userId: "",
            createdAt: ""
          });
          __c.__geaTpl = __tw.firstElementChild;
        } catch {
        }
      }
      if (!__c.__geaIdPfx) __c.__geaIdPfx = this.id_ + "-b16-";
      if (__c.__geaTpl) {
        var el = __c.__geaTpl.cloneNode(true);
      } else {
        var __fw = __c.cloneNode(false);
        __fw.innerHTML = this.renderIssuecommentsItem(item);
        var el = __fw.firstElementChild;
      }
      var __av = item.id;
      if (__av == null || __av === false) el.removeAttribute("commentId");
      else el.setAttribute("commentId", String(__av));
      var __av = item.body;
      if (__av == null || __av === false) el.removeAttribute("body");
      else el.setAttribute("body", String(__av));
      var __av = item.userId;
      if (__av == null || __av === false) el.removeAttribute("userId");
      else el.setAttribute("userId", String(__av));
      var __av = item.createdAt;
      if (__av == null || __av === false) el.removeAttribute("createdAt");
      else el.setAttribute("createdAt", String(__av));
      var __av = issue.id;
      if (__av == null || __av === false) el.removeAttribute("issueId");
      else el.setAttribute("issueId", String(__av));
      el.setAttribute("data-gea-item-id", item.id);
      el.id = __c.__geaIdPfx + item.id;
      el.__geaItem = item;
      return el;
    }
    __observe_issueStore_issue__comments(comments, change) {
      if (!this.__issue_comments_container) {
        this.__issue_comments_container = document.getElementById(this.id + "-b16");
      }
      if (!this.__issue_comments_container) return;
      if (Array.isArray(comments) && comments.length === 0 && this.__issue_comments_container.children.length > 0) {
        this.__issue_comments_container.textContent = "";
        return;
      }
      if (typeof this.__ensureArrayConfigs === "function") this.__ensureArrayConfigs();
      this.__applyListChanges(this.__issue_comments_container, comments, change, this.__issue_commentsListConfig);
    }
    __ensureArrayConfigs() {
      if (!this.__issue_commentsListConfig) {
        this.__issue_commentsListConfig = {
          arrayPathParts: ["issue", "comments"],
          render: (item) => this.renderIssuecommentsItem(item),
          create: (item) => this.createIssuecommentsItem(item),
          propPatchers: {
            "id": [(row, value, item) => {
              const __target = row;
              if (!__target) return;
              const __attrValue = item.id;
              if (__attrValue == null || __attrValue === false) {
                __target.removeAttribute("commentId");
              } else {
                __target.setAttribute("commentId", String(__attrValue));
              }
            }],
            "body": [(row, value, item) => {
              const __target = row;
              if (!__target) return;
              const __attrValue = item.body;
              if (__attrValue == null || __attrValue === false) {
                __target.removeAttribute("body");
              } else {
                __target.setAttribute("body", String(__attrValue));
              }
            }, (row, value) => row.classList.toggle("body", value)],
            "userId": [(row, value, item) => {
              const __target = row;
              if (!__target) return;
              const __attrValue = item.userId;
              if (__attrValue == null || __attrValue === false) {
                __target.removeAttribute("userId");
              } else {
                __target.setAttribute("userId", String(__attrValue));
              }
            }, (row, value) => row.classList.toggle("userId", value)],
            "createdAt": [(row, value, item) => {
              const __target = row;
              if (!__target) return;
              const __attrValue = item.createdAt;
              if (__attrValue == null || __attrValue === false) {
                __target.removeAttribute("createdAt");
              } else {
                __target.setAttribute("createdAt", String(__attrValue));
              }
            }, (row, value) => row.classList.toggle("createdAt", value)]
          }
        };
      }
    }
    __event_click_0_1(e, targetComponent) {
      const opt = this.__getMapItemFromEvent_store___unresolved_0(e);
      if (!opt) {
        return;
      }
      issue_store_default.updateIssue({
        status: opt.value
      });
      this.closeDropdown();
    }
    __event_click_1_1(e, targetComponent) {
      const uid = this.__getMapItemFromEvent_store___unresolved_1(e);
      if (!uid) {
        return;
      }
      this.removeAssignee(uid);
    }
    __event_click_2_1(e, targetComponent) {
      const u = this.__getMapItemFromEvent_store___unresolved_2(e);
      if (!u) {
        return;
      }
      this.addAssignee(u.id);
    }
    __event_click_3(e, targetComponent) {
      const u = this.__getMapItemFromEvent_store___unresolved_3(e);
      if (!u) {
        return;
      }
      issue_store_default.updateIssue({
        reporterId: u.id
      });
      this.closeDropdown();
    }
    __event_click_4(e, targetComponent) {
      const opt = this.__getMapItemFromEvent_store___unresolved_4(e);
      if (!opt) {
        return;
      }
      issue_store_default.updateIssue({
        priority: opt.value
      });
      this.closeDropdown();
    }
    createdHooks() {
      if (!this.__observer_removers__) {
        this.__observer_removers__ = [];
      }
      if (!this.__stores) {
        this.__stores = {};
      }
      this.__observer_removers__.forEach((fn) => fn());
      this.__observer_removers__ = [];
      if (typeof this.__ensureArrayConfigs === "function") {
        this.__ensureArrayConfigs();
      }
      this.__stores.issueStore = issue_store_default.__store;
      this.__observer_removers__.push(this.__stores.issueStore.observe(["issue", "id"], (__v, __c) => this.__observe_issueStore_issue__id(__v, __c)));
      this.__observer_removers__.push(this.__stores.issueStore.observe(["isLoading"], (__v, __c) => this.__observe_issueStore_isLoading(__v, __c)));
      this.__observer_removers__.push(this.__stores.issueStore.observe(["issue"], (__v, __c) => this.__observe_issueStore_issue(__v, __c)));
      this.__observer_removers__.push(this.__stores.issueStore.observe(["issue", "description"], (__v, __c) => this.__observe_issueStore_issue__description(__v, __c)));
      this.__observer_removers__.push(this.__stores.issueStore.observe(["issue", "type"], (__v, __c) => this.__observe_issueStore_issue__type(__v, __c)));
      this.__observer_removers__.push(this.__stores.issueStore.observe(["issue", "status"], (__v, __c) => this.__observe_issueStore_issue__status(__v, __c)));
      this.__observer_removers__.push(this.__stores.issueStore.observe(["issue", "priority"], (__v, __c) => this.__observe_issueStore_issue__priority(__v, __c)));
      this.__observer_removers__.push(this.__stores.issueStore.observe(["issue", "estimate"], (__v, __c) => this.__observe_issueStore_issue__estimate(__v, __c)));
      this.__observer_removers__.push(this.__stores.issueStore.observe(["issue", "reporterId"], (__v, __c) => this.__observe_issueStore_issue__reporterId(__v, __c)));
      this.__observer_removers__.push(this.__stores.issueStore.observe(["issue", "timeSpent"], (__v, __c) => this.__observe_issueStore_issue__timeSpent(__v, __c)));
      this.__observer_removers__.push(this.__stores.issueStore.observe(["issue", "timeRemaining"], (__v, __c) => this.__observe_issueStore_issue__timeRemaining(__v, __c)));
      this.__observer_removers__.push(this.__stores.issueStore.observe(["issue", "createdAt"], (__v, __c) => this.__observe_issueStore_issue__createdAt(__v, __c)));
      this.__observer_removers__.push(this.__stores.issueStore.observe(["issue", "updatedAt"], (__v, __c) => this.__observe_issueStore_issue__updatedAt(__v, __c)));
      this.__observer_removers__.push(this.__stores.issueStore.observe(["issue", "comments"], (__v, __c) => this.__observe_issueStore_issue__comments(__v, __c)));
      this.__observer_removers__.push(this.__stores.issueStore.observe(["issue", "userIds"], (__v, __c) => this.__geaSyncMapDelegate_1(__v, __c)));
      this.__observer_removers__.push(this.__stores.issueStore.observe(["issue", "userIds"], (__v, __c) => this.__geaSyncMapDelegate_2(__v, __c)));
      this.__stores.projectStore = project_store_default.__store;
      this.__observer_removers__.push(this.__stores.projectStore.observe(["project"], (__v, __c) => this.__observe_projectStore_project(__v, __c)));
      this.__observer_removers__.push(this.__stores.projectStore.observe(["project", "users"], (__v, __c) => this.__observe_projectStore_project__users(__v, __c)));
      this.__observer_removers__.push(this.__stores.projectStore.observe(["project"], (__v, __c) => this.__geaSyncMapDelegate_2(__v, __c)));
      this.__observer_removers__.push(this.__stores.projectStore.observe(["project", "users"], (__v, __c) => this.__geaSyncMapDelegate_2(__v, __c)));
      this.__observer_removers__.push(this.__stores.projectStore.observe(["project"], (__v, __c) => this.__geaSyncMapDelegate_3(__v, __c)));
      this.__observer_removers__.push(this.__stores.projectStore.observe(["project", "users"], (__v, __c) => this.__geaSyncMapDelegate_3(__v, __c)));
      this.__geaRegisterMap(0, "____unresolved_0_container", () => document.getElementById(this.id + "-b11"), () => {
        return statusOptions;
      }, (__item) => this.create__unresolved_0Item(__item));
      this.__geaRegisterMap(1, "____unresolved_1_container", () => document.getElementById(this.id + "-b12"), () => {
        const {
          isLoading,
          issue: issue2
        } = issue_store_default;
        return issue2.userIds || [];
      }, (__item) => this.create__unresolved_1Item(__item));
      this.__geaRegisterMap(2, "____unresolved_2_container", () => document.getElementById(this.id + "-b13"), () => {
        const {
          isLoading,
          issue: issue2
        } = issue_store_default;
        const project = project_store_default.project;
        const users = project ? project.users : [];
        const issueUserIds = issue2.userIds || [];
        return users.filter((u) => !issueUserIds.includes(u.id) && u.name.toLowerCase().includes(this.assigneeSearch.toLowerCase()));
      }, (__item) => this.create__unresolved_2Item(__item));
      this.__geaRegisterMap(3, "____unresolved_3_container", () => document.getElementById(this.id + "-b14"), () => {
        const project = project_store_default.project;
        return project ? project.users : [];
      }, (__item) => this.create__unresolved_3Item(__item));
      this.__geaRegisterMap(4, "____unresolved_4_container", () => document.getElementById(this.id + "-b15"), () => {
        return priorityOptions;
      }, (__item) => this.create__unresolved_4Item(__item));
    }
    __setupLocalStateObservers() {
      if (typeof this.__ensureArrayConfigs === "function") {
        this.__ensureArrayConfigs();
      }
      if (!this.__store) {
        return;
      }
      this.__observer_removers__.push(this.__store.observe(["confirmingDelete"], (__v, __c) => this.__observe_local_confirmingDelete(__v, __c)));
      this.__observer_removers__.push(this.__store.observe(["isEditingTitle"], (__v, __c) => this.__observe_local_isEditingTitle(__v, __c)));
      this.__observer_removers__.push(this.__store.observe(["editTitle"], (__v, __c) => this.__observe_local_editTitle(__v, __c)));
      this.__observer_removers__.push(this.__store.observe(["openDropdown"], (__v, __c) => this.__observe_local_openDropdown(__v, __c)));
      this.__observer_removers__.push(this.__store.observe(["assigneeSearch"], (__v, __c) => this.__observe_local_assigneeSearch(__v, __c)));
      this.__observer_removers__.push(this.__store.observe(["isEditingTracking"], (__v, __c) => this.__observe_local_isEditingTracking(__v, __c)));
      this.__observer_removers__.push(this.__store.observe(["editTimeSpent"], (__v, __c) => this.__observe_local_editTimeSpent(__v, __c)));
      this.__observer_removers__.push(this.__store.observe(["editTimeRemaining"], (__v, __c) => this.__observe_local_editTimeRemaining(__v, __c)));
      this.__observer_removers__.push(this.__store.observe(["assigneeSearch", "toLowerCase"], (__v, __c) => this.__observe_local_assigneeSearch__toLowerCase(__v, __c)));
    }
  };
  if (void 0) {
    const __moduleExports = {
      default: IssueDetails
    };
    registerHotModule19("", __moduleExports);
    (void 0).accept((newModule) => {
      const __updatedModule = newModule || __moduleExports;
      registerHotModule19("", __updatedModule);
      handleComponentUpdate19("", __updatedModule);
    });
    (void 0).accept("../stores/issue-store", () => (void 0).invalidate());
    (void 0).accept("../stores/project-store", () => (void 0).invalidate());
    (void 0).accept("../stores/toast-store", () => (void 0).invalidate());
    (void 0).accept("../constants/issues", () => (void 0).invalidate());
    (void 0).accept("../utils/dateTime", () => (void 0).invalidate());
    (void 0).accept("../components/Icon", () => (void 0).invalidate());
    (void 0).accept("../components/IssueTypeIcon", () => (void 0).invalidate());
    (void 0).accept("../components/IssuePriorityIcon", () => (void 0).invalidate());
    (void 0).accept("../components/Spinner", () => (void 0).invalidate());
    (void 0).accept("./CommentCreate", () => (void 0).invalidate());
    (void 0).accept("./CommentItem", () => (void 0).invalidate());
    const __origCreated = IssueDetails.prototype.created;
    IssueDetails.prototype.created = function(__geaProps) {
      registerComponentInstance19(this.constructor.name, this);
      return __origCreated.call(this, __geaProps);
    };
    const __origDispose = IssueDetails.prototype.dispose;
    IssueDetails.prototype.dispose = function() {
      unregisterComponentInstance19(this.constructor.name, this);
      return __origDispose.call(this);
    };
  }

  // jira_clone_gea/src/views/IssueCreate.tsx
  var IssueCreate = class extends Component {
    constructor(...args) {
      super(...args);
      this._button2 = null;
      this._spinner = null;
      this._button = null;
      this._select4 = null;
      this._select3 = null;
      this._select2 = null;
      this._select = null;
      try {
        this.__geaCond_0 = !!this.errors.type;
        this.__geaCond_1 = !!this.errors.title;
        this.__geaCond_2 = !!this.errors.reporterId;
        this.__geaCond_3 = !!this.errors.priority;
        this.__geaCond_4 = !!this.isCreating;
      } catch {
      }
      this.__geaRegisterCond(0, "c0", () => {
        return this.errors.type;
      }, () => `<div class="form-error">${this.errors.type}</div>`, null);
      this.__geaRegisterCond(1, "c1", () => {
        return this.errors.title;
      }, () => `<div class="form-error">${this.errors.title}</div>`, null);
      this.__geaRegisterCond(2, "c2", () => {
        return this.errors.reporterId;
      }, () => `<div class="form-error">${this.errors.reporterId}</div>`, null);
      this.__geaRegisterCond(3, "c3", () => {
        return this.errors.priority;
      }, () => `<div class="form-error">${this.errors.priority}</div>`, null);
      this.__geaRegisterCond(4, "c4", () => {
        return this.isCreating;
      }, () => `<span class="inline-flex items-center gap-2">${this.__ensureChild_spinner()}Create Issue</span>`, () => "Create Issue");
    }
    type = IssueType.TASK;
    title = "";
    description = "";
    reporterId = "";
    userIds = [];
    priority = IssuePriority.MEDIUM;
    isCreating = false;
    errors = {};
    created() {
      if (auth_store_default.currentUser) {
        this.reporterId = auth_store_default.currentUser.id;
      }
    }
    async handleSubmit() {
      this.errors = generateErrors({
        type: this.type,
        title: this.title,
        reporterId: this.reporterId,
        priority: this.priority
      }, {
        type: is.required(),
        title: [is.required(), is.maxLength(200)],
        reporterId: is.required(),
        priority: is.required()
      });
      if (Object.keys(this.errors).length > 0) return;
      this.isCreating = true;
      try {
        await project_store_default.createIssue({
          type: this.type,
          title: this.title,
          description: this.description,
          reporterId: this.reporterId,
          userIds: this.userIds,
          priority: this.priority,
          status: IssueStatus.BACKLOG,
          projectId: project_store_default.project.id,
          users: this.userIds.map((id) => ({
            id
          }))
        });
        toast_store_default.success("Issue has been successfully created.");
        this.props.onClose?.();
      } catch (e) {
        toast_store_default.error(e);
      } finally {
        this.isCreating = false;
      }
    }
    template({
      onClose
    }) {
      const project = project_store_default.project;
      if (!project) return `<div id="${this.id}"></div>`;
      return `<div id="${this.id}" class="issue-create"><h2 class="issue-create-heading">Create issue</h2><div class="form-field"><label class="form-label">Issue Type</label>${this.__ensureChild_select()}<!--${this.id + "-c0"}-->${this.errors.type && `<div class="form-error">${this.errors.type}</div>` || ""}<!--${this.id + "-c0-end"}--></div><div class="issue-create-divider"></div><div class="form-field"><label class="form-label">Short Summary</label><input id="${this.id + "-b1"}"${`input ${this.errors.title ? "input-error" : ""}` == null ? "" : ` class="${`input ${this.errors.title ? "input-error" : ""}`.trim()}"`} type="text"${this.title == null || this.title === false ? "" : ` value="${this.title}"`} /><!--${this.id + "-c1"}-->${this.errors.title && `<div class="form-error">${this.errors.title}</div>` || ""}<!--${this.id + "-c1-end"}--></div><div class="form-field"><label class="form-label">Description</label><textarea id="${this.id + "-b2"}" class="textarea"${this.description == null || this.description === false ? "" : ` value="${this.description}"`}></textarea></div><div class="form-field"><label class="form-label">Reporter</label>${this.__ensureChild_select2()}<!--${this.id + "-c2"}-->${this.errors.reporterId && `<div class="form-error">${this.errors.reporterId}</div>` || ""}<!--${this.id + "-c2-end"}--></div><div class="form-field"><label class="form-label">Assignees</label>${this.__ensureChild_select3()}</div><div class="form-field"><label class="form-label">Priority</label>${this.__ensureChild_select4()}<!--${this.id + "-c3"}-->${this.errors.priority && `<div class="form-error">${this.errors.priority}</div>` || ""}<!--${this.id + "-c3-end"}--></div><div class="issue-create-actions">${this.__ensureChild_button()}${this.__ensureChild_button2()}</div></div>`;
    }
    get events() {
      return {
        input: {
          [`#${this.id}-b1`]: this.__event_input_0,
          [`#${this.id}-b2`]: this.__event_input_1
        }
      };
    }
    __event_input_0(e, targetComponent) {
      this.title = e.target.value;
    }
    __event_input_1(e, targetComponent) {
      this.description = e.target.value;
    }
    __buildProps_select() {
      const typeOptions = Object.values(IssueType).map((t) => ({
        value: t,
        label: IssueTypeCopy[t]
      }));
      return {
        class: "w-full",
        items: typeOptions,
        value: [this.type],
        onValueChange: (d) => {
          const v = d.value[0];
          if (v !== void 0) this.type = v;
        },
        placeholder: "Type"
      };
    }
    __refreshChildProps_select() {
      const child = this._select;
      if (!child) {
        return;
      }
      child.__geaUpdateProps(this.__buildProps_select());
    }
    __ensureChild_select() {
      if (!this._select) {
        this._select = new Select(this.__buildProps_select());
        this._select.parentComponent = this;
        this._select.__geaCompiledChild = true;
      } else {
        this._select.props = this.__buildProps_select();
      }
      return this._select;
    }
    __buildProps_select2() {
      const project = project_store_default.project;
      if (!project) return {};
      const userOptions = project.users.map((u) => ({
        value: u.id,
        label: u.name
      }));
      return {
        class: "w-full",
        items: userOptions,
        value: this.reporterId ? [this.reporterId] : [],
        onValueChange: (d) => {
          const v = d.value[0];
          if (v !== void 0) this.reporterId = v;
        },
        placeholder: "Reporter"
      };
    }
    __refreshChildProps_select2() {
      const child = this._select2;
      if (!child) {
        return;
      }
      child.__geaUpdateProps(this.__buildProps_select2());
    }
    __ensureChild_select2() {
      if (!this._select2) {
        this._select2 = new Select(this.__buildProps_select2());
        this._select2.parentComponent = this;
        this._select2.__geaCompiledChild = true;
      } else {
        this._select2.props = this.__buildProps_select2();
      }
      return this._select2;
    }
    __buildProps_select3() {
      const project = project_store_default.project;
      if (!project) return {};
      const userOptions = project.users.map((u) => ({
        value: u.id,
        label: u.name
      }));
      return {
        class: "w-full",
        multiple: true,
        items: userOptions,
        value: this.userIds,
        onValueChange: (d) => {
          this.userIds = d.value;
        },
        placeholder: "Assignees"
      };
    }
    __refreshChildProps_select3() {
      const child = this._select3;
      if (!child) {
        return;
      }
      child.__geaUpdateProps(this.__buildProps_select3());
    }
    __ensureChild_select3() {
      if (!this._select3) {
        this._select3 = new Select(this.__buildProps_select3());
        this._select3.parentComponent = this;
        this._select3.__geaCompiledChild = true;
      } else {
        this._select3.props = this.__buildProps_select3();
      }
      return this._select3;
    }
    __buildProps_select4() {
      const priorityOptions2 = Object.values(IssuePriority).map((p) => ({
        value: p,
        label: IssuePriorityCopy[p]
      }));
      return {
        class: "w-full",
        items: priorityOptions2,
        value: [this.priority],
        onValueChange: (d) => {
          const v = d.value[0];
          if (v !== void 0) this.priority = v;
        },
        placeholder: "Priority"
      };
    }
    __refreshChildProps_select4() {
      const child = this._select4;
      if (!child) {
        return;
      }
      child.__geaUpdateProps(this.__buildProps_select4());
    }
    __ensureChild_select4() {
      if (!this._select4) {
        this._select4 = new Select(this.__buildProps_select4());
        this._select4.parentComponent = this;
        this._select4.__geaCompiledChild = true;
      } else {
        this._select4.props = this.__buildProps_select4();
      }
      return this._select4;
    }
    __buildProps_button() {
      return {
        variant: "default",
        disabled: this.isCreating,
        click: () => this.handleSubmit(),
        children: `<!--${this.id + "-c4"}-->${(this.isCreating ? `<span class="inline-flex items-center gap-2">${this.__ensureChild_spinner()}Create Issue</span>` : "Create Issue") || ""}<!--${this.id + "-c4-end"}-->`
      };
    }
    __refreshChildProps_button() {
      const child = this._button;
      if (!child) {
        return;
      }
      child.__geaUpdateProps(this.__buildProps_button());
    }
    __ensureChild_button() {
      if (!this._button) {
        this._button = new Button(this.__buildProps_button());
        this._button.parentComponent = this;
        this._button.__geaCompiledChild = true;
      } else {
        this._button.props = this.__buildProps_button();
      }
      return this._button;
    }
    __buildProps_button2() {
      const {
        onClose
      } = this.props;
      return {
        variant: "ghost",
        click: onClose,
        children: `Cancel`
      };
    }
    __refreshChildProps_button2() {
      const child = this._button2;
      if (!child) {
        return;
      }
      child.__geaUpdateProps(this.__buildProps_button2());
    }
    __ensureChild_button2() {
      if (!this._button2) {
        this._button2 = new Button(this.__buildProps_button2());
        this._button2.parentComponent = this;
        this._button2.__geaCompiledChild = true;
      } else {
        this._button2.props = this.__buildProps_button2();
      }
      return this._button2;
    }
    __buildProps_spinner() {
      return {
        size: 16
      };
    }
    __refreshChildProps_spinner() {
      const child = this._spinner;
      if (!child) {
        return;
      }
      child.__geaUpdateProps(this.__buildProps_spinner());
    }
    __ensureChild_spinner() {
      if (!this._spinner) {
        this._spinner = new Spinner(this.__buildProps_spinner());
        this._spinner.parentComponent = this;
        this._spinner.__geaCompiledChild = true;
      } else {
        this._spinner.props = this.__buildProps_spinner();
      }
      return this._spinner;
    }
    dispose() {
      if (this.__observer_removers__) {
        this.__observer_removers__.forEach((fn) => fn());
      }
      this._select?.dispose?.();
      this._select2?.dispose?.();
      this._select3?.dispose?.();
      this._select4?.dispose?.();
      this._button?.dispose?.();
      this._button2?.dispose?.();
      this._spinner?.dispose?.();
      super.dispose();
    }
    __onPropChange(key, value) {
      if (key === "onClose") this.__refreshChildProps_button2();
      this.__geaPatchCond(0);
      this.__geaPatchCond(1);
      this.__geaPatchCond(2);
      this.__geaPatchCond(3);
      this.__geaPatchCond(4);
    }
    __observe_projectStore_project__users(value, change) {
      if (value === this.__geaPrev___observe_projectStore_project__users) return;
      this.__geaPrev___observe_projectStore_project__users = value;
      if (this.rendered_ && typeof this.__geaRequestRender === "function") {
        this.__geaRequestRender();
      }
    }
    __observe_local_errors__type(value, change) {
      if (this.rendered_) {
        this.__geaCondPatched_0 = this.__geaPatchCond(0);
        if (this.__geaCondPatched_0) return;
      }
    }
    __observe_local_errors(value, change) {
      if (this.rendered_) {
        const __el = document.getElementById(this.id + "-b1");
        const __boundValue = `input ${this.errors.title ? "input-error" : ""}`;
        if (__el) {
          const __newClass = __boundValue != null ? String(__boundValue).trim() : "";
          if (__el.className !== __newClass) __el.className = __newClass;
        }
      }
    }
    __observe_local_errors__title(value, change) {
      if (this.rendered_) {
        const __el = document.getElementById(this.id + "-b1");
        const __boundValue = `input ${this.errors.title ? "input-error" : ""}`;
        if (__el) {
          const __newClass = __boundValue != null ? String(__boundValue).trim() : "";
          if (__el.className !== __newClass) __el.className = __newClass;
        }
      }
      if (this.rendered_) {
        this.__geaCondPatched_1 = this.__geaPatchCond(1);
      }
    }
    __observe_local_title(value, change) {
      if (this.rendered_) {
        const __el = document.getElementById(this.id + "-b1");
        const __boundValue = this.title;
        if (__el) __el.value = __boundValue === null || __boundValue === void 0 ? "" : String(__boundValue);
      }
    }
    __observe_local_description(value, change) {
      if (this.rendered_) {
        const __el = document.getElementById(this.id + "-b2");
        const __boundValue = this.description;
        if (__el) __el.value = __boundValue === null || __boundValue === void 0 ? "" : String(__boundValue);
      }
    }
    __observe_local_errors__reporterId(value, change) {
      if (this.rendered_) {
        this.__geaCondPatched_2 = this.__geaPatchCond(2);
        if (this.__geaCondPatched_2) return;
      }
    }
    __observe_local_errors__priority(value, change) {
      if (this.rendered_) {
        this.__geaCondPatched_3 = this.__geaPatchCond(3);
        if (this.__geaCondPatched_3) return;
      }
    }
    __observe_local_isCreating(value, change) {
      if (this.rendered_) {
        this.__geaCondPatched_4 = this.__geaPatchCond(4);
        if (this.__geaCondPatched_4) return;
      }
      this.__refreshChildProps_button();
    }
    __observe_local_type(value, change) {
      this.__refreshChildProps_select();
    }
    __observe_projectStore_project(value, change) {
      this.__refreshChildProps_select2();
      this.__refreshChildProps_select3();
    }
    __observe_projectStore_project__users__map(value, change) {
      this.__refreshChildProps_select2();
      this.__refreshChildProps_select3();
    }
    __observe_local_reporterId(value, change) {
      this.__refreshChildProps_select2();
    }
    __observe_local_userIds(value, change) {
      this.__refreshChildProps_select3();
    }
    __observe_local_priority(value, change) {
      this.__refreshChildProps_select4();
    }
    __observe_local_handleSubmit(value, change) {
      this.__refreshChildProps_button();
    }
    __observe_local_id(value, change) {
      this.__refreshChildProps_button();
    }
    __observe_local___ensureChild_spinner(value, change) {
      this.__refreshChildProps_button();
    }
    createdHooks() {
      if (!this.__observer_removers__) {
        this.__observer_removers__ = [];
      }
      if (!this.__stores) {
        this.__stores = {};
      }
      this.__observer_removers__.forEach((fn) => fn());
      this.__observer_removers__ = [];
      if (typeof this.__ensureArrayConfigs === "function") {
        this.__ensureArrayConfigs();
      }
      this.__stores.projectStore = project_store_default.__store;
      this.__observer_removers__.push(this.__stores.projectStore.observe(["project", "users"], (__v, __c) => this.__observe_projectStore_project__users(__v, __c)));
      this.__observer_removers__.push(this.__stores.projectStore.observe(["project"], (__v, __c) => this.__observe_projectStore_project(__v, __c)));
      this.__observer_removers__.push(this.__stores.projectStore.observe(["project", "users", "map"], (__v, __c) => this.__observe_projectStore_project__users__map(__v, __c)));
    }
    __setupLocalStateObservers() {
      if (typeof this.__ensureArrayConfigs === "function") {
        this.__ensureArrayConfigs();
      }
      if (!this.__store) {
        return;
      }
      this.__observer_removers__.push(this.__store.observe(["errors", "type"], (__v, __c) => this.__observe_local_errors__type(__v, __c)));
      this.__observer_removers__.push(this.__store.observe(["errors"], (__v, __c) => this.__observe_local_errors(__v, __c)));
      this.__observer_removers__.push(this.__store.observe(["errors", "title"], (__v, __c) => this.__observe_local_errors__title(__v, __c)));
      this.__observer_removers__.push(this.__store.observe(["title"], (__v, __c) => this.__observe_local_title(__v, __c)));
      this.__observer_removers__.push(this.__store.observe(["description"], (__v, __c) => this.__observe_local_description(__v, __c)));
      this.__observer_removers__.push(this.__store.observe(["errors", "reporterId"], (__v, __c) => this.__observe_local_errors__reporterId(__v, __c)));
      this.__observer_removers__.push(this.__store.observe(["errors", "priority"], (__v, __c) => this.__observe_local_errors__priority(__v, __c)));
      this.__observer_removers__.push(this.__store.observe(["isCreating"], (__v, __c) => this.__observe_local_isCreating(__v, __c)));
      this.__observer_removers__.push(this.__store.observe(["type"], (__v, __c) => this.__observe_local_type(__v, __c)));
      this.__observer_removers__.push(this.__store.observe(["reporterId"], (__v, __c) => this.__observe_local_reporterId(__v, __c)));
      this.__observer_removers__.push(this.__store.observe(["userIds"], (__v, __c) => this.__observe_local_userIds(__v, __c)));
      this.__observer_removers__.push(this.__store.observe(["priority"], (__v, __c) => this.__observe_local_priority(__v, __c)));
      this.__observer_removers__.push(this.__store.observe(["id"], (__v, __c) => this.__observe_local_id(__v, __c)));
    }
  };
  if (void 0) {
    const __moduleExports = {
      default: IssueCreate
    };
    registerHotModule20("", __moduleExports);
    (void 0).accept((newModule) => {
      const __updatedModule = newModule || __moduleExports;
      registerHotModule20("", __updatedModule);
      handleComponentUpdate20("", __updatedModule);
    });
    (void 0).accept("../stores/project-store", () => (void 0).invalidate());
    (void 0).accept("../stores/auth-store", () => (void 0).invalidate());
    (void 0).accept("../stores/toast-store", () => (void 0).invalidate());
    (void 0).accept("../constants/issues", () => (void 0).invalidate());
    (void 0).accept("../utils/validation", () => (void 0).invalidate());
    (void 0).accept("../components/Spinner", () => (void 0).invalidate());
    const __origCreated = IssueCreate.prototype.created;
    IssueCreate.prototype.created = function(__geaProps) {
      registerComponentInstance20(this.constructor.name, this);
      return __origCreated.call(this, __geaProps);
    };
    const __origDispose = IssueCreate.prototype.dispose;
    IssueCreate.prototype.dispose = function() {
      unregisterComponentInstance20(this.constructor.name, this);
      return __origDispose.call(this);
    };
  }

  // jira_clone_gea/src/views/IssueSearch.tsx
  var IssueSearch = class extends Component {
    constructor(...args) {
      super(...args);
      this._spinner = null;
      this._icon = null;
      try {
        const project = project_store_default.project;
        const recentIssues = project ? sortByNewest([...project.issues], "createdAt").slice(0, 10) : [];
        const isSearchEmpty = !this.searchTerm.trim();
        this.__geaCond_0 = !!this.isLoading;
        this.__geaCond_1 = !!(isSearchEmpty && recentIssues.length > 0);
        this.__geaCond_2 = !!(!isSearchEmpty && this.matchingIssues.length > 0);
        this.__geaCond_3 = !!(!isSearchEmpty && !this.isLoading && this.matchingIssues.length === 0);
      } catch {
      }
      this.__geaRegisterCond(0, "c0", () => {
        const project = project_store_default.project;
        const recentIssues = project ? sortByNewest([...project.issues], "createdAt").slice(0, 10) : [];
        const isSearchEmpty = !this.searchTerm.trim();
        return this.isLoading;
      }, () => {
        const project = project_store_default.project;
        const recentIssues = project ? sortByNewest([...project.issues], "createdAt").slice(0, 10) : [];
        const isSearchEmpty = !this.searchTerm.trim();
        return `${this.__ensureChild_spinner()}`;
      }, null);
      this.__geaRegisterCond(1, "c1", () => {
        const project = project_store_default.project;
        const recentIssues = project ? sortByNewest([...project.issues], "createdAt").slice(0, 10) : [];
        const isSearchEmpty = !this.searchTerm.trim();
        return isSearchEmpty && recentIssues.length > 0;
      }, () => {
        const project = project_store_default.project;
        const recentIssues = project ? sortByNewest([...project.issues], "createdAt").slice(0, 10) : [];
        return `<div class="issue-search-section"><div class="issue-search-section-title">Recent Issues</div>${recentIssues.map((issue2) => this.render__unresolved_0Item(issue2)).join("") + "<!---->"}</div>`;
      }, null);
      this.__geaRegisterCond(2, "c2", () => {
        const project = project_store_default.project;
        const recentIssues = project ? sortByNewest([...project.issues], "createdAt").slice(0, 10) : [];
        const isSearchEmpty = !this.searchTerm.trim();
        return !isSearchEmpty && this.matchingIssues.length > 0;
      }, () => {
        const project = project_store_default.project;
        const recentIssues = project ? sortByNewest([...project.issues], "createdAt").slice(0, 10) : [];
        const isSearchEmpty = !this.searchTerm.trim();
        return `<div class="issue-search-section"><div class="issue-search-section-title">Matching Issues</div>${this.matchingIssues.map((issue2) => this.renderMatchingIssuesItem(issue2)).join("") + "<!---->"}</div>`;
      }, null);
      this.__geaRegisterCond(3, "c3", () => {
        const project = project_store_default.project;
        const recentIssues = project ? sortByNewest([...project.issues], "createdAt").slice(0, 10) : [];
        const isSearchEmpty = !this.searchTerm.trim();
        return !isSearchEmpty && !this.isLoading && this.matchingIssues.length === 0;
      }, () => {
        const project = project_store_default.project;
        const recentIssues = project ? sortByNewest([...project.issues], "createdAt").slice(0, 10) : [];
        const isSearchEmpty = !this.searchTerm.trim();
        return `<div class="issue-search-no-results"><p class="issue-search-no-results-title">We couldn't find anything matching your search</p><p class="issue-search-no-results-tip">Try again with a different term.</p></div>`;
      }, null);
    }
    searchTerm = "";
    matchingIssues = [];
    isLoading = false;
    _debounceTimer = null;
    handleInput(e) {
      this.searchTerm = e.target.value;
      clearTimeout(this._debounceTimer);
      if (this.searchTerm.trim()) {
        this._debounceTimer = setTimeout(() => this.doSearch(), 300);
      } else {
        this.matchingIssues = [];
      }
    }
    async doSearch() {
      this.isLoading = true;
      try {
        const data = await api_default.get("/issues", {
          searchTerm: this.searchTerm.trim()
        });
        this.matchingIssues = data || [];
      } catch (e) {
        this.matchingIssues = [];
      } finally {
        this.isLoading = false;
      }
    }
    template({
      onClose
    }) {
      const project = project_store_default.project;
      const recentIssues = project ? sortByNewest([...project.issues], "createdAt").slice(0, 10) : [];
      const isSearchEmpty = !this.searchTerm.trim();
      return `<div id="${this.id}" class="issue-search"><div class="issue-search-input-cont">${this.__ensureChild_icon()}<input id="${this.id + "-b1"}" class="issue-search-input" type="text" autofocus placeholder="Search issues by summary, description..."${this.searchTerm == null || this.searchTerm === false ? "" : ` value="${this.searchTerm}"`} /><!--${this.id + "-c0"}-->${this.isLoading && `${this.__ensureChild_spinner()}` || ""}<!--${this.id + "-c0-end"}--></div><!--${this.id + "-c1"}-->${isSearchEmpty && recentIssues.length > 0 && `<div class="issue-search-section"><div class="issue-search-section-title">Recent Issues</div>${recentIssues.map((issue2) => this.render__unresolved_0Item(issue2)).join("") + "<!---->"}</div>` || ""}<!--${this.id + "-c1-end"}--><!--${this.id + "-c2"}-->${!isSearchEmpty && this.matchingIssues.length > 0 && `<div class="issue-search-section"><div class="issue-search-section-title">Matching Issues</div>${this.matchingIssues.map((issue2) => this.renderMatchingIssuesItem(issue2)).join("") + "<!---->"}</div>` || ""}<!--${this.id + "-c2-end"}--><!--${this.id + "-c3"}-->${!isSearchEmpty && !this.isLoading && this.matchingIssues.length === 0 && `<div class="issue-search-no-results"><p class="issue-search-no-results-title">We couldn't find anything matching your search</p><p class="issue-search-no-results-tip">Try again with a different term.</p></div>` || ""}<!--${this.id + "-c3-end"}--></div>`;
    }
    get events() {
      return {
        input: {
          [`#${this.id}-b1`]: this.__event_input_0
        }
      };
    }
    __event_input_0(e, targetComponent) {
      this.handleInput(e);
    }
    __buildProps_icon() {
      return {
        type: "search",
        size: 22
      };
    }
    __refreshChildProps_icon() {
      const child = this._icon;
      if (!child) {
        return;
      }
      child.__geaUpdateProps(this.__buildProps_icon());
    }
    __ensureChild_icon() {
      if (!this._icon) {
        this._icon = new Icon(this.__buildProps_icon());
        this._icon.parentComponent = this;
        this._icon.__geaCompiledChild = true;
      } else {
        this._icon.props = this.__buildProps_icon();
      }
      return this._icon;
    }
    __buildProps_spinner() {
      return {
        size: 20
      };
    }
    __refreshChildProps_spinner() {
      const child = this._spinner;
      if (!child) {
        return;
      }
      child.__geaUpdateProps(this.__buildProps_spinner());
    }
    __ensureChild_spinner() {
      if (!this._spinner) {
        this._spinner = new Spinner(this.__buildProps_spinner());
        this._spinner.parentComponent = this;
        this._spinner.__geaCompiledChild = true;
      } else {
        this._spinner.props = this.__buildProps_spinner();
      }
      return this._spinner;
    }
    dispose() {
      if (this.__observer_removers__) {
        this.__observer_removers__.forEach((fn) => fn());
      }
      this._icon?.dispose?.();
      this._spinner?.dispose?.();
      super.dispose();
    }
    render__unresolved_0Item(issue2) {
      const __v = (v) => v != null && typeof v === "object" ? v.valueOf() : v;
      return `<div data-gea-item-id="${issue2.id}">${new Link({
        to: `/project/board/issues/${issue2.id}`,
        class: "issue-search-item",
        onNavigate: () => this.props.onClose?.(),
        children: `${new IssueTypeIcon({
          type: issue2.type,
          size: 22
        })}<div class="issue-search-item-data"><div class="issue-search-item-title">${issue2.title}</div><div class="issue-search-item-id">${issue2.type}-${issue2.id}</div></div>`
      })}</div>`;
    }
    create__unresolved_0Item(item) {
      var __c = this.____unresolved_0_container;
      if (!__c.__geaTpl) {
        try {
          var __tw = __c.cloneNode(false);
          __tw.innerHTML = this.render__unresolved_0Item({
            id: 0,
            type: "",
            title: ""
          });
          __c.__geaTpl = __tw.firstElementChild;
        } catch {
        }
      }
      if (__c.__geaTpl) {
        var el = __c.__geaTpl.cloneNode(true);
      } else {
        var __fw = __c.cloneNode(false);
        __fw.innerHTML = this.render__unresolved_0Item(item);
        var el = __fw.firstElementChild;
      }
      var __av = `/project/board/issues/${item.id}`;
      if (__av == null || __av === false) el.firstElementChild.removeAttribute("to");
      else el.firstElementChild.setAttribute("to", String(__av));
      var __av = () => this.props.onClose?.();
      if (__av == null || __av === false) el.firstElementChild.removeAttribute("onNavigate");
      else el.firstElementChild.setAttribute("onNavigate", String(__av));
      var __av = item.type;
      if (__av == null || __av === false) el.firstElementChild.firstElementChild.removeAttribute("type");
      else el.firstElementChild.firstElementChild.setAttribute("type", String(__av));
      var __av = 22;
      if (__av == null || __av === false) el.firstElementChild.firstElementChild.removeAttribute("size");
      else el.firstElementChild.firstElementChild.setAttribute("size", String(__av));
      el.firstElementChild.firstElementChild.nextElementSibling.firstElementChild.textContent = `${item.title}`;
      el.firstElementChild.firstElementChild.nextElementSibling.firstElementChild.nextElementSibling.textContent = `
                      ${item.type}-${item.id}
                    `;
      el.setAttribute("data-gea-item-id", item.id);
      el.__geaItem = item;
      return el;
    }
    __onPropChange(key, value) {
      this.__geaPatchCond(0);
      this.__geaPatchCond(1);
      this.__geaPatchCond(2);
      this.__geaPatchCond(3);
    }
    __observe_projectStore_project(value, change) {
      if (this.rendered_) {
        this.__geaCondPatched_1 = this.__geaPatchCond(1);
        if (this.__geaCondPatched_1) return;
      }
    }
    __observe_projectStore_project__issues(value, change) {
      if (this.rendered_) {
        this.__geaCondPatched_1 = this.__geaPatchCond(1);
        if (this.__geaCondPatched_1) return;
      }
    }
    __observe_local_searchTerm(value, change) {
      if (this.rendered_) {
        const __el = document.getElementById(this.id + "-b1");
        const __boundValue = this.searchTerm;
        if (__el) __el.value = __boundValue === null || __boundValue === void 0 ? "" : String(__boundValue);
      }
    }
    __observe_local_isLoading(value, change) {
      if (this.rendered_) {
        this.__geaCondPatched_0 = this.__geaPatchCond(0);
        this.__geaCondPatched_3 = this.__geaPatchCond(3);
        if (this.__geaCondPatched_0 || this.__geaCondPatched_3) return;
      }
    }
    __observe_local_matchingIssues(value, change) {
      if (this.rendered_) {
        this.__geaCondPatched_2 = this.__geaPatchCond(2);
        this.__geaCondPatched_3 = this.__geaPatchCond(3);
        if (this.__geaCondPatched_2 || this.__geaCondPatched_3) return;
      }
      if (!this.__matchingIssues_container) {
        this.__matchingIssues_container = this.$(":scope");
      }
      if (!this.__matchingIssues_container) return;
      if (Array.isArray(value) && value.length === 0 && this.__matchingIssues_container.children.length > 0) {
        this.__matchingIssues_container.textContent = "";
        return;
      }
      if (typeof this.__ensureArrayConfigs === "function") this.__ensureArrayConfigs();
      this.__applyListChanges(this.__matchingIssues_container, value, change, this.__matchingIssuesListConfig);
    }
    __geaSyncMapDelegate_0() {
      this.__geaSyncMap(0);
    }
    renderMatchingIssuesItem(issue2) {
      const __v = (v) => v != null && typeof v === "object" ? v.valueOf() : v;
      return `<div data-gea-item-id="${issue2.id}">${new Link({
        to: `/project/board/issues/${issue2.id}`,
        class: "issue-search-item",
        onNavigate: () => this.props.onClose?.(),
        children: `${new IssueTypeIcon({
          type: issue2.type,
          size: 22
        })}<div class="issue-search-item-data"><div class="issue-search-item-title">${issue2.title}</div><div class="issue-search-item-id">${issue2.type}-${issue2.id}</div></div>`
      })}</div>`;
    }
    createMatchingIssuesItem(item) {
      var __c = this.__matchingIssues_container;
      if (!__c.__geaTpl) {
        try {
          var __tw = __c.cloneNode(false);
          __tw.innerHTML = this.renderMatchingIssuesItem({
            id: 0,
            type: "",
            title: ""
          });
          __c.__geaTpl = __tw.firstElementChild;
        } catch {
        }
      }
      if (__c.__geaTpl) {
        var el = __c.__geaTpl.cloneNode(true);
      } else {
        var __fw = __c.cloneNode(false);
        __fw.innerHTML = this.renderMatchingIssuesItem(item);
        var el = __fw.firstElementChild;
      }
      var __av = `/project/board/issues/${item.id}`;
      if (__av == null || __av === false) el.firstElementChild.removeAttribute("to");
      else el.firstElementChild.setAttribute("to", String(__av));
      var __av = () => this.props.onClose?.();
      if (__av == null || __av === false) el.firstElementChild.removeAttribute("onNavigate");
      else el.firstElementChild.setAttribute("onNavigate", String(__av));
      var __av = item.type;
      if (__av == null || __av === false) el.firstElementChild.firstElementChild.removeAttribute("type");
      else el.firstElementChild.firstElementChild.setAttribute("type", String(__av));
      var __av = 22;
      if (__av == null || __av === false) el.firstElementChild.firstElementChild.removeAttribute("size");
      else el.firstElementChild.firstElementChild.setAttribute("size", String(__av));
      el.firstElementChild.firstElementChild.nextElementSibling.firstElementChild.textContent = `${item.title}`;
      el.firstElementChild.firstElementChild.nextElementSibling.firstElementChild.nextElementSibling.textContent = `
                      ${item.type}-${item.id}
                    `;
      el.setAttribute("data-gea-item-id", item.id);
      el.__geaItem = item;
      return el;
    }
    __ensureArrayConfigs() {
      if (!this.__matchingIssuesListConfig) {
        this.__matchingIssuesListConfig = {
          arrayPathParts: ["matchingIssues"],
          render: (item) => this.renderMatchingIssuesItem(item),
          create: (item) => this.createMatchingIssuesItem(item),
          propPatchers: {
            "id": [(row, value, item) => {
              const __target = row.firstElementChild;
              if (!__target) return;
              const __attrValue = `/project/board/issues/${item.id}`;
              if (__attrValue == null || __attrValue === false) {
                __target.removeAttribute("to");
              } else {
                __target.setAttribute("to", String(__attrValue));
              }
            }, (row, value, item) => {
              const __target = row.firstElementChild.firstElementChild.nextElementSibling.firstElementChild.nextElementSibling;
              if (!__target) return;
              __target.firstChild && (__target.firstChild.nodeValue = `
                      ${item.type}-${item.id}
                    `) || (__target.textContent = `
                      ${item.type}-${item.id}
                    `);
            }],
            "type": [(row, value, item) => {
              const __target = row.firstElementChild.firstElementChild;
              if (!__target) return;
              const __attrValue = item.type;
              if (__attrValue == null || __attrValue === false) {
                __target.removeAttribute("type");
              } else {
                __target.setAttribute("type", String(__attrValue));
              }
            }, (row, value, item) => {
              const __target = row.firstElementChild.firstElementChild.nextElementSibling.firstElementChild.nextElementSibling;
              if (!__target) return;
              __target.firstChild && (__target.firstChild.nodeValue = `
                      ${item.type}-${item.id}
                    `) || (__target.textContent = `
                      ${item.type}-${item.id}
                    `);
            }, (row, value) => row.classList.toggle("type", value)],
            "title": [(row, value, item) => {
              const __target = row.firstElementChild.firstElementChild.nextElementSibling.firstElementChild;
              if (!__target) return;
              __target.firstChild && (__target.firstChild.nodeValue = `${item.title}`) || (__target.textContent = `${item.title}`);
            }]
          }
        };
      }
    }
    createdHooks() {
      if (!this.__observer_removers__) {
        this.__observer_removers__ = [];
      }
      if (!this.__stores) {
        this.__stores = {};
      }
      this.__observer_removers__.forEach((fn) => fn());
      this.__observer_removers__ = [];
      if (typeof this.__ensureArrayConfigs === "function") {
        this.__ensureArrayConfigs();
      }
      this.__stores.projectStore = project_store_default.__store;
      this.__observer_removers__.push(this.__stores.projectStore.observe(["project"], (__v, __c) => this.__observe_projectStore_project(__v, __c)));
      this.__observer_removers__.push(this.__stores.projectStore.observe(["project", "issues"], (__v, __c) => this.__observe_projectStore_project__issues(__v, __c)));
      this.__observer_removers__.push(this.__stores.projectStore.observe(["project"], (__v, __c) => this.__geaSyncMapDelegate_0(__v, __c)));
      this.__observer_removers__.push(this.__stores.projectStore.observe(["project", "issues"], (__v, __c) => this.__geaSyncMapDelegate_0(__v, __c)));
      this.__geaRegisterMap(0, "____unresolved_0_container", () => this.$(":scope"), () => {
        const project = project_store_default.project;
        return project ? sortByNewest([...project.issues], "createdAt").slice(0, 10) : [];
      }, (__item) => this.create__unresolved_0Item(__item));
    }
    __setupLocalStateObservers() {
      if (typeof this.__ensureArrayConfigs === "function") {
        this.__ensureArrayConfigs();
      }
      if (!this.__store) {
        return;
      }
      this.__observer_removers__.push(this.__store.observe(["searchTerm"], (__v, __c) => this.__observe_local_searchTerm(__v, __c)));
      this.__observer_removers__.push(this.__store.observe(["isLoading"], (__v, __c) => this.__observe_local_isLoading(__v, __c)));
      this.__observer_removers__.push(this.__store.observe(["matchingIssues"], (__v, __c) => this.__observe_local_matchingIssues(__v, __c)));
    }
  };
  if (void 0) {
    const __moduleExports = {
      default: IssueSearch
    };
    registerHotModule21("", __moduleExports);
    (void 0).accept((newModule) => {
      const __updatedModule = newModule || __moduleExports;
      registerHotModule21("", __updatedModule);
      handleComponentUpdate21("", __updatedModule);
    });
    (void 0).accept("../stores/project-store", () => (void 0).invalidate());
    (void 0).accept("../utils/api", () => (void 0).invalidate());
    (void 0).accept("../utils/javascript", () => (void 0).invalidate());
    (void 0).accept("../components/Icon", () => (void 0).invalidate());
    (void 0).accept("../components/IssueTypeIcon", () => (void 0).invalidate());
    (void 0).accept("../components/Spinner", () => (void 0).invalidate());
    const __origCreated = IssueSearch.prototype.created;
    IssueSearch.prototype.created = function(__geaProps) {
      registerComponentInstance21(this.constructor.name, this);
      return __origCreated.call(this, __geaProps);
    };
    const __origDispose = IssueSearch.prototype.dispose;
    IssueSearch.prototype.dispose = function() {
      unregisterComponentInstance21(this.constructor.name, this);
      return __origDispose.call(this);
    };
  }

  // jira_clone_gea/src/components/PageLoader.tsx
  var PageLoader = class extends Component {
    constructor(...args) {
      super(...args);
      this._spinner = null;
    }
    template(props) {
      return `<div id="${this.id}" class="page-loader">${this.__ensureChild_spinner()}</div>`;
    }
    __buildProps_spinner() {
      return {
        size: 50
      };
    }
    __refreshChildProps_spinner() {
      const child = this._spinner;
      if (!child) {
        return;
      }
      child.__geaUpdateProps(this.__buildProps_spinner());
    }
    __ensureChild_spinner() {
      if (!this._spinner) {
        this._spinner = new Spinner(this.__buildProps_spinner());
        this._spinner.parentComponent = this;
        this._spinner.__geaCompiledChild = true;
      } else {
        this._spinner.props = this.__buildProps_spinner();
      }
      return this._spinner;
    }
    dispose() {
      this._spinner?.dispose?.();
      super.dispose();
    }
  };
  if (void 0) {
    const __moduleExports = {
      default: PageLoader
    };
    registerHotModule22("", __moduleExports);
    (void 0).accept((newModule) => {
      const __updatedModule = newModule || __moduleExports;
      registerHotModule22("", __updatedModule);
      handleComponentUpdate22("", __updatedModule);
    });
    (void 0).accept("./Spinner", () => (void 0).invalidate());
    const __origCreated = PageLoader.prototype.created;
    PageLoader.prototype.created = function(__geaProps) {
      registerComponentInstance22(this.constructor.name, this);
      return __origCreated.call(this, __geaProps);
    };
    const __origDispose = PageLoader.prototype.dispose;
    PageLoader.prototype.dispose = function() {
      unregisterComponentInstance22(this.constructor.name, this);
      return __origDispose.call(this);
    };
  }

  // jira_clone_gea/src/views/Project.tsx
  var Project = class extends Component {
    constructor(...args) {
      super(...args);
      this._issueCreate = null;
      this._dialog3 = null;
      this._issueSearch = null;
      this._dialog2 = null;
      this._issueDetails = null;
      this._dialog = null;
      this._projectSettings = null;
      this._board = null;
      this._sidebar = null;
      this._navbarLeft = null;
      try {
        this.__geaCond_0 = !!this.isBoard;
        this.__geaCond_1 = !!this.isSettings;
        this.__geaCond_2 = !!this.showIssueDetail;
        this.__geaCond_3 = !!this.searchModalOpen;
        this.__geaCond_4 = !!this.createModalOpen;
      } catch {
      }
      this.__geaRegisterCond(0, "c0", () => {
        return this.isBoard;
      }, () => `${this.__ensureChild_board()}`, null);
      this.__geaRegisterCond(1, "c1", () => {
        return this.isSettings;
      }, () => `${this.__ensureChild_projectSettings()}`, null);
      this.__geaRegisterCond(2, "c2", () => {
        return this.showIssueDetail;
      }, () => `${this.__ensureChild_dialog()}`, null);
      this.__geaRegisterCond(3, "c3", () => {
        return this.searchModalOpen;
      }, () => `${this.__ensureChild_dialog2()}`, null);
      this.__geaRegisterCond(4, "c4", () => {
        return this.createModalOpen;
      }, () => `${this.__ensureChild_dialog3()}`, null);
    }
    searchModalOpen = false;
    createModalOpen = false;
    get isBoard() {
      return router.path.startsWith("/project/board");
    }
    get isSettings() {
      return router.path === "/project/settings";
    }
    get issueMatch() {
      return matchRoute("/project/board/issues/:issueId", router.path);
    }
    get showIssueDetail() {
      return !!this.issueMatch;
    }
    get issueId() {
      return this.issueMatch ? this.issueMatch.params.issueId : "";
    }
    closeIssueDetail() {
      issue_store_default.clear();
      router.push("/project/board");
    }
    closeSearchModal() {
      this.searchModalOpen = false;
    }
    closeCreateModal() {
      this.createModalOpen = false;
    }
    template() {
      Component._register(NavbarLeft);
      Component._register(Sidebar);
      Component._register(Board);
      Component._register(ProjectSettings);
      Component._register(IssueDetails);
      Component._register(IssueCreate);
      Component._register(IssueSearch);
      const {
        isLoading,
        project
      } = project_store_default;
      if (isLoading || !project) {
        return `${new PageLoader({})}`;
      }
      return `<div id="${this.id}" class="project-page">${this.__ensureChild_navbarLeft()}${this.__ensureChild_sidebar()}<div class="page-content"><!--${this.id + "-c0"}-->${this.isBoard && `${this.__ensureChild_board()}` || ""}<!--${this.id + "-c0-end"}--><!--${this.id + "-c1"}-->${this.isSettings && `${this.__ensureChild_projectSettings()}` || ""}<!--${this.id + "-c1-end"}--></div><!--${this.id + "-c2"}-->${this.showIssueDetail && `${this.__ensureChild_dialog()}` || ""}<!--${this.id + "-c2-end"}--><!--${this.id + "-c3"}-->${this.searchModalOpen && `${this.__ensureChild_dialog2()}` || ""}<!--${this.id + "-c3-end"}--><!--${this.id + "-c4"}-->${this.createModalOpen && `${this.__ensureChild_dialog3()}` || ""}<!--${this.id + "-c4-end"}--></div>`;
    }
    __buildProps_navbarLeft() {
      return {
        onSearchClick: () => {
          this.searchModalOpen = true;
        },
        onCreateClick: () => {
          this.createModalOpen = true;
        }
      };
    }
    __refreshChildProps_navbarLeft() {
      const child = this._navbarLeft;
      if (!child) {
        return;
      }
      child.__geaUpdateProps(this.__buildProps_navbarLeft());
    }
    __ensureChild_navbarLeft() {
      if (!this._navbarLeft) {
        this._navbarLeft = new NavbarLeft(this.__buildProps_navbarLeft());
        this._navbarLeft.parentComponent = this;
        this._navbarLeft.__geaCompiledChild = true;
      } else {
        this._navbarLeft.props = this.__buildProps_navbarLeft();
      }
      return this._navbarLeft;
    }
    __ensureChild_sidebar() {
      if (!this._sidebar) {
        this._sidebar = new Sidebar({});
        this._sidebar.parentComponent = this;
        this._sidebar.__geaCompiledChild = true;
      }
      return this._sidebar;
    }
    __ensureChild_board() {
      if (!this._board) {
        this._board = new Board({});
        this._board.parentComponent = this;
        this._board.__geaCompiledChild = true;
      }
      return this._board;
    }
    __ensureChild_projectSettings() {
      if (!this._projectSettings) {
        this._projectSettings = new ProjectSettings({});
        this._projectSettings.parentComponent = this;
        this._projectSettings.__geaCompiledChild = true;
      }
      return this._projectSettings;
    }
    __buildProps_dialog() {
      return {
        open: true,
        onOpenChange: (d) => {
          if (!d.open) this.closeIssueDetail();
        },
        class: "dialog-issue-detail",
        children: `${this.__ensureChild_issueDetails()}`
      };
    }
    __refreshChildProps_dialog() {
      const child = this._dialog;
      if (!child) {
        return;
      }
      child.__geaUpdateProps(this.__buildProps_dialog());
    }
    __ensureChild_dialog() {
      if (!this._dialog) {
        this._dialog = new Dialog(this.__buildProps_dialog());
        this._dialog.parentComponent = this;
        this._dialog.__geaCompiledChild = true;
      } else {
        this._dialog.props = this.__buildProps_dialog();
      }
      return this._dialog;
    }
    __buildProps_dialog2() {
      return {
        open: true,
        onOpenChange: (d) => {
          if (!d.open) this.closeSearchModal();
        },
        class: "dialog-search",
        children: `${this.__ensureChild_issueSearch()}`
      };
    }
    __refreshChildProps_dialog2() {
      const child = this._dialog2;
      if (!child) {
        return;
      }
      child.__geaUpdateProps(this.__buildProps_dialog2());
    }
    __ensureChild_dialog2() {
      if (!this._dialog2) {
        this._dialog2 = new Dialog(this.__buildProps_dialog2());
        this._dialog2.parentComponent = this;
        this._dialog2.__geaCompiledChild = true;
      } else {
        this._dialog2.props = this.__buildProps_dialog2();
      }
      return this._dialog2;
    }
    __buildProps_dialog3() {
      return {
        open: true,
        onOpenChange: (d) => {
          if (!d.open) this.closeCreateModal();
        },
        class: "dialog-create",
        children: `${this.__ensureChild_issueCreate()}`
      };
    }
    __refreshChildProps_dialog3() {
      const child = this._dialog3;
      if (!child) {
        return;
      }
      child.__geaUpdateProps(this.__buildProps_dialog3());
    }
    __ensureChild_dialog3() {
      if (!this._dialog3) {
        this._dialog3 = new Dialog(this.__buildProps_dialog3());
        this._dialog3.parentComponent = this;
        this._dialog3.__geaCompiledChild = true;
      } else {
        this._dialog3.props = this.__buildProps_dialog3();
      }
      return this._dialog3;
    }
    __buildProps_issueDetails() {
      return {
        issueId: this.issueId,
        onClose: () => this.closeIssueDetail()
      };
    }
    __refreshChildProps_issueDetails() {
      const child = this._issueDetails;
      if (!child) {
        return;
      }
      child.__geaUpdateProps(this.__buildProps_issueDetails());
    }
    __ensureChild_issueDetails() {
      if (!this._issueDetails) {
        this._issueDetails = new IssueDetails(this.__buildProps_issueDetails());
        this._issueDetails.parentComponent = this;
        this._issueDetails.__geaCompiledChild = true;
      } else {
        this._issueDetails.props = this.__buildProps_issueDetails();
      }
      return this._issueDetails;
    }
    __buildProps_issueSearch() {
      return {
        onClose: () => this.closeSearchModal()
      };
    }
    __refreshChildProps_issueSearch() {
      const child = this._issueSearch;
      if (!child) {
        return;
      }
      child.__geaUpdateProps(this.__buildProps_issueSearch());
    }
    __ensureChild_issueSearch() {
      if (!this._issueSearch) {
        this._issueSearch = new IssueSearch(this.__buildProps_issueSearch());
        this._issueSearch.parentComponent = this;
        this._issueSearch.__geaCompiledChild = true;
      } else {
        this._issueSearch.props = this.__buildProps_issueSearch();
      }
      return this._issueSearch;
    }
    __buildProps_issueCreate() {
      return {
        onClose: () => this.closeCreateModal()
      };
    }
    __refreshChildProps_issueCreate() {
      const child = this._issueCreate;
      if (!child) {
        return;
      }
      child.__geaUpdateProps(this.__buildProps_issueCreate());
    }
    __ensureChild_issueCreate() {
      if (!this._issueCreate) {
        this._issueCreate = new IssueCreate(this.__buildProps_issueCreate());
        this._issueCreate.parentComponent = this;
        this._issueCreate.__geaCompiledChild = true;
      } else {
        this._issueCreate.props = this.__buildProps_issueCreate();
      }
      return this._issueCreate;
    }
    dispose() {
      if (this.__observer_removers__) {
        this.__observer_removers__.forEach((fn) => fn());
      }
      this._navbarLeft?.dispose?.();
      this._sidebar?.dispose?.();
      this._board?.dispose?.();
      this._projectSettings?.dispose?.();
      this._dialog?.dispose?.();
      this._dialog2?.dispose?.();
      this._dialog3?.dispose?.();
      this._issueDetails?.dispose?.();
      this._issueSearch?.dispose?.();
      this._issueCreate?.dispose?.();
      super.dispose();
    }
    __onPropChange(key, value) {
      this.__geaPatchCond(0);
      this.__geaPatchCond(1);
      this.__geaPatchCond(2);
      this.__geaPatchCond(3);
      this.__geaPatchCond(4);
    }
    __observe_projectStore_isLoading(value, change) {
      if (value === this.__geaPrev___observe_projectStore_isLoading) return;
      this.__geaPrev___observe_projectStore_isLoading = value;
      if (this.rendered_ && typeof this.__geaRequestRender === "function") {
        this.__geaRequestRender();
      }
    }
    __observe_projectStore_project(value, change) {
      if (value === this.__geaPrev___observe_projectStore_project) return;
      this.__geaPrev___observe_projectStore_project = value;
      if (this.rendered_ && typeof this.__geaRequestRender === "function") {
        this.__geaRequestRender();
      }
    }
    __observe_local_searchModalOpen(value, change) {
      if (this.rendered_) {
        this.__geaCondPatched_3 = this.__geaPatchCond(3);
        if (this.__geaCondPatched_3) return;
      }
      this.__refreshChildProps_navbarLeft();
    }
    __observe_local_createModalOpen(value, change) {
      if (this.rendered_) {
        this.__geaCondPatched_4 = this.__geaPatchCond(4);
        if (this.__geaCondPatched_4) return;
      }
      this.__refreshChildProps_navbarLeft();
    }
    __observe_local_isBoard(value, change) {
      if (this.rendered_) {
        this.__geaCondPatched_0 = this.__geaPatchCond(0);
        if (this.__geaCondPatched_0) return;
      }
    }
    __observe_local_isSettings(value, change) {
      if (this.rendered_) {
        this.__geaCondPatched_1 = this.__geaPatchCond(1);
        if (this.__geaCondPatched_1) return;
      }
    }
    __observe_local_showIssueDetail(value, change) {
      if (this.rendered_) {
        this.__geaCondPatched_2 = this.__geaPatchCond(2);
        if (this.__geaCondPatched_2) return;
      }
    }
    __observe_local_closeIssueDetail(value, change) {
      this.__refreshChildProps_dialog();
      this.__refreshChildProps_issueDetails();
    }
    __observe_local___ensureChild_issueDetails(value, change) {
      this.__refreshChildProps_dialog();
    }
    __observe_local_closeSearchModal(value, change) {
      this.__refreshChildProps_dialog2();
      this.__refreshChildProps_issueSearch();
    }
    __observe_local___ensureChild_issueSearch(value, change) {
      this.__refreshChildProps_dialog2();
    }
    __observe_local_closeCreateModal(value, change) {
      this.__refreshChildProps_dialog3();
      this.__refreshChildProps_issueCreate();
    }
    __observe_local___ensureChild_issueCreate(value, change) {
      this.__refreshChildProps_dialog3();
    }
    __observe_local_issueId(value, change) {
      this.__refreshChildProps_issueDetails();
    }
    __observe_local_isBoard__via(_v, change) {
      this.__observe_local_isBoard(this.isBoard, change);
    }
    __observe_local_isSettings__via(_v, change) {
      this.__observe_local_isSettings(this.isSettings, change);
    }
    __observe_local_showIssueDetail__via(_v, change) {
      this.__observe_local_showIssueDetail(this.showIssueDetail, change);
    }
    __observe_local_issueId__via(_v, change) {
      this.__observe_local_issueId(this.issueId, change);
    }
    createdHooks() {
      if (!this.__observer_removers__) {
        this.__observer_removers__ = [];
      }
      if (!this.__stores) {
        this.__stores = {};
      }
      this.__observer_removers__.forEach((fn) => fn());
      this.__observer_removers__ = [];
      if (typeof this.__ensureArrayConfigs === "function") {
        this.__ensureArrayConfigs();
      }
      this.__stores.projectStore = project_store_default.__store;
      this.__observer_removers__.push(this.__stores.projectStore.observe(["isLoading"], (__v, __c) => this.__observe_projectStore_isLoading(__v, __c)));
      this.__observer_removers__.push(this.__stores.projectStore.observe(["project"], (__v, __c) => this.__observe_projectStore_project(__v, __c)));
      this.__stores.router = router.__store;
      this.__observer_removers__.push(this.__stores.router.observe(["path"], (__v, __c) => this.__observe_local_isBoard__via(__v, __c)));
      this.__observer_removers__.push(this.__stores.router.observe(["path"], (__v, __c) => this.__observe_local_isSettings__via(__v, __c)));
      this.__observer_removers__.push(this.__stores.router.observe(["path"], (__v, __c) => this.__observe_local_showIssueDetail__via(__v, __c)));
      this.__observer_removers__.push(this.__stores.router.observe(["path"], (__v, __c) => this.__observe_local_issueId__via(__v, __c)));
    }
    __setupLocalStateObservers() {
      if (typeof this.__ensureArrayConfigs === "function") {
        this.__ensureArrayConfigs();
      }
      if (!this.__store) {
        return;
      }
      this.__observer_removers__.push(this.__store.observe(["searchModalOpen"], (__v, __c) => this.__observe_local_searchModalOpen(__v, __c)));
      this.__observer_removers__.push(this.__store.observe(["createModalOpen"], (__v, __c) => this.__observe_local_createModalOpen(__v, __c)));
    }
  };
  if (void 0) {
    const __moduleExports = {
      default: Project
    };
    registerHotModule23("", __moduleExports);
    (void 0).accept((newModule) => {
      const __updatedModule = newModule || __moduleExports;
      registerHotModule23("", __updatedModule);
      handleComponentUpdate23("", __updatedModule);
    });
    (void 0).accept("../stores/project-store", () => (void 0).invalidate());
    (void 0).accept("../stores/issue-store", () => (void 0).invalidate());
    (void 0).accept("./NavbarLeft", () => (void 0).invalidate());
    (void 0).accept("./Sidebar", () => (void 0).invalidate());
    (void 0).accept("./Board", () => (void 0).invalidate());
    (void 0).accept("./ProjectSettings", () => (void 0).invalidate());
    (void 0).accept("./IssueDetails", () => (void 0).invalidate());
    (void 0).accept("./IssueCreate", () => (void 0).invalidate());
    (void 0).accept("./IssueSearch", () => (void 0).invalidate());
    (void 0).accept("../components/PageLoader", () => (void 0).invalidate());
    const __origCreated = Project.prototype.created;
    Project.prototype.created = function(__geaProps) {
      registerComponentInstance23(this.constructor.name, this);
      return __origCreated.call(this, __geaProps);
    };
    const __origDispose = Project.prototype.dispose;
    Project.prototype.dispose = function() {
      unregisterComponentInstance23(this.constructor.name, this);
      return __origDispose.call(this);
    };
  }
  return __toCommonJS(jira_integration_entry_exports);
})();
