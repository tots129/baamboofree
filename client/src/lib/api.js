// Cliente HTTP da API.

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function request(method, url, body, { raw } = {}) {
  const opts = { method, credentials: 'same-origin', headers: {} };
  if (body !== undefined) {
    if (raw) {
      opts.body = body;
      opts.headers['Content-Type'] = body.type || 'application/octet-stream';
    } else {
      opts.body = JSON.stringify(body);
      opts.headers['Content-Type'] = 'application/json';
    }
  }
  let res;
  try {
    res = await fetch(url, opts);
  } catch (_) {
    throw new ApiError(0, 'Sem conexão com o servidor. Verifique sua internet.');
  }
  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    /* resposta sem JSON */
  }
  if (!res.ok) throw new ApiError(res.status, (data && data.error) || 'Algo deu errado. Tente de novo.');
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body ?? {}),
  put: (url, body) => request('PUT', url, body),
  patch: (url, body) => request('PATCH', url, body),
  del: (url) => request('DELETE', url),
  upload: (url, blob) => request('POST', url, blob, { raw: true }),
};
