import { Component } from 'gea'
import store from './store.ts'

function Button({ id, text, click }) {
  return (
    <div class="col-sm-6 smallpad">
      <button type="button" class="btn btn-primary btn-block" id={id} click={click}>
        {text}
      </button>
    </div>
  )
}

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
                <Button id="run" text="Create 1,000 rows" click={() => store.run()} />
                <Button id="runlots" text="Create 10,000 rows" click={() => store.runLots()} />
                <Button id="add" text="Append 1,000 rows" click={() => store.add()} />
                <Button id="update" text="Update every 10th row" click={() => store.update()} />
                <Button id="clear" text="Clear" click={() => store.clear()} />
                <Button id="swaprows" text="Swap Rows" click={() => store.swapRows()} />
              </div>
            </div>
          </div>
        </div>
        <table class="table table-hover table-striped test-data">
          <tbody>
            {store.data.map((item, index) => (
              <tr key={item.id} class={store.selected === item.id ? 'danger' : ''}>
                <td class="col-md-1">{item.id}</td>
                <td class="col-md-4">
                  <a click={() => store.select(item.id)}>{item.label}</a>
                </td>
                <td class="col-md-1">
                  <a click={() => store.remove(index)}>
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
