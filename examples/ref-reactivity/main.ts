import InputSection from './input-section'

const app = document.getElementById('app')
if (!app) throw new Error('App root element not found')

const view = new InputSection()
view.render(app)
