// Well-known symbols used by the component system, router, and UI packages.

// Component internals
export const GEA_ELEMENT = Symbol.for('gea.element');
export const GEA_PARENT_COMPONENT = Symbol.for('gea.parentComponent');
export const GEA_CHILD_COMPONENTS = Symbol.for('gea.childComponents');
export const GEA_DOM_COMPONENT = Symbol.for('gea.domComponent');
export const GEA_DOM_COMPILED_CHILD_ROOT = Symbol.for('gea.domCompiledChildRoot');

// Component lifecycle / maps (used by zag-component)
export const GEA_MAPS = Symbol.for('gea.maps');
export const GEA_SYNC_MAP = Symbol.for('gea.syncMap');
export const GEA_UPDATE_PROPS = Symbol.for('gea.updateProps');

// Component lifecycle hooks
export const GEA_ON_PROP_CHANGE = Symbol.for('gea.onPropChange');

// Router
export const GEA_IS_ROUTER_OUTLET = Symbol.for('gea.isRouterOutlet');
export const GEA_ROUTER_DEPTH = Symbol.for('gea.routerDepth');
export const GEA_ROUTER_REF = Symbol.for('gea.routerRef');

// Render lifecycle
export const GEA_REQUEST_RENDER = Symbol.for('gea.component.requestRender');

// Compiler internals — used by compiled component/store output
export const GEA_PROPS = Symbol.for('gea.props');
export const GEA_PROP_THUNKS = Symbol.for('gea.propThunks');
export const GEA_SET_PROPS = Symbol.for('gea.setProps');
export const GEA_CREATE_TEMPLATE = Symbol.for('gea.createTemplate');
export const GEA_COMPILED = Symbol.for('gea.compiled');

export const GEA_RENDERED = Symbol.for('gea.component.rendered');

// List / array symbols
export const GEA_DOM_ITEM = Symbol.for('gea.dom.item');
export const GEA_DOM_KEY = Symbol.for('gea.dom.key');

/** Factory for per-array-prop list items symbols. */
export function geaListItemsSymbol(arrayPropName: string): symbol {
  return Symbol.for(`gea.listItems.${arrayPropName}`);
}

/**
 * Returns the component instance as-is (v1 compat — previously unwrapped proxies).
 */
export function engineThis<T extends object>(comp: T): T {
  return comp;
}

/**
 * Stash a component for transfer (e.g., drag-drop between containers).
 * Placeholder — the full implementation depends on the component lifecycle system.
 */
export function stashComponentForTransfer(_comp: any): void {
  // TODO: implement when component lifecycle supports transfer
}
