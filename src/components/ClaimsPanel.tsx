import type { ClaimsCheck } from "../../convex/claims";
import { panel } from "../lib/ui";

const VERDICTS = {
  supported: { label: "Supported", className: "border-go text-go" },
  disputed: { label: "Disputed", className: "border-warn text-warn" },
  unverified: { label: "Unverified", className: "border-cueInk text-cueInk" },
} as const;
const link = "underline underline-offset-2 hover:text-ink";
const newTab = (name: string) => `${name} (opens in a new tab)`;

export function ClaimsPanel({ claims }: { claims: ClaimsCheck }) {
  return (
    <section aria-labelledby="claims-heading" className={`${panel} w-full p-4`}>
      <h2 id="claims-heading" className="text-base font-semibold">Claims</h2>
      <p className="mt-1 text-xs text-muted">
        Gemini with Google Search checked the factual claims this video makes. Verdicts can be wrong, so read the sources before you rely on one.
      </p>
      {claims.status === "unavailable" ? (
        <p className="mt-3 text-sm text-muted">The claims check could not finish for this video.</p>
      ) : claims.claims.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Gemini found no factual claims to check in this video.</p>
      ) : (
        <ol className="mt-3 space-y-3">
          {claims.claims.map((claim, index) => (
            <li key={index} className="rounded-md border border-line p-3">
              <p className="break-words text-sm font-semibold">{claim.text}</p>
              <p className="mt-2 text-xs">
                <span className={`mr-2 inline-block rounded border px-1.5 py-0.5 font-bold ${VERDICTS[claim.verdict].className}`}>
                  {VERDICTS[claim.verdict].label}
                </span>
                <span className="break-words text-muted">{claim.reason}</span>
              </p>
              {claim.sources.length > 0 && (
                <ul aria-label={`Sources for claim ${index + 1}`} className="mt-2 space-y-1 text-xs text-muted">
                  {claim.sources.map((source) => (
                    <li key={source.url} className="break-words">
                      <a href={source.url} target="_blank" rel="noopener noreferrer" aria-label={newTab(source.title)} className={link}>{source.title}</a>
                    </li>
                  ))}
                </ul>
              )}
              {claim.searches.length > 0 && (
                <p className="mt-2 break-words text-xs text-muted">
                  Google searches:{" "}
                  {claim.searches.map((search, i) => (
                    <span key={search}>
                      {i > 0 && ", "}
                      <a href={`https://www.google.com/search?q=${encodeURIComponent(search)}`} target="_blank" rel="noopener noreferrer" aria-label={newTab(search)} className={link}>{search}</a>
                    </span>
                  ))}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
