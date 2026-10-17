import { useLocation } from "react-router-dom";
import Header from "../components/Header";
import SiteFooter from "../components/SiteFooter";
import { CONTACT_EMAIL } from "../lib/brand";

type Section = { heading: string; paragraphs?: string[]; items?: string[] };
type Document = { title: string; intro: string; sections: Section[] };

const updated = "September 22, 2026";

const documents: Record<string, Document> = {
  "/privacy": {
    title: "Privacy Policy",
    intro: "This policy explains what TakeOne collects, why it is used, and the choices available to you.",
    sections: [
      { heading: "Information we collect", items: ["Account details supplied by your sign-in provider, such as name, email address and account identifier.", "Prompts, uploaded media, generated videos, edits, project history and support messages you choose to provide.", "Payment status and order references. Payment card details are handled by the payment provider and are not stored by TakeOne.", "Basic product analytics, device information, error details and service logs used to secure and improve the product."] },
      { heading: "How we use information", items: ["Provide video generation, editing, storage, delivery and account features.", "Process purchases, prevent duplicate charges, restore failed generations and investigate abuse.", "Monitor reliability, understand product usage and respond to support requests."] },
      { heading: "Service providers", paragraphs: ["TakeOne may send the minimum necessary data to hosting, authentication, analytics, email, payment, media and AI providers. Current infrastructure can include Google Cloud and Firebase (hosting, sign-in, database, storage, rendering and AI models), Convex, PostHog, Resend, Dodo and connected media providers. Their handling of data is governed by their own terms and privacy policies."] },
      { heading: "Storage and retention", paragraphs: [`Uploads and outputs are private by default. We retain account and project data while your account is active and as needed for billing, security, dispute resolution and legal obligations. Product retention periods may change as storage controls are added. You can remove eligible uploads in the product and request account deletion by emailing ${CONTACT_EMAIL}.`] },
      { heading: "Your choices", paragraphs: ["You can disconnect Telegram, remove eligible uploads, control optional preferences and request access, correction or deletion of your personal information. Some records may be retained when required for payment, fraud prevention or legal compliance."] },
    ],
  },
  "/terms": {
    title: "Terms of Service",
    intro: "These terms govern your use of TakeOne. By using the service, you agree to them.",
    sections: [
      { heading: "Your account", paragraphs: ["You are responsible for activity on your account and for keeping linked services secure. You must provide accurate information and be legally able to enter this agreement."] },
      { heading: "Your content", paragraphs: ["You keep ownership of content you upload. You give TakeOne a limited license to host, process, modify and deliver that content only to operate and improve the service. You must own or have permission to use every source, including YouTube videos, music, logos, voices and reference material."] },
      { heading: "Generated content", paragraphs: ["AI and automated editing can produce incorrect, unexpected or similar results. You are responsible for reviewing outputs before publishing them and for obtaining any required permissions, disclosures or clearances. TakeOne does not promise that an output is unique or suitable for a particular commercial use."] },
      { heading: "Credits and availability", paragraphs: ["A successful finished render uses one free generation or one purchased credit. Failed jobs restore the reserved allowance when the system can verify the failure. Credits are account-bound, have no cash value and cannot be transferred. Features can be paused or changed to protect the service or comply with provider limits."] },
      { heading: "Ending access", paragraphs: ["We may suspend access for abuse, security risks, unpaid amounts or violations of these terms. You may stop using TakeOne or request account deletion. Sections about ownership, payments, liability and disputes continue where applicable."] },
      { heading: "Service limits", paragraphs: ["The service is provided as available. To the extent permitted by law, TakeOne is not liable for indirect or consequential loss, lost revenue, lost data or third-party claims arising from content you submit or publish."] },
    ],
  },
  "/acceptable-use": {
    title: "Acceptable Use Policy",
    intro: "Use TakeOne to create responsibly and only with content you have the right to process.",
    sections: [
      { heading: "Do not use TakeOne to", items: ["Exploit or sexualize minors, create non-consensual intimate content or facilitate trafficking or abuse.", "Impersonate another person deceptively, mislead people about elections or public safety, or create fraud, phishing or scams.", "Promote terrorism, targeted violence, self-harm instructions or illegal goods and services.", "Upload malware, probe the service, evade limits, automate abusive traffic or interfere with other users.", "Violate copyright, trademark, privacy, publicity or other rights."] },
      { heading: "Enforcement", paragraphs: ["We may block content, limit features, suspend accounts and preserve relevant records when we reasonably believe this policy has been violated. Serious or repeated violations may be reported to the appropriate provider or authority."] },
    ],
  },
  "/copyright": {
    title: "Copyright and Takedowns",
    intro: "TakeOne processes user-provided media. We respect copyright and respond to clear infringement notices.",
    sections: [
      { heading: "Before you create", paragraphs: ["Only upload, clip or remix material you own, that is licensed to you, or that you are otherwise legally permitted to use. A public URL does not automatically grant reuse rights."] },
      { heading: "Send a notice", paragraphs: [`Email ${CONTACT_EMAIL} with your name and contact details, the protected work, the exact TakeOne material or link at issue, a good-faith statement that the use is unauthorized, a statement that the information is accurate, and your physical or electronic signature.`] },
      { heading: "Response", paragraphs: ["We may remove or restrict material, ask for more information, notify the affected account and terminate repeat infringers when appropriate. If you believe material was removed by mistake, reply with the basis for your counter-notice and evidence of your rights."] },
    ],
  },
  "/refund-policy": {
    title: "Refund Policy",
    intro: "TakeOne sells one-time video credit packs. This policy explains when a purchase can be refunded.",
    sections: [
      { heading: "Failed videos", paragraphs: ["A job that fails before a verified finished video is delivered should automatically restore its reserved free generation or credit. This restoration is not a payment refund."] },
      { heading: "Purchase refunds", paragraphs: [`Contact ${CONTACT_EMAIL} with the order reference and reason for your request. Refund eligibility depends on applicable law, payment status and credit usage. Used credits are generally not refundable unless required by law or the service failed to provide the purchased functionality.`] },
      { heading: "Partial refunds and disputes", paragraphs: ["A partial refund removes the proportional number of credits. If refunded credits were already used, later credits may first cover the resulting account adjustment. Payment disputes can pause additional credit grants while the transaction is reviewed."] },
      { heading: "Processing", paragraphs: ["Approved refunds are returned through the original payment method. Bank and payment-provider processing times vary. Taxes and currency conversion are handled according to the checkout provider and applicable law."] },
    ],
  },
};

export default function Legal() {
  const { pathname } = useLocation();
  const document = documents[pathname] ?? documents["/terms"];
  return <div className="flex min-h-screen flex-col text-ink">
    <Header />
    <main className="mx-auto w-full max-w-[1280px] flex-1 px-5 pb-24 pt-12 sm:px-8 md:px-12 md:pt-20">
      <header className="max-w-[68ch]">
        <p className="text-[13px] text-muted">Updated {updated}</p>
        <h1 className="display ml-[-0.04em] mt-3 text-[40px] md:text-[52px]">{document.title}</h1>
        <p className="mt-4 text-[17px] leading-relaxed text-ink2">{document.intro}</p>
      </header>
      <div className="mt-12 max-w-[68ch] space-y-10">{document.sections.map(section => <section key={section.heading}>
        <h2 className="text-[19px] font-semibold tracking-[-0.015em]">{section.heading}</h2>
        {section.paragraphs?.map(paragraph => <p key={paragraph} className="mt-3 text-[16px] leading-[1.7] text-ink2">{paragraph}</p>)}
        {section.items && <ul className="mt-3 list-disc space-y-2 pl-5 text-[16px] leading-[1.7] text-ink2 marker:text-muted">{section.items.map(item => <li key={item}>{item}</li>)}</ul>}
      </section>)}</div>
      <p className="sheet mt-12 max-w-[68ch] p-5 text-[15px] text-ink2">Questions about this policy? Email <a className="font-medium text-ink underline decoration-ink/25 underline-offset-4 hover:decoration-ink" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
    </main>
    <SiteFooter />
  </div>;
}
