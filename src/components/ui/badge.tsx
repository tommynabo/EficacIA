import * as React from "react"
import { cn } from "@/src/lib/utils"

export interface BadgeProps extends React.ComponentProps<"div"> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "success"
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        {
          // Default: Mejor contraste en light
          "border-transparent bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400": variant === "default",
          // Secondary: Mejor contraste en light
          "border-transparent bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-300": variant === "secondary",
          // Destructive: Mejor contraste en light
          "border-transparent bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400": variant === "destructive",
          // Success: Mejor contraste en light
          "border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400": variant === "success",
          // Outline: Mejor contraste en light
          "text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 bg-transparent": variant === "outline",
        },
        className
      )}
      {...props}
    />
  )
}

export { Badge }
