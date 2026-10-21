import type { Stage } from '../three/stage';
import type { Panel } from '../core/panel';
import type { Effects } from '../three/effects';
import type { LessonContent } from '../content/types';

export interface FailOpts {
  title: string;
  text: string;
  /** Shows an Undo button that calls this. */
  undo?: () => void;
  undoLabel?: string;
  /** A positive result card instead of a failure. */
  good?: boolean;
}

export interface SceneCtx {
  stage: Stage;
  panel: Panel;
  /** Effects live in the real view. */
  fx: Effects;
  /** Effects for the water view. */
  fxWater: Effects;
  lesson: LessonContent;
  fail(o: FailOpts): void;
  clearFail(): void;
}

export interface CheckResult {
  ok: boolean;
  msg?: string;
}

export interface SceneHandle {
  check(task: string): CheckResult;
  dispose?(): void;
}

export type SceneFactory = (ctx: SceneCtx) => SceneHandle;
