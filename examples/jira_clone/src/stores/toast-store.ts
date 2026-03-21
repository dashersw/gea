import { ToastStore } from '@geajs/ui'

/** Thin adapter so call sites keep `toastStore.success(title)` / `toastStore.error(err)`. */
const toastStore = {
  success(title: string) {
    ToastStore.success({ title })
  },
  error(err: unknown) {
    ToastStore.error({
      title: 'Error',
      description: typeof err === 'string' ? err : (err as Error)?.message || String(err),
    })
  },
}

export default toastStore
