import { installDom } from '../../../tests/helpers/jsdom-setup'

if (typeof globalThis.document === 'undefined') {
  installDom()
}

// Must come after the DOM exists: compiled templates call `document.createElement`
// at module scope when a leaf's static template is first cloned.
import './gea-loader'
