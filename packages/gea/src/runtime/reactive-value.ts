import type { Disposer } from './disposer'
import { bind } from './bind'

type InputLike = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement

export const reactiveValueRead = (
  el: InputLike,
  d: Disposer,
  root: any,
  pathOrGetter: readonly string[] | (() => unknown),
): void => {
  let controlled = false
  const apply = (v: unknown): void => {
    if (v === undefined && !controlled) return
    controlled = true
    const s = v == null ? '' : String(v)
    if (el.value !== s) el.value = s
  }
  bind(d, root, pathOrGetter, apply)
}

export const reactiveValue = (
  el: InputLike,
  d: Disposer,
  root: any,
  pathOrGetter: readonly string[] | (() => unknown),
  writeBack?: (v: string) => void,
): void => {
  reactiveValueRead(el, d, root, pathOrGetter)
  if (writeBack) {
    const onInput = (): void => {
      writeBack(el.value)
    }
    el.addEventListener('input', onInput)
    d.add(() => el.removeEventListener('input', onInput))
  }
}
