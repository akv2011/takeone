import { motion, useMotionValueEvent, useScroll } from "framer-motion";
import { useState } from "react";
import { Link } from "react-router-dom";
import { SignedIn, SignedOut } from "../lib/auth";
import { TakeOneWordmark } from "./TakeOneLogo";
import TakeOneUserButton from "./account/TakeOneUserButton";
import { authEnabled } from "../lib/convexApi";
import { button } from "../lib/ui";

const navLink = "font-mono text-[11px] uppercase tracking-[0.08em] text-ink2 underline-offset-4 hover:text-ink hover:underline";

export default function Header() {
  const showAuth = authEnabled && !import.meta.env.SSR;
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  useMotionValueEvent(scrollY, "change", y => setScrolled(y > 24));
  const start = <Link to="/create" className={button("primary", "sm")}>Start a video</Link>;
  return (
    <motion.header
      className="sticky top-0 z-40 h-16 w-full bg-paper/90 px-4 backdrop-blur-sm sm:px-6 md:px-12"
      animate={{ borderBottomColor: scrolled ? "rgba(14,14,13,1)" : "rgba(14,14,13,0)" }}
      style={{ borderBottomWidth: 1, borderBottomStyle: "solid" }}
    >
      <div className="mx-auto flex h-full max-w-[1360px] items-center justify-between">
        <Link to="/" aria-label="TakeOne home">
          <TakeOneWordmark className="text-[28px] text-ink" />
        </Link>

        <nav aria-label="Primary" className="flex items-center gap-6">
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
