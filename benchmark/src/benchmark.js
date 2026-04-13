import { Component } from 'gea'
import store from './store.ts'

export default class Benchmark extends Component {
  template() {
    return (
      <div class="container">
        <div class="jumbotron">
          <div class="row">
            <div class="col-md-6">
              <h1>Gea-keyed</h1>
            </div>
            <div class="col-md-6">
              <div class="row">
                <div class="col-sm-6 smallpad">
                  <button type="button" class="btn btn-primary btn-block" id="run" click={() => store.run()}>
                    Create 1,000 rows
                  </button>
                </div>
                <div class="col-sm-6 smallpad">
                  <button type="button" class="btn btn-primary btn-block" id="runlots" click={() => store.runLots()}>
                    Create 10,000 rows
                  </button>
                </div>
                <div class="col-sm-6 smallpad">
                  <button type="button" class="btn btn-primary btn-block" id="add" click={() => store.add()}>
                    Append 1,000 rows
                  </button>
                </div>
                <div class="col-sm-6 smallpad">
                  <button type="button" class="btn btn-primary btn-block" id="update" click={() => store.update()}>
                    Update every 10th row
                  </button>
                </div>
                <div class="col-sm-6 smallpad">
                  <button type="button" class="btn btn-primary btn-block" id="clear" click={() => store.clear()}>
                    Clear
                  </button>
                </div>
                <div class="col-sm-6 smallpad">
                  <button type="button" class="btn btn-primary btn-block" id="swaprows" click={() => store.swapRows()}>
                    Swap Rows
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <table class="table table-hover table-striped test-data">
          <tbody id="tbody">
            {store.data.map((item, index) => (
              <tr key={item.id} class={store.selected === item.id ? 'danger' : ''}>
                <td class="col-md-1">{item.id}</td>
                <td class="col-md-4">
                  <a click={() => store.select(item.id)}>{item.label}</a>
                </td>
                <td class="col-md-1">
                  <a click={() => store.remove(item.id)}>
                    <span class="glyphicon glyphicon-remove" aria-hidden="true"></span>
                  </a>
                </td>
                <td class="col-md-6"></td>
              </tr>
            ))}
          </tbody>
        </table>
        <span class="preloadicon glyphicon glyphicon-remove" aria-hidden="true"></span>
      </div>
    )
  }
}
