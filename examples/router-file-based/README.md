# router-file-based

Demonstrates **file-based routing** in Gea using `router.setPath('./pages')`.

## Pages structure

```
src/pages/
  layout.tsx            # root layout — nav bar + <Outlet />
  page.tsx              # /
  about/page.tsx        # /about
  blog/page.tsx         # /blog
  blog/[slug]/page.tsx  # /blog/:slug  (dynamic)
  users/page.tsx        # /users
  users/[id]/page.tsx   # /users/:id   (dynamic)
  [...all]/page.tsx     # *            (catch-all 404)
```

## How it works

`main.ts` calls `router.setPath('./pages')` once. The `@geajs/vite-plugin` transforms this at
build time into `import.meta.glob` calls — layouts are loaded eagerly, pages are lazy-loaded.

## Run

```bash
npx vite dev --port 5188
```
