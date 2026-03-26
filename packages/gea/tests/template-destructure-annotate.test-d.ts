import Component from '../src/lib/base/component'

class AnnotatedDestructure extends Component {
  declare props: { id: string; name: string }

  template({ id, name }: this['props']) {
    const _a: string = id
    const _b: string = name
    return ''
  }
}

void AnnotatedDestructure
