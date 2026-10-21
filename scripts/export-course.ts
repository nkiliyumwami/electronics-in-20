// Generates docs/COURSE.md (course map + full lesson content) from the content files,
// so the document can never drift from what the app shows. Run: npm run docs
import { writeFileSync } from 'node:fs';
import { LESSONS, MODULES } from '../src/content/index.ts';
import { GLOSSARY } from '../src/content/glossary.ts';

const out: string[] = [];
const total = LESSONS.reduce((a, l) => a + l.minutes, 0) + 15;
out.push('# Electronics in 20%: course map and full lesson content', '');
out.push('_Generated from `src/content/` by `npm run docs`. Do not edit by hand._', '');
out.push(`**${LESSONS.length} lessons in ${MODULES.length} modules, plus a 15-minute capstone: about ${Math.floor(total / 60)} h ${total % 60} min in total.**`, '');
out.push('## Course map', '');
out.push('| # | Lesson | Min | "I can now…" |', '|---|---|---|---|');
for (const m of MODULES) {
  const ls = LESSONS.filter((l) => l.module === m.n);
  out.push(`| **M${m.n}** | **${m.title}** | **${ls.reduce((a, l) => a + l.minutes, 0)}** | |`);
  for (const l of ls) out.push(`| ${l.id} | ${l.title} | ${l.minutes} | ${l.skills.join('; ')} |`);
}
out.push('| ★ | Capstone: the night-light board | 15 | Design a simple board end to end, ready to order |', '');

const plain = (s: string) => s.replace(/\*\*(.+?)\*\*/g, '**$1**');
for (const m of MODULES) {
  out.push(`## Module ${m.n}: ${m.title}`, '', `_${m.blurb}_`, '');
  for (const l of LESSONS.filter((x) => x.module === m.n)) {
    out.push(`### ${l.id} ${l.title} (${l.minutes} min)`, '');
    out.push(`**Opening prompt (before any reading):** ${l.prompt}`, '');
    if (l.formula) out.push(`**The one live formula:** \`${l.formula}\``, '');
    out.push(`**Water view:** ${l.water ? 'yes (Real / Both / Water toggle)' : 'no'}`, '');
    out.push('**Explanation**', '');
    for (const p of l.explanation) out.push(`> ${plain(p)}`, '>');
    out.pop();
    out.push('', `**Key takeaway:** ${l.takeaway}`, '', `**Skills unlocked:** ${l.skills.join('; ')}`, '');
    l.questions.forEach((q, i) => {
      out.push(`**Q${i + 1}${q.kind === 'task' ? ' (do it in 3D)' : ''}.** ${q.prompt}`, '');
      if (q.kind === 'mc') {
        for (const c of q.choices) out.push(`- ${c.correct ? '✅' : '❌'} ${c.text}: _${c.why}_`);
        out.push('', `  Hint: ${q.hint}`, '');
      } else if (q.kind === 'num') {
        out.push(`- Answer: **${q.answer} ${q.units[0].label}** (±${q.tolerance * 100}%; units accepted: ${q.units.map((u) => u.label).join(', ')})`);
        out.push(`- Hint: ${q.hint}`, `- On a right answer: _${q.explain}_`);
        for (const t of q.traps ?? []) out.push(`- If they enter ${t.value} ${q.units[0].label}: _${t.msg}_`);
        out.push('');
      } else {
        out.push(`- Scene check: \`${q.task}\``, `- Hint: ${q.hint}`, `- On success: _${q.explain}_`, '');
      }
    });
  }
}
out.push('## Later, if you\'re curious (glossary of what was cut)', '');
for (const g of GLOSSARY) out.push(`- **${g.term}**: ${g.def}`);
out.push('');
writeFileSync('docs/COURSE.md', out.join('\n'));
console.log(`docs/COURSE.md written (${LESSONS.length} lessons, ${total} min).`);
