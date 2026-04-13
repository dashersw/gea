import { defineConfig } from 'vitepress'
import llmstxt, { copyOrDownloadAsMarkdownButtons } from 'vitepress-plugin-llms'

export default defineConfig({
  vite: {
    plugins: [llmstxt() as any],
  },
  markdown: {
    config(md) {
      md.use(copyOrDownloadAsMarkdownButtons)
    },
  },
  title: 'Gea',
  description: 'A compiler-first reactive JavaScript UI framework with compile-time JSX and proxy-based stores.',
  base: '/docs/',
  outDir: '../website/docs',
  head: [
    [
      'link',
      {
        rel: 'preconnect',
        href: 'https://fonts.googleapis.com',
      },
    ],
    [
      'link',
      {
        rel: 'preconnect',
        href: 'https://fonts.gstatic.com',
        crossorigin: '',
      },
    ],
    [
      'link',
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Audiowide&family=Exo+2:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap',
      },
    ],
  ],

  themeConfig: {
    logo: { src: '/logo.png', alt: 'Gea' },
    siteTitle: false,
    logoLink: '/',

    nav: [
      { text: 'Guide', link: '/getting-started' },
      { text: 'API Reference', link: '/api-reference' },
      { text: 'Benchmarks', link: 'https://geajs.com/benchmark-report.html' },
      {
        text: 'Links',
        items: [
          { text: 'npm', link: 'https://www.npmjs.com/package/@geajs/core' },
          { text: 'Changelog', link: 'https://github.com/dashersw/gea/releases' },
        ],
      },
    ],

    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'What is Gea?', link: '/README' },
          { text: 'Philosophy', link: '/philosophy' },
          { text: 'Getting Started', link: '/getting-started' },
          { text: 'Browser Usage (No Build Step)', link: '/browser-usage' },
        ],
      },
      {
        text: 'Core Concepts',
        items: [
          { text: 'Stores', link: '/core-concepts/stores' },
          { text: 'Components', link: '/core-concepts/components' },
          { text: 'JSX Syntax', link: '/core-concepts/jsx-syntax' },
          { text: 'Rendering', link: '/core-concepts/rendering' },
          { text: 'Computed Values', link: '/core-concepts/computed-values' },
        ],
      },
      {
        text: 'Gea Router',
        items: [
          { text: 'Overview', link: '/gea-router/overview' },
          { text: 'Getting Started', link: '/gea-router/getting-started' },
          { text: 'Route Configuration', link: '/gea-router/route-config' },
          { text: 'Navigation', link: '/gea-router/navigation' },
          { text: 'Layouts', link: '/gea-router/layouts' },
          { text: 'Guards', link: '/gea-router/guards' },
          { text: 'Type Safety', link: '/gea-router/type-safety' },
          { text: 'Utilities', link: '/gea-router/utilities' },
        ],
      },
      {
        text: 'Gea UI',
        items: [
          { text: 'Overview', link: '/gea-ui/overview' },
          { text: 'Getting Started', link: '/gea-ui/getting-started' },
          { text: 'Styled Components', link: '/gea-ui/styled-components' },
          { text: 'Interactive Components', link: '/gea-ui/interactive-components' },
          { text: 'Drag and Drop', link: '/gea-ui/drag-and-drop' },
          { text: 'Theming', link: '/gea-ui/theming' },
          { text: 'Architecture', link: '/gea-ui/architecture' },
          { text: 'Component Showcase', link: '/gea-ui/showcase' },
        ],
      },
      {
        text: 'Gea Mobile',
        items: [
          { text: 'Overview', link: '/gea-mobile/overview' },
          { text: 'View', link: '/gea-mobile/view' },
          { text: 'ViewManager', link: '/gea-mobile/view-manager' },
          { text: 'Gestures', link: '/gea-mobile/gestures' },
          { text: 'Components', link: '/gea-mobile/components' },
        ],
      },
      {
        text: 'Tooling',
        items: [
          { text: 'Vite Plugin', link: '/tooling/vite-plugin' },
          { text: 'create-gea', link: '/tooling/create-gea' },
          { text: 'VS Code Extension', link: '/tooling/vscode-extension' },
        ],
      },
      {
        text: 'Comparison',
        items: [
          { text: 'React vs Gea', link: '/comparison/react-vs-gea' },
          { text: 'Vue vs Gea', link: '/comparison/vue-vs-gea' },
        ],
      },
      {
        text: 'Reference',
        items: [{ text: 'API Reference', link: '/api-reference' }],
      },
    ],

    socialLinks: [{ icon: 'github', link: 'https://github.com/dashersw/gea' }],

    search: {
      provider: 'local',
    },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2017-present Armagan Amcalar',
    },
  },
})
