import * as fileUpload from '@zag-js/file-upload'
import { normalizeProps } from '@zag-js/vanilla'
import { type ClassValue } from 'clsx'
import ZagComponent from '../primitives/zag-component'
import { cn } from '../utils/cn'
import { JSXNode } from '../types'

export interface FileUploadTranslations {
  dropzone: string
  dropzoneButton: string
  dropzoneActive: string
  deleteFile: (file: File) => string
  clearAllButton: string
}

export interface FileUploadProps {
  accept?: string | string[] | Record<string, string[]>
  maxFiles?: number
  minFileSize?: number
  maxFileSize?: number
  allowDrop?: boolean
  preventDocumentDrop?: boolean
  name?: string
  class?: ClassValue
  label?: JSXNode
  disabled?: boolean
  formatFileSize?: (bytes: number) => string
  onFileChange?: (details: { acceptedFiles: File[]; rejectedFiles: { file: File; errors: string[] }[] }) => void
  translations?: Partial<FileUploadTranslations>
}

export default class FileUpload extends ZagComponent<FileUploadProps> {
  static readonly FILE_SIZE_FORMATTER = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  })

  declare acceptedFiles: File[]
  declare rejectedFiles: any[]

  readonly _translations: FileUploadTranslations = {
    dropzone: 'Drag and drop files here',
    dropzoneButton: 'Choose Files',
    dropzoneActive: 'Drop your files here',
    deleteFile: (file: File) => `Remove file ${file.name}`,
    clearAllButton: 'Clear all',
  }

  isDraggingIntoPage = false

  _dragEnterListener = (ev: DragEvent) => {
    if (!this.isDraggingIntoPage && ev.dataTransfer?.types.includes('Files')) {
      this.isDraggingIntoPage = true
    }
  }

  _dragLeaveListener = (ev: DragEvent) => {
    if (this.isDraggingIntoPage && !ev.relatedTarget) {
      this.isDraggingIntoPage = false
    }
  }

  _dragEndListener = () => {
    this.isDraggingIntoPage = false
  }

  created(props: FileUploadProps) {
    super.created?.(props)

    document.addEventListener('dragenter', this._dragEnterListener)
    document.addEventListener('dragleave', this._dragLeaveListener)
    document.addEventListener('drop', this._dragEndListener)
    document.addEventListener('dragend', this._dragEndListener)
  }

  dispose(): void {
    document.removeEventListener('dragenter', this._dragEnterListener)
    document.removeEventListener('dragleave', this._dragLeaveListener)
    document.removeEventListener('drop', this._dragEndListener)
    document.removeEventListener('dragend', this._dragEndListener)

    super.dispose()
  }

  getTranslations({ translations }: FileUploadProps): FileUploadTranslations {
    return {
      dropzone: translations?.dropzone ?? this._translations.dropzone,
      dropzoneButton: translations?.dropzoneButton ?? this._translations.dropzoneButton,
      dropzoneActive: translations?.dropzoneActive ?? this._translations.dropzoneActive,
      deleteFile: translations?.deleteFile ?? this._translations.deleteFile,
      clearAllButton: translations?.clearAllButton ?? this._translations.clearAllButton,
    }
  }

  createMachine(_props: FileUploadProps): any {
    return fileUpload.machine
  }

  getMachineProps(props: FileUploadProps): fileUpload.Props {
    const t = this.getTranslations(props)
    return {
      id: this.id,
      disabled: props.disabled,
      name: props.name,
      // undefined produces accept="[object Object]"
      accept: props.accept ?? [],
      maxFiles: props.maxFiles,
      minFileSize: props.minFileSize,
      maxFileSize: props.maxFileSize,
      allowDrop: props.allowDrop ?? true,
      preventDocumentDrop: props.preventDocumentDrop ?? true,
      onFileChange: (details: fileUpload.FileChangeDetails) => {
        this.acceptedFiles = details.acceptedFiles
        this.rejectedFiles = details.rejectedFiles
        this.isDraggingIntoPage = false
        props.onFileChange?.(details)
      },
      translations: {
        dropzone: t.dropzone,
        deleteFile: t.deleteFile,
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
      '[data-part="item-group"]': 'getItemGroupProps',
      '[data-part="item"]': (api: fileUpload.Api, el: HTMLElement) => {
        const file = this.getFileByItemEl(el)
        return file ? api.getItemProps({ file }) : {}
      },
      '[data-part="item-name"]': (api: fileUpload.Api, el: HTMLElement) => {
        const file = this.getFileByItemEl(el)
        return file ? api.getItemNameProps({ file }) : {}
      },
      '[data-part="item-size-text"]': (api: fileUpload.Api, el: HTMLElement) => {
        const file = this.getFileByItemEl(el)
        return file ? api.getItemSizeTextProps({ file }) : {}
      },
      '[data-part="item-delete-trigger"]': (api: fileUpload.Api, el: HTMLElement) => {
        const file = this.getFileByItemEl(el)
        return file ? api.getItemDeleteTriggerProps({ file }) : {}
      },
      '[data-part="clear-trigger"]': 'getClearTriggerProps',
    }
  }

  syncState(api: fileUpload.Api) {
    this.acceptedFiles = api.acceptedFiles
    this.rejectedFiles = api.rejectedFiles
  }

  getFileByItemEl(el: HTMLElement) {
    const itemEl = el.closest<HTMLElement>('[data-part="item"]')
    const intIndex = parseInt(itemEl?.dataset.itemIndex ?? '', 10)
    return Number.isNaN(intIndex) ? undefined : (this.acceptedFiles || [])[intIndex]
  }

  formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB']

    let value = bytes
    let unitIndex = 0

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024
      unitIndex++
    }

    return `${FileUpload.FILE_SIZE_FORMATTER.format(value)} ${units[unitIndex]}`
  }

  template(props: FileUploadProps) {
    const t = this.getTranslations(props)
    const isDropzoneActive = props.allowDrop !== false && !props.disabled && this.isDraggingIntoPage

    return (
      <div data-part="root" class={cn(props.class, 'data-disabled:opacity-60')}>
        {props.label && (
          <label data-part="label" class="file-upload-label text-sm font-medium mb-2 block">
            {props.label}
          </label>
        )}
        <div
          data-part="dropzone"
          data-dropzone-active={isDropzoneActive}
          class="file-upload-dropzone group relative rounded-lg border-2 border-dashed border-muted-foreground/25 p-8 hover:not-data-disabled:border-muted-foreground/50 motion-reduce:data-dropzone-active:not-data-dragging:border-muted-foreground/50 data-dragging:border-primary transition-colors"
        >
          <div
            class="flex flex-col items-center justify-center text-center transition-opacity motion-safe:group-data-[dropzone-active=true]:opacity-0 motion-safe:group-data-[dropzone-active=true]:pointer-events-none"
            aria-hidden={isDropzoneActive}
          >
            <p class="text-sm text-muted-foreground mb-2">{t.dropzone}</p>
            <button
              data-part="trigger"
              class="file-upload-trigger inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:not-disabled:bg-primary/90"
            >
              {t.dropzoneButton}
            </button>
          </div>

          <div
            class="absolute inset-0 flex items-center justify-center text-center opacity-0 pointer-events-none transition-opacity motion-safe:group-data-[dropzone-active=true]:opacity-100 motion-safe:group-data-[dropzone-active=true]:pointer-events-auto"
            aria-hidden={!isDropzoneActive}
          >
            <p class="text-sm text-foreground">{t.dropzoneActive}</p>
          </div>
        </div>
        <input data-part="hidden-input" class="sr-only" />
        {(this.acceptedFiles || []).length > 0 && (
          <div data-part="item-group" class="file-upload-file-list mt-3 space-y-1">
            {(this.acceptedFiles || []).map((file: File, index) => (
              <div
                key={`${index}`}
                data-part="item"
                data-item-index={index}
                class="flex items-center justify-between gap-1 rounded-md border px-3 py-2 text-sm"
              >
                <span data-part="item-name" class="truncate grow" title={file.name}>
                  {file.name}
                </span>
                <span data-part="item-size-text" class="text-muted-foreground whitespace-nowrap">
                  {props.formatFileSize ? props.formatFileSize(file.size) : this.formatFileSize(file.size)}
                </span>
                <button
                  data-part="item-delete-trigger"
                  class="text-muted-foreground hover:text-foreground"
                  title={t.deleteFile(file)}
                >
                  &#x2715;
                </button>
              </div>
            ))}
            <button
              data-part="clear-trigger"
              class="file-upload-clear text-xs text-muted-foreground hover:not-disabled:text-foreground mt-1"
            >
              {t.clearAllButton}
            </button>
          </div>
        )}
      </div>
    )
  }
}
