import { Component } from '@geajs/core'
import type { MouseEventHandler, ReactNode } from 'react'
import { cn } from '../utils/cn'

export type ButtonVariant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
export type ButtonSize = 'default' | 'sm' | 'lg' | 'icon'

export interface ButtonProps {
  variant?: ButtonVariant | (string & {})
  size?: ButtonSize | (string & {})
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  class?: string
  click?: MouseEventHandler<HTMLButtonElement>
  onClick?: MouseEventHandler<HTMLButtonElement>
  children?: ReactNode
}

const variants: Record<string, string> = {
  default: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90',
  destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
  outline: 'border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground',
  secondary: 'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80',
  ghost: 'hover:bg-accent hover:text-accent-foreground',
  link: 'text-primary underline-offset-4 hover:underline',
}

const sizes: Record<string, string> = {
  default: 'h-9 px-4 py-2',
  sm: 'h-8 rounded-md px-3 text-xs',
  lg: 'h-10 rounded-md px-8',
  icon: 'h-9 w-9',
}

export default class Button extends Component<ButtonProps> {
  template(props: ButtonProps) {
    const variant = variants[props.variant || 'default'] || variants.default
    const size = sizes[props.size || 'default'] || sizes.default
    const handleClick = props.click || props.onClick

    return (
      <button
        class={cn(
          'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
          variant,
          size,
          props.class,
        )}
        type={props.type || 'button'}
        disabled={props.disabled}
        click={(e: any) => handleClick?.(e)}
      >
        {props.children}
      </button>
    )
  }
}
