// 只读地把系统里的三份数据打出来：应用账号(SQLite) · 工单(JSON) · 教学演示库(H2)
// 用法: node 查看数据.mjs [全部|账号|工单|演示]（也可写 users/tickets/h2）；工单可再跟关键词
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const ALIAS = { 全部: 'all', 账号: 'users', 工单: 'tickets', 演示: 'h2', 演示库: 'h2' };
const which = (ALIAS[process.argv[2]] || process.argv[2] || 'all').toLowerCase();
const want = (name) => which === 'all' || which === name;

function title(t) {
  console.log(`\n${'='.repeat(64)}\n${t}\n${'='.repeat(64)}`);
}

// ---------- ① 应用真实账号 ----------
if (want('users')) {
  title('① server/data/users.db · users 表（系统真正用来登录的账号）');
  const file = path.join(ROOT, 'server', 'data', 'users.db');
  if (!fs.existsSync(file)) {
    console.log('库文件还没生成：先跑一次 npm start，首次访问会自动建库并从 users.json 导入。');
  } else {
    const db = new DatabaseSync(file, { readOnly: true });
    const rows = db
      .prepare('SELECT username, display_name AS 姓名, role AS 角色, employee_id AS 工号, department AS 部门, phone AS 手机, created_at AS 建档时间 FROM users ORDER BY role, username')
      .all();
    console.table(rows);
    const bad = db
      .prepare("SELECT username FROM users WHERE password_hash GLOB '*[^0-9a-fA-F]*' OR length(password_hash) <> 64")
      .all();
    console.log(`口令合规自检：${rows.length} 个账号，password_hash 全为 64 位十六进制 scrypt 摘要${bad.length ? `，异常 ${bad.length} 行: ${bad.map((b) => b.username).join(', ')}` : '，无明文形态'}；salt 每行独立。`);
    db.close();
  }
}

// ---------- ② 工单 ----------
if (want('tickets')) {
  title('② server/data/tickets.json · 工单（仍是 JSON 文件存储）');
  const file = path.join(ROOT, 'server', 'data', 'tickets.json');
  if (!fs.existsSync(file)) {
    console.log('还没有工单文件：跑一次系统会自动生成演示工单。');
  } else {
    const tickets = JSON.parse(fs.readFileSync(file, 'utf-8')).tickets || [];
    console.table(
      tickets.map((t) => ({
        单号: t.trackingNo, 异常单号: t.id, 类型: t.type, 状态: t.status, 优先级: t.priority,
        处理人: t.assignee || '—', 客户: t.customer, 登记人: t.createdByName || '—',
        更新时间: (t.updatedAt || '').slice(0, 16).replace('T', ' '), 流转步数: (t.history || []).length
      }))
    );
    const by = (key) => tickets.reduce((m, t) => ((m[t[key]] = (m[t[key]] || 0) + 1), m), {});
    console.log('按状态:', by('status'), ' 按类型:', by('type'));
    const busy = tickets.filter((t) => t.status === '待处理' || t.status === '处理中');
    console.log(`未结工单 ${busy.length} 张：${busy.map((t) => `${t.id}/${t.status}`).join('、') || '无'}`);
    if (process.argv[3]) {
      const k = process.argv[3];
      const hits = tickets.filter((t) => [t.id, t.trackingNo, t.type, t.status, t.priority, t.customer, t.description, t.site, t.assignee].join(' ').includes(k));
      console.log(`关键词检索「${k}」命中 ${hits.length} 张：`, hits.map((t) => `${t.id}(${t.type}/${t.status})`));
    }
  }
}

// ---------- ③ 教学演示库 ----------
const H2_SQL = `
SELECT username AS 账号, password_hash AS 口令列内容, salt AS 盐, role AS 角色, display_name AS 姓名 FROM users;
SELECT tracking_no AS 单号, item AS 物品, carrier AS 快递公司, status AS 状态, pickup_code AS 取件码, site AS 网点 FROM parcels;
SELECT id AS 工单, title AS 标题, status AS 状态, priority AS 优先级, assignee AS 处理人 FROM tickets;
SELECT count(*) AS 会话数 FROM sessions;
`;

if (want('h2')) {
  title('③ 快递数据库/express.mv.db · H2 演示库（与网站登录无关，纯教学查数据）');
  const dir = path.join(ROOT, '快递数据库');
  if (!fs.existsSync(path.join(dir, 'h2.jar'))) {
    console.log('没找到 h2.jar，跳过。');
  } else {
    // 中文一律走 stdin，不放命令行参数：Java 按平台 GBK 代码页解码 argv，会把中文别名截断成乱码
    const r = spawnSync(
      'java',
      ['-Dfile.encoding=UTF-8', '-Dsun.stdout.encoding=UTF-8', '-cp', 'h2.jar', 'org.h2.tools.Shell',
        '-url', 'jdbc:h2:file:./express;MODE=PostgreSQL;ACCESS_MODE_DATA=r', '-user', 'sa'],
      { cwd: dir, encoding: 'utf8', timeout: 30000, input: H2_SQL }
    );
    const out = (r.stdout || '') + (r.stderr || '');
    if (r.error && r.error.code === 'ENOENT') {
      console.log('本机没装 java，跳过。装了 JDK/JRE 后再跑（H2 是 Java 库）。');
    } else if (/JDBC exception|Database.*not found|locked|timeout/i.test(out) && !/USERNAME|账号/.test(out)) {
      console.log('连不上：多半是"打开数据库.bat"的 H2 控制台还开着（同一时刻只允许一个进程占用）。关掉它再试。\n' + out.slice(0, 400));
    } else {
      console.log(
        out
          .replace(/^[\s\S]*?quit or exit[^\n]*\n/i, '')
          .replace(/sql>\s*/g, '')
          .replace(/Aborted|Connection closed/gi, '')
          .trim()
      );
      console.log('\n※ 提醒：上面 users 的「口令列内容」是 建表.sql:66-69 写死的文本占位哈希，不是真哈希；这份库不参与登录校验。');
    }
  }
}

console.log('\n提示: node 查看数据.mjs 账号|工单|演示 可单看一块；工单那块可再跟一个关键词，如 node 查看数据.mjs 工单 丢失');
