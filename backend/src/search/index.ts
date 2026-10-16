// Linkup — live web search, used to GROUND generated reels in current facts + sources
// (Mode 1 / generate). Real work: the script is built on fresh, cited data, not hallucination.
// Uses the Linkup API when LINKUP_API_KEY is set; degrades to no-context offline.
export class SearchError extends Error {}

export interface SearchResult { facts: string[]; sources: { title: string; url: string }[]; }

// pure: parse a Linkup sourcedAnswer response -> facts + sources (fully unit-tested)
export function parseLinkup(json: any): SearchResult {
  const answer: string = json?.answer ?? '';
  const facts = answer.split(/(?<=[.!?])\s+/).map((s: string) => s.trim()).filter((s: string) => s.length > 20).slice(0, 6);
  const sources = (json?.sources ?? []).slice(0, 5).map((s: any) => ({ title: String(s.name ?? s.title ?? 'source'), url: String(s.url ?? '') }));
  return { facts, sources };
}

export async function search(query: string, depth: 'standard' | 'deep' = 'standard'): Promise<SearchResult> {
  const key = process.env.LINKUP_API_KEY;
  if (!key) return { facts: [], sources: [] };   // offline: generate still works, just ungrounded
  const res = await fetch('https://api.linkup.so/v1/search', {
    signal: AbortSignal.timeout(45_000),
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ q: query, depth, outputType: 'sourcedAnswer' }),
  });
  if (!res.ok) throw new SearchError(`linkup ${res.status}`);
  return parseLinkup(await res.json());
}
