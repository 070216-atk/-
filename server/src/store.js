import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'tickets.json');

// 领域常量
export const ANOMALY_TYPES = ['延误', '丢失', '破损', '错发', '滞留', '拒收', '其他'];
export const PRIORITIES = ['高', '中', '低'];
// 工单状态与允许的流转顺序
export const STATUSES = ['待处理', '处理中', '已解决', '已关闭'];
const TRANSITIONS = {
  待处理: ['处理中', '已关闭'],
  处理中: ['已解决', '已关闭'],
  已解决: ['已关闭', '处理中'],
  已关闭: []
};

export function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}
export function nextStatuses(from) {
  return TRANSITIONS[from] || [];
}

function now() {
  return new Date().toISOString();
}

function seedTickets() {
  const base = Date.now();
  const mk = (i, over) => ({
    id: `EX${String(1001 + i)}`,
    trackingNo: over.trackingNo || `SF${String(1380000000 + i)}`,
    type: over.type,
    description: over.description,
    customer: over.customer,
    phone: over.phone || '138****0000',
    site: over.site || '北京朝阳网点',
    priority: over.priority || '中',
    status: over.status || '待处理',
    assignee: over.assignee || '',
    createdAt: new Date(base - (i + 1) * 3600 * 1000 * 6).toISOString(),
    updatedAt: new Date(base - i * 3600 * 1000 * 2).toISOString(),
    history: over.history || [
      { time: new Date(base - (i + 1) * 3600 * 1000 * 6).toISOString(), operator: '系统', action: '创建', detail: '异常单已登记' }
    ]
  });
  return [
    mk(0, { type: '延误', description: '承诺次日达,已超时3天未更新物流', customer: '张伟', status: '待处理', priority: '高' }),
    mk(1, { type: '破损', description: '外包装严重挤压,内件玻璃杯碎裂', customer: '李娜', status: '处理中', assignee: '王强', site: '上海浦东网点' }),
    mk(2, { type: '丢失', description: '物流显示已签收但客户未收到', customer: '陈杰', status: '处理中', assignee: '刘敏', priority: '高', site: '广州天河网点' }),
    mk(3, { type: '错发', description: '收到他人包裹,面单信息不符', customer: '赵敏', status: '已解决', assignee: '王强' }),
    mk(4, { type: '滞留', description: '到件后长期未派送,停留在中转场', customer: '孙磊', status: '待处理', site: '深圳南山网点' })
  ];
}

let cache = null;

function load() {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    cache = JSON.parse(raw);
    if (!Array.isArray(cache.tickets)) cache.tickets = [];
  } catch {
    cache = { tickets: seedTickets() };
    persist();
  }
  return cache;
}

function persist() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(cache, null, 2), 'utf-8');
}

export function listTickets({ status, type, keyword, priority } = {}) {
  let rows = load().tickets.slice();
  if (status) rows = rows.filter((t) => t.status === status);
  if (type) rows = rows.filter((t) => t.type === type);
  if (priority) rows = rows.filter((t) => t.priority === priority);
  if (keyword) {
    const k = String(keyword).toLowerCase();
    rows = rows.filter(
      (t) =>
        t.trackingNo.toLowerCase().includes(k) ||
        t.customer.toLowerCase().includes(k) ||
        t.description.toLowerCase().includes(k) ||
        t.id.toLowerCase().includes(k)
    );
  }
  rows.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  return rows;
}

export function getTicket(id) {
  return load().tickets.find((t) => t.id === id) || null;
}

function genId() {
  const n = load().tickets.length + 1001;
  let id = `EX${n}`;
  while (load().tickets.some((t) => t.id === id)) id = `EX${Math.floor(1000 + Math.random() * 90000)}`;
  return id;
}

export function createTicket(input) {
  const store = load();
  const ticket = {
    id: genId(),
    trackingNo: (input.trackingNo || '').trim(),
    type: ANOMALY_TYPES.includes(input.type) ? input.type : '其他',
    description: (input.description || '').trim(),
    customer: (input.customer || '').trim(),
    phone: (input.phone || '').trim(),
    site: (input.site || '').trim() || '未知网点',
    priority: PRIORITIES.includes(input.priority) ? input.priority : '中',
    status: '待处理',
    assignee: (input.assignee || '').trim(),
    createdBy: (input.createdBy || '').trim(),
    createdByName: (input.operator || '客服').trim(),
    createdAt: now(),
    updatedAt: now(),
    history: [{ time: now(), operator: input.operator || '客服', action: '创建', detail: '异常单已登记' }]
  };
  if (!ticket.trackingNo) throw new Error('快递单号必填');
  if (!ticket.description) throw new Error('问题描述必填');
  store.tickets.push(ticket);
  persist();
  return ticket;
}

export function updateStatus(id, { to, operator, note }) {
  const t = getTicket(id);
  if (!t) throw new Error('异常单不存在');
  if (!STATUSES.includes(to)) throw new Error('未知状态');
  if (!canTransition(t.status, to)) throw new Error(`不允许从「${t.status}」流转到「${to}」`);
  const from = t.status;
  t.status = to;
  t.updatedAt = now();
  t.history.push({
    time: now(),
    operator: operator || '处理人',
    action: `状态流转:${from}→${to}`,
    detail: note || `由「${from}」变更为「${to}」`
  });
  persist();
  return t;
}

export function assignTicket(id, { assignee, operator }) {
  const t = getTicket(id);
  if (!t) throw new Error('异常单不存在');
  t.assignee = (assignee || '').trim();
  t.updatedAt = now();
  t.history.push({
    time: now(),
    operator: operator || '调度',
    action: '指派',
    detail: t.assignee ? `指派给 ${t.assignee}` : '取消指派'
  });
  persist();
  return t;
}

export function addNote(id, { note, operator }) {
  const t = getTicket(id);
  if (!t) throw new Error('异常单不存在');
  if (!note || !note.trim()) throw new Error('备注内容不能为空');
  t.updatedAt = now();
  t.history.push({ time: now(), operator: operator || '处理人', action: '处理记录', detail: note.trim() });
  persist();
  return t;
}

export function stats() {
  const rows = load().tickets;
  const byStatus = {};
  const byType = {};
  STATUSES.forEach((s) => (byStatus[s] = 0));
  ANOMALY_TYPES.forEach((t) => (byType[t] = 0));
  rows.forEach((t) => {
    byStatus[t.status] = (byStatus[t.status] || 0) + 1;
    byType[t.type] = (byType[t.type] || 0) + 1;
  });
  return { total: rows.length, byStatus, byType };
}

// 个人工作台统计:按登录身份(用户名 + 姓名)归集
export function myStats(username, name) {
  const rows = load().tickets;
  const created = rows.filter((t) => t.createdBy === username).length;
  const assigned = rows.filter((t) => t.assignee && t.assignee === name);
  return {
    created,
    assigned: assigned.length,
    assignedDoing: assigned.filter((t) => t.status === '处理中').length,
    assignedDone: assigned.filter((t) => t.status === '已解决' || t.status === '已关闭').length
  };
}
