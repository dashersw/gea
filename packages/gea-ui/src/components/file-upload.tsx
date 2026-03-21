import * as fileUpload from '@zag-js/file-upload'
import { normalizeProps } from '@zag-js/vanilla'
import ZagComponent from '../primitives/zag-component'

export default class FileUpload extends ZagComponent {
  declare acceptedFiles: File[]
  declare rejectedFiles: any[]

  createMachine(_props: any): any {
    return fileUpload.machine
  }

  getMachineProps(props: any) {
    return {
      id: this.id,
      accept: props.accept,
      maxFiles: props.maxFiles,
      maxFileSize: props.maxFileSize,
      minFileSize: props.minFileSize,
      multiple: props.multiple ?? false,
      disabled: props.disabled,
      allowDrop: props.allowDrop ?? true,
      name: props.name,
      onFileChange: (details: fileUpload.FileChangeDetails) => {
        this.acceptedFiles = details.acceptedFiles
        this.rejectedFiles = details.rejectedFiles
        props.onFileChange?.(details)
      },
    }
  }

  connectApi(service: any) {
    return fileUpload.connect(service, normalizeProps)
  }

  getSpreadMap() {
    return {
      '[data-part="root"]': 'getRootProps',
      '[data-part="label"]': 'getLabelProps',
      '[data-part="dropzone"]': 'getDropzoneProps',
      '[data-part="trigger"]': 'getTriggerProps',
      '[data-part="hidden-input"]': 'getHiddenInputProps',
      '[data-part="clear-trigger"]': 'getClearTriggerProps',
    }
  }

  syncState(api: any) {
    this.acceptedFiles = api.acceptedFiles
    this.rejectedFiles = api.rejectedFiles
  }

  template(props: any) {
    return (
      <div data-part="root" class={props.class || ''}>
        {props.label && (
          <label data-part="label" class="file-upload-label text-sm font-medium mb-2 block">
            {props.label}
          </label>
        )}
        <div
          data-part="dropzone"
          class="file-upload-dropzone flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 p-8 text-center hover:border-muted-foreground/50 transition-colors"
        >
          <p class="text-sm text-muted-foreground mb-2">Drag and drop files here</p>
          <button
            data-part="trigger"
            class="file-upload-trigger inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
          >
            Choose Files
          </button>
        </div>
        <input data-part="hidden-input" type="file" class="sr-only" />
        {this.acceptedFiles.length > 0 && (
          <div class="file-upload-file-list mt-3 space-y-1">
            {this.acceptedFiles.map((file: File) => (
              <div key={file.name} class="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <span>{file.name}</span>
              </div>
            ))}
            <button
              data-part="clear-trigger"
              class="file-upload-clear text-xs text-muted-foreground hover:text-foreground mt-1"
            >
              Clear all
            </button>
          </div>
        )}
      </div>
    )
  }
}
