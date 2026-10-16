import { Link } from "react-router-dom";
import { SignedIn, SignedOut, SignInButton } from "@clerk/clerk-react";
import TakeOneLogo from "./TakeOneLogo";
import TakeOneUserButton from "./account/TakeOneUserButton";
import { useProductCapabilities } from "../hooks/useProductCapabilities";
import { authEnabled } from "../lib/convexApi";

export default function Header() {
  const capabilities = useProductCapabilities();
  const showAuth = authEnabled && !import.meta.env.SSR;
  return (
    <header className="h-[72px] w-full border-b border-black/10 bg-paper/90 px-6 md:px-8">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5" aria-label="TakeOne home">
          <TakeOneLogo className="h-8 w-8 text-ink" />
          <span className="font-display text-xl font-bold tracking-tight text-ink">takeone</span>
        </Link>

        <nav aria-label="Primary" className="flex items-center gap-4 sm:gap-5">
          {capabilities?.telegram.available && capabilities.telegram.username && <a href={`https://t.me/${capabilities.telegram.username}`} target="_blank" rel="noreferrer" className="hidden text-sm font-semibold text-ink2 transition-opacity hover:opacity-60 sm:inline">Telegram</a>}
          <Link to="/pricing" className="hidden text-sm font-semibold text-ink2 transition-opacity hover:opacity-60 sm:inline">Pricing</Link>
          {!showAuth && <Link to="/create" className="rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-80">Start creating</Link>}
          {showAuth && <SignedOut>
            <SignInButton mode="modal"><button className="hidden text-sm font-semibold text-ink2 transition-opacity hover:opacity-60 sm:inline">Sign in</button></SignInButton>
            <Link to="/create" className="rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-80">Start creating</Link>
          </SignedOut>}
          {showAuth && <SignedIn>
            <Link to="/create" className="text-sm font-semibold text-ink2 transition-opacity hover:opacity-60">Dashboard</Link>
            <TakeOneUserButton />
          </SignedIn>}
        </nav>
      </div>
    </header>
  );
}
