import { describe, it, expect } from 'vitest';
import { LESSONS, parseLessons } from '../src/data';
import { createDefaultSave } from '../src/save';
import type { SaveData } from '../src/save/types';
import {
  HINT_FORMATION,
  lessonForStage,
  lessonHintId,
  markHintSeen,
  markLessonSeen,
} from '../src/systems/tutorial';

function freshSave(): SaveData {
  return createDefaultSave(1);
}

describe('分關卡教學', () => {
  it('每一課都短：標題一行、內文最多兩行', () => {
    // 這套東西的存在理由就是「說明頁文字多到沒有人會看」，
    // 所以長度是硬性約束而不是風格偏好——寫長了就退化回它要取代的那個東西。
    expect(LESSONS.length).toBeGreaterThan(5);
    for (const lesson of LESSONS) {
      expect(lesson.title).not.toContain('\n');
      expect(lesson.title.length, `${lesson.id} 的標題太長`).toBeLessThanOrEqual(14);
      const lines = lesson.body.split('\n');
      expect(lines.length, `${lesson.id} 的內文超過兩行`).toBeLessThanOrEqual(2);
      for (const line of lines) {
        expect(line.length, `${lesson.id} 有一行太長：${line}`).toBeLessThanOrEqual(34);
      }
    }
  });

  it('依關卡遞增排列，而且都落在前三十關', () => {
    // 教學要在玩家還在學的時候講完。排在第 60 關的「新手教學」等於沒有。
    let previous = 0;
    for (const lesson of LESSONS) {
      expect(lesson.stage).toBeGreaterThanOrEqual(previous);
      previous = lesson.stage;
    }
    expect(previous).toBeLessThanOrEqual(30);
  });

  it('一場只上一課，而且照順序補', () => {
    // 玩家可能一口氣連過好幾關，或是舊存檔直接跳到深處。
    // 若「所有到期的課」一次全倒出來，就又變回一堵沒有人會看的文字牆。
    const save = freshSave();
    const first = lessonForStage(save, 30);
    expect(first?.id).toBe(LESSONS[0]?.id);

    if (first === null) throw new Error('第一課不該是 null');
    markLessonSeen(save, first);
    expect(lessonForStage(save, 30)?.id).toBe(LESSONS[1]?.id);
  });

  it('還沒推到的關卡不會提前上課', () => {
    const save = freshSave();
    const early = LESSONS[0];
    if (early === undefined) throw new Error('沒有課程');
    expect(lessonForStage(save, early.stage - 1)).toBeNull();
    expect(lessonForStage(save, early.stage)?.id).toBe(early.id);
  });

  it('上過就不再上，全部上完之後回 null', () => {
    const save = freshSave();
    for (const lesson of LESSONS) markLessonSeen(save, lesson);
    expect(lessonForStage(save, 999)).toBeNull();
    for (const lesson of LESSONS) {
      expect(markLessonSeen(save, lesson), `${lesson.id} 被重複記了一次`).toBe(false);
    }
  });

  it('課程與它取代的觸發式提示互相認得，同一條規則只講一次', () => {
    // 兩套機制的時機不同：觸發式的在「事情發生的當下」講，時機更好但不保證會發生；
    // 課程綁在關卡上，保證講得到。哪一邊先講到，另一邊就該閉嘴。
    const formation = LESSONS.find((lesson) => lesson.hint === HINT_FORMATION);
    if (formation === undefined) throw new Error('陣法那一課應該對應到 HINT_FORMATION');

    // 已經自己排出過陣法（觸發式提示講過了）→ 不再上那一課。
    const played = freshSave();
    markHintSeen(played, HINT_FORMATION);
    expect(lessonForStage(played, formation.stage)?.id).not.toBe(formation.id);

    // 反過來：先上完課 → 之後排出陣法時觸發式提示也不再跳。
    const taught = freshSave();
    markLessonSeen(taught, formation);
    expect(markHintSeen(taught, HINT_FORMATION)).toBe(false);
    expect(markHintSeen(taught, lessonHintId(formation))).toBe(false);
  });

  it('已經有觸發式提示的規則不重複開課', () => {
    // 手牌塞滿、首領出場、首領砸門這三件事都有觸發式提示，
    // 它們在「事情發生的當下」講，比綁在某一關講更準——不該再開一課。
    const ids = new Set(LESSONS.map((lesson) => lesson.id));
    for (const covered of ['handFull', 'boss', 'gateSiege']) {
      expect(ids.has(covered), `${covered} 已經有觸發式提示，不該再開一課`).toBe(false);
    }
  });

  it('資料檔的格式錯誤在載入階段就報錯', () => {
    expect(() => parseLessons([{ id: 'a', stage: 1, title: 'T', body: '一\n二\n三' }])).toThrow(/兩行/);
    expect(() =>
      parseLessons([
        { id: 'a', stage: 9, title: 'T', body: 'x' },
        { id: 'b', stage: 2, title: 'T', body: 'x' },
      ]),
    ).toThrow(/遞增/);
    expect(() => parseLessons([{ id: 'a', stage: 0, title: 'T', body: 'x' }])).toThrow(/stage/);
  });
});
