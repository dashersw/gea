import Component from '../src/lib/base/component'

class WithDestructured extends Component {
  declare props: { id: string; name: string }

  template({ id, name }) {
    const _a: string = id
    const _b: string = name
    return ''
  }
}

class WithIdent extends Component {
  declare props: { id: string; name: string }

  template(props) {
    const _a: string = props.id
    const _b: string = props.name
    return ''
  }
}

void WithDestructured
void WithIdent
