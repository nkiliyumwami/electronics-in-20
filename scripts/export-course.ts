// Generates docs/COURSE.md (course map + full lesson content) from the content files,
// so the document can never drift from what the app shows. Run: npm run docs
import { writeFileSync } from 'node:fs';
import { LESSONS, MODULES } from '../src/content/index.ts';
import { GLOSSARY } from '../src/content/glossary.ts';
import { CAPSTONE, budgetDays } from '../src/content/capstone.ts';

const out: string[] = [];
const total = LESSONS.reduce((a, l) => a + l.minutes, 0) + 15;
out.push('# Electronics in 20% (for IoT beginners): course map and full lesson content', '');
out.push('The electronics an IoT beginner needs, taught by building **Plant Buddy**, a battery-powered ESP32 plant monitor (soil sensor, BME280, status LED, pump).', '');
out.push('_Generated from `src/content/` by `npm run docs`. Do not edit by hand._', '');
out.push(`**${LESSONS.length} lessons in ${MODULES.length} modules, plus a 15-minute capstone: about ${Math.floor(total / 60)} h ${total % 60} min in total.**`, '');
out.push('## Course map', '');
out.push('| # | Lesson | Min | "I can now…" |', '|---|---|---|---|');
for (const m of MODULES) {
  const ls = LESSONS.filter((l) => l.module === m.n);
  out.push(`| **M${m.n}** | **${m.title}** | **${ls.reduce((a, l) => a + l.minutes, 0)}** | |`);
  for (const l of ls) out.push(`| ${l.id} | ${l.title} | ${l.minutes} | ${l.skills.join('; ')} |`);
}
out.push('| ★ | Capstone: build Plant Buddy | 15 | Wire a complete ESP32 device, budget its battery, and debug it |', '');

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
        const shown = (v: number) => +(v / q.units[0].factor).toPrecision(4);
        out.push(`- Answer: **${shown(q.answer)} ${q.units[0].label}** (±${q.tolerance * 100}%; units accepted: ${q.units.map((u) => u.label).join(', ')})`);
        out.push(`- Hint: ${q.hint}`, `- On a right answer: _${q.explain}_`);
        for (const t of q.traps ?? []) out.push(`- If they enter ${shown(t.value)} ${q.units[0].label}: _${t.msg}_`);
        out.push('');
      } else {
        out.push(`- Scene check: \`${q.task}\``, `- Hint: ${q.hint}`, `- On success: _${q.explain}_`, '');
      }
    });
  }
}
out.push('## Capstone: build Plant Buddy (15 min)', '');
out.push('1. **Power rails:** 3V3 and GND to the front rails (logic, sensors), VIN (5 V) and GND to the back rails (pump).');
out.push('2. **Status LED:** D16 → 220 Ω → red LED → GND (5.9 mA). Wrong picks are explained: GPIO 34 is input-only, no resistor burns the LED, 47 Ω is too much.');
out.push('3. **Sensors:** soil AOUT on D32 (ADC1; D4 is ADC2 and fails with Wi-Fi on), soil VCC on 3.3 V, BME280 SDA on D21 and SCL on D22.');
out.push('4. **Pump driver:** logic-level MOSFET, 10 kΩ gate pull-down and a flyback diode; never the pump straight on a pin.');
out.push(`5. **Power budget:** ${CAPSTONE.capacity} mAh, awake ${CAPSTONE.awakeMa} mA for ${CAPSTONE.awakeS} s per wake-up, more than ${CAPSTONE.targetDays} days needed. A DevKit waking every 10 min lasts ${budgetDays('devkit', 10).toFixed(0)} days; a low-power board lasts ${budgetDays('lowpower', 10).toFixed(0)} days.`);
out.push('6. **Fix three faults** (pick the fix for each symptom):');
for (const f of CAPSTONE.faults) {
  const fix = f.fixes.find((x) => x.correct)!;
  out.push(`   - _${f.symptom}_ Fix: ${fix.text}. ${fix.why}`);
}
out.push('7. **Run it:** a time-lapse until the soil drops below 30% and the pump waters it back above 80%.');
out.push("8. **Certificate** with the learner's name and the skills they unlocked.", '');
out.push('## Later, if you\'re curious (glossary of what was cut)', '');
for (const g of GLOSSARY) out.push(`- **${g.term}**: ${g.def}`);
out.push('');
writeFileSync('docs/COURSE.md', out.join('\n'));
console.log(`docs/COURSE.md written (${LESSONS.length} lessons, ${total} min).`);
