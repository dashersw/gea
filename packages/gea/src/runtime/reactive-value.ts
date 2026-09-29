import type { Disposer } from './disposer'
import { bind } from './bind'

type InputLike = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement

export function reactiveValueRead(
  el: InputLike,
  d: Disposer,
  root: any,
  pathOrGetter: readonly string[] | (() => unknown),
): void {
  bind(d, root, pathOrGetter, valueWriter(el))
}

/** The write step of `reactiveValueRead`. Spread attributes reuse it per element. */
export function valueWriter(el: InputLike): (v: unknown) => void {
  let controlled = false
  return (v) => {
    if (v === undefined && !controlled) return
    controlled = true
    const s = v == null ? '' : String(v)
    if (el.value !== s) el.value = s
  }
}

export function reactiveValue(
  el: InputLike,
  d: Disposer,
  root: any,
  pathOrGetter: readonly string[] | (() => unknown),
  writeBack?: (v: string) => void,
): void {
  reactiveValueRead(el, d, root, pathOrGetter)
  if (writeBack) {
    const onInput = (): void => {
      writeBack(el.value)
    }
    el.addEventListener('input', onInput)
    d.add(() => el.removeEventListener('input', onInput))
  }
}
