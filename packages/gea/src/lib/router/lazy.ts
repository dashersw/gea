export async function resolveLazy(
  loader: () => Promise<any>,
  retries = 3,
  delay = 1000,
  timeout = 10000,
): Promise<any> {
  let lastError: unknown

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      let timeoutId: ReturnType<typeof setTimeout>
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error(`[gea] Lazy component load timed out after ${timeout}ms`)),
          timeout,
        )
      })
      const mod = await Promise.race([loader(), timeoutPromise])
      clearTimeout(timeoutId!)
      return mod && typeof mod === 'object' && 'default' in mod ? mod.default : mod
    } catch (err) {
      lastError = err
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, delay * 2 ** attempt))
      }
    }
  }

  throw lastError
}
