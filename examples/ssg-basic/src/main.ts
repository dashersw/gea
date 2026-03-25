import { hydrate } from '@geajs/ssg'
import Counter from './views/Counter'
import LiveClock from './views/LiveClock'
import './styles.css'

if (!hydrate({ Counter, LiveClock })) {
  // Dev mode: no SSG content, render full app
  import('./App').then(({ default: App }) => {
    const root = document.getElementById('app')!
    root.innerHTML = ''
    new App().render(root)
  })
}
