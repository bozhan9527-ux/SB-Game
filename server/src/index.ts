/**
 * Cloudflare Worker 入口。
 *
 * 路由刻意手寫、不引框架：目前只有五個端點，一個 switch 比任何 router 都好讀，
 * 而且冷啟動時少載一包東西。
 */
import type { Env } from './http';
import { corsHeaders, fail } from './http';
import { accountSalt, loginAccount, registerAccount } from './accounts';
import { getSave, putSave } from './saves';
import { distribution, leaderboard, submitScore } from './scores';
import { API_VERSION } from '../../src/net/protocol';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('origin');
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env, origin) });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '');

    try {
      if (path === `/${API_VERSION}/health` && request.method === 'GET') {
        return new Response('ok', { status: 200, headers: corsHeaders(env, origin) });
      }
      if (path === `/${API_VERSION}/account/salt` && request.method === 'POST') {
        return await accountSalt(request, env, origin);
      }
      if (path === `/${API_VERSION}/account/register` && request.method === 'POST') {
        return await registerAccount(request, env, origin);
      }
      if (path === `/${API_VERSION}/account/login` && request.method === 'POST') {
        return await loginAccount(request, env, origin);
      }
      if (path === `/${API_VERSION}/save/put` && request.method === 'POST') {
        return await putSave(request, env, origin);
      }
      if (path === `/${API_VERSION}/save/get` && request.method === 'POST') {
        return await getSave(request, env, origin);
      }
      if (path === `/${API_VERSION}/score` && request.method === 'POST') {
        return await submitScore(request, env, origin);
      }
      if (path === `/${API_VERSION}/leaderboard` && request.method === 'GET') {
        return await leaderboard(env, origin);
      }
      if (path === `/${API_VERSION}/distribution` && request.method === 'GET') {
        return await distribution(env, origin);
      }
      return fail('notFound', env, origin);
    } catch (error) {
      // 不把內部錯誤訊息回給客戶端，但要留在 Worker 的記錄裡。
      console.error('unhandled', error);
      return fail('serverError', env, origin);
    }
  },
};
