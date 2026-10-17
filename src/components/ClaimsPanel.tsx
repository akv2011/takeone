import {
  CheckCircle,
  Question,
  SealCheck,
  XCircle,
} from "@phosphor-icons/react";
import { InspectorSection, PanelState } from "./StudioWorkspace";
import type { ClaimsCheck } from "../../convex/claims";
import { panel } from "../lib/ui";

const VERDICTS = {
  supported: { label: "Supported", className: "text-go", icon: CheckCircle },
  disputed: { label: "Disputed", className: "text-grease", icon: XCircle },
  unverified: { label: "Unclear", className: "text-wait", icon: Question },
} as const;
const link = "underline underline-offset-2 hover:text-ink";
const newTab = (name: string) => `${name} (opens in a new tab)`;

export function ClaimsPanel({ claims }: { claims: ClaimsCheck }) {
  return (
    <InspectorSection
      title="Check claims"
      icon={SealCheck}
      help="Gemini with Google Search checked factual claims. Verdicts can be wrong. Read the sources before relying on one."
    >
      <section
        aria-labelledby="claims-heading"
        className={`${panel} w-full p-4`}
      >
        <h2 id="claims-heading" className="sr-only">
          Claims
        </h2>
        {claims.status === "unavailable" ? (
          <PanelState error>
            The claims check could not finish for this video. Check its claims
            before sharing.
          </PanelState>
        ) : claims.claims.length === 0 ? (
          <PanelState>
            Gemini found no factual claims to check in this video.
          </PanelState>
        ) : (
          <ol className="mt-3 space-y-3">
            {claims.claims.map((claim, index) => {
              const verdict = VERDICTS[claim.verdict];
              const Icon = verdict.icon;
              return (
                <li key={index} className="claim-card">
                  <p className="break-words text-sm font-semibold">
                    {claim.text}
                  </p>
                  <p className="mt-2 text-[13px]">
                    <span className={`claim-verdict ${verdict.className}`}>
                      <Icon size={18} weight="regular" aria-hidden="true" />
                      {verdict.label}
                    </span>
                    <span className="break-words text-ink2">
                      {claim.reason}
                    </span>
                  </p>
                  {claim.sources.length > 0 && (
                    <ul
                      aria-label={`Sources for claim ${index + 1}`}
                      className="claim-sources text-ink2"
                    >
                      {claim.sources.map((source, sourceIndex) => (
                        <li key={source.url} className="break-words">
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={newTab(source.title)}
                            className={link}
                          >
                            <span className="font-medium">
                              [{sourceIndex + 1}]
                            </span>
                            {source.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </InspectorSection>
  );
}
