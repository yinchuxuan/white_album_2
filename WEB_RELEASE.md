# Web 正式发布

`.github/workflows/web-release.yml` 在正式 Release 发布后，用固定提交的 WorldCardStation 发布器构建网页资源。开发提交和预发布不更新线上，现有桌面 PNG 分发不受影响。

配置 Secret `SITE_DISPATCH_TOKEN`，仅授权网站仓库 `yinchuxuan/WorldCardStation_website` 的 Contents Read and write；无需 Cloudflare 密钥。

Workflow 上传 `wcs-card-web.zip` 和 `wcs-card-web.zip.sha256`，完成后通知网站仓库。网站统一校验并与播放器组装，保留旧版卡片资源。首次接入请创建包含本 Workflow 的新正式版本。

发布器固定为 Workflow 中的 40 位 commit SHA。平台/Schema 兼容性是精确匹配；升级时明确更新发布器，不使用浮动 master。CI 不会为了通过检查修改游戏卡内容。

通知失败可在网站仓库手动执行部署；产物构建失败可在此手动运行 Workflow，输入已有正式 Release tag。已上传资产不会覆盖，重跑必须字节一致；已有版本内容变化时应发布新版本。

完整配置和恢复流程见网站仓库的 `RELEASING.md`。
