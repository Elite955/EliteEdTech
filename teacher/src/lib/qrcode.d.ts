import type { ComponentPropsWithoutRef, ForwardRefExoticComponent, RefAttributes } from 'react'

interface QRCodeProps extends Omit<ComponentPropsWithoutRef<'svg'>, 'value'> {
  value: string
  size?: number
  bgColor?: string
  fgColor?: string
  level?: 'L' | 'M' | 'Q' | 'H'
  marginSize?: number
  title?: string
  includeMargin?: boolean
  imageSettings?: {
    src: string
    height?: number
    width?: number
    excavate?: boolean
    x?: number
    y?: number
  }
}

export const QRCodeSVG: ForwardRefExoticComponent<QRCodeProps & RefAttributes<SVGSVGElement>>
export const QRCodeCanvas: ForwardRefExoticComponent<QRCodeProps & RefAttributes<HTMLCanvasElement>>
