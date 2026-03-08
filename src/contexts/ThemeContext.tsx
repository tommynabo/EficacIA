import * as React from "react"

type Theme = "dark" | "light"

interface ThemeContextType {
  theme: Theme
  setTheme: (t: Theme) => void
}

export const ThemeContext = React.createContext<ThemeContextType>({
  theme: "dark",
  setTheme: () => {},
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>(() => {
    // If the user has manually set a preference, honour it
    const stored = localStorage.getItem("theme") as Theme | null
    if (stored === "light" || stored === "dark") return stored
    // Otherwise follow the OS preference
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  })

  React.useEffect(() => {
    const root = document.documentElement
    root.classList.remove("light", "dark")
    if (theme === "light") root.classList.add("light")
    localStorage.setItem("theme", theme)
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme: setThemeState }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => React.useContext(ThemeContext)
