/**
 * Unit tests for runtime/mount.ts.
 *
 * Covers class-based, function-returning-Element, function-returning-Component,
 * and lazy (Promise-resolved) variants. Asserts the mounted element is attached
 * to the parent and that disposer cleanup detaches / disposes it.
 */

import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { installDom } from '../../../../tests/helpers/jsdom-setup'
import { mount } from '../../src/runtime/mount'
import { Component } from '../../src/runtime/component'
import { createDisposer } from '../../src/runtime/disposer'
import { GEA_CREATE_TEMPLATE, GEA_ELEMENT } from '../../src/runtime/symbols'

let teardown: () => void

class Greeter extends Component {
  [GEA_CREATE_TEMPLATE](_d: any): Node {
    const el = document.createElement('span')
    el.textContent = 'hi ' + (this.props.who ?? '?')
    ;(this as any)[GEA_ELEMENT] = el
    return el
  }
}

describe('mount', () => {
  beforeEach(() => {
    teardown = installDom()
  })
  afterEach(() => {
    teardown()
  })

  it('mounts a class Component and attaches its element to parent', () => {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const disposer = createDisposer()
    const inst = mount(Greeter, parent, { who: () => 'world' }, disposer) as Component
    assert.ok(inst instanceof Component)
    assert.equal(parent.querySelector('span')?.textContent, 'hi world')
  })

  it('disposer cleanup removes the class-mounted element', () => {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const disposer = createDisposer()
    mount(Greeter, parent, { who: () => 'x' }, disposer)
    assert.equal(parent.children.length, 1)
    disposer.dispose()
    assert.equal(parent.children.length, 0)
  })

  it('mounts a function returning an Element directly', () => {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const disposer = createDisposer()
    const fn = (props: any) => {
      const el = document.createElement('p')
      el.textContent = 'fn-' + props.label
      return el
    }
    const result = mount(fn, parent, { label: () => 'ok' }, disposer)
    assert.equal(result, null)
    assert.equal(parent.querySelector('p')?.textContent, 'fn-ok')
    disposer.dispose()
    assert.equal(parent.children.length, 0)
  })

  it('mounts a lazy Promise that resolves to a class component', async () => {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const disposer = createDisposer()
    const lazy = Promise.resolve(Greeter)
    const inst = (await mount(lazy, parent, { who: () => 'lazy' }, disposer)) as Component
    assert.ok(inst instanceof Component)
    assert.equal(parent.querySelector('span')?.textContent, 'hi lazy')
  })

  it('mounts a lazy Promise that resolves to an esm-module-like { default }', async () => {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const disposer = createDisposer()
    const lazy = Promise.resolve({ default: Greeter })
    const inst = (await mount(lazy, parent, { who: () => 'mod' }, disposer)) as Component
    assert.ok(inst instanceof Component)
    assert.equal(parent.querySelector('span')?.textContent, 'hi mod')
  })
})
