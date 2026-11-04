# 启动拓扑 · 证据索引

配套 `startup-topology.dot`（Graphviz）与 `startup-flow.mmd`（Mermaid 时序）。
生成于 2026-11-04，作者视图：deployment-topology-analyzer + graphviz。
下面每一条都能在代码里直接翻到，无 `inferred` 节点；结论均经本机实测（起服务打接口、开库查表）。

| 图中节点 | 证据 | 置信度 |
| --- | --- | --- |
| 应用只监听 4000 | `启动系统.bat:11` `set "PORT=4000"`；`server/src/index.js:23` `process.env.PORT \|\| 4000` | high |
| Node 运行时二选一 | `启动系统.bat:15-19` 系统 node 优先；`:21-35` 回退 Qoder `exe` + `ELECTRON_RUN_AS_NODE` | high（两个运行时都实测过 `node:sqlite`） |
| 前后端同进程 | `server/src/index.js:93` 非 `/api/` 全部走 `serveStatic`；`:65-78` 从 `WEB_DIR` 读文件 | high |
| 前端无构建步骤 | `web/index.html:11-14` react.js / react-dom.js / babel.min.js + `<script type="text/babel" src="/app.jsx">` | high |
| 前端只能同源访问 | `web/app.jsx:5` `const BASE='/api'`，`:20` 相对 fetch —— 决定了不能拆独立前端服务 | high |
| 口令为 scrypt 哈希 | `server/src/auth.js:36-38` `scryptSync(password, salt, 32)`；`:24-36` 表 DDL 只有 `password_hash`/`salt` | high |
| 应用用户库是 SQLite | `server/src/auth.js:8` `users.db`；`:45` `new DatabaseSync(DB_FILE)`；实测 `server/data/users.db` 16384B、5 行 | high |
| 工单仍是 JSON | `server/src/store.js:7` `tickets.json`；实测 `/api/stats` 返回 total=6 | high |
| HMAC 密钥落盘 | `server/src/auth.js` `SECRET_FILE=.secret`，首启自动生成 | high |
| 浏览器窗口独立 profile | `启动系统.bat:93` `--app=... --user-data-dir=.webapp-profile` | high |
| 停止方式是按端口强杀 | `停止系统.bat:8-15` `netstat` 找 `:4000` LISTENING 的 PID → `taskkill /f` | high |
| H2 控制台走 8082 | `快递数据库/打开数据库.bat:16` `java -jar h2.jar`；`:6` 提示 localhost:8082 | high |
| H2 与代码无关联 | 全仓 grep 无任何 Node 侧引用 H2/JDBC；应用侧无 MySQL/H2 驱动 | high |
| H2 的 `password_hash` 是假数据 | `建表.sql:66-69` 插入字面量 `'占位哈希'`；实测 `SELECT password_hash FROM users` 返回该文本 | high |

## 已知边界与不确定性

- **只画了本机单机便携运行这一种形态**，没有任何 CI/CD、容器、云端或生产环境证据；不要据此推断线上拓扑。
- H2 库与 SQLite 库**表结构同构但数据不互通**，图里那条红色虚线（Node 不可达 H2）是刻意保留的架构结论，不是遗漏。
- 单用户场景下未验证两个进程并发写同一文件的行为（H2 自带独占锁，SQLite 默认日志模式也偏保守）。

## 重新渲染

```bash
# 拓扑图（需装 Graphviz；本机当前未检测到 dot.exe）
dot -Tsvg docs/architecture/startup-topology.dot -o docs/architecture/startup-topology.svg

# 时序图：Typora / VS Code Markdown Preview Mermaid / GitHub 直接贴 startup-flow.mmd 内容即可
```
