import * as React from "react"
import { cn } from "@/src/lib/utils"

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
  size?: "default" | "sm" | "lg" | "icon"
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", asChild = false, ...props }, ref) => {
    const baseStyles = cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
      {
        "bg-blue-500 text-white hover:bg-blue-600": variant === "default",
        "bg-red-500 text-white hover:bg-red-600": variant === "destructive",
        "border border-slate-700 bg-transparent hover:bg-slate-800 text-slate-100": variant === "outline",
        "bg-slate-800 text-slate-100 hover:bg-slate-700": variant === "secondary",
        "hover:bg-slate-800 hover:text-slate-100 text-slate-300": variant === "ghost",
        "text-blue-500 underline-offset-4 hover:underline": variant === "link",
        "h-10 px-4 py-2": size === "default",
        "h-9 rounded-md px-3": size === "sm",
        "h-11 rounded-md px-8": size === "lg",
        "h-10 w-10": size === "icon",
      },
      className
    )

    // When asChild is true, return a wrapper div that applies the button styles
    // This is typically used with <Button asChild><Link>...</Link></Button>
    if (asChild) {
      return (
        <div className={baseStyles} {...props}>
          {props.children}
        </div>
      )
    }

    return (
      <button
        ref={ref}
        className={baseStyles}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }
