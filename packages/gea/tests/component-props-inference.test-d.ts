import type { JSX } from '../src/jsx-runtime'
import { Component } from '../src/runtime/component'
import { GEA_SET_PROPS } from '../src/runtime/internal-symbols'

class TypedComponent extends Component<{ title: string; count?: number; children?: JSX.Element }> {
  readProps() {
    const title: string = this.props.title
    const count: number | undefined = this.props.count
    const children: JSX.Element | undefined = this.props.children

    // @ts-expect-error title stays string-typed
    const badTitle: number = this.props.title
    // @ts-expect-error count does not accept arbitrary string values
    const badCount: string = this.props.count

    return { title, count, children, badTitle, badCount }
  }
}

class WithAnnotatedTemplate extends Component<{ id: string; name: string }> {
  template({ id, name }: this['props']) {
    const typedId: string = id
    const typedName: string = name

    // @ts-expect-error annotated destructured template props stay typed
    const badId: number = id

    return { typedId, typedName, badId }
  }
}

class WithPropsParameter extends Component<{ id: string; name: string }> {
  template(props: this['props']) {
    const typedId: string = props.id
    const typedName: string = props.name

    // @ts-expect-error annotated template props reject missing keys
    const missing = props.missing

    return { typedId, typedName, missing }
  }
}

const instance = new TypedComponent()
instance[GEA_SET_PROPS]({
  title: () => 'Issue title',
  count: () => 3,
})

const title: string = instance.props.title
const maybeCount: number | undefined = instance.props.count

// @ts-expect-error typed Component props should not become catch-all any
const missing = instance.props.missing

void title
void maybeCount
void missing
void WithAnnotatedTemplate
void WithPropsParameter
