import type { SceneFactory } from './types';

type Loader = () => Promise<{ default: SceneFactory }>;

// Each lesson's 3D scene is code-split and loaded on demand.
export const SCENES: Record<string, Loader> = {
  '1.1': () => import('./scenes/l1_1'),
  '1.2': () => import('./scenes/l1_2'),
  '1.3': () => import('./scenes/l1_3'),
};
