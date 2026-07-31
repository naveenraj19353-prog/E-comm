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
      "--text",
      theme.colors.text
    );
  }, [theme]);

  return <>{children}</>;
};

export default ThemeProvider;