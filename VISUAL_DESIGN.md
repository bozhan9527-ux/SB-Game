# 修仙遊戲視覺設計系統

## 概述

本遊戲 UI 視覺設計已升級，融合修仙(Xianxia)風格與現代光效設計。視覺系統從簡單線條進化為多層次、具有質感的精緻介面。

## 核心設計原則

1. **質感優先**：不只是簡單的線條，而是通過光暈、陰影、粒子創造層次感
2. **修仙美學**：融合傳統中式美學與現代視覺效果
3. **可複用性**：模組化的視覺系統，易於應用到各個場景
4. **性能考慮**：確保視覺效果精美但不影響遊戲性能

## 視覺模組系統

### 1. 主題系統 (theme.ts)

**新增顏色常數：**
```typescript
export const ACCENT_GLOW = '#f5d76e';     // 金色光暈
export const JADE_GLOW = '#9fffc8';       // 玉色光暈
export const DANGER_GLOW = '#ff8a8f';     // 危險色光暈
```

### 2. 按鈕 (button.ts)

**視覺特徵：**
- 陰影效果（深度感）
- 外層光暈邊框（修仙感）
- 點擊時的上升粒子效果

**使用範例：**
```typescript
createButton(scene, x, y, {
  width: 356,
  height: 72,
  label: '開始挑戰',
  fillColor: hexToNumber(GOLD),
  strokeColor: hexToNumber(GOLD),
  textColor: '#12181f',
  onClick: () => { /* ... */ }
});
// 點擊時自動觸發靈光粒子效果
```

### 3. 符牌 (card.ts)

**視覺特徵：**
- 卡牌邊框光暈（顏色匹配卡牌類型）
- 空位槽的淡色光暈

### 4. 選單面板 (menu.ts)

**視覺特徵：**
- 面板邊框光暈
- 提升視覺層次感

### 5. 表單 (form.ts)

**視覺特徵：**
- 表單框的發光邊框
- 輸入框聚焦時的光暈效果
- 按鈕懸停和點擊反饋動畫

### 6. 拉條 (slider.ts)

**視覺特徵：**
- 填充條光暈效果
- 把手周圍的發光圈

## 高級視覺效果模組

### 裝飾系統 (decorations.ts)

用於創建各種交互和環境效果：

```typescript
// 上升靈光粒子
createAscendingGlow(scene, x, y, glowColor, particleCount, duration);

// 旋轉光暈環
createGlowRing(scene, x, y, radius, glowColor);

// 連續旋轉軌跡
createRotatingOrbit(scene, x, y, radius, glowColor);

// 脈搏式發光
addPulseGlow(scene, target, glowColor, intensity);
```

### 面板系統 (panels.ts)

用於創建統一風格的面板框架：

```typescript
// 創建帶修仙風格的面板
const panel = createPanelFrame(scene, x, y, {
  width: 300,
  height: 200,
  accentColor: GOLD,
  hasCornerDeco: true,
  hasMidPointDeco: true,
  bgAlpha: 0.85
});

// 為現有 UI 添加裝飾邊框
addOrnamentalBorder(scene, x, y, width, height, GOLD);

// 添加分隔線
addSeparatorLine(scene, x, y, width, GOLD);

// 添加角落光暈
addCornerGlow(scene, x, y, GOLD);
```

### 效果系統 (effects.ts)

用於創建全局視覺效果和氛圍：

```typescript
// 環境光影粒子
addAmbientLighting(scene, x, y, radius, glowColor);

// 光柱效果
createLightBeam(scene, x, y, height, glowColor);

// 脈動星點
addTwinklingStars(scene, starCount, glowColor);

// 環繞光暈軌跡
createOrbitalGlow(scene, centerX, centerY, radius, glowColor);

// 下落粒子雨
createFallingParticles(scene, x, y, width, height, glowColor);

// 柔和脈搏
addGentlePulse(scene, target, duration);

// 鼠標跟蹤光跡
addMouseTrailGlow(scene, glowColor, trailLength);
```

## 顏色使用規範

### 主要顏色
- **GOLD** (#e8c46a)：主要強調色，用於重要按鈕和主要 UI
- **JADE** (#7fdba0)：次要強調色，用於次要 UI 和特殊效果
- **DANGER** (#e0616a)：警告和危險狀態

### 光暈顏色
- **ACCENT_GLOW** (#f5d76e)：金色光暈，用於主要元素
- **JADE_GLOW** (#9fffc8)：玉色光暈，用於次要元素
- **DANGER_GLOW** (#ff8a8f)：危險色光暈，用於警告

## 應用場景範例

### 標題場景 (TitleScene)
- 使用裝飾邊框突出重要信息面板
- 為主要按鈕添加光暈邊框
- 添加環境光影粒子營造氛圍

### 升級場景 (UpgradeScene)
- 使用面板系統展示升級選項
- 為能升級的項目添加脈搏效果
- 使用分隔線整理信息層次

### 結算場景 (ResultScene)
- 使用光柱效果強調獲得的獎勵
- 添加上升粒子效果表示成就
- 使用發光邊框突出最高分或新紀錄

### 戰鬥場景 (RunScene)
- 為重要動作提示添加光暈
- 使用粒子效果增強卡牌交互反饋
- 添加環繞軌跡效果突出特殊技能

## 性能最佳實踐

1. **粒子效果數量**：根據設備性能調整，桌面版本可以更豐富
2. **動畫時長**：保持在 500-2000ms 範圍，避免過長動畫影響響應感
3. **複用效果**：盡量複用已有的粒子和動畫，而不是每次都創建新的
4. **條件應用**：只在必要的交互時刻觸發效果，不要持續運行

## 未來擴展方向

1. **動態光源**：根據場景內容動態調整光源位置和強度
2. **粒子系統高級特效**：融合物理引擎的高級粒子效果
3. **背景動畫**：為各個境界添加獨特的視覺動畫
4. **特殊符牌效果**：為高階符牌添加特殊的視覺效果
5. **場景轉換動畫**：使用光暈和粒子效果優化場景轉換過程

## 開發指南

### 添加新的視覺效果

1. 選擇合適的模組（decorations/panels/effects）
2. 定義效果參數（顏色、大小、時長等）
3. 在場景的適當位置調用相應函數
4. 進行性能測試確保流暢度
5. 記錄使用方式供其他開發者參考

### 調試技巧

- 使用 Phaser 的調試工具檢查視覺效果的位置和大小
- 調整光暈顏色的 Alpha 值來測試最佳透明度
- 使用時間軸工具檢查動畫時長是否合適

## 總結

本視覺設計系統提供了從簡單線條到精緻多層次的視覺體驗的完整升級。通過模組化的設計，開發者可以輕鬆地在各個場景中應用和自定義這些效果，同時保持視覺風格的一致性和遊戲性能。
