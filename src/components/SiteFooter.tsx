import { Link } from "react-router-dom";
import { TakeOneWordmark } from "./TakeOneLogo";

const columns = [
  ["Product", [["/create", "Your videos"], ["/pricing", "Pricing"], ["/guides", "Guides"], ["/#how-it-works", "How it works"]]],
  ["Policies", [["/privacy", "Privacy"], ["/terms", "Terms"], ["/acceptable-use", "Acceptable use"], ["/copyright", "Copyright"], ["/refund-policy", "Refunds"]]],
] as const;

const link = "text-[14px] text-ink2 transition-colors hover:text-ink";

// Public pages share this footer. On the home page the in-page anchor skips the router.
export default function SiteFooter({ home = false }: { home?: boolean }) {
  return (
    <footer className="mx-auto w-full max-w-[1280px] px-5 sm:px-8 md:px-12">
      <div className="grid gap-10 border-t border-line py-12 md:grid-cols-12">
        <div className="md:col-span-6">
          <Link to="/" aria-label="TakeOne home" className="inline-block rounded-md"><TakeOneWordmark className="text-[18px] text-ink" /></Link>
          <p className="mt-3 text-[13px] text-muted">© {new Date().getFullYear()} TakeOne</p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-8 md:col-span-6">
          {columns.map(([title, links]) => (
            <div key={title}>
              <p className="text-[13px] font-semibold text-ink">{title}</p>
              <ul className="mt-3 space-y-2.5">
                {links.map(([to, label]) => (
                  <li key={to}>{to.includes("#") ? <a href={home ? to.slice(1) : to} className={link}>{label}</a> : <Link to={to} className={link}>{label}</Link>}</li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
    </footer>
  );
}
