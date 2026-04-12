export async function resolveLazy(loader: () => Promise<any>, retries = 3, delay = 1000): Promise<any> {
  let lastError: unknown

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const mod = await loader()
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
