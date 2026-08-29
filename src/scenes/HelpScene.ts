import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { BALANCE, CARDS } from '../data';
import { state } from '../state';
import { realmForStage } from '../systems/realms';
import {
  TALISMAN_SLOTS,
  effectLines,
  statLine,
  talismanDefs,
  unlockedTalismans,
} from '../systems/talismans';
import { createButton } from '../ui/button';
import { drawBackdrop } from '../ui/backdrop';
import { BG_PANEL, GOLD, INK, INK_DIM, JADE, LINE, hexToNumber, textStyle, wrapText } from '../ui/theme';
import { fadeIn, fadeToScene } from '../ui/transition';

interface Section {
  title: string;
  lines: string[];
}

/** 陣法加成一律以百分比呈現，四捨五入到整數。 */
function pct(ratio: number): number {
  return Math.round(ratio * 100);
}

/**
 * 玩法說明。
 *
 * **這一頁是查閱用的，不是教學。** 教學拆成十課綁在關卡上講（見 data/lessons.json）——
 * 一次攤開八個章節，新手一條都讀不進去，實測玩家的原話是「文字那麼多沒有人會看」。
 * 兩者分工：課程負責「在用得到的當下教會一條」，這一頁負責「想查的時候查得到全部」。
 * 教學和參考資料不該用同一份文件兼任，兼任的結果是對新手太長、對老手又不夠精確。
 *
 * 內容裡的數字一律從 data/*.json 讀，不另外抄一份：抄一份就一定會和實際數值走散。
 */
export class HelpScene extends Phaser.Scene {
  constructor() {
    super('Help');
  }

  private sections(): Section[] {
    const { field, formation, wave } = BALANCE;
    const save = state();
    const unlocked = unlockedTalismans(save.world.highestStage);
    const pool = talismanDefs(save.player.talismans, save.world.highestStage);
    // 只列玩家帶的四張。二十張全列出來是一份查不完的表，而他這一場遇得到的只有四張。
    const cards = pool.map(
      (card) =>
        `・${card.name}：一次打 ${card.targets} 個、每 ${(card.intervalMs / 1000).toFixed(2)} 秒出手一次`,
    );
    const mine = pool.flatMap((card) => [
      `・${card.name}　${statLine(card)}`,
      ...effectLines(card).map((line) => `　　◆ ${line}`),
    ]);
    return [
      {
        title: '目標',
        lines: [
          `妖魔分 ${wave.wavesPerStage} 波由上而下推進，走到最下面的山門就會扣耐久。`,
          '耐久扣光就失守；撐過所有波次、再斬掉關底首領就過關。',
        ],
      },
      {
        title: '拖放或點兩下，都可以',
        lines: [
          '按住一張符拖到別的格位放開，或是點一下選起來、再點目標格，',
          '兩種都行——手指會擋住自己要放的位置時，點兩下比較準。',
          '不論用哪一種，都會依序判定三件事：',
          '１. 同種同階且未達上限 → 合成，階數 +1',
          '２. 目標是空格 → 搬過去',
          '３. 其餘 → 兩張互換',
          '手牌之間也能合，可以先在手裡湊一對再放下去。',
          '往畫面最下緣拖（或選起來後點那裡）是棄符——',
          '手牌塞滿時抽到的新符會流失。',
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
          '一整條線「全部同種」或「全部不同種」就會成陣（階數不拘），',
          '兩同一異什麼都不算——那是唯一擺錯的方式。',
          `・同心陣（全同種）：橫 +${pct(formation.same.rowDamage)}% 傷害、`,
          `　縱 +${pct(formation.same.columnFireRate)}% 出手、斜 +${pct(formation.same.diagonalDamage)}% 傷害`,
          `・五行陣（全不同種）：橫 +${pct(formation.distinct.rowDamage)}% 傷害、`,
          `　縱 +${pct(formation.distinct.columnFireRate)}% 出手、斜 +${pct(formation.distinct.diagonalDamage)}% 傷害`,
          '同心好排、同種又好合成，所以給得少；五行難排、和合成互相牽制，所以給得多。',
          '六格的場上只有橫陣；縱陣與斜陣要把「陣法擴充」買滿成 3×3。',
          '同時落在橫陣與縱陣上的那一格，兩種加成相加。',
          '3×3 最多能同時成八條：全場同種，或橫列各自同種、直行剛好湊齊四種中的三種。',
        ],
      },
      {
        title: `符籙譜：${CARDS.length} 張裡帶 ${TALISMAN_SLOTS} 張`,
        lines: [
          `每次入場只能帶 ${TALISMAN_SLOTS} 張符，這四張就是整個抽符池。`,
          '池子小，同一種才湊得到第二張——合成是唯一的指數成長，它必須湊得到。',
          '而四種正好對上 3×3 的陣法：多帶會湊不成五行陣，少帶排不出變化。',
          '',
          '你目前帶的是：',
          ...mine,
          '',
          `符籙靠推關解鎖，目前已參悟 ${unlocked.length} / ${CARDS.length} 張。`,
          '後解鎖的不是更強的符，是條件不同的符：誅仙符對首領近兩倍、對雜兵平平；',
          '引靈符自己幾乎不輸出，靠的是把相鄰四格撐起來。',
        ],
      },
      {
        title: '傷害是逐目標結算的',
        lines: [
          '每一道各自結算，超出目標血量的部分直接浪費：',
          ...cards,
          '所以天雷符打小妖會浪費一半，打首領最狠；風刃符正好相反。',
          '穿雲符則把溢出的傷害轉給下一隻，正好補上這個洞。',
        ],
      },
      {
        title: '妖魔的習性',
        lines: [
          '從築基期起，每個境界有一種妖魔帶習性，血條旁會標一個字：',
          '「甲」每一發傷害都被削掉一截——多發小傷害吃虧，大單發划算。',
          '「疾」走得比較快，血量少一點，但你的反應時間也少一截。',
          '「裂」死掉會裂成兩隻小的往前衝——單體高傷反而拖慢清場。',
          '帶習性的妖魔血量都打過折：牠們改變的是「誰打牠有效率」，',
          '不是「大家都打不動」。看到什麼字，就知道該換哪張符。',
        ],
      },
      {
        title: '門派與修為',
        lines: [
          '四個門派的被動會改變打法，不只是數值：',
          '體修前兩次漏怪免傷、劍修專精劍陣符、',
          '符修合成有機率不消耗、丹修抽符快且金幣多。',
          '每個門派都專精一種符——那一種沒帶進場，專精就完全不生效，',
          '所以「帶哪四張」和「拜哪一派」是同一個決定。',
          '用某一派通關會累積該派的修為，每 5 場升一階、最多四階，',
          '每階讓法寶傷害 +4%。修為只長在自己派上，換派帶不走，',
          '但也不會被沒收——回去的時候還在。換派要付金幣，',
          '價碼看你在現任門派累積了多少。',
        ],
      },
      {
        title: '輪迴轉世',
        lines: [
          '推進飛升境（第 82 關）之後，主畫面左上角會出現「輪迴」。',
          '轉世把「已經爬到多深」換成仙緣點：關卡退回第 1 關、金幣歸零、',
          '洞府六條線全部重來，但門派修為、符籙解鎖、成就與紀錄都留著。',
          '仙緣點買的是每一世都帶著走的加成——法寶傷害、金幣、山門耐久，',
          '以及最有感的「法寶階數上限 +1」。',
          '只有推得比上一次更深才換得到點，同一段進度不會重複換。',
        ],
      },
      {
        title: '存檔在哪裡',
        lines: [
          '進度只存在這台裝置的瀏覽器裡。清快取或換手機就會不見。',
          '主畫面的「存檔」可以把整份進度變成一串碼——複製起來收好，',
          '換裝置時貼回去就接得上。',
          '同一頁也有個人紀錄：最深境界、最高每秒輸出、最快通關等等。',
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
    fadeIn(this);
    const save = state();
    const realm = realmForStage(save.world.stage);
    drawBackdrop(this, realm.color, realm.scenery);

    const cx = GAME_WIDTH / 2;
    this.add.text(cx, 46, '玩法說明', textStyle({ size: 40, color: INK, bold: true })).setOrigin(0.5);
    this.add
      .text(cx, 92, '完整規則，隨時查閱（教學會在用得到的那一關自己出現）', textStyle({ size: 16, color: INK_DIM }))
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
      onClick: () => fadeToScene(this, 'Title'),
    });
  }
}
