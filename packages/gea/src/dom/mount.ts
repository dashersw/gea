import { Component } from '../component/component';
import { createPropsProxy, type PropThunks } from '../component/props';
import { GEA_DOM_COMPONENT, GEA_PARENT_COMPONENT, GEA_SET_PROPS, GEA_CREATE_TEMPLATE, GEA_PROPS } from '../symbols.js';
import { _renderingStack } from '../component/rendering-context.js';

export function mountComponent(
  Class: new () => Component,
  propThunks: PropThunks,
  parent?: Node,
  anchor?: Node,
): Node {
  const instance = new Class();
  // Set parent component from the rendering context stack
  const parentComp = _renderingStack.length > 0 ? _renderingStack[_renderingStack.length - 1] : null;
  if (parentComp) (instance as any)[GEA_PARENT_COMPONENT] = parentComp;
  (instance as any)[GEA_SET_PROPS](propThunks);
  _renderingStack.push(instance);
  let node: Node;
  try {
    node = (instance as any)[GEA_CREATE_TEMPLATE]();
  } finally {
    _renderingStack.pop();
  }

  if (parent) {
    if (anchor) {
      parent.insertBefore(node, anchor);
    } else {
      parent.appendChild(node);
    }
  }

  if (typeof Element !== 'undefined') {
    if (node instanceof Element) {
      instance.el = node;
    } else if (parent instanceof Element) {
      instance.el = parent.lastElementChild;
    }
  }

  (node as any)[GEA_DOM_COMPONENT] = instance;

  instance.rendered = true;
  instance.created((instance as any)[GEA_PROPS]);
  instance.onAfterRender();

  return node;
}

export function mountFunctionComponent(
  fn: (props: Record<string, unknown>) => Node,
  propThunks: PropThunks,
  parent?: Node,
  anchor?: Node,
): Node {
  const props = createPropsProxy(propThunks);
  const node = fn(props);

  if (parent) {
    if (anchor) {
      parent.insertBefore(node, anchor);
    } else {
      parent.appendChild(node);
    }
  }

  return node;
}

export function mount(
  componentOrFn: (new () => Component) | ((props: Record<string, unknown>) => Node),
  propThunks: PropThunks,
  parent?: Node,
  anchor?: Node,
): Node {
  if (
    typeof componentOrFn === 'function' &&
    typeof (componentOrFn.prototype as any)?.[GEA_CREATE_TEMPLATE] === 'function'
  ) {
    return mountComponent(
      componentOrFn as new () => Component,
      propThunks,
      parent,
      anchor,
    );
  }
  return mountFunctionComponent(
    componentOrFn as (props: Record<string, unknown>) => Node,
    propThunks,
    parent,
    anchor,
  );
}
