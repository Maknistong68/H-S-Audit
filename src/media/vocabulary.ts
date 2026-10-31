/**
 * Makes phone dictation fit HSE audit language: fixes how generic recognisers hear site acronyms,
 * turns spoken punctuation into marks, and picks the recogniser guess that sounds most like an audit.
 */

/** Hints given to recognisers that accept them; also used to score guesses. */
export const HSE_PHRASES: string[] = [
  'RAMS', 'PTW', 'HSSE', 'HSE', 'NEOC', 'NEOM', 'Oxagon', 'Aconex', 'Enablon', 'LOTO', 'PPE', 'RCD', 'ELCB', 'SCBA', 'KPI', 'TBT', 'NCR', 'MOH',
  'Code A', 'Code B', 'Code C', 'toolbox talk', 'method statement', 'risk assessment', 'permit to work', 'hot work', 'confined space',
  'work at height', 'scaffolding', 'scaffold tag', 'fire extinguisher', 'fire blanket', 'first aid', 'first aider', 'competent person',
  'subcontractor', 'chargehand', 'foreman', 'supervisor', 'housekeeping', 'barricade', 'full body harness', 'lanyard', 'excavation',
  'lifting plan', 'rigging', 'emergency response plan', 'muster point', 'steering committee', 'induction', 'near miss', 'unsafe act',
  'unsafe condition', 'corrective action', 'non-conformance', 'fatigue management', 'heat stress', 'paramedic', 'ambulance',
  'flashback arrestor', 'oxy-fuel', 'gas cylinder', 'distribution board', 'earthing', 'generator', 'traffic management', 'banksman',
  'audit', 'inspection', 'approved', 'not approved', 'not available', 'evidence', 'register', 'tracker', 'training matrix',
];

const LETTERS = (word: string) => word.split('').join('[\\s.]*');

/** Acronyms recognisers spell out or mangle; longer ones first so HSSE wins over HSE. */
const ACRONYMS = ['HSSE', 'NEOC', 'LOTO', 'ELCB', 'SCBA', 'MSRA', 'HSE', 'PTW', 'PPE', 'RCD', 'TBT', 'NCR', 'MOH', 'KPI'];

const FIXES: Array<[RegExp, string]> = [
  // spoken punctuation
  [/\s*\b(?:new line|next line|new paragraph)\b\s*/gi, '\n'],
  [/\s*\bfull stop\b/gi, '.'],
  [/\s+period\s*$/i, '.'],
  [/\s*\bquestion mark\b/gi, '?'],
  [/\s*\bcomma\b/gi, ','],
  // words recognisers commonly get wrong
  [/\bram'?s'?(?=\s|[.,?]|$)/gi, 'RAMS'],
  [/\bk[\s.]*p[\s.]*i[\s.]*'?s\b/gi, 'KPIs'],
  [/\bneo\s*(?:c|see|sea)\b/gi, 'NEOC'],
  [/\ba\s*conn?ex\b/gi, 'Aconex'],
  [/\ben\s*a?blon\b/gi, 'Enablon'],
  [/\boxygen projects\b/gi, 'Oxagon Projects'],
  [/\bcode\s+([abc])\b/gi, 'Code '],
  [/\btool\s*box talks?\b/gi, 'toolbox talk'],
  [/\bflash\s*back arrest[eo]rs?\b/gi, 'flashback arrestor'],
  [/\bbanks\s*man\b/gi, 'banksman'],
  [/\bloto\b/gi, 'LOTO'],
];

/** Fix a recogniser transcript. Idempotent, so it is safe to run twice. */
export function correctTranscript(text: string): string {
  let out = text;
  for (const [re, to] of FIXES) {
    out = out.replace(re, (match, g1?: string) => (to === 'Code ' && typeof g1 === 'string' ? `Code ${g1.toUpperCase()}` : to));
  }
  for (const a of ACRONYMS) out = out.replace(new RegExp(`\\b${LETTERS(a.toLowerCase())}\\b`, 'gi'), a);
  out = out.replace(/\b[r][\s.]*a[\s.]*m[\s.]*s\b/gi, 'RAMS');
  // tidy spacing around marks the punctuation words produced
  out = out.replace(/[ \t]+([.,?])/g, '$1').replace(/[ \t]*\n[ \t]*/g, '\n');
  return out;
}

const STOPWORDS = new Set(
  'there their these those that this what when where which while with from into onto have has had been being were does done each every they them then than also only some such very more most other your about after before under over upon how and are for all the not any its'.split(' '),
);

/** Distinctive words of a question, used to prefer guesses that talk about it. */
export function contextWordsFor(text: string): string[] {
  const words = text.toLowerCase().match(/[a-z][a-z'-]*/g) ?? [];
  return [...new Set(words.filter((w) => w.length >= 4 && !STOPWORDS.has(w)))];
}

const PHRASE_WORDS = new Set(HSE_PHRASES.flatMap((p) => p.toLowerCase().split(/\s+/)).filter((w) => w.length >= 3 && !STOPWORDS.has(w)));

export interface Alternative {
  transcript: string;
  confidence?: number;
}

/** Highest confidence wins, plus a bonus for each audit or question word the guess contains. */
export function pickBestAlternative(alternatives: Alternative[], contextWords: string[]): string {
  if (alternatives.length === 0) return '';
  const context = new Set(contextWords);
  let best = alternatives[0];
  let bestScore = -Infinity;
  for (const alt of alternatives) {
    const words = new Set(correctTranscript(alt.transcript).toLowerCase().match(/[a-z][a-z'-]*/g) ?? []);
    let hits = 0;
    for (const w of words) if (context.has(w) || PHRASE_WORDS.has(w)) hits += 1;
    const score = (alt.confidence ?? 0) + 0.1 * hits;
    if (score > bestScore) {
      best = alt;
      bestScore = score;
    }
  }
  return best.transcript;
}
