// Progress lives in localStorage. Every access is wrapped: private windows,
// blocked storage or previews must never break the course.

const KEY = 'e20.progress.v1';
const THEME_KEY = 'e20.theme';

export interface Progress {
  /** Lessons completed (all questions attempted). */
  done: Record<string, number>;
  /** Per lesson, per question: true once answered correctly, false if only attempted. */
  answers: Record<string, Record<string, boolean>>;
  /** Capstone steps finished. */
  capstone: Record<string, boolean>;
  name: string;
}

function empty(): Progress {
  return { done: {}, answers: {}, capstone: {}, name: '' };
}

let cache: Progress | null = null;

export function load(): Progress {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? { ...empty(), ...JSON.parse(raw) } : empty();
  } catch {
    cache = empty();
  }
  return cache!;
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* storage unavailable: progress just won't persist */
  }
}

export function recordAnswer(lesson: string, q: string, correct: boolean) {
  const p = load();
  const l = (p.answers[lesson] ??= {});
  l[q] = l[q] || correct;
  save();
}

export function answersFor(lesson: string): Record<string, boolean> {
  return load().answers[lesson] ?? {};
}

export function markDone(lesson: string) {
  const p = load();
  if (!p.done[lesson]) {
    p.done[lesson] = Date.now();
    save();
  }
}

export function isDone(lesson: string): boolean {
  return !!load().done[lesson];
}

export function setCapstone(step: string) {
  load().capstone[step] = true;
  save();
}

export function setName(name: string) {
  load().name = name;
  save();
}

export function resetProgress() {
  cache = empty();
  save();
}

export function getTheme(): 'light' | 'dark' | 'auto' {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === 'light' || t === 'dark' ? t : 'auto';
  } catch {
    return 'auto';
  }
}

export function setTheme(t: 'light' | 'dark' | 'auto') {
  try {
    if (t === 'auto') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, t);
  } catch {
    /* ignore */
  }
}
