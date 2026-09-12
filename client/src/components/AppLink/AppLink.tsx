import type { MouseEvent, ReactNode } from "react";
import { Link, type LinkProps, useLocation } from "react-router-dom";
import { isExternalHref } from "./appLink.utils";

type AppLinkProps = {
  to: string;
  children: ReactNode;
  className?: string;
} & Omit<LinkProps, "to">;

function scrollToHash(hash: string) {
  const id = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!id) {
    return;
  }
  const el = document.getElementById(id);
  if (!el) {
    return;
  }
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** Prefer React Router Link for in-app routes; keep native anchor for absolute URLs. */
export default function AppLink({
  to,
  children,
  className,
  onClick,
  ...rest
}: AppLinkProps) {
  const location = useLocation();

  if (isExternalHref(to)) {
    return (
      <a
        href={to}
        className={className}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClick as AppLinkProps["onClick"]}
      >
        {children}
      </a>
    );
  }

  const hashOnly = to.startsWith("#");
  const linkTo = hashOnly
    ? { pathname: location.pathname || "/", hash: to }
    : to;

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) {
      return;
    }
    if (hashOnly) {
      // Same-page hash: RR updates the URL but does not scroll reliably.
      event.preventDefault();
      window.history.pushState(null, "", `${location.pathname}${to}`);
      scrollToHash(to);
    }
  };

  return (
    <Link to={linkTo} className={className} onClick={handleClick} {...rest}>
      {children}
    </Link>
  );
}
