import type { JSX as ReactJSX } from 'react'
import { h } from './h'
import type { Component } from './runtime/component'

type GeaComponentConstructor<P = any> = new (...args: any[]) => Component<P>
type GeaFunctionComponent<P = any> = (props: P) => any

type BivariantHandler<E extends Event> = {
  bivarianceHack(event: E): void
}['bivarianceHack']

type ClassValue = string | number | false | null | undefined | ClassValue[] | Record<string, unknown>
type GeaInputEvent = InputEvent & {
  currentTarget: HTMLInputElement
  target: HTMLInputElement
}

type GeaEventAttributes = {
  click?: BivariantHandler<MouseEvent>
  dblclick?: BivariantHandler<MouseEvent>
  mousedown?: BivariantHandler<MouseEvent>
  mouseup?: BivariantHandler<MouseEvent>
  mouseover?: BivariantHandler<MouseEvent>
  mouseout?: BivariantHandler<MouseEvent>
  mousemove?: BivariantHandler<MouseEvent>
  mouseenter?: BivariantHandler<MouseEvent>
  mouseleave?: BivariantHandler<MouseEvent>
  contextmenu?: BivariantHandler<MouseEvent>
  drag?: BivariantHandler<DragEvent>
  dragend?: BivariantHandler<DragEvent>
  dragenter?: BivariantHandler<DragEvent>
  dragleave?: BivariantHandler<DragEvent>
  dragover?: BivariantHandler<DragEvent>
  dragstart?: BivariantHandler<DragEvent>
  drop?: BivariantHandler<DragEvent>
  input?: BivariantHandler<GeaInputEvent>
  change?: BivariantHandler<Event>
  submit?: BivariantHandler<SubmitEvent>
  reset?: BivariantHandler<Event>
  keydown?: BivariantHandler<KeyboardEvent>
  keyup?: BivariantHandler<KeyboardEvent>
  keypress?: BivariantHandler<KeyboardEvent>
  focus?: BivariantHandler<FocusEvent>
  blur?: BivariantHandler<FocusEvent>
  scroll?: BivariantHandler<Event>
  touchstart?: BivariantHandler<TouchEvent>
  touchmove?: BivariantHandler<TouchEvent>
  touchend?: BivariantHandler<TouchEvent>
  tap?: BivariantHandler<Event>
  longTap?: BivariantHandler<Event>
  swipeRight?: BivariantHandler<Event>
  swipeUp?: BivariantHandler<Event>
  swipeLeft?: BivariantHandler<Event>
  swipeDown?: BivariantHandler<Event>
  pointerdown?: BivariantHandler<PointerEvent>
  pointerup?: BivariantHandler<PointerEvent>
  pointermove?: BivariantHandler<PointerEvent>
  pointerenter?: BivariantHandler<PointerEvent>
  pointerleave?: BivariantHandler<PointerEvent>
  pointerover?: BivariantHandler<PointerEvent>
  pointerout?: BivariantHandler<PointerEvent>
  pointercancel?: BivariantHandler<PointerEvent>
  resize?: BivariantHandler<UIEvent>
  wheel?: BivariantHandler<WheelEvent>
  animationstart?: BivariantHandler<AnimationEvent>
  animationend?: BivariantHandler<AnimationEvent>
  animationiteration?: BivariantHandler<AnimationEvent>
  transitionstart?: BivariantHandler<TransitionEvent>
  transitionend?: BivariantHandler<TransitionEvent>
  transitionrun?: BivariantHandler<TransitionEvent>
  transitioncancel?: BivariantHandler<TransitionEvent>
}

type GeaElementProps<P> = Omit<P, 'className' | 'htmlFor' | 'ref'> &
  GeaEventAttributes & {
    class?: ClassValue
    for?: P extends { htmlFor?: infer F } ? F : string
    htmlFor?: P extends { htmlFor?: infer F } ? F : string
    ref?: any
  }

type GeaIntrinsicElements = {
  [K in keyof ReactJSX.IntrinsicElements]: GeaElementProps<ReactJSX.IntrinsicElements[K]>
}

export declare namespace JSX {
  export type Element = any
  export type ElementType = keyof IntrinsicElements | GeaFunctionComponent<any> | GeaComponentConstructor<any>
  export interface ElementClass extends Component<any> {}
  export interface ElementAttributesProperty {
    props: {}
  }
  export interface ElementChildrenAttribute {
    children: {}
  }
  export interface IntrinsicAttributes {
    key?: string | number
  }
  export interface IntrinsicClassAttributes<T> extends IntrinsicAttributes {
    ref?: T
  }
  export interface IntrinsicElements extends GeaIntrinsicElements {}
}

export function jsx(type: any, props: any, key?: string): any {
  const normalized = props == null ? {} : { ...props }
  const children = normalized.children
  delete normalized.children
  if (key !== undefined) normalized.key = key
  return Array.isArray(children) ? h(type, normalized, ...children) : h(type, normalized, children)
}

export const jsxs = jsx

export function Fragment(props: { children?: any }): any {
  const children = props?.children
  return Array.isArray(children) ? children.join('') : (children ?? '')
}
