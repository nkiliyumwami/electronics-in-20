import type { LessonContent } from './types.ts';
import { M1 } from './m1.ts';

export { MODULES } from './modules.ts';

export const LESSONS: LessonContent[] = [...M1];

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
