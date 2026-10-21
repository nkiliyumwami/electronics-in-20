import type { LessonContent, McQuestion, NumQuestion, Question, TaskQuestion } from '../content/types';
import { h, rich, uid } from './dom';
import { answersFor, recordAnswer } from './store';

export type TaskCheck = (task: string) => { ok: boolean; msg?: string };

/**
 * Renders the three questions. Wrong answers show a hint and allow a retry.
 * `onChange` fires whenever the number of attempted questions changes.
 */
export function renderQuiz(
  host: HTMLElement,
  lesson: LessonContent,
  check: TaskCheck,
  onChange: (attempted: number, total: number) => void,
) {
  const prev = answersFor(lesson.id);
  const attempted = new Set(Object.keys(prev));
  const wrap = h(
    'section',
    { class: 'card quiz', 'aria-labelledby': 'quiz-h' },
    h('h2', { id: 'quiz-h' }, 'Quick check'),
    h('p', { class: 'sub' }, 'Three questions. Wrong answers just get a hint, so try again as often as you like.'),
  );
  host.append(wrap);

  const mark = (q: Question, correct: boolean) => {
    recordAnswer(lesson.id, q.id, correct);
    attempted.add(q.id);
    onChange(attempted.size, lesson.questions.length);
  };

  lesson.questions.forEach((q, i) => {
    const box = h('div', { class: 'q' });
    const label = h('div', { class: 'qn' }, `Question ${i + 1}`, q.kind === 'task' ? h('span', { class: 'badge3d' }, 'Do it in 3D') : null);
    const pid = uid('qp');
    const prompt = h('p', { class: 'qp', id: pid, html: rich(q.prompt) });
    box.append(label, prompt);
    const fb = h('div', { 'aria-live': 'polite' });
    if (q.kind === 'mc') mc(box, q, fb, pid, mark, prev[q.id] === true);
    else if (q.kind === 'num') num(box, q, fb, pid, mark, prev[q.id] === true);
    else task(box, q, fb, check, mark, prev[q.id] === true);
    box.append(fb);
    wrap.append(box);
  });
  onChange(attempted.size, lesson.questions.length);
}

function feedback(fb: HTMLElement, kind: 'right' | 'wrong' | 'hint', tag: string, text: string, hint?: string) {
  fb.innerHTML = '';
  fb.append(
    h(
      'div',
      { class: `fb ${kind}` },
      h('span', { class: 'tag' }, tag),
      text ? h('span', { html: rich(text) }) : null,
      hint ? h('div', null, h('strong', null, 'Hint: '), h('span', { html: rich(hint) })) : null,
    ),
  );
}

function mc(box: HTMLElement, q: McQuestion, fb: HTMLElement, pid: string, mark: (q: Question, c: boolean) => void, solved: boolean) {
  const list = h('div', { class: 'choices', role: 'group', 'aria-labelledby': pid });
  const buttons: HTMLButtonElement[] = [];
  q.choices.forEach((c) => {
    const b = h('button', { class: 'choice', type: 'button', html: rich(c.text) }) as HTMLButtonElement;
    b.addEventListener('click', () => {
      buttons.forEach((x) => x.classList.remove('wrong'));
      if (c.correct) {
        b.classList.add('right');
        feedback(fb, 'right', 'Right.', c.why);
        buttons.forEach((x) => (x.disabled = true));
        mark(q, true);
      } else {
        b.classList.add('wrong');
        feedback(fb, 'wrong', 'Not quite.', c.why, q.hint);
        mark(q, false);
      }
    });
    buttons.push(b);
    list.append(b);
  });
  box.append(list);
  if (solved) {
    const i = q.choices.findIndex((c) => c.correct);
    buttons[i].classList.add('right');
    buttons.forEach((x) => (x.disabled = true));
    feedback(fb, 'right', 'Answered.', q.choices[i].why);
  }
}

function num(box: HTMLElement, q: NumQuestion, fb: HTMLElement, pid: string, mark: (q: Question, c: boolean) => void, solved: boolean) {
  const input = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', 'aria-labelledby': pid, placeholder: 'Your answer' }) as HTMLInputElement;
  let unitSel: HTMLSelectElement | null = null;
  const row = h('div', { class: 'numrow' }, input);
  if (q.units.length > 1) {
    unitSel = h('select', { 'aria-label': 'Unit' }) as HTMLSelectElement;
    q.units.forEach((u, i) => unitSel!.append(h('option', { value: String(i) }, u.label)));
    row.append(unitSel);
  } else {
    row.append(h('span', null, q.units[0].label));
  }
  const btn = h('button', { class: 'btn primary', type: 'button' }, 'Check');
  row.append(btn);
  box.append(row);
  const submit = () => {
    const raw = input.value.trim().replace(',', '.').replace(/[^\d.eE+-]/g, '');
    const n = parseFloat(raw);
    if (!isFinite(n)) {
      feedback(fb, 'hint', 'Type a number.', 'Just the number, for example 0.5.');
      return;
    }
    const factor = q.units[unitSel ? Number(unitSel.value) : 0].factor;
    const base = n * factor;
    if (isClose(base, q.answer, q.tolerance)) {
      feedback(fb, 'right', 'Right.', q.explain);
      input.disabled = true;
      btn.setAttribute('disabled', '');
      if (unitSel) unitSel.disabled = true;
      mark(q, true);
      return;
    }
    const trap = q.traps?.find((t) => isClose(base, t.value, 0.01));
    if (trap) feedback(fb, 'hint', 'Almost.', trap.msg);
    else feedback(fb, 'wrong', 'Not quite.', '', q.hint);
    mark(q, false);
  };
  btn.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
  });
  if (solved) {
    input.value = String(q.answer);
    input.disabled = true;
    btn.setAttribute('disabled', '');
    if (unitSel) unitSel.disabled = true;
    feedback(fb, 'right', 'Answered.', q.explain);
  }
}

function task(box: HTMLElement, q: TaskQuestion, fb: HTMLElement, check: TaskCheck, mark: (q: Question, c: boolean) => void, solved: boolean) {
  const btn = h('button', { class: 'btn primary', type: 'button' }, 'Check my scene');
  box.append(h('div', { class: 'btnrow' }, btn));
  btn.addEventListener('click', () => {
    const r = check(q.task);
    if (r.ok) {
      feedback(fb, 'right', 'Done!', q.explain);
      btn.textContent = 'Check again';
      mark(q, true);
    } else {
      feedback(fb, 'hint', 'Not yet.', r.msg ?? '', q.hint);
      mark(q, false);
    }
  });
  if (solved) feedback(fb, 'right', 'Done before.', q.explain);
}

export function isClose(a: number, b: number, rel: number): boolean {
  if (b === 0) return Math.abs(a) < 1e-9;
  return Math.abs(a - b) <= Math.abs(b) * rel + 1e-12;
}
