"use client";

import { ThemeProvider } from "@/contexts/ThemeContext";

export function ThemeProviderWrapper({
    children,
}: {
    children: React.ReactNode;
}) {
    return <ThemeProvider>{children}</ThemeProvider>;
}
