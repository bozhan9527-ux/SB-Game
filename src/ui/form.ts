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

export interface FormField {
  key: string;
  label: string;
  /** 密碼欄會遮蔽，而且不進瀏覽器的自動完成紀錄。 */
  password?: boolean;
  placeholder?: string;
  maxLength?: number;
}

export interface FormOptions {
  title: string;
  /** 標題底下的說明。可以多行。 */
  note?: string;
  fields: FormField[];
  submit: string;
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
  background: rgba(6, 9, 13, 0.82);
  /* 遊戲本體關掉了觸控手勢，這一層要自己開回來，否則點不動。 */
  touch-action: auto;
  font-family: "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif;
}
.sb-form {
  width: min(88vw, 360px);
  box-sizing: border-box;
  padding: 22px 20px 18px;
  border: 2px solid #3a4652;
  border-radius: 10px;
  background: #131a22;
  color: #e8eef5;
}
.sb-form h2 { margin: 0 0 6px; font-size: 22px; color: #e8c46a; font-weight: 700; }
.sb-form p { margin: 0 0 16px; font-size: 13px; line-height: 1.6; color: #8fa0b0; white-space: pre-line; }
.sb-form label { display: block; margin: 0 0 12px; font-size: 14px; color: #8fa0b0; }
.sb-form input {
  box-sizing: border-box; width: 100%; margin-top: 5px; padding: 11px 10px;
  border: 1px solid #3a4652; border-radius: 6px;
  background: #0d1116; color: #e8eef5; font-size: 17px;
}
.sb-form input:focus { outline: none; border-color: #e8c46a; }
.sb-form-error { margin: 0 0 12px; font-size: 14px; color: #e0796d; min-height: 1em; white-space: pre-line; }
.sb-form-row { display: flex; gap: 10px; }
.sb-form button {
  flex: 1; padding: 12px 0; border-radius: 6px; font-size: 17px; cursor: pointer;
  border: 1px solid #3a4652; background: #1b242e; color: #e8eef5;
}
.sb-form button.sb-primary { border-color: #e8c46a; background: #e8c46a; color: #1a1408; font-weight: 700; }
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
      input.type = field.password === true ? 'password' : 'text';
      // 帳號用 username、密碼用 current-password：密碼管理員才認得出來。
      input.autocomplete = field.password === true ? 'current-password' : 'username';
      if (field.placeholder !== undefined) input.placeholder = field.placeholder;
      if (field.maxLength !== undefined) input.maxLength = field.maxLength;
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
    submit.className = 'sb-primary';
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
