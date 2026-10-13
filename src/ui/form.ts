/**
 * 疊在畫布上的表單。
 *
 * **為什麼不用 Phaser 畫：** 這一頁要收密碼。畫布上自己做的輸入框沒有
 * 密碼遮蔽、沒有手機鍵盤、沒有密碼管理員的自動填入，而且中文輸入法
 * 在 canvas 上根本沒有組字視窗。真正的 `<input>` 是唯一能用的答案。
 *
 * **為什麼不用 window.prompt：** 它一次只能問一個欄位、密碼會裸露在畫面上，
 * 而且長得像瀏覽器的錯誤訊息——在一個仙俠遊戲裡跳出來，觀感是「壞掉了」。
 * 部分 in-app 瀏覽器還會直接忽略它。
 *
 * 這裡不接 Phaser 的縮放：它是一層蓋住整個視窗的固定定位面板，
 * 不需要和遊戲座標對齊，也就不必處理 FIT 之後的縮放與置中。
 */

import { cleanEmail } from '../net/protocol';

export interface FormField {
  key: string;
  label: string;
  /** 密碼欄會遮蔽。 */
  password?: boolean;
  /** 信箱欄：手機鍵盤會換成帶 @ 的那一組。 */
  email?: boolean;
  /** 只收數字（驗證碼）：手機直接跳數字鍵盤。 */
  numeric?: boolean;
  placeholder?: string;
  maxLength?: number;
  /** 預先填好的值。 */
  value?: string;
  /** 唯讀：只給玩家複製用（例如剪貼簿不可用時顯示存檔碼），點一下就全選。 */
  readonly?: boolean;
}

export interface FormOptions {
  title: string;
  /** 標題底下的說明。可以多行。 */
  note?: string;
  fields: FormField[];
  submit: string;
  /**
   * 送出前的檢查。回一句話就顯示它並且**不關閉表單**——
   * 打錯一個字就把整張表清掉重來，是這種畫面最讓人火大的地方。
   */
  validate?: (values: Record<string, string>) => string | null;
  /** 送出會蓋掉或清掉東西時用紅色按鈕，和一般的「確定」分開。 */
  danger?: boolean;
}

/** 送出時回傳每個欄位的值；取消回 null。 */
export type FormResult = Record<string, string> | null;

const STYLE_ID = 'sb-form-style';

/**
 * 樣式只注入一次。
 *
 * 顏色直接寫死而不是從 theme.ts 讀：那一份是給 Phaser 的十六進位數字，
 * 這裡要的是 CSS 字串，兩邊硬要共用只會多一層轉換而已。
 */
function ensureStyle(): void {
  if (document.getElementById(STYLE_ID) !== null) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.sb-form-mask {
  position: fixed; inset: 0; z-index: 50;
  display: flex; align-items: center; justify-content: center;
  background: rgba(230, 220, 196, 0.86);
  /* 遊戲本體關掉了觸控手勢，這一層要自己開回來，否則點不動。 */
  touch-action: auto;
  font-family: "LXGW WenKai TC", "Kaiti TC", "STKaiti", "PingFang TC", "Noto Sans TC", serif;
}
.sb-form {
  width: min(88vw, 360px);
  box-sizing: border-box;
  padding: 22px 20px 18px;
  border: 2.5px solid #2a2622;
  border-radius: 3px 6px 4px 5px;
  background: #f5eddb;
  color: #2a2622;
  box-shadow: inset 0 0 0 6px #f5eddb, inset 0 0 0 7px rgba(200, 55, 45, 0.45), 4px 5px 0 rgba(42, 38, 34, 0.18);
  position: relative;
}
.sb-form h2 { margin: 0 0 6px; font-size: 24px; color: #2a2622; font-weight: 400; }
.sb-form p { margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #6a5d4e; white-space: pre-line; }
.sb-form label { display: block; margin: 0 0 12px; font-size: 15px; color: #6a5d4e; }
.sb-form input {
  box-sizing: border-box; width: 100%; margin-top: 5px; padding: 11px 10px;
  border: 0; border-bottom: 2px solid #2a2622; border-radius: 0;
  background: rgba(255, 255, 255, 0.45); color: #2a2622; font-size: 18px; font-family: inherit;
}
.sb-form input:focus {
  outline: none;
  border-bottom-color: #c8372d;
  background: rgba(255, 255, 255, 0.7);
}
.sb-form .sb-form-error {
  margin: 0 0 12px; font-size: 15px; color: #c8372d; min-height: 1em; white-space: pre-line;
  border-left: 3px solid #c8372d; padding-left: 8px;
}
.sb-form .sb-form-error:empty { border-left: 0; padding-left: 0; }
.sb-form p { text-wrap: pretty; }
.sb-form-row { display: flex; gap: 10px; }
.sb-form button {
  flex: 1; padding: 12px 0; border-radius: 3px 5px 4px 6px; font-size: 18px; cursor: pointer; font-family: inherit;
  border: 2px solid #2a2622; background: #e8d6b4; color: #2a2622;
  box-shadow: 3px 4px 0 rgba(42, 38, 34, 0.2);
}
.sb-form button:active:not(:disabled) {
  transform: translate(2px, 3px);
  box-shadow: none;
}
.sb-form button.sb-primary {
  background: #efd27a;
  color: #2a2622;
  box-shadow: inset 0 0 0 3px #efd27a, inset 0 0 0 4px #c8372d, 3px 4px 0 rgba(42, 38, 34, 0.2);
}
.sb-form button.sb-primary.sb-danger {
  background: #f0b0a8;
  color: #2a2622;
}
.sb-form button:disabled { opacity: 0.5; cursor: default; }
`;
  document.head.appendChild(style);
}

/**
 * 開一張表單，等使用者送出或取消。
 *
 * 回傳的 promise 一定會 resolve（取消是 null），不會 reject——呼叫端
 * 不必為了「使用者按了取消」寫 try/catch。
 */
export function showForm(options: FormOptions): Promise<FormResult> {
  ensureStyle();

  return new Promise<FormResult>((resolve) => {
    const mask = document.createElement('div');
    mask.className = 'sb-form-mask';

    const form = document.createElement('form');
    form.className = 'sb-form';

    const heading = document.createElement('h2');
    heading.textContent = options.title;
    form.appendChild(heading);

    if (options.note !== undefined) {
      const note = document.createElement('p');
      note.textContent = options.note;
      form.appendChild(note);
    }

    const inputs = new Map<string, HTMLInputElement>();
    for (const field of options.fields) {
      const label = document.createElement('label');
      label.textContent = field.label;
      const input = document.createElement('input');
      input.type = field.password === true ? 'password' : field.email === true ? 'email' : 'text';
      // 密碼管理員靠 autocomplete 認欄位：信箱用 username、密碼用 current-password。
      input.autocomplete =
        field.password === true ? 'current-password' : field.email === true ? 'username' : 'off';
      if (field.numeric === true) {
        input.inputMode = 'numeric';
        input.autocomplete = 'one-time-code';
      }
      if (field.placeholder !== undefined) input.placeholder = field.placeholder;
      if (field.maxLength !== undefined) input.maxLength = field.maxLength;
      if (field.value !== undefined) input.value = field.value;
      if (field.readonly === true) {
        input.readOnly = true;
        input.addEventListener('focus', () => input.select());
      }
      label.appendChild(input);
      form.appendChild(label);
      inputs.set(field.key, input);
    }

    const error = document.createElement('p');
    error.className = 'sb-form-error';
    form.appendChild(error);

    const row = document.createElement('div');
    row.className = 'sb-form-row';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = '取消';
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = options.danger === true ? 'sb-primary sb-danger' : 'sb-primary';
    submit.textContent = options.submit;
    row.append(cancel, submit);
    form.appendChild(row);
    mask.appendChild(form);
    document.body.appendChild(mask);

    // 手機上不自動聚焦：鍵盤一彈出來會把面板推到看不見的地方。
    // 桌機聚焦第一個欄位，省一次點擊。
    const first = inputs.values().next().value;
    if (first !== undefined && !('ontouchstart' in window)) first.focus();

    const close = (result: FormResult): void => {
      mask.remove();
      resolve(result);
    };

    cancel.addEventListener('click', () => close(null));
    // 點面板外面關閉。點在面板上不算——外面指的是面板以外，
    // 不是面板上沒有元件的地方。
    mask.addEventListener('click', (event) => {
      if (event.target === mask) close(null);
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const values: Record<string, string> = {};
      for (const [key, input] of inputs) values[key] = input.value;
      // 信箱欄先擋：全空送出時，訊息要指著第一個沒填的欄位，
      // 不是跳到表單後面去說「密碼至少要 8 個字」。
      for (const field of options.fields) {
        const input = inputs.get(field.key);
        if (field.email !== true || input === undefined) continue;
        if (cleanEmail(input.value) === null) {
          error.textContent = input.value.trim().length === 0 ? '先填電子信箱' : '電子信箱看起來不對';
          input.focus();
          return;
        }
      }
      const complaint = options.validate?.(values) ?? null;
      if (complaint !== null) {
        // 留在表單上：他已經打的東西不該因為一個錯字全部消失。
        error.textContent = complaint;
        return;
      }
      close(values);
    });
  });
}

/**
 * 一句話的提示框。用在「註冊成功」這種只需要被讀到的訊息。
 *
 * 存在的理由和上面同一個：`window.alert` 長得像錯誤訊息。
 */
export function showNotice(title: string, note: string): Promise<void> {
  return showForm({ title, note, fields: [], submit: '知道了' }).then(() => undefined);
}

/**
 * 確定／取消。取代 window.confirm，理由同上。按確定回 true，取消或點外面回 false。
 * 會蓋掉進度的確認一律用紅色按鈕。
 */
export function confirmForm(title: string, note: string, submit: string): Promise<boolean> {
  return showForm({ title, note, fields: [], submit, danger: true }).then((result) => result !== null);
}
