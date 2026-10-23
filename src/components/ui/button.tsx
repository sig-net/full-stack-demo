import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from 'cn'

/**
 * Variants follow the sig.network Figma button sets: `default` is BlueButton Hierarchy=Primary,
 * `secondary` is Secondary, `ghost` is Tertiary and `link` is Link. `pink` and `green` are the
 * PinkButton and GreenButton sets at Hierarchy=Primary. Sizes `sm`, `default`, `lg` and `xl` are
 * Size=sm, md, lg and xl.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-xs border border-transparent bg-clip-padding font-semibold whitespace-nowrap transition-all outline-none select-none focus-visible:border-input focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        default:
          'border-primary-foreground bg-primary text-primary-foreground hover:border-input hover:bg-primary-hover aria-expanded:border-input aria-expanded:bg-primary-hover',
        secondary:
          'border-input bg-card text-secondary-foreground hover:bg-muted aria-expanded:bg-muted',
        ghost:
          'rounded-md text-secondary-foreground hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground',
        destructive:
          'bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40',
        link: 'text-muted-foreground underline-offset-4 hover:underline',
        pink: 'border-pink-foreground bg-pink text-pink-foreground hover:border-input hover:bg-pink-hover aria-expanded:border-input aria-expanded:bg-pink-hover disabled:border-pink-disabled-foreground disabled:bg-pink-disabled disabled:text-pink-disabled-foreground disabled:opacity-100',
        green:
          'border-green-foreground bg-green text-green-foreground hover:border-input hover:bg-green-hover aria-expanded:border-input aria-expanded:bg-green-hover disabled:border-green-disabled-foreground disabled:bg-green-disabled disabled:text-green-disabled-foreground disabled:opacity-100',
      },
      size: {
        default: 'h-10 gap-1 px-3.5 text-sm',
        xs: "h-6 gap-1 px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: 'h-9 gap-1 px-2.75 text-sm',
        lg: 'h-11 gap-1.5 px-4 text-base',
        xl: 'h-12 gap-1.5 px-4.25 text-base',
        icon: 'size-10',
        'icon-xs': "size-6 [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': "size-7 [&_svg:not([class*='size-'])]:size-3.5",
        'icon-lg': 'size-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
