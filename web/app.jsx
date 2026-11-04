/* global React, ReactDOM */
const { useState, useEffect, useCallback } = React;

/* ---------- 鉴权 + API ---------- */
const BASE = '/api';
const TOKEN_KEY = 'ex_token';
const USER_KEY = 'ex_user';
const auth = {
  getToken: () => localStorage.getItem(TOKEN_KEY),
  getUser: () => { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; } },
  set: (token, user) => { localStorage.setItem(TOKEN_KEY, token); localStorage.setItem(USER_KEY, JSON.stringify(user)); },
  clear: () => { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); }
};
function emitLogout() { window.dispatchEvent(new CustomEvent('ex:logout')); }

async function req(url, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const token = auth.getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(BASE + url, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && url !== '/login') { auth.clear(); emitLogout(); }
  if (!res.ok) throw new Error(data.error || '请求失败 (' + res.status + ')');
  return data;
}
const api = {
  login: (username, password) => req('/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  register: (body) => req('/register', { method: 'POST', body: JSON.stringify(body) }),
  meta: () => req('/meta'),
  stats: () => req('/stats'),
  mystats: () => req('/mystats'),
  profile: () => req('/profile'),
  saveProfile: (body) => req('/profile', { method: 'POST', body: JSON.stringify(body) }),
  list: (params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null)).toString();
    return req('/tickets' + (q ? '?' + q : ''));
  },
  get: (id) => req('/tickets/' + id),
  create: (body) => req('/tickets', { method: 'POST', body: JSON.stringify(body) }),
  setStatus: (id, body) => req('/tickets/' + id + '/status', { method: 'POST', body: JSON.stringify(body) }),
  assign: (id, body) => req('/tickets/' + id + '/assign', { method: 'POST', body: JSON.stringify(body) }),
  addNote: (id, body) => req('/tickets/' + id + '/note', { method: 'POST', body: JSON.stringify(body) })
};

/* ---------- helpers ---------- */
function fmtTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}
const StatusTag = ({ status }) => <span className={'tag st-' + status}>{status}</span>;
const PriorityTag = ({ priority }) => <span className={'pr-' + priority}>{priority}优先</span>;

function ModalShell({ title, onClose, children, wide }) {
  return (
    <div className="mask" onClick={onClose}>
      <div className="modal" style={wide ? { maxWidth: 640 } : undefined} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="close-x" onClick={onClose}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------- 登录 / 注册 ---------- */
function Login({ onSuccess }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [f, setF] = useState({ username: '', name: '', password: '', confirm: '' });
  const [fe, setFe] = useState({}); // 字段级错误
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const upd = (k) => (e) => {
    const v = e.target.value;
    setF((s) => ({ ...s, [k]: v }));
    if (v.trim()) setFe((s) => { const n = { ...s }; delete n[k]; return n; });
  };
  const switchMode = (m) => { setMode(m); setFe({}); setErr(''); };

  function validate() {
    const e = {};
    if (!f.username.trim()) e.username = '请输入用户名';
    if (!f.password) e.password = '请输入密码';
    if (mode === 'register') {
      if (!f.name.trim()) e.name = '请输入姓名';
      if (f.username.trim() && f.username.trim().length < 3) e.username = '用户名至少 3 个字符';
      if (f.password && f.password.length < 6) e.password = '密码至少 6 位';
      if (!f.confirm) e.confirm = '请再次输入密码';
      else if (f.confirm !== f.password) e.confirm = '两次输入的密码不一致';
    }
    setFe(e);
    return Object.keys(e).length === 0;
  }

  async function submit(ev) {
    ev.preventDefault();
    setErr('');
    if (!validate()) return;
    setLoading(true);
    try {
      const { token, user } = mode === 'login'
        ? await api.login(f.username.trim(), f.password)
        : await api.register({ username: f.username.trim(), name: f.name.trim(), password: f.password });
      auth.set(token, user);
      onSuccess(user);
    } catch (ex) {
      setErr(ex.message || '操作失败');
      setLoading(false);
    }
  }

  const cls = (k) => (fe[k] ? 'err-input' : '');

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="brand"><span className="logo">📦</span><h1>快递异常处理系统</h1></div>
        <div className="sub">异常登记 · 工单流转 · 状态跟踪</div>

        <div className="tabs">
          <button type="button" className={'tab' + (mode === 'login' ? ' active' : '')} onClick={() => switchMode('login')}>登录</button>
          <button type="button" className={'tab' + (mode === 'register' ? ' active' : '')} onClick={() => switchMode('register')}>注册</button>
        </div>

        {err && <div className="err">{err}</div>}

        <div className="login-field">
          <label>用户名</label>
          <input className={cls('username')} value={f.username} onChange={upd('username')} placeholder="请输入用户名" autoFocus />
          {fe.username && <span className="ferr">{fe.username}</span>}
        </div>

        {mode === 'register' && (
          <div className="login-field">
            <label>姓名</label>
            <input className={cls('name')} value={f.name} onChange={upd('name')} placeholder="用于流转记录显示的真实姓名" />
            {fe.name && <span className="ferr">{fe.name}</span>}
          </div>
        )}

        <div className="login-field">
          <label>密码</label>
          <input type="password" className={cls('password')} value={f.password} onChange={upd('password')} placeholder={mode === 'register' ? '至少 6 位' : '请输入密码'} />
          {fe.password && <span className="ferr">{fe.password}</span>}
        </div>

        {mode === 'register' && (
          <div className="login-field">
            <label>确认密码</label>
            <input type="password" className={cls('confirm')} value={f.confirm} onChange={upd('confirm')} placeholder="请再次输入密码" />
            {fe.confirm && <span className="ferr">{fe.confirm}</span>}
          </div>
        )}

        <button type="submit" className="btn primary login-btn" disabled={loading}>
          {loading ? '处理中…' : mode === 'login' ? '登 录' : '注册并登录'}
        </button>

        {mode === 'login' ? (
          <div className="hint">
            演示账号:<br />
            管理员 <b>admin</b> / <b>admin123</b><br />
            处理人 <b>wangqiang</b> / <b>wang123</b> · <b>liumin</b> / <b>liu123</b>
          </div>
        ) : (
          <div className="hint">注册成功后将自动登录,并以后台处理人身份参与工单流转。</div>
        )}
      </form>
    </div>
  );
}

/* ---------- 登记表单(字段级校验) ---------- */
const REQUIRED_FIELDS = [
  { key: 'trackingNo', label: '快递单号' },
  { key: 'customer', label: '客户/收件人' },
  { key: 'description', label: '问题描述' }
];

function CreateModal({ meta, onClose, onCreated }) {
  const [form, setForm] = useState({
    trackingNo: '', type: (meta.anomalyTypes[0] || '其他'), description: '',
    customer: '', phone: '', site: '', priority: '中', assignee: ''
  });
  const [fieldErr, setFieldErr] = useState({});
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  function set(k) {
    return (e) => {
      const v = e.target.value;
      setForm((f) => ({ ...f, [k]: v }));
      if (v.trim()) setFieldErr((fe) => { const n = { ...fe }; delete n[k]; return n; });
    };
  }

  function validate() {
    const fe = {};
    REQUIRED_FIELDS.forEach(({ key, label }) => {
      if (!String(form[key] || '').trim()) fe[key] = '请填写' + label;
    });
    setFieldErr(fe);
    return Object.keys(fe).length === 0;
  }

  async function submit(e) {
    e.preventDefault();
    setErr('');
    if (!validate()) { setErr('请完善标红的必填项后再提交'); return; }
    setSaving(true);
    try { await api.create(form); onCreated(); }
    catch (ex) { setErr(ex.message); setSaving(false); }
  }

  const inputCls = (k) => (fieldErr[k] ? 'err-input' : '');

  return (
    <ModalShell title="登记快递异常单" onClose={onClose}>
      <form className="modal-body" onSubmit={submit}>
        {err && <div className="err">{err}</div>}
        <div className="form-grid">
          <div className="field full">
            <label>快递单号 *</label>
            <input className={inputCls('trackingNo')} value={form.trackingNo} onChange={set('trackingNo')} placeholder="如 SF1380000000" autoFocus />
            {fieldErr.trackingNo && <span className="ferr">{fieldErr.trackingNo}</span>}
          </div>
          <div className="field">
            <label>异常类型</label>
            <select value={form.type} onChange={set('type')}>{meta.anomalyTypes.map((t) => <option key={t}>{t}</option>)}</select>
          </div>
          <div className="field">
            <label>优先级</label>
            <select value={form.priority} onChange={set('priority')}>{meta.priorities.map((p) => <option key={p}>{p}</option>)}</select>
          </div>
          <div className="field">
            <label>客户/收件人 *</label>
            <input className={inputCls('customer')} value={form.customer} onChange={set('customer')} placeholder="姓名" />
            {fieldErr.customer && <span className="ferr">{fieldErr.customer}</span>}
          </div>
          <div className="field">
            <label>联系电话</label>
            <input value={form.phone} onChange={set('phone')} placeholder="手机号(选填)" />
          </div>
          <div className="field">
            <label>所属网点</label>
            <input value={form.site} onChange={set('site')} placeholder="如 北京朝阳网点(选填)" />
          </div>
          <div className="field">
            <label>指派处理人(可选)</label>
            <input value={form.assignee} onChange={set('assignee')} placeholder="留空暂不指派" />
          </div>
          <div className="field full">
            <label>问题描述 *</label>
            <textarea className={inputCls('description')} value={form.description} onChange={set('description')} placeholder="详细描述异常现象,如延误时长、破损情况等" />
            {fieldErr.description && <span className="ferr">{fieldErr.description}</span>}
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>取消</button>
          <button type="submit" className="btn primary" disabled={saving}>{saving ? '提交中…' : '确认登记'}</button>
        </div>
      </form>
    </ModalShell>
  );
}

/* ---------- 详情 + 流转 ---------- */
function DetailModal({ id, onClose, onChanged }) {
  const [ticket, setTicket] = useState(null);
  const [err, setErr] = useState('');
  const [assignee, setAssignee] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(id).then((t) => { setTicket(t); setAssignee(t.assignee || ''); }).catch((e) => setErr(e.message));
  }, [id]);

  if (err && !ticket) return <ModalShell title="异常单详情" onClose={onClose} wide><div className="modal-body"><div className="err">{err}</div></div></ModalShell>;
  if (!ticket) return <ModalShell title="异常单详情" onClose={onClose} wide><div className="modal-body">加载中…</div></ModalShell>;

  async function run(fn) {
    setErr(''); setBusy(true);
    try { await fn(); setTicket(await api.get(id)); onChanged && onChanged(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }
  function transit(to) { const n = note.trim(); run(() => api.setStatus(id, { to, note: n || undefined })); setNote(''); }
  const doAssign = () => run(() => api.assign(id, { assignee }));
  function doNote() {
    if (!note.trim()) { setErr('请先填写处理备注'); return; }
    run(() => api.addNote(id, { note })); setNote('');
  }

  return (
    <ModalShell title={'异常单 ' + ticket.id} onClose={onClose} wide>
      <div className="modal-body">
        {err && <div className="err">{err}</div>}
        <div className="kv">
          <div className="k">快递单号</div><div className="tk">{ticket.trackingNo}</div>
          <div className="k">异常类型</div><div>{ticket.type}</div>
          <div className="k">优先级</div><div><PriorityTag priority={ticket.priority} /></div>
          <div className="k">当前状态</div><div><StatusTag status={ticket.status} /></div>
          <div className="k">客户</div><div>{ticket.customer || '-'} {ticket.phone ? '(' + ticket.phone + ')' : ''}</div>
          <div className="k">所属网点</div><div>{ticket.site}</div>
          <div className="k">处理人</div><div>{ticket.assignee || <span className="sub">未指派</span>}</div>
          <div className="k">创建时间</div><div>{fmtTime(ticket.createdAt)}</div>
          <div className="k">问题描述</div><div>{ticket.description}</div>
        </div>

        <div className="section-title">工单流转</div>
        <div className="flow">
          {ticket.nextStatuses.length === 0 && <span className="sub">该单已终结,无可继续流转的状态。</span>}
          {ticket.nextStatuses.map((to) => (
            <button key={to} className="btn primary sm" disabled={busy} onClick={() => transit(to)}>
              {to === '已解决' ? '✓ 标记已解决' : to === '已关闭' ? '关闭工单' : '▶ 开始处理'} → {to}
            </button>
          ))}
        </div>
        <div className="sub" style={{ marginBottom: 10 }}>提示:先在下方填写处理备注再点流转按钮,备注会写入流转历史。</div>

        <div className="section-title">指派处理人</div>
        <div className="flow">
          <input style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8 }} value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="处理人姓名" />
          <button className="btn sm" disabled={busy} onClick={doAssign}>保存指派</button>
        </div>

        <div className="section-title">添加处理记录</div>
        <textarea style={{ width: '100%', padding: '9px 10px', border: '1px solid var(--border)', borderRadius: 8, minHeight: 60 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="记录本次处理动作/沟通结果" />
        <div style={{ marginTop: 8 }}><button className="btn sm" disabled={busy} onClick={doNote}>添加记录</button></div>

        <div className="section-title">流转历史</div>
        <div className="timeline">
          {ticket.history.slice().reverse().map((h, i) => (
            <div className="tl-item" key={i}>
              <div className="tl-meta">{fmtTime(h.time)} · {h.operator}</div>
              <div className="tl-action">{h.action}</div>
              <div className="sub">{h.detail}</div>
            </div>
          ))}
        </div>
      </div>
    </ModalShell>
  );
}

/* ---------- 个人信息完善 ---------- */
const PROFILE_FIELDS = [
  { key: 'name', label: '姓名', placeholder: '用于工单流转显示' },
  { key: 'employeeId', label: '工号', placeholder: '如 E1024' },
  { key: 'department', label: '部门 / 网点', placeholder: '如 北京朝阳网点' },
  { key: 'title', label: '职位', placeholder: '如 异常处理专员' },
  { key: 'phone', label: '联系电话', placeholder: '手机号' }
];

function profileComplete(profile) {
  const p = profile || {};
  return ['employeeId', 'department', 'title', 'phone'].every((k) => String(p[k] || '').trim());
}

function ProfileModal({ user, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: user.name || '',
    employeeId: (user.profile && user.profile.employeeId) || '',
    department: (user.profile && user.profile.department) || '',
    title: (user.profile && user.profile.title) || '',
    phone: (user.profile && user.profile.phone) || ''
  });
  const [fe, setFe] = useState({});
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const upd = (k) => (e) => {
    const v = e.target.value;
    setForm((s) => ({ ...s, [k]: v }));
    if (v.trim()) setFe((s) => { const n = { ...s }; delete n[k]; return n; });
  };

  async function submit(e) {
    e.preventDefault();
    setErr('');
    const e2 = {};
    if (!form.name.trim()) e2.name = '请填写姓名';
    if (!form.employeeId.trim()) e2.employeeId = '请填写工号';
    if (!form.department.trim()) e2.department = '请填写部门/网点';
    if (!form.title.trim()) e2.title = '请填写职位';
    if (!form.phone.trim()) e2.phone = '请填写联系电话';
    setFe(e2);
    if (Object.keys(e2).length) return;
    setSaving(true);
    try {
      const saved = await api.saveProfile(form);
      auth.set(auth.getToken(), saved);
      onSaved(saved);
    } catch (ex) { setErr(ex.message); setSaving(false); }
  }

  const cls = (k) => (fe[k] ? 'err-input' : '');

  return (
    <ModalShell title="个人信息" onClose={onClose}>
      <form className="modal-body" onSubmit={submit}>
        {err && <div className="err">{err}</div>}
        <div className="sub" style={{ marginBottom: 14 }}>账号:{user.username} · 角色:{user.role === 'admin' ? '管理员' : '处理人'}。完善资料后可在"我的工作台"查看个人处理统计。</div>
        <div className="form-grid">
          {PROFILE_FIELDS.map(({ key, label, placeholder }) => (
            <div className={'field' + (key === 'name' ? ' full' : '')} key={key}>
              <label>{label} *</label>
              <input className={cls(key)} value={form[key]} onChange={upd(key)} placeholder={placeholder} />
              {fe[key] && <span className="ferr">{fe[key]}</span>}
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>取消</button>
          <button type="submit" className="btn primary" disabled={saving}>{saving ? '保存中…' : '保存资料'}</button>
        </div>
      </form>
    </ModalShell>
  );
}

/* ---------- 主应用 ---------- */
function App() {
  const [user, setUser] = useState(() => (auth.getToken() ? auth.getUser() : null));
  const [meta, setMeta] = useState({ anomalyTypes: [], priorities: [], statuses: [] });
  const [stats, setStats] = useState(null);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ keyword: '', status: '', type: '', priority: '' });
  const [showCreate, setShowCreate] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [myWork, setMyWork] = useState(null);
  const [showProfile, setShowProfile] = useState(false);

  const refreshList = useCallback(() => {
    if (!user) return;
    setLoading(true);
    api.list(filters).then((rows) => { setList(rows); setError(''); })
      .catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [filters, user]);

  const refreshStats = useCallback(() => { if (user) api.stats().then(setStats).catch(() => {}); }, [user]);
  const refreshMyStats = useCallback(() => { if (user) api.mystats().then(setMyWork).catch(() => {}); }, [user]);

  useEffect(() => {
    function onLogout() { setUser(null); }
    window.addEventListener('ex:logout', onLogout);
    return () => window.removeEventListener('ex:logout', onLogout);
  }, []);

  useEffect(() => { if (user) api.meta().then(setMeta).catch((e) => setError(e.message)); }, [user]);
  useEffect(() => { refreshList(); }, [refreshList]);
  useEffect(() => { refreshStats(); }, [refreshStats]);
  useEffect(() => { refreshMyStats(); }, [refreshMyStats]);

  function refreshAll() { refreshList(); refreshStats(); refreshMyStats(); }
  function logout() { auth.clear(); setUser(null); }
  const setF = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  const hasFilter = filters.keyword || filters.status || filters.type || filters.priority;

  if (!user) return <Login onSuccess={(u) => setUser(u)} />;

  const needProfile = !profileComplete(user.profile);

  return (
    <div className="app">
      <div className="topbar">
        <h1><span className="logo">📦</span> 快递异常处理系统 <span className="sub">异常登记 · 工单流转 · 状态跟踪</span></h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button className="user-chip" onClick={() => setShowProfile(true)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>
            <span className="avatar">{(user.name || user.username).slice(0, 1)}</span>
            {user.name} <span className="sub">({user.role === 'admin' ? '管理员' : '处理人'})</span>
            {needProfile && <span className="badge-dot" title="资料待完善">待完善</span>}
          </button>
          <button className="btn primary" onClick={() => setShowCreate(true)}>+ 登记异常</button>
          <button className="btn" onClick={logout}>退出登录</button>
        </div>
      </div>

      {stats && (
        <div className="stats">
          <div className="stat"><div className="num">{stats.total}</div><div className="label">异常单总数</div></div>
          <div className="stat pending"><div className="num">{stats.byStatus['待处理'] || 0}</div><div className="label">待处理</div></div>
          <div className="stat doing"><div className="num">{stats.byStatus['处理中'] || 0}</div><div className="label">处理中</div></div>
          <div className="stat done"><div className="num">{stats.byStatus['已解决'] || 0}</div><div className="label">已解决</div></div>
        </div>
      )}

      {myWork && (
        <div className="workbench">
          <span className="wb-title">我的工作台</span>
          <span className="wb-item">我登记 <b>{myWork.created}</b></span>
          <span className="wb-item">我负责 <b>{myWork.assigned}</b></span>
          <span className="wb-item doing">处理中 <b>{myWork.assignedDoing}</b></span>
          <span className="wb-item done">已完成 <b>{myWork.assignedDone}</b></span>
          {needProfile && <span className="wb-tip">补全个人信息可获得更准确的归属统计 →</span>}
        </div>
      )}


      <div className="toolbar">
        <input type="text" placeholder="搜索单号 / 客户 / 描述…" value={filters.keyword} onChange={setF('keyword')} />
        <select value={filters.status} onChange={setF('status')}><option value="">全部状态</option>{meta.statuses.map((s) => <option key={s}>{s}</option>)}</select>
        <select value={filters.type} onChange={setF('type')}><option value="">全部类型</option>{meta.anomalyTypes.map((t) => <option key={t}>{t}</option>)}</select>
        <select value={filters.priority} onChange={setF('priority')}><option value="">全部优先级</option>{meta.priorities.map((p) => <option key={p}>{p}</option>)}</select>
        {hasFilter && <button className="btn sm" onClick={() => setFilters({ keyword: '', status: '', type: '', priority: '' })}>清空筛选</button>}
      </div>

      {error && <div className="err">{error}</div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>快递单号</th><th>类型</th><th>问题描述</th><th>优先级</th><th>状态</th><th>处理人</th><th>更新时间</th><th></th></tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="empty">加载中…</td></tr>}
            {!loading && list.length === 0 && <tr><td colSpan={8} className="empty">没有符合条件的异常单</td></tr>}
            {!loading && list.map((t) => (
              <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => setDetailId(t.id)}>
                <td className="tk">{t.trackingNo}</td>
                <td>{t.type}</td>
                <td className="desc" title={t.description}>{t.description}</td>
                <td><PriorityTag priority={t.priority} /></td>
                <td><StatusTag status={t.status} /></td>
                <td>{t.assignee || '-'}</td>
                <td className="sub">{fmtTime(t.updatedAt)}</td>
                <td><button className="btn sm" onClick={(e) => { e.stopPropagation(); setDetailId(t.id); }}>详情</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && <CreateModal meta={meta} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); refreshAll(); }} />}
      {detailId && <DetailModal id={detailId} onClose={() => setDetailId(null)} onChanged={refreshAll} />}
      {showProfile && <ProfileModal user={user} onClose={() => setShowProfile(false)} onSaved={(u) => { setUser(u); setShowProfile(false); refreshAll(); }} />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
