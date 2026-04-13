import { Component } from '@geajs/core'

export default class DeferredPage extends Component {
  template() {
    return (
      <div class="deferred-page">
        <h1>Deferred Streaming Demo</h1>
        <div id="deferred-fast" class="deferred-slot">
          Loading fast data...
        </div>
        <div id="deferred-slow" class="deferred-slot">
          Loading slow data...
        </div>
        <div id="deferred-fail" class="deferred-slot">
          Loading failing data...
        </div>
      </div>
    )
  }
}
