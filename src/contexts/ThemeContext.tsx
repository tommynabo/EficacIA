import * as React from "react"

type Theme = "dark"

interface ThemeContextType {
  theme: Theme
  setTheme: (t: Theme) => void
}

export const ThemeContext = React.createContext<ThemeContextType>({
  theme: "dark",
  setTheme: () => {},
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Solo modo dark
  const theme = "dark"
  const setTheme = () => {}
  React.useEffect(() => {
    const root = document.documentElement
    root.classList.remove("light")
    root.classList.add("dark")
    localStorage.setItem("theme", theme)
  }, [])
  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => React.useContext(ThemeContext)
