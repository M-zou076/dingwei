# 校园出行助手 Cloudflare 部署版

此目录用于免费部署到 Cloudflare Workers，无需电脑常开或连接校园局域网。

功能包括匿名定位上报、3 分钟实时人流、绿黄红拥挤网格、隐私模糊红点、天气和出行建议。

部署时在 Cloudflare Workers & Pages 中导入 GitHub 仓库，根目录填写 `cloudflare-worker`，构建命令留空，部署命令使用 `npx wrangler deploy`。
