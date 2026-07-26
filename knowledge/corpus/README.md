# 嘉名完整原文语料库

这个目录保存大规模本地原文与全文检索索引。它与 `knowledge/wiki/` 的编辑性知识页分开：

- Wiki 负责来源、概念、候选姓名与互链关系。
- Corpus 负责完整原文和作品级全文检索。
- 浏览器先搜 Wiki；通过本地服务运行时，再并行搜索 Corpus。

## 当前语料

1. `chinese-poetry/chinese-poetry`（MIT）
   - 《全唐诗》约 5.5 万首
   - 《全宋诗》约 26 万首
   - 《全宋词》约 2.1 万首
   - 《诗经》《楚辞》《论语》《大学》《中庸》《孟子》
   - 曹操诗集、花间集/南唐词、元曲、纳兰性德诗集
2. `gujilab/chinese-classical-corpus`（数据 CC0）
   - 用于补齐完整四书、五经与十三经
3. `authorized/`
   - 用户自己拥有授权的近现代文本。未经授权的在版权作品不随程序分发。

上游原始数据位于 `vendor/`，本地索引为 `classics.sqlite`，统计见 `manifest.json`。这些大文件默认不提交到应用源码仓库，可运行 `npm run corpus:sync` 重新获取。

## 版权与版本说明

古典作品原文本身属于公有领域，但数字整理可能有单独的数据许可；本项目保留上游许可证与来源。毛泽东诗词等近现代作品在中国大陆截至 2026 年仍可能处于著作财产权保护期，因此默认只收录目录元数据与合法来源说明，不内置全文。用户取得合法授权后，可按 `authorized/README.md` 的格式导入。

## 运行

```powershell
npm run corpus:sync
npm run corpus:build
npm run corpus:status
```

构建后的全文库通过本地服务 `/api/kb/search` 查询，不会上传到在线站点。
