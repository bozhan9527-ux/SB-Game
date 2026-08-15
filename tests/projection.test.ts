import { describe, it, expect } from 'vitest';
import { project, isVisible, roadEdgesAt } from '../src/systems/projection';
import type { ProjectionConfig } from '../src/data/types';

const cfg: ProjectionConfig = {
  horizonY: 300,
  focalLength: 260,
  cameraHeight: 190,
  roadHalfWidth: 1,
  nearZ: 0.35,
  farZ: 14,
};

const W = 540;

describe('2.5D 投影', () => {
  it('道路中線永遠投影在畫面中央', () => {
    for (const z of [0.5, 1, 5, 14]) {
      expect(project(0, z, cfg, W).x).toBeCloseTo(W / 2, 6);
    }
  });

  it('距離越遠縮放越小', () => {
    const near = project(0, 1, cfg, W);
    const far = project(0, 10, cfg, W);
    expect(far.scale).toBeLessThan(near.scale);
  });

  it('距離越遠越靠近地平線', () => {
    const near = project(0, 1, cfg, W);
    const far = project(0, 10, cfg, W);
    expect(far.y).toBeLessThan(near.y);
    expect(far.y).toBeGreaterThan(cfg.horizonY);
  });

  it('z 趨近 0 時被夾在 nearZ，不產生 Infinity 或 NaN', () => {
    for (const z of [0, 1e-9, -5]) {
      const p = project(1, z, cfg, W);
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
      expect(Number.isFinite(p.scale)).toBe(true);
      expect(p.scale).toBeCloseTo(cfg.focalLength / cfg.nearZ, 6);
    }
  });

  it('同一距離上左右對稱', () => {
    const l = project(-0.7, 3, cfg, W);
    const r = project(0.7, 3, cfg, W);
    expect(W / 2 - l.x).toBeCloseTo(r.x - W / 2, 6);
    expect(l.y).toBeCloseTo(r.y, 6);
  });

  it('道路兩緣隨距離向消失點收斂', () => {
    const near = roadEdgesAt(1, cfg, W);
    const far = roadEdgesAt(12, cfg, W);
    expect(near.right - near.left).toBeGreaterThan(far.right - far.left);
  });

  it('可見範圍以 farZ 為界', () => {
    expect(isVisible(1, cfg)).toBe(true);
    expect(isVisible(cfg.farZ, cfg)).toBe(true);
    expect(isVisible(cfg.farZ + 0.1, cfg)).toBe(false);
    expect(isVisible(0, cfg)).toBe(false);
  });
});
