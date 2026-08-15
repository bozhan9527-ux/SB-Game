import { z } from 'zod';

/**
 * 每個 data/*.json 對應此處一個 schema。
 * TECH_SPEC 第 3 節：資料格式錯誤必須在載入階段就報錯，
 * 不得等到遊戲跑到該筆資料才崩潰。
 */

export const ProjectionConfigSchema = z.object({
  /** 消失點的螢幕 Y 座標。 */
  horizonY: z.number(),
  /** 焦距，越大透視越平緩。 */
  focalLength: z.number().positive(),
  /** 攝影機離地高度（世界單位）。 */
  cameraHeight: z.number().positive(),
  /** 道路半寬（世界單位），玩家橫向位置以此為上限。 */
  roadHalfWidth: z.number().positive(),
  /** z 的下限。z → 0 會使 scale 溢位，見 TECH_SPEC 第 4.6 節。 */
  nearZ: z.number().positive(),
  /** 超過此距離的物件不繪製。 */
  farZ: z.number().positive(),
});

export const GateRunConfigSchema = z.object({
  /** 推進速度（世界單位 / 秒）。 */
  speedZPerSecond: z.number().positive(),
  /** 相鄰兩道閘門的距離。 */
  gateSpacingZ: z.number().positive(),
  /** 第一道閘門的起始距離。 */
  firstGateZ: z.number().positive(),
  /** 中線死區半寬，落在此區間內視為未選擇（撞牆）。 */
  deadZoneX: z.number().nonnegative(),
  /** 玩家橫向位置的絕對值上限。 */
  playerMaxX: z.number().positive(),
  /** 撞牆扣除的凝膠。 */
  wallHitGelPenalty: z.number().nonnegative(),
});

export const DragConfigSchema = z.object({
  /** 多少 px 的橫向位移對應 x 變化 1.0。 */
  pixelsPerUnitX: z.number().positive(),
  /** 抬指後是否自動歸中。TECH_SPEC 第 4.5 節規定為 false。 */
  recenterOnRelease: z.boolean(),
});

export const BattleStartSchema = z.object({
  gel: z.number().nonnegative(),
  gelMax: z.number().positive(),
  shield: z.number().nonnegative(),
  baseAttack: z.number().positive(),
});

/** 各關卡類型的閘門數範圍，見 GAME_DESIGN 第 3.2 節。 */
export const EncounterSchema = z
  .object({
    minGates: z.number().int().positive(),
    maxGates: z.number().int().positive(),
  })
  .refine((e) => e.maxGates >= e.minGates, {
    message: 'maxGates 不得小於 minGates',
  });

/**
 * 呈現用的世界尺寸。放在 data/ 是因為這些值需要在手機上反覆調整手感。
 * 顏色不在此處——配色屬美術風格，不屬 TECH_SPEC 第 3 節所指的「遊戲數值」。
 */
export const RenderConfigSchema = z.object({
  /** 閘門面板的高度（世界單位）。 */
  gateHeightWorld: z.number().positive(),
  /** 路面條紋的長度，用來產生速度感。 */
  stripeLengthZ: z.number().positive(),
  /** 史萊姆固定所在的距離。 */
  playerZ: z.number().positive(),
  /** 史萊姆半徑（世界單位）。 */
  playerRadiusWorld: z.number().positive(),
  /** 繪製路面時的取樣段數，越多越平滑。 */
  roadSampleCount: z.number().int().positive(),
  /**
   * 閘門標籤的最小顯示縮放。低於此值只畫面板不畫字。
   * 遠處的閘門在畫面上彼此很近，全部標字會疊成一團無法閱讀。
   */
  labelMinScale: z.number().positive(),
});

export const BalanceSchema = z.object({
  projection: ProjectionConfigSchema,
  gateRun: GateRunConfigSchema,
  drag: DragConfigSchema,
  battleStart: BattleStartSchema,
  render: RenderConfigSchema,
  encounters: z.record(z.string(), EncounterSchema),
});

export const GateEffectSchema = z.object({
  stat: z.enum(['attack', 'gel', 'shield']),
  op: z.enum(['add', 'mul']),
  value: z.number(),
});

export const GateTypeSchema = z.object({
  label: z.string().min(1),
  effects: z.array(GateEffectSchema).min(1),
});

export const GatePairSchema = z.object({
  left: z.string().min(1),
  right: z.string().min(1),
});

export const GatesSchema = z
  .object({
    types: z.record(z.string(), GateTypeSchema),
    pairs: z.array(GatePairSchema).min(1),
  })
  // 交叉驗證：pairs 引用的 id 必須存在於 types，否則是斷掉的資料。
  .refine(
    (data) => data.pairs.every((p) => p.left in data.types && p.right in data.types),
    { message: 'gates.json: pairs 引用了 types 中不存在的閘門 id' },
  );

export type ProjectionConfig = z.infer<typeof ProjectionConfigSchema>;
export type GateRunConfig = z.infer<typeof GateRunConfigSchema>;
export type DragConfig = z.infer<typeof DragConfigSchema>;
export type BattleStart = z.infer<typeof BattleStartSchema>;
export type Encounter = z.infer<typeof EncounterSchema>;
export type RenderConfig = z.infer<typeof RenderConfigSchema>;
export type Balance = z.infer<typeof BalanceSchema>;
export type GateEffect = z.infer<typeof GateEffectSchema>;
export type GateType = z.infer<typeof GateTypeSchema>;
export type GatePair = z.infer<typeof GatePairSchema>;
export type Gates = z.infer<typeof GatesSchema>;
