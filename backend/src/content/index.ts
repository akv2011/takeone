// B4 content: brainstorm viral angles, write a 14-20s script, and format caption text. Uses Gemini
// when GEMINI_PROJECT and GEMINI_MODEL are set; otherwise deterministic templates keep the CLI and
// offline tests working at lower quality. Strict (production) calls never fall back.
import type { Content, ContentOptions, Angle, Word } from '../types.js';
import { generateJson, geminiConfigured } from '../gemini.js';

const SYSTEM = 'You are a short-form video strategist. Be specific, punchy, no fluff.';

async function ask<T>(prompt: string, schema: Record<string, unknown>, parse: (value: unknown) => T, options: ContentOptions): Promise<T | null> {
  options.signal?.throwIfAborted();
  if (!geminiConfigured()) {
    if (options.strict) throw Error('Script generation requires GEMINI_PROJECT and GEMINI_MODEL');
    return null;
  }
  try {
    return await generateJson({ parts: [{ text: prompt }], schema, system: SYSTEM, signal: options.signal, timeoutMs: 45_000, parse });
  } catch (error) {
    options.signal?.throwIfAborted();
    if (options.strict) throw error;
    return null;
  }
}

const ANGLES_SCHEMA = {
  type: 'array', minItems: 1, maxItems: 10,
  items: { type: 'object', properties: { hook: { type: 'string' }, premise: { type: 'string' }, whyViral: { type: 'string' } },
    required: ['hook', 'premise', 'whyViral'], propertyOrdering: ['hook', 'premise', 'whyViral'] },
};
function parseAngles(parsed: unknown): Angle[] {
  const valid = Array.isArray(parsed) && parsed.length > 0 && parsed.length <= 10 && parsed.every(a => a && ['hook', 'premise', 'whyViral'].every(key => typeof a[key] === 'string' && a[key].trim().length > 0 && a[key].length <= 1000));
  if (!valid) throw Error('Script provider returned invalid angles');
  return (parsed as Angle[]).slice(0, 3);
}

const SCRIPT_SCHEMA = {
  type: 'object', properties: { script: { type: 'string' }, captions: { type: 'string' } },
  required: ['script'], propertyOrdering: ['script', 'captions'],
};
function parseScript(parsed: any): { script: string; captions: string } {
  const script = typeof parsed?.script === 'string' ? parsed.script.trim() : '';
  const words = script.split(/\s+/).length;
  if (script.length < 20 || script.length > 2000 || words < 10 || words > 120) throw Error('Script provider returned invalid narration');
  return { script, captions: typeof parsed.captions === 'string' && parsed.captions.trim() ? parsed.captions : script };
}

export const content: Content = {
  async brainstorm(topic: string, facts: string[] = [], options: ContentOptions = {}): Promise<Angle[]> {
    const grounding = facts.length ? `\nUse these current facts (cite-worthy, keep them accurate):\n- ${facts.join('\n- ')}` : '';
    const angles = await ask(`Give 3 viral short-form angles for the topic: "${topic}".${grounding}\nJSON array of {hook, premise, whyViral}.`, ANGLES_SCHEMA, parseAngles, options);
    return angles ?? [
      { hook: `the real reason ${topic}`, premise: `a 3-beat myth-bust on ${topic}`, whyViral: 'contrarian + specific' },
      { hook: `${topic}, explained in 15 seconds`, premise: `fast facts with a twist ending`, whyViral: 'saves + shares as a quick explainer' },
      { hook: `nobody tells you this about ${topic}`, premise: `one surprising insight + a takeaway`, whyViral: 'curiosity gap' },
    ];
  },

  async script(angle: Angle, facts: string[] = [], options: ContentOptions = {}): Promise<{ script: string; captions: string }> {
    const grounding = facts.length ? ` Ground it in: ${facts.slice(0, 3).join(' ')}` : '';
    const written = await ask(`Write a 45-55 word voiceover script for this angle. Hook first line.${grounding} JSON {script, captions}. Angle: ${JSON.stringify(angle)}`, SCRIPT_SCHEMA, parseScript, options);
    if (written) return written;
    const fact = facts[0] ? ` ${facts[0]}` : '';
    const script = `${angle.hook}.${fact} ${angle.premise}. here's the part that actually matters, and why most people get it wrong. remember this next time.`;
    return { script, captions: script };
  },

  async captionText(words: Word[], style: 'karaoke' | 'meme' | 'clean'): Promise<string> {
    const text = words.map((w) => w.text).join(' ').trim();
    if (style === 'meme') return text.toUpperCase();
    return text;
  },
};

// word count -> rough spoken seconds (≈2.5 words/sec). Used to keep reels in the 14-20s band.
export function spokenSeconds(script: string): number { return script.trim().split(/\s+/).length / 2.5; }
