import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { BALANCE, CARDS } from '../data';
import { state } from '../state';
import { realmForStage } from '../systems/realms';
import { createButton } from '../ui/button';
import { drawBackdrop } from '../ui/backdrop';
import { BG_PANEL, GOLD, INK, INK_DIM, JADE, LINE, hexToNumber, textStyle, wrapText } from '../ui/theme';

interface Section {
  title: string;
  lines: string[];
}

/**
 * 玩法說明。
 *
 * 新手教學教的是「怎麼動手」，這一頁補的是「為什麼這樣動手」——
 * 四種符的取捨、階數上限怎麼長、耐久怎麼掉。教學只跑一次，這一頁隨時查得到。
 *
 * 內容裡的數字一律從 data/*.json 讀，不另外抄一份：抄一份就一定會和實際數值走散。
 */
export class HelpScene extends Phaser.Scene {
  constructor() {
    super('Help');
  }

  private sections(): Section[] {
    const { field, formation, wave } = BALANCE;
    const cards = CARDS.map(
      (card) =>
        `・${card.name}：一次打 ${card.targets} 個、每 ${(card.intervalMs / 1000).toFixed(2)} 秒出手一次`,
    );
    return [
      {
        title: '目標',
        lines: [
          `妖魔分 ${wave.wavesPerStage} 波由上而下推進，走到最下面的山門就會扣耐久。`,
          '耐久扣光就失守；撐過所有波次、再斬掉關底首領就過關。',
        ],
      },
      {
        title: '操作只有一種：拖放',
        lines: [
          '按住一張符拖到別的格位放開，會依序判定三件事：',
          '１. 同種同階且未達上限 → 合成，階數 +1',
          '２. 目標是空格 → 搬過去',
          '３. 其餘 → 兩張互換',
          '手牌之間也能合，可以先在手裡湊一對再放下去。',
          '往畫面最下緣拖是棄符——手牌塞滿時抽到的新符會流失。',
        ],
      },
      {
        title: '合成是唯一的成長',
        lines: [
          `每升一階，傷害乘上 ${field.tierGrowth} 倍。階數上限每 ${field.stagesPerTier} 關 +1，`,
          `第 1 關是 ${field.maxTierBase} 階，越後面越高。`,
          `抽到的符固定比上限低 ${field.drawTierBelowMax} 階——`,
          '要把一張符推到上限得合十六張，所以抽符速度就是成長速度。',
          '與其鋪滿一堆低階符，不如把同一種集中合上去。',
        ],
      },
      {
        title: '陣法：擺哪一格有差',
        lines: [
          '一整條線上每一張符都「不同種」（階數不拘）就會成陣：',
          `・橫陣：一整橫列不同種 → 該列傷害 +${Math.round(formation.rowDamage * 100)}%`,
          `・縱陣：一整直行不同種 → 該行出手速度 +${Math.round(formation.columnFireRate * 100)}%`,
          `・斜陣：對角線不同種 → 傷害 +${Math.round(formation.diagonalDamage * 100)}%`,
          '六格的場上只有橫陣；縱陣與斜陣要把「陣法擴充」買滿成 3×3。',
          '同時落在橫陣與縱陣上的那一格，兩種加成相加。',
          '注意：合成要湊同種、結陣要湊不同種，這兩件事是對立的。',
          '全場鋪同一種符一條陣都成不了；要留幾格排陣，還是全拿去養合成，自己取捨。',
        ],
      },
      {
        title: '四種符的取捨',
        lines: [
          '傷害是逐目標結算的，超出的部分直接浪費：',
          ...cards,
          '所以天雷符打小妖會浪費一半，打首領最狠；風刃符正好相反。',
        ],
      },
      {
        title: '門派',
        lines: [
          '四個門派的被動會改變打法，不只是數值：',
          '體修前兩次漏怪免傷、劍修專精劍陣符、',
          '符修合成有機率不消耗、丹修抽符快且金幣多。',
          '隨時可以在主畫面更換，不影響進度。',
        ],
      },
      {
        title: '洞府升級',
        lines: [
          '通關拿的金幣在洞府換成永久加成，六條線都會影響下一關。',
          '「陣法擴充」是唯一加格位的線，場上多一格就多一份輸出。',
          '打不過就先回洞府買幾級，這是設計上預期的循環。',
        ],
      },
    ];
  }

  create(): void {
    const save = state();
    const realm = realmForStage(save.world.stage);
    drawBackdrop(this, realm.color, realm.scenery);

    const cx = GAME_WIDTH / 2;
    this.add.text(cx, 46, '玩法說明', textStyle({ size: 40, color: INK, bold: true })).setOrigin(0.5);
    this.add
      .text(cx, 92, '拖符布陣，合成升階，鎮守山門', textStyle({ size: 18, color: INK_DIM }))
      .setOrigin(0.5);

    const viewTop = 122;
    // 底部留給「可捲動」提示與按鈕，遮罩下緣不能貼著它們。
    const viewHeight = GAME_HEIGHT - viewTop - 126;
    const list = this.add.container(0, viewTop);
    const width = GAME_WIDTH - 40;
    const left = cx - width / 2 + 18;

    // 逐段量出實際高度再往下堆，段落行數不同也不會互相壓到。
    let y = 8;
    for (const section of this.sections()) {
      const body = section.lines.map((line) => wrapText(line, width - 36, 16)).join('\n');
      const title = this.add.text(left, 0, section.title, textStyle({ size: 22, color: GOLD, bold: true }));
      const text = this.add
        .text(left, 0, body, textStyle({ size: 16, color: INK }))
        .setLineSpacing(6);
      const height = 44 + text.height + 18;
      const panel = this.add
        .rectangle(cx, y + height / 2, width, height, BG_PANEL, 0.9)
        .setStrokeStyle(2, LINE);
      title.setY(y + 12);
      text.setY(y + 44);
      list.add([panel, title, text]);
      y += height + 10;
    }

    const shape = this.make.graphics({ x: 0, y: 0 });
    shape.fillRect(0, viewTop, GAME_WIDTH, viewHeight);
    list.setMask(shape.createGeometryMask());

    // 內容比可視範圍高的那一段才是可捲動距離。
    const minY = viewTop + Math.min(0, viewHeight - y);
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown) return;
      list.y = Phaser.Math.Clamp(list.y + pointer.velocity.y * 0.28, minY, viewTop);
    });
    if (minY < viewTop) {
      this.add
        .text(cx, GAME_HEIGHT - 96, '上下拖曳可捲動', textStyle({ size: 15, color: JADE }))
        .setOrigin(0.5)
        .setAlpha(0.8);
    }

    // 遮罩邊緣加一道漸層感的細線，讓「還有內容在下面」看得出來。
    this.add.rectangle(cx, viewTop + viewHeight, GAME_WIDTH, 2, hexToNumber(INK_DIM), 0.25);

    createButton(this, cx, GAME_HEIGHT - 56, {
      width: 300,
      height: 62,
      label: '回主畫面',
      fontSize: 24,
      onClick: () => this.scene.start('Title'),
    });
  }
}
