import { useEffect } from "react";
import { themes } from "./tenant002";
import { useAppSelector } from "../../app/hooks";

interface Props {
  children: React.ReactNode;
}

const ThemeProvider = ({ children }: Props) => {
  const tenantId = useAppSelector((state) => state.tenant.tenantSlug);

  const theme = themes[tenantId as keyof typeof themes] ?? themes.DEFAULT;
console.log(theme)
  useEffect(() => {
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
      theme.colors.textWhite
    );

    document.documentElement.style.setProperty(
      "--border",
      theme.colors.border ?? "#e5e7eb"
    );
  }, [theme]);

  return <>{children}</>;
};

export default ThemeProvider;