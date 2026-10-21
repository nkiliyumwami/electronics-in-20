import './styles.css';
import { h, rich, toast } from './core/dom';
import { LESSONS, MODULES, lessonById, nextLesson, prevLesson } from './content/index';
import { getTheme, isDone, load, markDone, resetProgress, setTheme } from './core/store';
import { renderQuiz } from './core/quiz';
import { Panel } from './core/panel';
import type { FailOpts, SceneHandle } from './lessons/types';

const app = document.getElementById('app')!;
let cleanup: (() => void) | null = null;

// ------------------------------------------------------------------ theme
function applyTheme() {
  const t = getTheme();
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#121514' : '#f6f5f1');
}
applyTheme();
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

function themeButton() {
  const label = () => ({ auto: 'Theme: auto', light: 'Theme: light', dark: 'Theme: dark' })[getTheme()];
  const icon = () => ({ auto: '◐', light: '☀', dark: '☾' })[getTheme()];
  const b = h('button', { class: 'iconbtn', type: 'button', 'aria-label': label(), title: label() }, icon());
  b.addEventListener('click', () => {
    const order = ['auto', 'light', 'dark'] as const;
    setTheme(order[(order.indexOf(getTheme()) + 1) % 3]);
    applyTheme();
    b.textContent = icon();
    b.setAttribute('aria-label', label());
    b.title = label();
  });
  return b;
}

function topbar(crumb = '') {
  return h(
    'header',
    { class: 'topbar' },
    h('a', { class: 'logo', href: '#/' }, h('span', { 'aria-hidden': 'true' }, '⚡'), 'Electronics in ', h('span', null, '20%')),
    crumb ? h('span', { class: 'crumb' }, '· ', crumb) : null,
    h('span', { class: 'spacer' }),
    h('a', { class: 'iconbtn', href: '#/glossary', title: 'Later, if you\'re curious' }, 'Glossary'),
    themeButton(),
  );
}

// ------------------------------------------------------------------ skills
function skillsPanel() {
  const all = LESSONS.flatMap((l) => l.skills.map((s) => ({ s, id: l.id, done: isDone(l.id) })));
  const got = all.filter((x) => x.done).length;
  return h(
    'aside',
    { class: 'cando', 'aria-labelledby': 'cando-h' },
    h('h2', { id: 'cando-h' }, 'Things I can now do'),
    h('div', { class: 'meter', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(all.length), 'aria-valuenow': String(got) }, h('div', { style: { width: `${(got / Math.max(1, all.length)) * 100}%` } })),
    h('p', { class: 'note' }, `${got} of ${all.length} skills unlocked`),
    h(
      'ul',
      null,
      all.map((x) =>
        h('li', { class: x.done ? '' : 'locked' }, h('span', { class: `tick ${x.done ? 'done' : ''}`, 'aria-hidden': 'true' }, x.done ? '✓' : ''), h('span', null, x.s, x.done ? '' : h('span', { class: 'sr' }, ' (not yet)'))),
      ),
    ),
  );
}

// ------------------------------------------------------------------ pages
function courseMap() {
  const total = LESSONS.reduce((a, l) => a + l.minutes, 0) + 15;
  const doneCount = LESSONS.filter((l) => isDone(l.id)).length;
  const next = LESSONS.find((l) => !isDone(l.id));
  const main = h('main', { id: 'main' });
  main.append(
    h(
      'section',
      { class: 'hero' },
      h('h1', null, 'Electronics in 20%'),
      h('p', { class: 'lead' }, 'The small part of electronics that explains most of it. Play with each 3D circuit first, then read a short explanation. Every lesson fits in a coffee break.'),
      h(
        'div',
        { class: 'stats' },
        h('span', { class: 'chip' }, `${LESSONS.length} lessons + capstone`),
        h('span', { class: 'chip' }, `about ${Math.floor(total / 60)} h ${total % 60} min`),
        h('span', { class: 'chip' }, `${doneCount} done`),
      ),
      h(
        'div',
        { class: 'btnrow' },
        next ? h('a', { class: 'btn primary', href: `#/lesson/${next.id}` }, doneCount ? `Continue: ${next.id} ${next.title}` : 'Start lesson 1.1') : h('a', { class: 'btn primary', href: '#/capstone' }, 'Build the capstone board'),
      ),
    ),
  );
  const list = h('div');
  for (const m of MODULES) {
    const ls = LESSONS.filter((l) => l.module === m.n);
    const mins = ls.reduce((a, l) => a + l.minutes, 0);
    list.append(
      h(
        'section',
        { class: 'module-card', 'aria-labelledby': `m${m.n}` },
        h('h2', { id: `m${m.n}` }, h('span', { class: 'num' }, `${m.n}`), m.title),
        h('p', { class: 'blurb' }, `${m.blurb} · ${mins} min`),
        h(
          'ul',
          { class: 'lesson-list' },
          ls.map((l) =>
            h(
              'li',
              null,
              h(
                'a',
                { class: 'lesson-link', href: `#/lesson/${l.id}` },
                h('span', { class: `tick ${isDone(l.id) ? 'done' : ''}`, 'aria-hidden': 'true' }, isDone(l.id) ? '✓' : ''),
                h('span', { class: 'id' }, l.id),
                h('span', { class: 't' }, l.title, isDone(l.id) ? h('span', { class: 'sr' }, ' (done)') : ''),
                h('span', { class: 'min' }, `${l.minutes} min`),
              ),
            ),
          ),
        ),
      ),
    );
  }
  list.append(
    h(
      'section',
      { class: 'module-card' },
      h('h2', null, h('span', { class: 'num' }, '★'), 'Capstone: the night-light board'),
      h('p', { class: 'blurb' }, 'Design a real board from schematic to virtual power-on, then download your certificate. 15 min.'),
      h('a', { class: 'btn primary', href: '#/capstone' }, 'Open the capstone'),
    ),
  );
  const footer = h(
    'p',
    { class: 'note', style: { marginTop: '16px' } },
    'Progress is saved in this browser only. ',
    h('button', {
      class: 'btn small',
      type: 'button',
      onclick: () => {
        if (confirm('Reset all progress?')) {
          resetProgress();
          route();
        }
      },
    }, 'Reset progress'),
  );
  list.append(footer);
  main.append(h('div', { class: 'map-grid' }, list, skillsPanel()));
  app.replaceChildren(topbar(), main);
}

async function lessonPage(id: string) {
  const lesson = lessonById(id);
  if (!lesson) return notFound();
  const mod = MODULES.find((m) => m.n === lesson.module)!;
  const main = h('main', { id: 'main' });
  const left = h('div', { class: 'left' });
  const right = h('div', { class: 'right' });
  main.append(
    h('div', { class: 'lesson-head' }, h('span', { class: 'kicker' }, `Module ${mod.n} · Lesson ${lesson.id}`), h('h1', null, lesson.title), h('span', { class: 'min' }, `${lesson.minutes} min`)),
    h('div', { class: 'lesson' }, left, right),
  );
  app.replaceChildren(topbar(`${lesson.id} ${lesson.title}`), main);
  window.scrollTo(0, 0);

  // Left: prompt, 3D stage, parts list, controls.
  left.append(h('div', { class: 'prompt-box', role: 'note' }, lesson.prompt));
  const wrap = h('div', { class: 'stage-wrap' });
  left.append(wrap);
  const partsRow = h('div', { class: 'parts', 'aria-label': 'Parts in this scene' });
  left.append(partsRow);
  const panelHost = h('div');
  left.append(panelHost);

  // Right: explanation, takeaway, quiz, navigation.
  right.append(
    h(
      'section',
      { class: 'card explain', 'aria-label': 'Explanation' },
      lesson.explanation.map((p) => h('p', { html: rich(p) })),
      lesson.formula ? h('div', { class: 'formula formula-card' }, h('span', { class: 'lbl-f' }, 'The one formula'), lesson.formula) : null,
      h('div', { class: 'takeaway' }, h('span', { class: 'k' }, 'Key takeaway'), lesson.takeaway),
    ),
  );
  const quizHost = h('div');
  right.append(quizHost);
  const prev = prevLesson(id);
  const next = nextLesson(id);
  const status = h('span', { class: 'status', 'aria-live': 'polite' });
  const nextHref = next ? `#/lesson/${next.id}` : '#/capstone';
  const nextBtn = h('a', { class: 'btn primary', href: nextHref, 'aria-disabled': 'true' }, next ? `Next: ${next.id}` : 'Capstone');
  const skip = h('a', { class: 'btn small', href: nextHref }, 'Skip ahead');
  right.append(h('nav', { class: 'nav', 'aria-label': 'Lesson navigation' }, prev ? h('a', { class: 'btn', href: `#/lesson/${prev.id}` }, `← ${prev.id}`) : h('a', { class: 'btn', href: '#/' }, '← Course map'), status, h('div', { class: 'btnrow' }, skip, nextBtn)));

  // Stage + scene.
  const { Stage } = await import('./three/stage');
  const { Effects } = await import('./three/effects');
  const { SCENES } = await import('./lessons/registry');
  if (location.hash !== `#/lesson/${id}`) return; // navigated away while loading
  const stage = new Stage(wrap);
  const panel = new Panel(panelHost);
  const fx = new Effects(stage.real);
  const fxWater = new Effects(stage.water);
  stage.onUpdate((dt) => {
    fx.update(dt);
    fxWater.update(dt);
  });
  let card: HTMLElement | null = null;
  const clearFail = () => {
    card?.remove();
    card = null;
  };
  const fail = (o: FailOpts) => {
    clearFail();
    const undo = o.undo
      ? h('button', { class: 'btn primary', type: 'button', onclick: () => { clearFail(); o.undo!(); } }, o.undoLabel ?? 'Undo')
      : null;
    card = h(
      'div',
      { class: `failcard ${o.good ? 'good' : ''}`, role: 'alert' },
      h('h3', null, o.title),
      h('p', { html: rich(o.text) }),
      h('div', { class: 'btnrow' }, undo, h('button', { class: 'btn', type: 'button', onclick: clearFail }, o.undo ? 'Keep looking' : 'OK')),
    );
    wrap.append(card);
  };
  const renderParts = () => {
    partsRow.replaceChildren(
      h('span', { class: 'lab' }, 'Parts:'),
      ...stage.listParts().map((p) => h('button', { type: 'button', onclick: () => stage.showTooltip(p.info) }, p.info.name)),
    );
  };
  stage.partsChanged = () => queueMicrotask(renderParts);
  // Visibility can change with any control (e.g. switching buses), so refresh the list.
  panelHost.addEventListener('click', () => setTimeout(renderParts, 50));
  panelHost.addEventListener('change', () => setTimeout(renderParts, 50));
  let handle: SceneHandle = { check: () => ({ ok: false, msg: 'The scene is still loading.' }) };
  const loader = SCENES[id];
  if (loader) {
    const mod = await loader();
    if (location.hash !== `#/lesson/${id}`) {
      stage.dispose();
      return;
    }
    handle = mod.default({ stage, panel, fx, fxWater, lesson, fail, clearFail });
    stage.renderFallback();
    stage.startFallbackLoop();
  }
  renderParts();

  renderQuiz(quizHost, lesson, (t) => handle.check(t), (n, total) => {
    const ready = n >= total;
    nextBtn.setAttribute('aria-disabled', String(!ready));
    nextBtn.classList.toggle('disabled', !ready);
    status.textContent = ready ? 'All questions attempted.' : `${n} of ${total} questions attempted`;
    if (ready && !isDone(id)) {
      markDone(id);
      toast(`Unlocked: ${lesson.skills[0]}`);
    }
  });
  nextBtn.addEventListener('click', (e) => {
    if (nextBtn.getAttribute('aria-disabled') === 'true') {
      e.preventDefault();
      toast('Try the three questions first, or use "Skip ahead".');
    }
  });

  cleanup = () => {
    handle.dispose?.();
    stage.dispose();
  };
}

function notFound() {
  app.replaceChildren(topbar(), h('main', { id: 'main' }, h('h1', null, 'Page not found'), h('a', { href: '#/' }, 'Back to the course map')));
}

async function glossary() {
  const { GLOSSARY } = await import('./content/glossary');
  app.replaceChildren(
    topbar('Glossary'),
    h(
      'main',
      { id: 'main' },
      h('h1', null, 'Later, if you\'re curious'),
      h('p', { class: 'lead note' }, 'Everything this course deliberately skipped, in one line each. None of it is needed for your first board.'),
      h('dl', { class: 'card gloss' }, GLOSSARY.flatMap((g) => [h('dt', null, g.term), h('dd', null, g.def)])),
      h('p', null, h('a', { class: 'btn', href: '#/' }, '← Course map')),
    ),
  );
}

async function capstone() {
  const { capstonePage } = await import('./capstone/capstone');
  const main = h('main', { id: 'main' });
  app.replaceChildren(topbar('Capstone'), main);
  cleanup = await capstonePage(main);
}

// ------------------------------------------------------------------ router
async function route() {
  cleanup?.();
  cleanup = null;
  load();
  const hash = location.hash || '#/';
  const m = hash.match(/^#\/lesson\/([\d.]+)$/);
  if (m) return lessonPage(m[1]);
  if (hash === '#/glossary') return glossary();
  if (hash === '#/capstone') return capstone();
  if (hash === '#/' || hash === '#') return courseMap();
  notFound();
}

window.addEventListener('hashchange', route);
route();
