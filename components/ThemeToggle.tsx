import { DeviceDesktopIcon, MoonIcon, SunIcon } from "@primer/octicons-react";
import { useTheme } from "@/contexts/ThemeContext";

export function ThemeToggle() {
    const { theme, resolvedTheme, setTheme } = useTheme();

    const cycleTheme = () => {
        if (theme === "system") {
            setTheme("light");
        } else if (theme === "light") {
            setTheme("dark");
        } else {
            setTheme("system");
        }
    };

    const label = `Theme: ${theme}${theme === "system" ? ` (${resolvedTheme})` : ""}`;

    return (
        <button onClick={cycleTheme} className="btn btn-icon" title={label} aria-label={label}>
            {theme === "system" ? <DeviceDesktopIcon /> : theme === "light" ? <SunIcon /> : <MoonIcon />}
        </button>
    );
}
