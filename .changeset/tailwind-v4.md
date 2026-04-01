---
"@geajs/ui": minor
---

### @geajs/ui (minor)

- **Tailwind CSS v4**: Upgraded from Tailwind CSS v3 to v4. The CSS-based configuration system replaces the old JavaScript preset.
- Migration steps:
  1. **Update dependencies**
    ```bash
    npm install -D tailwindcss@4 @tailwindcss/vite
    npm uninstall autoprefixer postcss
    ```

  2. **Update `vite.config.ts`** — add `@tailwindcss/vite` as a plugin and remove any inline PostCSS Tailwind config
    ```ts
    // vite.config.ts
    import tailwindcss from '@tailwindcss/vite'

    export default defineConfig({
      plugins: [tailwindcss()],
    })
    ```

  3. **Remove the old `@geajs/ui` preset/PostCSS wiring** — delete `postcss.config.js` if it only existed for Tailwind v3, and only remove `tailwind.config.js` if it contained no project-specific configuration

  4. **Remove `@tailwind` directives** from any CSS files you own (e.g. `@tailwind base; @tailwind components; @tailwind utilities;`). You don't have to `@import "tailwindcss";` in your own CSS, just make sure the theme file is imported first.
    ```ts
    // main.ts
    import '@geajs/ui/style.css'
    import './style.css' 
    ```

  5. **Remove manual CSS resets** — if your project has a global reset like `* { margin: 0; padding: 0; }` outside a CSS layer, it will silently override Tailwind v4 utilities. In v4, all utilities live inside `@layer utilities`, and unlayered styles always win over layered styles regardless of specificity. Tailwind v4's Preflight already handles these resets inside `@layer base`, so the manual reset is redundant and should be removed
    ```css
    /* Remove this — Tailwind v4 Preflight already does it */
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    ```

  6. **Check [Tailwind CSS upgrade guide](https://tailwindcss.com/docs/upgrade-guide#changes-from-v3)** for needed changes in your custom components
