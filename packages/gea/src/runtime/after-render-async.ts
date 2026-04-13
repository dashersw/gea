export interface AfterRenderAsyncTarget {
  onAfterRenderAsync: () => void
}

export function scheduleAfterRenderAsync(target: AfterRenderAsyncTarget): void {
  const run = () => target.onAfterRenderAsync()
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(run)
  } else if (typeof queueMicrotask === 'function') {
    queueMicrotask(run)
  } else {
    setTimeout(run, 0)
  }
}
