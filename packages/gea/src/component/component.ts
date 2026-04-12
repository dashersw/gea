import { Store } from '../store/store.js';
import { createPropsProxy, type PropThunks } from './props.js';
import getUid from './uid.js';
import { GEA_PROPS, GEA_PROP_THUNKS, GEA_SET_PROPS, GEA_CREATE_TEMPLATE, GEA_UPDATE_PROPS } from '../symbols.js';
import { _renderingStack } from './rendering-context.js';

export class Component extends Store {
  [GEA_PROPS]: Record<string, unknown> = null!;
  [GEA_PROP_THUNKS]: PropThunks = null!;

  id: string = getUid();
  el: Element | null = null;
  rendered: boolean = false;

  get props(): any {
    return this[GEA_PROPS];
  }

  [GEA_SET_PROPS](thunks: PropThunks): void {
    this[GEA_PROP_THUNKS] = thunks;
    this[GEA_PROPS] = createPropsProxy(thunks);
  }

  [GEA_CREATE_TEMPLATE](): Node {
    return document.createDocumentFragment();
  }

  render(parent: Element): void {
    _renderingStack.push(this);
    try {
      const node = this[GEA_CREATE_TEMPLATE]();
      parent.appendChild(node);
      if (typeof DocumentFragment !== 'undefined' && node instanceof DocumentFragment) {
        this.el = parent.lastElementChild;
      } else if (typeof Element !== 'undefined' && node instanceof Element) {
        this.el = node;
      }
      this.rendered = true;
      this.created();
      this.onAfterRender();
    } finally {
      _renderingStack.pop();
    }
  }

  $(selector: string): Element | null {
    return this.el?.querySelector(selector) ?? null;
  }

  $$(selector: string): Element[] {
    return this.el ? Array.from(this.el.querySelectorAll(selector)) : [];
  }

  [GEA_UPDATE_PROPS](_nextProps: Record<string, any>): void {}

  template(): any {}
  created(_props?: any): void {}
  onAfterRender(): void {}

  dispose(): void {
    if (this.el?.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
    this.el = null;
  }
}
