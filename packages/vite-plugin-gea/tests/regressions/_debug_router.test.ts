import { describe, it } from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, loadComponentUnseeded } from '../helpers/compile'
import { readExampleFile } from '../helpers/example-paths'

it('debug router', async () => {
  const restoreDom = installDom('http://localhost/')
  try {
    const Component = await loadComponentUnseeded()
    const seed = `test-debug-${Date.now()}`
    const { createRouter, Link, RouterView } = await import(`../../../gea/src/router/index.ts?${seed}`)
    const router = createRouter({})

    console.log('router type:', typeof router)
    console.log('router.observe:', typeof router.observe)
    console.log('router.path:', router.path)
    console.log('router.__path:', router.__path)

    const Home = await compileJsxComponent(
      readExampleFile('router-simple/src/views/Home.tsx'),
      '/virtual/examples/router-simple/Home.jsx',
      'Home',
      { Component },
    )

    const App = await compileJsxComponent(
      readExampleFile('router-simple/src/App.tsx'),
      '/virtual/examples/router-simple/App.jsx',
      'App',
      { Component, router, Link, RouterView, Home, About: Home, UserProfile: Home, NotFound: Home },
    )

    console.log('App:', App)
    console.log('RouterView:', RouterView)

    const root = document.createElement('div')
    document.body.appendChild(root)
    const app = new App()
    app.render(root)
    await flushMicrotasks()

    console.log('router.path after render:', router.path)
    console.log('root HTML (first 500):', root.innerHTML.slice(0, 500))
    console.log('view h1:', root.querySelector('.view h1')?.textContent)
    console.log('nav a count:', root.querySelectorAll('.nav a').length)

    const item = router.getComponentAtDepth(0)
    console.log('componentAtDepth(0):', item ? 'exists' : 'null', item?.component?.name)

    app.dispose?.()
    router.dispose?.()
    root.remove()
  } finally {
    restoreDom()
  }
})
