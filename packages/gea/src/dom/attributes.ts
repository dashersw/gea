import { computation } from '../signals/effect.js';

const DOM_PROPERTIES = new Set([
  'value',
  'checked',
  'selected',
  'disabled',
  'indeterminate',
  'className',
  'textContent',
  'innerHTML',
]);

const UNITLESS = new Set([
  'animationIterationCount', 'boxFlex', 'boxFlexGroup', 'boxOrdinalGroup',
  'columnCount', 'fillOpacity', 'flex', 'flexGrow', 'flexPositive',
  'flexShrink', 'flexNegative', 'flexOrder', 'fontWeight', 'gridColumn',
  'gridRow', 'lineClamp', 'lineHeight', 'opacity', 'order', 'orphans',
  'tabSize', 'widows', 'zIndex', 'zoom',
]);

function applyStyle(el: HTMLElement, value: unknown): void {
  if (value == null || value === false) {
    el.removeAttribute('style');
  } else if (typeof value === 'string') {
    el.style.cssText = value;
  } else if (typeof value === 'object') {
    el.style.cssText = '';
    const styles = value as Record<string, string | number>;
    for (const key in styles) {
      const v = styles[key];
      if (v != null) {
        (el.style as any)[key] =
          typeof v === 'number' && !UNITLESS.has(key) ? `${v}px` : String(v);
      }
    }
  }
}

export function reactiveAttr(
  el: HTMLElement,
  name: string,
  fn: () => unknown,
): void {
  if (name === 'style') {
    computation(fn, (value) => applyStyle(el, value));
  } else if (DOM_PROPERTIES.has(name)) {
    computation(fn, (value) => {
      (el as any)[name] = value;
    });
  } else {
    computation(fn, (value) => {
      if (value === false || value == null) {
        el.removeAttribute(name);
      } else if (value === true) {
        el.setAttribute(name, '');
      } else {
        el.setAttribute(name, typeof value === 'string' ? value : String(value));
      }
    });
  }
}

export function staticAttr(el: HTMLElement, name: string, value: unknown): void {
  applyAttr(el, name, value);
}

function applyAttr(el: HTMLElement, name: string, value: unknown): void {
  if (name === 'style') {
    applyStyle(el, value);
  } else if (DOM_PROPERTIES.has(name)) {
    (el as any)[name] = value;
  } else if (value === false || value == null) {
    el.removeAttribute(name);
  } else if (value === true) {
    el.setAttribute(name, '');
  } else {
    el.setAttribute(name, typeof value === 'string' ? value : String(value));
  }
}
