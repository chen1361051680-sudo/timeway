# 外部服务接入清单

本轮交付的是可运行的本地业务，不代表以下外部平台已接通。生产、开发、测试数据库通过路径和库内环境标记双重隔离。

## 百度地图

当前 `MAP_PROVIDER=manual`，该配置仅表达待接入状态，不会自动启用百度 SDK。客户端地图以区域列表、已有成果和需求入口替代；地点可手动填地址及选填坐标。没有坐标的有效服务仍入账，地图提示待机构补充地点。

后续需要 `BAIDU_MAP_BROWSER_AK`、`BAIDU_MAP_SERVER_AK`，按实际 SDK 配置域名白名单与服务端签名。服务端私密凭据不能发给浏览器。

替换位置：`src/adapters.mjs` 的地图／路线适配和 `public/app.js` 的 `mapPage`、地点表单、`route` 操作。适配结果统一为 `{provider, minutes, returnMinutes, distance}`，时间单位分钟，距离单位公里，无法计算为 `null`。`src/routing.mjs` 已实现预约占用时间＋去程＋返程＋缓冲的可用时间判断，并测试缺失结果不计零。真实路由请求需先获取或缓存结果，再调用纯业务规则；不得在 SQLite 写事务中等待网络。

固定网格在 `src/common.mjs` 的 `cellFor` 计算。坐标合同为 WGS84；接入百度的 BD-09 坐标时需要明确转换至此坐标系后存储，渲染时按 SDK 要求转换。公共接口仅公开网格编码和粗粒度区域，不能返回私人坐标与门牌。地图放缩、标记选中、实时定位、真实路线及距离排序属于本项待接入能力。

## 短信

`SMS_PROVIDER=development` 仅在 development／test 返回页面可见的模拟验证码，生产环境即使错误配置为 development 也拒绝发送。验证码五分钟有效，60 秒重发间隔，最多五次校验尝试，消费后不可重放。生产会话 Cookie 为 HttpOnly、SameSite=Lax、Secure。

真实接入边界支持 `SMS_PROVIDER=webhook`、`SMS_WEBHOOK_URL`（HTTPS）、`SMS_WEBHOOK_TOKEN`。服务端 POST `{phone, code, expiresIn:300}`，Authorization 为 Bearer token；仅将成功响应视为发送成功。需要供应商账号、签名与短信模板及转发适配，不能把 webhook 配置存在描述为已经成功发送。适配位置 `src/adapters.mjs`，业务位置 `src/auth.mjs`。

没有密码、万能验证码、生产快捷登录或隐藏测试账号。

## COS 附件

开发／测试附件本地替代位置 `data/<environment>-uploads`，保留附件元数据于 SQLite，仅相关已确认参与者和所属机构可访问。PNG、JPEG、WebP、PDF 最大 3 MB，检查文件头，下载作为附件返回。未通过报名者、其他机构和匿名用户无法读取。

生产 `upload=unavailable`：未接入 COS 时禁用文件上传，但可正常提交文字服务记录、核实和异议，不阻断核心业务。

后续需要 `COS_BUCKET`、`COS_REGION`，以及服务器运行身份的 `COS_SECRET_ID`／`COS_SECRET_KEY` 或等价临时角色授权。变量预留，不会自动调用 COS。替换位置 `src/http.mjs` 附件存取分支与 `src/adapters.mjs` 存储状态；将本地写入／读取替换为私有桶对象写入和受授权下载。必须保留同一业务权限检查、尺寸与类型校验，不把私人文件变成公共 URL；数据库保存对象键，不保存长效公开地址。

## 通知

站内通知已真实持久化。打开应用后会生成已确认服务／兑换开始前 24 小时的提醒，消息中心标记已读并跳转最新任务状态。业务状态通知不受显示提醒偏好影响。短信推送和浏览器离线推送不在已接通能力内，后续可复用站内通知记录，避免重复发送。
