// B4 — content (the content-generation surface). Brainstorm viral angles, write a
// 14-20s script, and format caption text. Uses an OpenAI-compatible LLM when LLM_API_KEY is set;
// falls back to deterministic templates so the tool works (lower quality) and tests run offline.
import type { Content, ContentOptions, Angle, Word } from '../types.js';

const SYSTEM =
  'You are a short-form video strategist. Reply ONLY with compact JSON. Be specific, punchy, no fluff.';

export async function llm(prompt: string, options: ContentOptions): Promise<string | null> {
  options.signal?.throwIfAborted();
  const key = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL?.trim();
  if (!key?.trim() || !model) {
    if (options.strict) throw Error('Script generation requires LLM_API_KEY and LLM_MODEL');
    return null;
  }
  const base = process.env.LLM_BASE_URL?.trim() || 'https://api.openai.com/v1';
  try {
  const res = await fetch(`${base}/chat/completions`, {
    signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(45_000)]) : AbortSignal.timeout(45_000),
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw Error('Script provider rejected request');
  const j = await res.json();
  const value = j.choices?.[0]?.message?.content;
  return typeof value === 'string' ? value : null;
  } catch {
    options.signal?.throwIfAborted();
    if (options.strict) throw Error('Script generation provider failed');
    return null;
  }
}

function safeJson<T>(s: string | null, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s.replace(/^```json?|```$/g, '').trim()); } catch { return fallback; }
}

export const content: Content = {
  async brainstorm(topic: string, facts: string[] = [], options: ContentOptions = {}): Promise<Angle[]> {
    const grounding = facts.length ? `\nUse these current facts (cite-worthy, keep them accurate):\n- ${facts.join('\n- ')}` : '';
    const out = await llm(`Give 3 viral short-form angles for the topic: "${topic}".${grounding}\nJSON array of {hook, premise, whyViral}.`, options);
    const fallback: Angle[] = [
      { hook: `the real reason ${topic}`, premise: `a 3-beat myth-bust on ${topic}`, whyViral: 'contrarian + specific' },
      { hook: `${topic}, explained in 15 seconds`, premise: `fast facts with a twist ending`, whyViral: 'saves + shares as a quick explainer' },
      { hook: `nobody tells you this about ${topic}`, premise: `one surprising insight + a takeaway`, whyViral: 'curiosity gap' },
    ];
    const parsed = safeJson<unknown>(out, null);
    const valid = Array.isArray(parsed) && parsed.length > 0 && parsed.length <= 10 && parsed.every(a => a && ['hook', 'premise', 'whyViral'].every(key => typeof a[key] === 'string' && a[key].trim().length > 0 && a[key].length <= 1000));
    if (!valid) {
      if (options.strict) throw Error('Script provider returned invalid angles');
      return fallback;
    }
    return (parsed as Angle[]).slice(0, 3);
  },

  async script(angle: Angle, facts: string[] = [], options: ContentOptions = {}): Promise<{ script: string; captions: string }> {
    const grounding = facts.length ? ` Ground it in: ${facts.slice(0, 3).join(' ')}` : '';
    const out = await llm(`Write a 45-55 word voiceover script for this angle. Hook first line.${grounding} JSON {script, captions}. Angle: ${JSON.stringify(angle)}`, options);
    const fb = (() => {
      const fact = facts[0] ? ` ${facts[0]}` : '';
      const script = `${angle.hook}.${fact} ${angle.premise}. here's the part that actually matters, and why most people get it wrong. remember this next time.`;
      return { script, captions: script };
    })();
    const parsed = safeJson<any>(out, null);
    const script = typeof parsed?.script === 'string' ? parsed.script.trim() : '';
    const words = script.split(/\s+/).length;
    if (script.length < 20 || script.length > 2000 || words < 10 || words > 120) {
      if (options.strict) throw Error('Script provider returned invalid narration');
      return fb;
    }
    return { script, captions: typeof parsed.captions === 'string' && parsed.captions.trim() ? parsed.captions : script };
  },

  async captionText(words: Word[], style: 'karaoke' | 'meme' | 'clean'): Promise<string> {
    const text = words.map((w) => w.text).join(' ').trim();
    if (style === 'meme') return text.toUpperCase();
    return text;
  },
};

// word count -> rough spoken seconds (≈2.5 words/sec). Used to keep reels in the 14-20s band.
export function spokenSeconds(script: string): number { return script.trim().split(/\s+/).length / 2.5; }
