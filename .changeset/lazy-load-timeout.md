---
"@geajs/core": patch
---

### @geajs/core (patch)

- **Lazy component load timeout**: `resolveLazy` now accepts a `timeout` parameter (default `10000`ms). Each load attempt is raced against the timeout, preventing the router from hanging indefinitely on a stalled network request. A timeout counts as a failure and triggers the existing retry logic with exponential backoff.
