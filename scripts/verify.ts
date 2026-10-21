// Content verification: `npm run verify`
//
// 1. Structure: word limits, prompt length, 3 questions with a 3D task, one correct
//    choice, hints present, time budget.
// 2. Maths: every numeric answer is recomputed independently. Each multiple-choice
//    option with a number is parsed and compared with the value its explanation claims
//    (the right answer, or the specific mistake described).
// 3. Text audit: every number that appears in a hint, explanation or feedback text must
//    be a given or a derived value listed for that question. Unknown numbers fail.
import { LESSONS } from '../src/content/index.ts';
import type { LessonContent, Question } from '../src/content/types.ts';
import { CHECKS } from './checks.ts';

let errors = 0;
let passes = 0;
const fail = (where: string, msg: string) => {
  errors++;
  console.log(`  ✗ ${where}: ${msg}`);
};
const pass = () => passes++;

// ---------------------------------------------------------------- helpers
export function words(s: string): number {
  return s.replace(/\*\*/g, '').split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}
function sentences(s: string): number {
  return s.split(/(?<=[.!?])\s+/).filter((x) => x.trim()).length;
}

const PREFIX: Record<string, number> = { p: 1e-12, n: 1e-9, 'µ': 1e-6, u: 1e-6, m: 1e-3, '': 1, k: 1e3, M: 1e6, G: 1e9 };
/** Parse "5 mA", "0.2 mA", "250 Ω", "1 kΩ", "3.5 W" into SI. Returns null if no unit. */
export function parseSI(text: string): { value: number; unit: string } | null {
  const m = text.replace(',', '').match(/(-?\d+(?:\.\d+)?)\s*(p|n|µ|u|m|k|M|G)?(A|V|W|Ω|F|Hz|s|h|°C|mm|mAh)\b/);
  if (!m) return null;
  if (m[3] === 'mm' || m[3] === 'mAh' || m[3] === '°C' || m[3] === 'h') return { value: Number(m[1]), unit: m[3] };
  return { value: Number(m[1]) * PREFIX[m[2] ?? ''], unit: m[3] };
}

/** All numbers in a text (as written), e.g. "5 V × 0.1 A = 0.5 W" → [5, 0.1, 0.5]. */
function numbersIn(text: string): number[] {
  const t = text.replace(/¼/g, ' 0.25 ').replace(/½/g, ' 0.5 ');
  return [...t.matchAll(/(?<![\w.])(\d+(?:\.\d+)?)(?![\w.]*\d)/g)].map((m) => Number(m[1]));
}

const near = (a: number, b: number, rel = 0.005) => Math.abs(a - b) <= Math.abs(b) * rel + 1e-12;

// ---------------------------------------------------------------- structure
function structure(l: LessonContent) {
  const w = l.explanation.reduce((a, p) => a + words(p), 0);
  if (w > 150) fail(l.id, `explanation is ${w} words (max 150)`);
  else pass();
  if (sentences(l.prompt) > 2) fail(l.id, `opening prompt has ${sentences(l.prompt)} sentences (max 2)`);
  else pass();
  if (l.minutes < 5 || l.minutes > 8) fail(l.id, `${l.minutes} min is outside 5–8`);
  if (l.questions.length !== 3) fail(l.id, `${l.questions.length} questions (need 3)`);
  if (!l.questions.some((q) => q.kind === 'task')) fail(l.id, 'no "do it in 3D" question');
  if (!l.skills.length) fail(l.id, 'no skills listed');
  if (!l.takeaway) fail(l.id, 'no takeaway');
  for (const q of l.questions) {
    const where = `${l.id}/${q.id}`;
    if (!q.hint.trim()) fail(where, 'empty hint');
    if (q.kind === 'mc') {
      const c = q.choices.filter((x) => x.correct).length;
      if (c !== 1) fail(where, `${c} correct choices (need exactly 1)`);
      for (const ch of q.choices) if (!ch.why.trim()) fail(where, `choice "${ch.text}" has no explanation`);
    }
    if (q.kind === 'num' && !q.explain) fail(where, 'numeric question has no explanation');
  }
}

// ---------------------------------------------------------------- maths
function maths(l: LessonContent, q: Question) {
  const where = `${l.id}/${q.id}`;
  const spec = CHECKS[where];
  if (!spec) {
    // Questions without any numbers need no maths spec.
    const texts = allTexts(q);
    if (texts.some((t) => numbersIn(t).length)) fail(where, 'contains numbers but has no entry in scripts/checks.ts');
    return;
  }
  if (q.kind === 'num') {
    if (spec.answer === undefined) fail(where, 'checks.ts has no independent answer');
    else if (!near(q.answer, spec.answer, Math.max(q.tolerance / 4, 0.001))) fail(where, `answer ${q.answer} ≠ recomputed ${spec.answer}`);
    else pass();
    if (q.tolerance > 0.05) fail(where, `tolerance ±${q.tolerance * 100}% is loose`);
    for (const t of q.traps ?? []) {
      const exp = spec.traps?.[String(t.value)];
      if (exp === undefined) fail(where, `trap ${t.value} has no recomputed mistake value in checks.ts`);
      else if (!near(t.value, exp)) fail(where, `trap ${t.value} ≠ mistake model ${exp}`);
      else pass();
    }
  }
  if (q.kind === 'mc' && spec.choices) {
    for (const ch of q.choices) {
      const model = spec.choices[ch.text];
      const parsed = parseSI(ch.text);
      if (model === undefined) {
        if (parsed) fail(where, `choice "${ch.text}" has a number but no model in checks.ts`);
        continue;
      }
      if (!parsed) {
        fail(where, `could not parse a value from choice "${ch.text}"`);
        continue;
      }
      if (!near(parsed.value, model)) fail(where, `choice "${ch.text}" = ${parsed.value}, but its explained mistake gives ${model}`);
      else pass();
      if (ch.correct && spec.answer !== undefined && !near(parsed.value, spec.answer)) fail(where, `correct choice "${ch.text}" ≠ recomputed ${spec.answer}`);
      if (!ch.correct && spec.answer !== undefined && near(parsed.value, spec.answer)) fail(where, `wrong choice "${ch.text}" equals the right answer`);
    }
  }
  // Text audit: every number must be a given or derived value.
  const allowed = spec.allowed ?? [];
  for (const t of allTexts(q)) {
    for (const n of numbersIn(t)) {
      if (!allowed.some((a) => near(n, a, 0.0005))) fail(where, `number ${n} in "${t.slice(0, 70)}…" is not a given/derived value`);
      else pass();
    }
  }
  for (const c of spec.extra ?? []) {
    const ok = c.check();
    if (ok !== true) fail(where, `${c.name}: ${ok}`);
    else pass();
  }
}

function allTexts(q: Question): string[] {
  const out = [q.prompt, q.hint];
  if (q.kind === 'mc') for (const c of q.choices) out.push(c.text, c.why);
  if (q.kind === 'num') {
    out.push(q.explain);
    for (const t of q.traps ?? []) out.push(t.msg);
  }
  if (q.kind === 'task') out.push(q.explain);
  return out;
}

// ---------------------------------------------------------------- run
console.log('Verifying lesson content…\n');
for (const l of LESSONS) {
  const before = errors;
  structure(l);
  for (const q of l.questions) maths(l, q);
  console.log(`${errors === before ? '✓' : '✗'} ${l.id} ${l.title}`);
}
const total = LESSONS.reduce((a, l) => a + l.minutes, 0) + 15;
console.log(`\nCourse time: ${total} min (${Math.floor(total / 60)} h ${total % 60} min) incl. 15 min capstone`);
if (total > 180) fail('course', `total ${total} min exceeds 3 h`);
const ids = new Set(LESSONS.map((l) => l.id));
if (ids.size !== LESSONS.length) fail('course', 'duplicate lesson ids');
for (const k of Object.keys(CHECKS)) if (!ids.has(k.split('/')[0])) fail('checks.ts', `${k} refers to an unknown lesson`);
console.log(`\n${passes} checks passed, ${errors} problems.`);
process.exit(errors ? 1 : 0);
