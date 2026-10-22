import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light" | "system";

interface ThemeContextType {
    theme: Theme;
    resolvedTheme: "dark" | "light";
    setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    // Client-only app: read the saved theme synchronously so the first render already uses it
    const [theme, setTheme] = useState<Theme>(() => {
        try {
            return (localStorage.getItem("theme") as Theme | null) || "system";
        } catch {
            return "system";
        }
    });
    const [resolvedTheme, setResolvedTheme] = useState<"dark" | "light">("dark");

    useEffect(() => {
        const root = document.documentElement;

        // Determine resolved theme
        let resolved: "dark" | "light";
        if (theme === "system") {
            resolved = window.matchMedia("(prefers-color-scheme: dark)").matches
                ? "dark"
                : "light";
        } else {
            resolved = theme;
        }

        setResolvedTheme(resolved);

        // Apply theme class
        root.classList.remove("light", "dark");
        root.classList.add(resolved);

        // Save to localStorage
        try {
            localStorage.setItem("theme", theme);
        } catch {
            // Storage unavailable (private mode); theme just won't persist
        }
    }, [theme]);

    // Listen for system theme changes
    useEffect(() => {
        if (theme !== "system") return;

        const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
        const handleChange = () => {
            const resolved = mediaQuery.matches ? "dark" : "light";
            setResolvedTheme(resolved);
            document.documentElement.classList.remove("light", "dark");
            document.documentElement.classList.add(resolved);
        };

        mediaQuery.addEventListener("change", handleChange);
        return () => mediaQuery.removeEventListener("change", handleChange);
    }, [theme]);

    return (
        <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error("useTheme must be used within a ThemeProvider");
    }
    return context;
}
