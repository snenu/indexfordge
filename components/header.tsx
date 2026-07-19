import Link from "next/link";
import { Logo } from "./logo";
import { MobileMenu } from "./mobile-menu";

export const Header = () => {
  return (
    <div className="fixed left-0 top-0 z-50 w-full border-b border-border/40 bg-background/85 py-4 backdrop-blur-md md:py-5">
      <header className="flex items-center justify-between container">
        <Link href="/">
          <Logo className="w-[132px] md:w-[154px]" />
        </Link>
        <nav className="flex max-lg:hidden absolute left-1/2 -translate-x-1/2 items-center justify-center gap-x-10">
          {[
            { name: "Designer", href: "/designer" },
            { name: "Gallery", href: "/gallery" },
            { name: "Creators", href: "/creators" },
            { name: "Sources", href: "/designer#sources" },
          ].map((item) => (
            <Link
              className="uppercase inline-block font-mono text-foreground/60 hover:text-foreground/100 duration-150 transition-colors ease-out"
              href={item.href}
              key={item.name}
            >
              {item.name}
            </Link>
          ))}
        </nav>
        <Link className="uppercase max-lg:hidden transition-colors ease-out duration-150 font-mono text-primary hover:text-primary/80" href="/designer">
          Build
        </Link>
        <MobileMenu />
      </header>
    </div>
  );
};
