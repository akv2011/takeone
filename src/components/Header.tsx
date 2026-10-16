import { Link } from "react-router-dom";
import { SignedIn, SignedOut, SignInButton } from "@clerk/clerk-react";
import { TakeOneWordmark } from "./TakeOneLogo";
import TakeOneUserButton from "./account/TakeOneUserButton";
import { authEnabled } from "../lib/convexApi";
import { button } from "../lib/ui";

const navLink = "text-sm font-semibold text-ink2 underline-offset-4 hover:text-ink hover:underline";

export default function Header() {
  const showAuth = authEnabled && !import.meta.env.SSR;
  const start = <Link to="/create" className={button("primary")}>Start</Link>;
  return (
    <header className="h-[72px] w-full border-b border-line bg-paper px-4 sm:px-6 md:px-12">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between">
        <Link to="/" aria-label="TakeOne home" className="rounded-md">
          <TakeOneWordmark className="text-[26px] text-ink" />
        </Link>

        <nav aria-label="Primary" className="flex items-center gap-5">
          <Link to="/pricing" className={`hidden sm:inline ${navLink}`}>Pricing</Link>
          {!showAuth && start}
          {showAuth && <SignedOut>
            <SignInButton mode="modal"><button type="button" className={`hidden sm:inline ${navLink}`}>Sign in</button></SignInButton>
            {start}
          </SignedOut>}
          {showAuth && <SignedIn>
            <Link to="/create" className={navLink}>Dashboard</Link>
            <TakeOneUserButton />
          </SignedIn>}
        </nav>
      </div>
    </header>
  );
}
