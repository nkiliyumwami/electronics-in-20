// Pure data types for lesson content. No runtime imports here, so the
// verify script can load content files directly with Node.

export interface Choice {
  text: string;
  correct?: boolean;
  /** Shown when this choice is picked. For wrong choices: why it's wrong. */
  why: string;
}

export interface McQuestion {
  kind: 'mc';
  id: string;
  prompt: string;
  choices: Choice[];
  hint: string;
}

export interface UnitOption {
  label: string;
  /** Multiply the typed number by this to get the base unit. */
  factor: number;
}

export interface NumTrap {
  /** Value in the base unit that triggers this message. */
  value: number;
  msg: string;
}

export interface NumQuestion {
  kind: 'num';
  id: string;
  prompt: string;
  /** Correct answer in the base unit (first entry of `units`). */
  answer: number;
  /** Relative tolerance, e.g. 0.02 = ±2%. */
  tolerance: number;
  units: UnitOption[];
  hint: string;
  /** Shown on a correct answer. */
  explain: string;
  /** Common mistakes, matched before the generic "not quite". */
  traps?: NumTrap[];
}

export interface TaskQuestion {
  kind: 'task';
  id: string;
  prompt: string;
  /** Key the scene's check() function understands. */
  task: string;
  hint: string;
  explain: string;
}

export type Question = McQuestion | NumQuestion | TaskQuestion;

export interface LessonContent {
  id: string;
  module: number;
  title: string;
  minutes: number;
  /** Shown above the scene before anything else. At most two sentences. */
  prompt: string;
  /** Paragraphs. **bold** is allowed. At most 150 words in total. */
  explanation: string[];
  takeaway: string;
  /** The single live formula, if any. */
  formula?: string;
  skills: string[];
  questions: Question[];
  /** Whether the scene offers the Water ⇄ Real toggle. */
  water: boolean;
}

export interface ModuleInfo {
  n: number;
  title: string;
  blurb: string;
}
