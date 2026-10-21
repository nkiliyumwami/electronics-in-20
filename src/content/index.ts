import type { LessonContent } from './types.ts';
import { M1 } from './m1.ts';
import { M2 } from './m2.ts';
import { M3 } from './m3.ts';
import { M4 } from './m4.ts';
import { M5 } from './m5.ts';

export { MODULES } from './modules.ts';

export const LESSONS: LessonContent[] = [...M1, ...M2, ...M3, ...M4, ...M5];

export function lessonById(id: string): LessonContent | undefined {
  return LESSONS.find((l) => l.id === id);
}

export function nextLesson(id: string): LessonContent | undefined {
  const i = LESSONS.findIndex((l) => l.id === id);
  return i >= 0 ? LESSONS[i + 1] : undefined;
}

export function prevLesson(id: string): LessonContent | undefined {
  const i = LESSONS.findIndex((l) => l.id === id);
  return i > 0 ? LESSONS[i - 1] : undefined;
}
