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
        // Default: Mejor contraste en light
        "bg-blue-600 text-white hover:bg-blue-700 shadow-sm": variant === "default",
        "bg-red-600 text-white hover:bg-red-700 shadow-sm": variant === "destructive",
        // Outline: Mejor hover y contraste en light
        "border border-slate-300 dark:border-slate-700 bg-transparent text-slate-700 dark:text-slate-100 hover:bg-blue-50 hover:border-blue-500 dark:hover:bg-slate-800/50 dark:hover:border-blue-500": variant === "outline",
        // Secondary: Mejor contraste y hover
        "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 hover:bg-blue-100 dark:hover:bg-slate-700 hover:text-blue-700": variant === "secondary",
        // Ghost: Mejor hover y contraste
        "bg-transparent text-slate-600 dark:text-slate-400 font-medium hover:bg-slate-200 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100": variant === "ghost",
        // Link: Mejor contraste
        "text-blue-600 dark:text-blue-500 underline-offset-4 hover:underline hover:text-blue-800 dark:hover:text-blue-300": variant === "link",
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
      const { children, ...rest } = props;
      return (
        <div className={baseStyles} {...(rest as any)}>
          {children}
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
