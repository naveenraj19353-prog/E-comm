import { useEffect } from "react";
import { themes } from "./tenant002";
import { useAppSelector } from "../../app/hooks";

interface Props {
  children: React.ReactNode;
}

const ThemeProvider = ({ children }: Props) => {
  const tenant = useAppSelector((state) => state.tenant.currentTenant);
  const slug = useAppSelector((state) => state.tenant.tenantSlug);
  const themeKey =
    tenant?.theme || tenant?.tenantId || slug || "DEFAULT";
  const theme =
    themes[themeKey as keyof typeof themes] ??
    themes[slug as keyof typeof themes] ??
    themes.DEFAULT;

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--primary", theme.colors.primary);
    root.style.setProperty("--secondary", theme.colors.secondary);
    root.style.setProperty("--background", theme.colors.background);
    root.style.setProperty("--surface", theme.colors.surface);
    root.style.setProperty("--border", theme.colors.border);
    root.style.setProperty("--text", theme.colors.textBlack);
    root.style.setProperty("--text-black", theme.colors.textBlack);
    root.style.setProperty("--text-white", theme.colors.textWhite);
    root.style.setProperty("--success", theme.colors.success);
    root.style.setProperty("--warning", theme.colors.warning);
    root.style.setProperty("--danger", theme.colors.danger);
  }, [theme]);

  return <>{children}</>;
};

export default ThemeProvider;
