import { useEffect } from "react";
import { useAppSelector } from "../../redux/hooks";
import { themes } from "../theme";

interface Props {
  children: React.ReactNode;
}

const ThemeProvider = ({ children }: Props) => {
  const tenantId = useAppSelector((state) => state.tenant.tenantId);

  const theme =
    themes[tenantId as keyof typeof themes] ?? themes.DEFAULT;

  useEffect(() => {
    // Sync the selected tenant palette with CSS custom properties so every component
    // can consume the same design tokens without hardcoded colors.
    document.documentElement.style.setProperty(
      "--primary",
      theme.colors.primary
    );

    document.documentElement.style.setProperty(
      "--secondary",
      theme.colors.secondary
    );

    document.documentElement.style.setProperty(
      "--background",
      theme.colors.background
    );

    document.documentElement.style.setProperty(
      "--surface",
      theme.colors.surface ?? "#ffffff"
    );

    document.documentElement.style.setProperty(
      "--text",
      theme.colors.text
    );

    document.documentElement.style.setProperty(
      "--border",
      theme.colors.border ?? "#e5e7eb"
    );
  }, [theme]);

  return <>{children}</>;
};

export default ThemeProvider;