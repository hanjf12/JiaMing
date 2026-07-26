# 授权近现代文本导入区

仅把你有权保存和使用的文本放在这里。支持：

- JSON / JSONL：`title`、`author`、`content`，可选 `dynasty`、`source`、`license`
- TXT / Markdown：文件名作为作品名，全文作为内容

每份资料应同时记录授权来源。这里的内容会进入本机 `classics.sqlite`，不会编译进网页或上传到部署站点。

毛泽东诗词默认只在 `modern-catalog.json` 中保留目录元数据，不附全文。若你有出版社、权利人或其他合法来源的授权文本，可自行放入本目录后运行 `npm run corpus:build`。
