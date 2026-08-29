import { describe, it, expect } from 'vitest';
import { BALANCE } from '../src/data';
import { createDefaultSave } from '../src/save';
import {
  HINT_TUTORIAL,
  advanceStep,
  hasSeenHint,
  markHintSeen,
  shouldRunTutorial,
  tutorialCopy,
  tutorialField,
  tutorialHand,
} from '../src/systems/tutorial';
import { canMerge, maxTierForStage } from '../src/systems/deck';

describe('新手教學', () => {
  it('只有沒看過教學、而且正要打第 1 關的玩家才走教學', () => {
    const fresh = createDefaultSave(1);
    expect(shouldRunTutorial(fresh)).toBe(true);

    const taught = createDefaultSave(1);
    markHintSeen(taught, HINT_TUTORIAL);
    expect(shouldRunTutorial(taught)).toBe(false);

    const later = createDefaultSave(1);
    later.world.stage = 4;
    expect(shouldRunTutorial(later)).toBe(false);
  });

  it('教學起手牌保證第一步放得下、第二步合得起來', () => {
    const field = tutorialField(BALANCE.field.fieldSlots);
    const hand = tutorialHand(BALANCE.field.handSlots);

    // 場上全空，所以「拖到空格」一定成立。
    expect(field.length).toBe(BALANCE.field.fieldSlots);
    expect(field.every((card) => card === null)).toBe(true);

    // 手上至少三張同種同階：不管先放哪一張，剩下的都還合得起來。
    const held = hand.filter((card) => card !== null);
    expect(held.length).toBeGreaterThanOrEqual(3);
    const first = held[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    for (const card of held) {
      expect(card).not.toBeNull();
      if (card === null) continue;
      expect(canMerge(first, card, 1)).toBe(true);
    }
    // 而且起始階數遠低於第 1 關的上限，合完不會立刻封頂。
    expect(first.tier).toBeLessThan(maxTierForStage(1));
  });

  it('每一步都有文案，最後一步是空的（代表教學結束）', () => {
    for (const step of ['deploy', 'merge', 'watch'] as const) {
      expect(tutorialCopy(step).title.length).toBeGreaterThan(0);
      expect(tutorialCopy(step).body.length).toBeGreaterThan(0);
    }
    expect(tutorialCopy('done').title).toBe('');
  });

  it('步驟只往前走，走完停在 done', () => {
    expect(advanceStep('deploy')).toBe('merge');
    expect(advanceStep('merge')).toBe('watch');
    expect(advanceStep('watch')).toBe('done');
    expect(advanceStep('done')).toBe('done');
  });

  it('一次性提示只會被記錄一次', () => {
    const save = createDefaultSave(1);
    expect(hasSeenHint(save, 'x')).toBe(false);
    expect(markHintSeen(save, 'x')).toBe(true);
    expect(markHintSeen(save, 'x')).toBe(false);
    expect(hasSeenHint(save, 'x')).toBe(true);
    expect(save.player.hints.filter((id) => id === 'x')).toHaveLength(1);
  });
});
