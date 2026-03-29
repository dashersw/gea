import { transformGeaSourceToEvalBody } from './helpers/compile'

const source = `import { Component } from '@geajs/core'
export default class DynamicRootId extends Component {
  template(props: any) {
    return <div id={props.myId}>Content</div>
  }
}`

async function main() {
  const body = await transformGeaSourceToEvalBody(source, '/virtual/DynamicRootId.jsx')
  body.split('\n').forEach((l, i) => console.log(i + 1 + '| ' + l))
}
main()
