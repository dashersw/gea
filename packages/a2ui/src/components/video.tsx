import { Component } from '@geajs/core'

interface VideoProps {
  url?: string
}

export default class Video extends Component<VideoProps> {
  template(props: VideoProps) {
    return <video class="a2ui-video" src={props.url} controls></video>
  }
}
