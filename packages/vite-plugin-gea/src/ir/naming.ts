/**
 * Centralized naming registry.
 *
 * All generated method/variable/id names are computed here.
 * Both the analyzer (to populate the IR) and the codegen (to emit methods)
 * call the same functions — one place to change if conventions evolve.
 */

import { pascalToKebab } from '../utils/html.ts'

export function bindingSuffix(index: number): string {
  return `b${index}`
}

export function getObserveMethodName(storeVar: string, pathParts: string[]): string {
  const parts = [storeVar, ...pathParts].map((p) => p.replace(/\*/g, 'wildcard'))
  return `__observe_${parts.join('_')}`
}

export function buildObserveKey(storeVar: string | undefined, pathParts: string[]): string {
  return JSON.stringify(storeVar ? [storeVar, ...pathParts] : pathParts)
}

export function createItemMethodName(pathParts: string[]): string {
  const name = pathParts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('')
  return `create${name}Item`
}

export function renderItemMethodName(pathParts: string[]): string {
  const name = pathParts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('')
  return `render${name}Item`
}

export function patchItemMethodName(pathParts: string[]): string {
  const name = pathParts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('')
  return `patch${name}Item`
}

export function childInstanceName(className: string, index: number): string {
  const base = `_${className.charAt(0).toLowerCase()}${className.slice(1)}`
  return index === 0 ? base : `${base}${index + 1}`
}

export function lazyBackingField(instanceVar: string): string {
  return `__lazy${instanceVar}`
}

export function buildPropsMethodName(instanceVar: string): string {
  return `__buildProps${instanceVar}`
}

export function itemPropsMethodName(pathParts: string[]): string {
  const name = pathParts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('')
  return `__itemProps_${name.charAt(0).toLowerCase()}${name.slice(1)}`
}

export function refreshItemsMethodName(pathParts: string[]): string {
  const name = pathParts.join('_')
  return `__refresh${name.charAt(0).toUpperCase()}${name.slice(1)}Items`
}

export function condSlotId(index: number): string {
  return `c${index}`
}

export function refId(index: number): string {
  return `ref${index}`
}

export function eventMethodName(eventType: string, index: number): string {
  return `__event_${eventType}_${index}`
}

export function tagToKebab(className: string): string {
  return pascalToKebab(className)
}

export function pathPartsToString(parts: string[]): string {
  return parts.join('.')
}

/** Normalize path parts — remove empty strings, trim whitespace. */
export function normalizePathParts(parts: string[]): string[] {
  return parts.filter((p) => p.length > 0).map((p) => p.trim())
}
