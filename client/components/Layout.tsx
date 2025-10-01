import { Link, NavLink, useLocation } from "react-router-dom";
import { PropsWithChildren } from "react";
import { cn } from "@/lib/utils";

export default function Layout({ children }: PropsWithChildren) {
  const location = useLocation();
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-14 items-center justify-between">
          <Link to="/" className="font-extrabold tracking-tight text-xl">
            <span className="bg-gradient-to-r from-primary to-cyan-500 bg-clip-text text-transparent">
              ATD Sonata
            </span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <NavItem to="/" current={location.pathname === "/"}>
              Home
            </NavItem>
            <NavItem
              to="/files"
              current={location.pathname.startsWith("/files")}
            >
              Upload & Files
            </NavItem>
            <NavItem
              to="/whatsapp"
              current={location.pathname.startsWith("/whatsapp")}
            >
              WhatsApp
            </NavItem>
          </nav>
        </div>
      </header>
      <main>{children}</main>
      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        <div className="container mx-auto">
          © {new Date().getFullYear()} ATD Sonata
        </div>
      </footer>
    </div>
  );
}

function NavItem({
  to,
  current,
  children,
}: {
  to: string;
  current: boolean;
  children: React.ReactNode;
}) {
  return (
    <NavLink
      to={to}
      className={cn(
        "rounded-md px-3 py-2 font-medium transition-colors",
        current
          ? "bg-primary text-primary-foreground"
          : "text-foreground/80 hover:text-foreground hover:bg-muted",
      )}
    >
      {children}
    </NavLink>
  );
}
