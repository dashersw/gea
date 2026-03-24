import { Component } from '@geajs/core'

export default class ErrorRenderPage extends Component {
  template(): string {
    throw new Error('Render explosion')
  }
}
