import { describe, expect, it } from 'vitest';
import { computeFeatureLayout } from '../src/webview/featureLayout';

describe('featureLayout', () => {
  it('places state at center and spreads kinds into lanes', () => {
    const nodes = [
      { id: 'state:Counter', kind: 'state' },
      { id: 'action:Inc', kind: 'action' },
      { id: 'reducer:Reduce', kind: 'reducer' },
      { id: 'effect:Fx', kind: 'effect' },
      { id: 'component:Page', kind: 'component' },
    ];

    const layout = computeFeatureLayout(nodes, 400, 300);
    const state = layout.get('state:Counter')!;
    const action = layout.get('action:Inc')!;
    const reducer = layout.get('reducer:Reduce')!;

    expect(state.x).toBe(400);
    expect(state.y).toBe(300);
    expect(action.x).toBeGreaterThan(state.x);
    expect(reducer.x).toBeLessThan(state.x);
  });
});