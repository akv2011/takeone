import { Link } from "react-router-dom";
import TakeOneLogo from "./TakeOneLogo";

export const footLink = "font-mono text-[11px] uppercase tracking-[0.08em] text-ink2 underline-offset-4 hover:text-ink hover:underline";

const columns = [
  ["Product", [["/create", "Dashboard"], ["/pricing", "Pricing"], ["/guides", "Guides"], ["/#how-it-works", "How it works"]]],
  ["Policies", [["/privacy", "Privacy"], ["/terms", "Terms"], ["/acceptable-use", "Acceptable use"], ["/copyright", "Copyright"], ["/refund-policy", "Refunds"]]],
] as const;

// Public pages share this footer. On the home page the in-page anchor skips the router.
export default function SiteFooter({ home = false }: { home?: boolean }) {
  return (
    <footer className={`w-full bg-paper px-4 pt-14 sm:px-6 md:px-12 ${home ? "" : "pb-14 border-t border-ink"}`}>
      <div className="mx-auto grid max-w-[1360px] gap-10 md:grid-cols-12">
        <div className="flex items-center gap-2 md:col-span-6">
          <TakeOneLogo className="h-6 w-6 text-ink" />
          <span className={footLink}>© {new Date().getFullYear()} TakeOne</span>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-8 md:col-span-6">
          {columns.map(([title, links]) => (
            <div key={title} className="border-t border-ink pt-3">
              <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink">{title}</p>
              <ul className="mt-3 space-y-2">
                {links.map(([to, label]) => (
                  <li key={to}>{to.includes("#") ? <a href={home ? to.slice(1) : to} className={footLink}>{label}</a> : <Link to={to} className={footLink}>{label}</Link>}</li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
      {home && <p aria-hidden="true" translate="no" className="display mx-auto mt-16 max-w-[1360px] select-none overflow-hidden whitespace-nowrap text-[clamp(96px,22vw,330px)] leading-[0.78] text-ink">TakeOne</p>}
    </footer>
  );
}
