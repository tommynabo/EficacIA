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
          "border-transparent bg-blue-500/20 text-blue-400": variant === "default",
          "border-transparent bg-slate-800 text-slate-300": variant === "secondary",
          "border-transparent bg-red-500/20 text-red-400": variant === "destructive",
          "border-transparent bg-emerald-500/20 text-emerald-400": variant === "success",
          "text-slate-300 border-slate-700": variant === "outline",
        },
        className
      )}
      {...props}
    />
  )
}

export { Badge }
