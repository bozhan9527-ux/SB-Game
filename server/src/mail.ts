/**
 * 寄信。只有一種信：忘記密碼的驗證碼。
 *
 * **沒設定金鑰時整包是 no-op，而且會在記錄裡大聲說。** 和遙測、和 API 位址
 * 同一套規矩——但這一個的沉默特別危險：玩家會以為信寄出去了，
 * 坐在那裡等一封永遠不會到的信。所以呼叫端要看回傳值，
 * 不是「呼叫過就當作寄了」。
 *
 * 用 Resend：一支 HTTPS 請求就送得出去，Workers 上不必額外的 SDK。
 * 換成別家（Postmark、SES、SendGrid）只要改這一個函式。
 *
 * 要讓信不進垃圾桶，寄件網域必須設好 SPF 與 DKIM——那是網域那邊的設定，
 * 不是這裡的程式能解決的。RESEND_FROM 沒設好就會被退信。
 */
import type { Env } from './http';

export interface MailEnv {
  /** Resend 的 API 金鑰。存在 Cloudflare 的 secret 裡，不進版控。 */
  RESEND_KEY?: string;
  /** 寄件人，例如 `問道飛升 <no-reply@你的網域>`。 */
  RESEND_FROM?: string;
}

/**
 * 寄出驗證碼。
 *
 * 回傳「有沒有真的寄出去」。失敗不丟例外：忘記密碼那一頁的回應
 * **必須和「這個帳號不存在」長得一模一樣**，否則它就變成一個
 * 「查某個名字有沒有註冊」的工具。所以錯誤只能進記錄，不能進回應。
 */
export async function sendRecoveryMail(
  env: Env & MailEnv,
  to: string,
  name: string,
  code: string,
): Promise<boolean> {
  const key = env.RESEND_KEY;
  const from = env.RESEND_FROM;
  if (key === undefined || key.length === 0 || from === undefined || from.length === 0) {
    // 大聲說。安靜地失敗會讓玩家等一封永遠不會到的信。
    console.error('mail: RESEND_KEY / RESEND_FROM 沒有設定，驗證碼沒有寄出');
    return false;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: '問道飛升：重設密碼的驗證碼',
        // 純文字。這封信只有一個數字要傳達，HTML 只會多一份進垃圾桶的理由。
        text:
          `${name} 道友：\n\n` +
          `你的驗證碼是 ${code}\n\n` +
          '回到遊戲的「忘記密碼」把它填進去，就可以設一組新密碼。\n' +
          '三十分鐘內有效。不是你本人要求的話，忽略這封信即可——\n' +
          '在有人填對驗證碼之前，你的密碼不會有任何改變。\n',
      }),
    });
    if (!response.ok) {
      console.error('mail: 寄送失敗', response.status, await response.text());
      return false;
    }
    return true;
  } catch (error) {
    console.error('mail: 寄送時發生錯誤', error);
    return false;
  }
}
