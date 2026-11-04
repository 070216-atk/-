import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ANOMALY_TYPES,
  PRIORITIES,
  STATUSES,
  nextStatuses,
  listTickets,
  getTicket,
  createTicket,
  updateStatus,
  assignTicket,
  addNote,
  stats,
  myStats
} from './store.js';
import { verifyCredentials, registerUser, issueToken, verifyToken, getProfile, updateProfile } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.join(__dirname, '..', '..', 'web');
const PORT = process.env.PORT || 4000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.jsx': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8'
};

function sendJSON(res, code, obj) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 1e6) { reject(new Error('payload too large')); req.destroy(); }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { reject(new Error('invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function getAuth(req) {
  const h = req.headers['authorization'] || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? verifyToken(m[1]) : null;
}

function serveStatic(res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.join(WEB_DIR, rel);
  if (!filePath.startsWith(WEB_DIR)) return sendJSON(res, 403, { error: 'forbidden' });
  fs.readFile(filePath, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(u.pathname);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization'
    });
    return res.end();
  }

  if (!pathname.startsWith('/api/')) return serveStatic(res, pathname);

  const q = u.searchParams;
  const parts = pathname.split('/').filter(Boolean); // ['api','tickets',':id',sub]

  try {
    // ---- 公开接口 ----
    if (req.method === 'GET' && pathname === '/api/health') return sendJSON(res, 200, { ok: true });
    if (req.method === 'GET' && pathname === '/api/meta')
      return sendJSON(res, 200, { anomalyTypes: ANOMALY_TYPES, priorities: PRIORITIES, statuses: STATUSES });

    if (req.method === 'POST' && pathname === '/api/login') {
      const body = await readBody(req);
      const user = verifyCredentials(body.username, body.password);
      if (!user) return sendJSON(res, 401, { error: '用户名或密码错误' });
      return sendJSON(res, 200, { token: issueToken(user), user });
    }

    if (req.method === 'POST' && pathname === '/api/register') {
      const body = await readBody(req);
      try {
        const user = registerUser(body);
        return sendJSON(res, 201, { token: issueToken(user), user });
      } catch (e) {
        return sendJSON(res, 400, { error: e.message });
      }
    }

    // ---- 以下需登录 ----
    const auth = getAuth(req);
    if (!auth) return sendJSON(res, 401, { error: '未登录或登录已过期' });

    if (req.method === 'GET' && pathname === '/api/stats') return sendJSON(res, 200, stats());
    if (req.method === 'GET' && pathname === '/api/mystats') return sendJSON(res, 200, myStats(auth.sub, auth.name));

    if (req.method === 'GET' && pathname === '/api/profile') {
      const p = getProfile(auth.sub);
      if (!p) return sendJSON(res, 404, { error: '用户不存在' });
      return sendJSON(res, 200, p);
    }
    if (req.method === 'POST' && pathname === '/api/profile') {
      const body = await readBody(req);
      try {
        const p = updateProfile(auth.sub, body);
        return sendJSON(res, 200, p);
      } catch (e) {
        return sendJSON(res, 400, { error: e.message });
      }
    }

    if (parts[1] === 'tickets') {
      const id = parts[2];
      const sub = parts[3];

      if (req.method === 'GET' && !id)
        return sendJSON(res, 200, listTickets({ status: q.get('status'), type: q.get('type'), keyword: q.get('keyword'), priority: q.get('priority') }));

      if (req.method === 'POST' && !id) {
        const body = await readBody(req);
        return sendJSON(res, 201, createTicket({ ...body, operator: auth.name, createdBy: auth.sub }));
      }

      const t = getTicket(id);
      if (!t) return sendJSON(res, 404, { error: '异常单不存在' });

      if (req.method === 'GET' && !sub)
        return sendJSON(res, 200, { ...t, nextStatuses: nextStatuses(t.status) });

      const body = await readBody(req);
      if (req.method === 'POST' && sub === 'status') {
        const nt = updateStatus(id, { ...body, operator: auth.name });
        return sendJSON(res, 200, { ...nt, nextStatuses: nextStatuses(nt.status) });
      }
      if (req.method === 'POST' && sub === 'assign') return sendJSON(res, 200, assignTicket(id, { ...body, operator: auth.name }));
      if (req.method === 'POST' && sub === 'note') return sendJSON(res, 200, addNote(id, { ...body, operator: auth.name }));
    }

    return sendJSON(res, 404, { error: 'not found' });
  } catch (e) {
    return sendJSON(res, 400, { error: e.message });
  }
});

server.listen(PORT, () => {
  console.log(`[express-anomaly] 服务已启动: http://localhost:${PORT}`);
});
