export const RECONCILE_ID = 'virtual:gea-reconcile'
export const RESOLVED_RECONCILE_ID = '\0' + RECONCILE_ID

export const HMR_RUNTIME_ID = 'virtual:gea-hmr'
export const RESOLVED_HMR_RUNTIME_ID = '\0' + HMR_RUNTIME_ID

export const STORE_REGISTRY_ID = 'virtual:gea-store-registry'
export const RESOLVED_STORE_REGISTRY_ID = '\0' + STORE_REGISTRY_ID

export const COMPILER_RUNTIME_ID = 'virtual:gea-compiler-runtime'
export const RESOLVED_COMPILER_RUNTIME_ID = '\0' + COMPILER_RUNTIME_ID

export const RECONCILE_SOURCE = `
import { GEA_DOM_ITEM } from '${COMPILER_RUNTIME_ID}';
function getKey(el) {
  if (el[GEA_DOM_ITEM]) return String(el[GEA_DOM_ITEM].id);
  return el.getAttribute('key');
}
export function reconcile(oldC, newC) {
  var oldMap = new Map();
  var arr = Array.from(oldC.children);
  for (var i = 0; i < arr.length; i++) {
    var k = getKey(arr[i]);
    if (k) oldMap.set(k, arr[i]);
  }
  var newArr = Array.from(newC.children);
  var seen = new Set();
  var prev = null;
  for (var j = 0; j < newArr.length; j++) {
    var nk = getKey(newArr[j]);
    if (!nk) continue;
    seen.add(nk);
    var existing = oldMap.get(nk);
    if (existing) {
      if (existing.innerHTML !== newArr[j].innerHTML) {
        existing.innerHTML = newArr[j].innerHTML;
      }
      var newEl = newArr[j];
      for (var a = 0; a < newEl.attributes.length; a++) {
        var at = newEl.attributes[a];
        if (at.name !== 'key' && existing.getAttribute(at.name) !== at.value) {
          existing.setAttribute(at.name, at.value);
        }
      }
      if (prev ? existing.previousElementSibling !== prev : existing !== oldC.firstElementChild) {
        if (prev) prev.after(existing); else oldC.prepend(existing);
      }
      prev = existing;
    } else {
      if (prev) prev.after(newArr[j]); else oldC.prepend(newArr[j]);
      prev = newArr[j];
    }
  }
  oldMap.forEach(function(el, key) {
    if (!seen.has(key)) el.remove();
  });
}
`

export const HMR_RUNTIME_SOURCE = `
var GEA_ELEMENT = Symbol.for('gea.el');
var GEA_RENDERED = Symbol.for('gea.r');
var GEA_CLEANUP_BINDINGS = Symbol.for('gea.component.cleanupBindings');
var GEA_TEARDOWN_SELF_LISTENERS = Symbol.for('gea.component.teardownSelfListeners');
var GEA_CHILD_COMPONENTS = Symbol.for('gea.ccs');
var GEA_BINDINGS = Symbol.for('gea.bindings');
var GEA_SELF_LISTENERS = Symbol.for('gea.selfListeners');
var hot = import.meta.hot;
var componentInstances = hot && hot.data && hot.data.componentInstances || new Map();
if (hot) hot.data.componentInstances = componentInstances;
var hmrGlobal = globalThis.__geaHMRGlobal || (globalThis.__geaHMRGlobal = {
  componentModules: new Map(),
  componentProxies: new Map(),
});
var componentModules = hmrGlobal.componentModules;
var componentProxies = hmrGlobal.componentProxies;

function normalizeModuleUrl(moduleUrl) {
  try {
    var url = new URL(moduleUrl, import.meta.url);
    url.search = '';
    url.hash = '';
    return url.href;
  } catch(e) {
    return String(moduleUrl || '').replace(/[?#].*$/, '');
  }
}

function getLatestComponentClass(moduleUrl, fallbackComponent) {
  var latestModule = componentModules.get(normalizeModuleUrl(moduleUrl));
  return latestModule && latestModule.default || latestModule || fallbackComponent;
}

export function registerHotModule(moduleUrl, moduleExports) {
  if (!moduleExports) return moduleExports;
  componentModules.set(normalizeModuleUrl(moduleUrl), moduleExports);
  return moduleExports;
}

export function createHotComponentProxy(moduleUrl, initialComponent) {
  var normalizedUrl = normalizeModuleUrl(moduleUrl);
  if (!componentModules.has(normalizedUrl) && initialComponent) {
    componentModules.set(normalizedUrl, { default: initialComponent });
  }
  if (!componentProxies.has(normalizedUrl)) {
    var target = function GeaHotComponentProxy() {};
    var proxy = new Proxy(target, {
      construct: function(_target, args, newTarget) {
        var ComponentClass = getLatestComponentClass(normalizedUrl, initialComponent);
        if (typeof ComponentClass !== 'function') {
          throw new Error('[gea HMR] No component class available for ' + normalizedUrl);
        }
        return Reflect.construct(ComponentClass, args, newTarget === proxy ? ComponentClass : newTarget);
      },
      // Function components are called, not constructed. Forward the call.
      apply: function(_target, thisArg, args) {
        var ComponentClass = getLatestComponentClass(normalizedUrl, initialComponent);
        if (typeof ComponentClass !== 'function') return undefined;
        return Reflect.apply(ComponentClass, thisArg, args);
      },
      get: function(_target, prop, receiver) {
        var ComponentClass = getLatestComponentClass(normalizedUrl, initialComponent);
        if (!ComponentClass) return undefined;
        if (prop === 'prototype') return ComponentClass.prototype;
        return Reflect.get(ComponentClass, prop, receiver);
      },
      set: function(_target, prop, value, receiver) {
        var ComponentClass = getLatestComponentClass(normalizedUrl, initialComponent);
        if (!ComponentClass) return false;
        return Reflect.set(ComponentClass, prop, value, receiver);
      },
      has: function(_target, prop) {
        var ComponentClass = getLatestComponentClass(normalizedUrl, initialComponent);
        return !!ComponentClass && prop in ComponentClass;
      },
      ownKeys: function() {
        var ComponentClass = getLatestComponentClass(normalizedUrl, initialComponent);
        return ComponentClass ? Reflect.ownKeys(ComponentClass) : [];
      },
      getOwnPropertyDescriptor: function(_target, prop) {
        var ComponentClass = getLatestComponentClass(normalizedUrl, initialComponent);
        return ComponentClass ? Object.getOwnPropertyDescriptor(ComponentClass, prop) : undefined;
      }
    });
    componentProxies.set(normalizedUrl, proxy);
  }
  return componentProxies.get(normalizedUrl);
}

export function registerComponentInstance(className, instance) {
  if (!componentInstances.has(className)) {
    componentInstances.set(className, new Set());
  }
  componentInstances.get(className).add(instance);
}

export function unregisterComponentInstance(className, instance) {
  var instances = componentInstances.get(className);
  if (instances) {
    instances.delete(instance);
    if (instances.size === 0) {
      componentInstances.delete(className);
    }
  }
}

function reRenderComponent(instance) {
  var oldEl = instance && (instance[GEA_ELEMENT] || instance.el);
  if (!oldEl) return;
  var parent = oldEl.parentElement;
  if (!parent) return;
  var index = Array.prototype.indexOf.call(parent.children, oldEl);
  var props = Object.assign({}, instance.props);
  var __stateSnapshot = {};
  var __ownKeys = Object.getOwnPropertyNames(instance);
  for (var __ki = 0; __ki < __ownKeys.length; __ki++) {
    var __k = __ownKeys[__ki];
    if (__k.charAt(0) === '_' || __k === 'props' || __k === 'id') continue;
    var __desc = Object.getOwnPropertyDescriptor(instance, __k);
    if (__desc && (__desc.get || __desc.set)) continue;
    try { __stateSnapshot[__k] = instance[__k]; } catch(e) {}
  }
  instance[GEA_RENDERED] = false;
  if (typeof instance[GEA_CLEANUP_BINDINGS] === 'function') instance[GEA_CLEANUP_BINDINGS]();
  if (typeof instance[GEA_TEARDOWN_SELF_LISTENERS] === 'function') instance[GEA_TEARDOWN_SELF_LISTENERS]();
  if (instance.__cleanupCompiledDirectEvents) instance.__cleanupCompiledDirectEvents();
  var __cc = instance[GEA_CHILD_COMPONENTS];
  if (__cc && __cc.length) {
    __cc.forEach(function(child) { if (child && child.dispose) child.dispose(); });
    instance[GEA_CHILD_COMPONENTS] = [];
  }
  if (oldEl && oldEl.parentNode) {
    oldEl.parentNode.removeChild(oldEl);
  }
  if (instance[GEA_ELEMENT]) instance[GEA_ELEMENT] = null;
  instance.props = props;
  var __restoreKeys = Object.getOwnPropertyNames(__stateSnapshot);
  for (var __ri = 0; __ri < __restoreKeys.length; __ri++) {
    try { instance[__restoreKeys[__ri]] = __stateSnapshot[__restoreKeys[__ri]]; } catch(e) {}
  }
  if (!instance[GEA_BINDINGS]) instance[GEA_BINDINGS] = [];
  if (!instance.__bindingRemovers) instance.__bindingRemovers = [];
  if (!instance[GEA_SELF_LISTENERS]) instance[GEA_SELF_LISTENERS] = [];
  if (!instance[GEA_CHILD_COMPONENTS]) instance[GEA_CHILD_COMPONENTS] = [];
  instance.render(parent, index);
  if (typeof instance.createdHooks === 'function') {
    instance.createdHooks(instance.props);
  }
}

export function handleComponentUpdate(moduleId, newModule) {
  var ComponentClass = newModule.default || newModule;
  if (!ComponentClass || typeof ComponentClass !== 'function') return false;
  var className = ComponentClass.name;
  if (!className) return false;
  var instances = componentInstances.get(className);
  if (!instances || instances.size === 0) return false;
  var newProto = ComponentClass.prototype;
  var instancesArray = Array.from(instances);
  instancesArray.forEach(function(instance) {
    try {
      Object.getOwnPropertyNames(newProto).forEach(function(name) {
        if (name === 'constructor') return;
        var descriptor = Object.getOwnPropertyDescriptor(newProto, name);
        if (!descriptor) return;
        try {
          if (typeof descriptor.value === 'function') {
            instance[name] = descriptor.value.bind(instance);
          } else {
            Object.defineProperty(instance, name, descriptor);
          }
        } catch(e) {}
      });
      try {
        var currentProto = Object.getPrototypeOf(instance);
        if (currentProto !== newProto && currentProto !== Object.prototype) {
          Object.setPrototypeOf(instance, newProto);
        }
      } catch(e) {}
      reRenderComponent(instance);
    } catch(error) {
      console.error('[gea HMR] Error updating ' + className + ':', error);
      if (hot && hot.invalidate) hot.invalidate();
    }
  });
  return true;
}
`
