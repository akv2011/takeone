import { SealCheck } from "@phosphor-icons/react";
import { InspectorSection } from "./StudioWorkspace";
import type { ClaimsCheck } from "../../convex/claims";
import { panel } from "../lib/ui";

const VERDICTS = {
  supported: { label: "Supported", className: "border-go text-go" },
  disputed: { label: "Disputed", className: "border-warn text-warn" },
  unverified: { label: "Unclear", className: "border-wait text-wait" },
} as const;
const link = "underline underline-offset-2 hover:text-ink";
const newTab = (name: string) => `${name} (opens in a new tab)`;

export function ClaimsPanel({ claims }: { claims: ClaimsCheck }) {
  return (
    <InspectorSection title="Check claims" icon={SealCheck} help="Gemini with Google Search checked factual claims. Verdicts can be wrong. Read the sources before relying on one."><section aria-labelledby="claims-heading" className={`${panel} w-full p-4`}>
      <h2 id="claims-heading" className="sr-only">Claims</h2>
      {claims.status === "unavailable" ? (
        <p className="mt-3 text-sm text-ink2">The claims check could not finish for this video.</p>
      ) : claims.claims.length === 0 ? (
        <p className="mt-3 text-sm text-ink2">Gemini found no factual claims to check in this video.</p>
      ) : (
        <ol className="mt-3 space-y-3">
          {claims.claims.map((claim, index) => (
            <li key={index} className="border border-ink/30 bg-paper p-4 shadow-hard-sm">
              <p className="break-words text-sm font-semibold">{claim.text}</p>
              <p className="mt-2 text-xs">
                <span className={`stamp mr-2 my-2 !px-2 !py-1 !text-[9px] ${VERDICTS[claim.verdict].className}`}>
                  {VERDICTS[claim.verdict].label}
                </span>
                <span className="break-words text-ink2">{claim.reason}</span>
              </p>
              {claim.sources.length > 0 && (
                <ul aria-label={`Sources for claim ${index + 1}`} className="mt-2 space-y-1 text-xs text-ink2">
                  {claim.sources.map((source, sourceIndex) => (
                    <li key={source.url} className="break-words">
                      <a href={source.url} target="_blank" rel="noopener noreferrer" aria-label={newTab(source.title)} className={link}><span className="mr-2 font-mono">[{sourceIndex + 1}]</span>{source.title}</a>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </section></InspectorSection>
  );
}
