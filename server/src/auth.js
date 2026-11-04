import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'users.db');
const LEGACY_USERS_FILE = path.join(DATA_DIR, 'users.json');
const SECRET_FILE = path.join(DATA_DIR, '.secret');
const TOKEN_TTL_MS = 1000 * 60 * 60 * 8; // 8 小时

// 首次运行的内置演示账号
const SEED_USERS = [
  { username: 'admin', password: 'admin123', name: '系统管理员', role: 'admin' },
  { username: 'wangqiang', password: 'wang123', name: '王强', role: 'handler' },
  { username: 'liumin', password: 'liu123', name: '刘敏', role: 'handler' }
];

const DDL = `
CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  username       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash  TEXT NOT NULL,
  salt           TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'handler',
  display_name   TEXT NOT NULL,
  employee_id    TEXT NOT NULL DEFAULT '',
  department     TEXT NOT NULL DEFAULT '',
  phone          TEXT NOT NULL DEFAULT '',
  title          TEXT NOT NULL DEFAULT '',
  created_at     TEXT NOT NULL
)`;

function hashPw(password, salt) {
  return crypto.scryptSync(password, salt, 32).toString('hex');
}

let DB = null;

function db() {
  if (DB) return DB;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  DB = new DatabaseSync(DB_FILE);
  DB.exec(DDL);
  seedOrImport();
  return DB;
}

function insertUser({ id, username, password, hash, salt, role, name, profile = {}, createdAt }) {
  const p = { employeeId: '', department: '', phone: '', title: '', ...profile };
  db()
    .prepare(
      `INSERT INTO users (id, username, password_hash, salt, role, display_name, employee_id, department, phone, title, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id || crypto.randomUUID(),
      username,
      hash || hashPw(password, salt),
      salt,
      role || 'handler',
      name || username,
      p.employeeId,
      p.department,
      p.phone,
      p.title,
      createdAt || new Date().toISOString()
    );
}

// 空库时优先导入遗留的 users.json（保住已有账号的哈希），否则写入演示账号
function seedOrImport() {
  if (DB.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0) return;
  try {
    const rows = JSON.parse(fs.readFileSync(LEGACY_USERS_FILE, 'utf-8'));
    if (Array.isArray(rows) && rows.length) {
      rows
        .filter((u) => u && u.username && u.salt && u.hash)
        .forEach((u) =>
          insertUser({
            username: String(u.username),
            hash: u.hash,
            salt: u.salt,
            role: u.role,
            name: u.name,
            profile: u.profile
          })
        );
      fs.renameSync(LEGACY_USERS_FILE, `${LEGACY_USERS_FILE}.imported`);
      return;
    }
  } catch {
    // 遗留文件缺失或损坏，退回演示账号
  }
  SEED_USERS.forEach((u) => insertUser({ ...u, salt: crypto.randomBytes(16).toString('hex'), hash: undefined }));
}

function publicUser(u) {
  return {
    username: u.username,
    name: u.display_name,
    role: u.role,
    profile: { employeeId: u.employee_id, department: u.department, phone: u.phone, title: u.title }
  };
}

function findUser(username) {
  return db().prepare('SELECT * FROM users WHERE username = ?').get(String(username || '')) || null;
}

function loadSecret() {
  try {
    return fs.readFileSync(SECRET_FILE, 'utf-8').trim();
  } catch {
    const s = crypto.randomBytes(32).toString('hex');
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(SECRET_FILE, s, 'utf-8');
    return s;
  }
}
const SECRET = loadSecret();

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64');
}
function sign(data) {
  return b64url(crypto.createHmac('sha256', SECRET).update(data).digest());
}

export function getProfile(username) {
  const u = findUser(username);
  return u ? publicUser(u) : null;
}

export function updateProfile(username, patch) {
  const u = findUser(username);
  if (!u) throw new Error('用户不存在');
  const keep = (v, fallback) => (v == null ? fallback : String(v).trim());
  const name = keep(patch.name, u.display_name) || u.display_name;
  db()
    .prepare('UPDATE users SET display_name = ?, employee_id = ?, department = ?, phone = ?, title = ? WHERE id = ?')
    .run(
      name,
      keep(patch.employeeId, u.employee_id),
      keep(patch.department, u.department),
      keep(patch.phone, u.phone),
      keep(patch.title, u.title),
      u.id
    );
  return publicUser(findUser(username));
}

export function verifyCredentials(username, password) {
  const u = findUser(username);
  if (!u) return null;
  const candidate = hashPw(password || '', u.salt);
  const a = Buffer.from(candidate);
  const b = Buffer.from(u.password_hash);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return publicUser(u);
}

export function registerUser({ username, password, name }) {
  const uname = String(username || '').trim();
  const pname = String(name || '').trim();
  if (uname.length < 3) throw new Error('用户名至少 3 个字符');
  if (!/^[a-zA-Z0-9_]+$/.test(uname)) throw new Error('用户名只能包含字母、数字、下划线');
  if (!password || String(password).length < 6) throw new Error('密码至少 6 位');
  if (findUser(uname)) throw new Error('该用户名已被注册');
  const salt = crypto.randomBytes(16).toString('hex');
  insertUser({ username: uname, password: String(password), salt, name: pname, role: 'handler' });
  return publicUser(findUser(uname));
}

export function issueToken(user) {
  const payload = { sub: user.username, name: user.name, role: user.role, iat: Date.now(), exp: Date.now() + TOKEN_TTL_MS };
  const body = b64url(JSON.stringify(payload));
  return body + '.' + sign(body);
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expect = sign(body);
  const a = Buffer.from(sig || '');
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(unb64url(body).toString('utf-8'));
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}
