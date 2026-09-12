# 数据与部署运行说明

本文件为后续明确部署时使用，本轮仅本地开发。不得直接在服务器修改受 Git 管理的代码，也不能通过发布覆盖 `.env`、数据库或用户文件。

## 运行参数

| 参数 | 默认／说明 |
| --- | --- |
| NODE_ENV | development；只接受 development、test、production |
| PORT | 4312；仅监听 127.0.0.1 |
| DATABASE_PATH | data/<environment>.sqlite；生产建议绝对路径 |
| PUBLIC_ORIGIN | 正式环境为 https://timeway.chhwork.cn |
| APP_VERSION | systemd 从 Git HEAD 注入 |
| BACKUP_DIR | backups；正式环境 /var/backups/timeway/sqlite |

数据库路径父目录会创建；库内 metadata.environment 必须匹配进程环境。不会自动导入模拟数据。建议生产 `.env` 明确配置 `NODE_ENV=production`、数据库路径与 PUBLIC_ORIGIN；勿复制开发 `.env`。

## 首次升级为业务版本

收到部署指令后先验证本地、提交和推送，再由服务器 fetch 指定 commit。保持已有 Nginx 反代、证书与其他项目不变。

检查 `/www/wwwroot/timeway/data` 和 `/var/backups/timeway/sqlite`，按最小权限创建并赋予 www 用户读写。新的 systemd 模板增加 `ReadWritePaths=/www/wwwroot/timeway/data`；此前只有静态页面的 ProtectSystem=strict 配置会阻止 SQLite 写入，需在部署时应用该定向写权限。不得放开其他项目目录。

在服务器 Node 24 下执行 `npm ci --omit=dev`、`npm run build`，保留现有 `.env`。首次数据库创建无需额外备份；已有库遇到结构迁移、高风险升级或重要配置变动前做一致性备份。真实短信未提供时生产登录会明确提示未接入；不能临时打开模拟认证解决。

重启已有 `timeway.service` 后检查 `/healthz`、实际绑定端口、日志和 SQLite 写入权限；检查 Nginx 配置、HTTP 跳转与 HTTPS。正式部署报告按 AGENTS.md 列明 commit、运行状态、端口、数据状态及证书。

## 定时一致性备份

`scripts/backup.mjs` 使用 Node SQLite backup API，不能用普通文件复制替代运行中的 WAL 数据库备份。生成后以只读连接执行 `PRAGMA integrity_check`，失败时命令非零退出。

部署模板 `timeway-backup.service` 与 `.timer` 每天 03:30 加随机延迟运行，Persistent=true 补跑错过的执行。安装并 enable timer 仅在后续部署时完成。备份 service 只写独立备份目录，保留所有旧备份，不自动删除；运营时应观察磁盘容量并制定经确认的保留策略。

## 恢复与回滚

1. 选择已通过完整性验证的备份并核对环境、日期、Git 版本和 schema 版本。
2. 先停止本项目进程，额外备份当前库；不影响其他项目。
3. 若仅回滚代码且 schema 兼容，不恢复数据库，保留升级后真实产生的数据。
4. 确需恢复数据时，先在独立目录验证备份，保留当前数据库及对应 WAL／SHM 整套文件，再恢复目标库至原路径。不要保留旧库 WAL 与新库混用。任何可能损失生产新数据的操作必须停止询问用户。
5. 恢复目标 commit 并重启，检查账务、幂等记录、会话与成果统计。程序拒绝打开高于自身支持版本的数据库，禁止通过强改 user_version 绕过。

Git 回滚不等于数据回滚。COS 对象需要独立持久化及生命周期管理，不能通过清理发布目录删除用户附件。
