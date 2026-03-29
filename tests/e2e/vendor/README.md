# E2E vendor assets

## `babel.min.js`

Pinned copy of `@babel/standalone` for [`examples/runtime-only-jsx`](../../examples/runtime-only-jsx). The Vite dev server serves it at `/vendor/babel.min.js` (see [`examples/shared/runtime-only-vite-plugin.ts`](../../examples/shared/runtime-only-vite-plugin.ts)).

To refresh after a version bump:

```bash
node scripts/fetch-e2e-babel-vendor.mjs
```

The version is defined in [`scripts/fetch-e2e-babel-vendor.mjs`](../../scripts/fetch-e2e-babel-vendor.mjs).
