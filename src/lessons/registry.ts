import type { SceneFactory } from './types';

type Loader = () => Promise<{ default: SceneFactory }>;

// Each lesson's 3D scene is code-split and loaded on demand.
export const SCENES: Record<string, Loader> = {
  '1.1': () => import('./scenes/l1_1'),
  '1.2': () => import('./scenes/l1_2'),
  '1.3': () => import('./scenes/l1_3'),
  '2.1': () => import('./scenes/l2_1'),
  '2.2': () => import('./scenes/l2_2'),
  '2.3': () => import('./scenes/l2_3'),
  '2.4': () => import('./scenes/l2_4'),
  '3.1': () => import('./scenes/l3_1'),
  '3.2': () => import('./scenes/l3_2'),
  '3.3': () => import('./scenes/l3_3'),
  '3.4': () => import('./scenes/l3_4'),
  '4.1': () => import('./scenes/l4_1'),
  '4.2': () => import('./scenes/l4_2'),
  '4.3': () => import('./scenes/l4_3'),
  '5.1': () => import('./scenes/l5_1'),
  '5.2': () => import('./scenes/l5_2'),
  '5.3': () => import('./scenes/l5_3'),
  '6.1': () => import('./scenes/l6_1'),
  '6.2': () => import('./scenes/l6_2'),
  '6.3': () => import('./scenes/l6_3'),
  '6.4': () => import('./scenes/l6_4'),
  '7.1': () => import('./scenes/l7_1'),
  '7.2': () => import('./scenes/l7_2'),
  '7.3': () => import('./scenes/l7_3'),
};
