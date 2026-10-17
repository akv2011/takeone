import { motion, useMotionValueEvent, useScroll } from "framer-motion";
import { useState } from "react";
import { Link } from "react-router-dom";
import { SignedIn, SignedOut } from "../lib/auth";
import { TakeOneWordmark } from "./TakeOneLogo";
import TakeOneUserButton from "./account/TakeOneUserButton";
import { authEnabled } from "../lib/convexApi";
import { button } from "../lib/ui";

const navLink = "text-sm font-medium text-ink2 transition-colors hover:text-ink";

export default function Header() {
  const showAuth = authEnabled && !import.meta.env.SSR;
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  useMotionValueEvent(scrollY, "change", y => setScrolled(y > 12));
  const start = <Link to="/create" className={button("primary", "sm")}>Start free</Link>;
  return (
    <motion.header
      className="sticky top-0 z-40 h-16 w-full px-5 sm:px-8 md:px-12"
      animate={{
        backgroundColor: scrolled ? "rgba(243,240,233,0.82)" : "rgba(243,240,233,0)",
        boxShadow: scrolled ? "0 1px 0 rgba(20,19,17,0.08)" : "0 1px 0 rgba(20,19,17,0)",
      }}
      transition={{ duration: 0.25 }}
      style={{ backdropFilter: scrolled ? "blur(14px)" : "none", WebkitBackdropFilter: scrolled ? "blur(14px)" : "none" }}
    >
      <div className="mx-auto flex h-full max-w-[1280px] items-center justify-between">
        <Link to="/" aria-label="TakeOne home" className="rounded-md">
          <TakeOneWordmark className="text-[20px] text-ink" />
        </Link>

        <nav aria-label="Primary" className="flex items-center gap-7">
          <Link to="/guides" className={`hidden md:inline ${navLink}`}>Guides</Link>
          <Link to="/pricing" className={`hidden sm:inline ${navLink}`}>Pricing</Link>
          {!showAuth && start}
          {showAuth && <SignedOut>
            <Link to="/create" className={`hidden sm:inline ${navLink}`}>Sign in</Link>
            {start}
          </SignedOut>}
          {showAuth && <SignedIn>
            <Link to="/create" className={navLink}>Your videos</Link>
            <TakeOneUserButton />
          </SignedIn>}
        </nav>
      </div>
    </motion.header>
  );
}
