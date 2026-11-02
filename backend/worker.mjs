import { createRemoteJWKSet, jwtVerify } from 'jose';

const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
class Failure extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export async function verifyIdentity(token, env, keys = googleKeys) {
  const { payload } = await jwtVerify(token, keys, {
    algorithms: ['RS256'], audience: env.GOOGLE_CLIENT_ID,
    issuer: ['https://accounts.google.com', 'accounts.google.com'], requiredClaims: ['exp', 'iat', 'sub', 'email']
  });
  // Personal Gmail identity only. No client-provided email or account IDs are trusted.
  if (!payload.sub || payload.email_verified !== true ||
      !String(payload.email).endsWith('@gmail.com') ||
      payload.email.toLowerCase() !== env.GOOGLE_ALLOWED_EMAIL?.trim().toLowerCase() ||
      (env.GOOGLE_ALLOWED_SUB && payload.sub !== env.GOOGLE_ALLOWED_SUB)) {
    throw new Failure(403, 'Esta conta Google não está autorizada.');
  }
  return { sub: payload.sub, email: payload.email, expiresAt: payload.exp * 1000 };
}

export function normalizeAccount(account, item, connection) {
  if (account.type !== 'BANK' || !['CHECKING_ACCOUNT', 'SAVINGS_ACCOUNT'].includes(account.subtype) || account.currencyCode !== 'BRL') return null;
  const cents = Math.round(account.balance * 100);
  const sourceUpdatedAt = item.statusDetail?.accounts?.lastUpdatedAt || item.lastUpdatedAt;
  if (!uuid.test(account.id) || account.itemId !== connection.id ||
      typeof account.balance !== 'number' || !Number.isSafeInteger(cents) || Math.abs(cents) > 99999999900 ||
      !iso(sourceUpdatedAt) || Date.parse(sourceUpdatedAt) > Date.now() + 300000) {
    throw new Failure(502, 'O banco retornou um saldo ou uma data inválida.');
  }
  return { accountId: account.id, itemId: connection.id, bank: connection.bank,
    name: String(account.name || 'Conta bancária').slice(0, 100),
    type: account.subtype === 'CHECKING_ACCOUNT' ? 'Conta corrente' : 'Poupança',
    cents, currency: 'BRL', sourceUpdatedAt: new Date(sourceUpdatedAt).toISOString() };
}

export function createWorker({ fetcher = fetch, verify = verifyIdentity, now = Date.now } = {}) {
  let key = '', keyUntil = 0, keyOwner = '', authPending, cached, cacheKey, cacheUntil = 0, pending;
  async function json(url, options = {}) {
    const response = await fetcher(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Failure(response.status === 429 ? 429 : 502, response.status === 429 ? 'Limite temporário. Tente novamente mais tarde.' : 'Não foi possível consultar a Pluggy. Os saldos anteriores foram mantidos.');
    return response.json();
  }
  async function apiKey(env) {
    const owner = env.PLUGGY_CLIENT_ID + ':' + env.PLUGGY_CLIENT_SECRET;
    if (keyOwner !== owner) { key = ''; keyUntil = 0; keyOwner = owner; }
    if (key && now() < keyUntil) return key;
    if (!authPending) authPending = json('https://api.pluggy.ai/auth', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: env.PLUGGY_CLIENT_ID, clientSecret: env.PLUGGY_CLIENT_SECRET })
    }).then(data => { if (typeof data.apiKey !== 'string' || !data.apiKey) throw new Failure(502, 'Falha na autorização com a Pluggy.'); key = data.apiKey; keyUntil = now() + 110 * 60000; return key; }).finally(() => { authPending = null; });
    return authPending;
  }
  async function pluggy(path, env) {
    const token = await apiKey(env);
    return json('https://api.pluggy.ai' + path, { headers: { 'X-API-KEY': token } });
  }
  function connections(env) {
    let items;
    try { items = JSON.parse(env.PLUGGY_ITEMS); } catch { throw new Failure(503, 'Configure as conexões do Meu Pluggy no servidor.'); }
    if (!Array.isArray(items) || !items.length || items.length > 5 || new Set(items.map(x => x?.id)).size !== items.length || items.some(x => !uuid.test(x?.id) || typeof x.bank !== 'string' || !x.bank.trim() || x.bank.length > 100)) throw new Failure(503, 'Confira a configuração das conexões no servidor.');
    return items;
  }
  async function readConnection(connection, env) {
    const result = { itemId: connection.id, bank: connection.bank, accounts: [], status: 'unavailable', message: '' };
    try {
      const item = await pluggy('/items/' + connection.id, env);
      if (item.id !== connection.id) throw new Failure(502, 'Conexão bancária inválida.');
      if (item.status === 'LOGIN_ERROR' || item.error?.code === 'USER_AUTHORIZATION_EXPIRED' ||
          (iso(item.consentExpiresAt) && Date.parse(item.consentExpiresAt) <= now())) {
        return { ...result, status: 'reauthorize', message: 'Renove a autorização no Meu Pluggy. O último saldo foi mantido.' };
      }
      if (item.status !== 'UPDATED' || (item.executionStatus !== 'SUCCESS' && item.statusDetail?.accounts?.isUpdated !== true)) {
        return { ...result, message: 'O banco ainda não forneceu uma atualização válida. O último saldo foi mantido.' };
      }
      const accounts = [];
      let page = 1;
      do {
        const data = await pluggy('/accounts?' + new URLSearchParams({ itemId: connection.id, type: 'BANK', page: String(page), pageSize: '100' }), env);
        if (!Array.isArray(data.results) || !Number.isInteger(data.totalPages) || data.totalPages < 0 || data.totalPages > 20) throw new Failure(502, 'Resposta de contas inválida.');
        for (const raw of data.results) { const account = normalizeAccount(raw, item, connection); if (account) accounts.push(account); }
        if (page >= data.totalPages) break;
        page++;
      } while (page <= 20);
      if (!accounts.length) return { ...result, message: 'Nenhuma conta corrente ou poupança em reais foi disponibilizada. Confira as autorizações no Meu Pluggy.' };
      if (new Set(accounts.map(x => x.accountId)).size !== accounts.length) throw new Failure(502, 'O banco retornou contas duplicadas.');
      return { ...result, accounts, status: 'ok' };
    } catch (e) { return { ...result, message: e instanceof Failure ? e.message : 'Falha temporária na consulta. O último saldo foi mantido.' }; }
  }
  return {
    async fetch(request, env) {
      const origin = request.headers.get('Origin');
      const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff' };
      const respond = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
      if (!env.ALLOWED_ORIGIN || origin !== env.ALLOWED_ORIGIN) return respond({ error: 'Origem não autorizada.' }, 403);
      headers['Access-Control-Allow-Origin'] = env.ALLOWED_ORIGIN;
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization', 'Access-Control-Max-Age': '600' } });
      const url = new URL(request.url);
      if (request.method !== 'GET') return respond({ error: 'Método não permitido.' }, 405);
      if (!['/session', '/balances'].includes(url.pathname) || url.search) return respond({ error: 'Rota não encontrada.' }, 404);
      try {
        if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_ALLOWED_EMAIL) throw new Failure(503, 'A integração ainda precisa ser configurada.');
        const match = /^Bearer ([A-Za-z0-9_.-]{20,10000})$/.exec(request.headers.get('Authorization') || '');
        if (!match) throw new Failure(401, 'Entre com sua conta Google para consultar.');
        let identity;
        try { identity = await verify(match[1], env); } catch (e) { throw e instanceof Failure ? e : new Failure(401, 'Sua sessão expirou ou não é válida. Entre novamente.'); }
        if (url.pathname === '/session') return respond(identity);
        if (!env.PLUGGY_CLIENT_ID || !env.PLUGGY_CLIENT_SECRET) throw new Failure(503, 'Configure as credenciais da Pluggy no servidor.');
        const items = connections(env), signature = JSON.stringify([env.PLUGGY_CLIENT_ID, env.PLUGGY_CLIENT_SECRET, items, identity.sub]);
        if (cacheKey !== signature) { cached = null; pending = null; cacheKey = signature; }
        if (!cached || now() >= cacheUntil) {
          if (!pending) pending = Promise.all(items.map(x => readConnection(x, env))).then(results => {
            cached = { connections: results, fetchedAt: new Date(now()).toISOString() }; cacheUntil = now() + 60000; return cached;
          }).finally(() => { pending = null; });
          await pending;
        }
        return respond({ ...cached, owner: { sub: identity.sub, email: identity.email } });
      } catch (e) { return respond({ error: e instanceof Failure ? e.message : 'Falha temporária. Tente novamente.' }, e instanceof Failure ? e.status : 502); }
    }
  };
}
export default createWorker();
