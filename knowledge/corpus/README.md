# 嘉名完整原文语料库

这个目录保存大规模本地原文。它与 `knowledge/wiki/` 的编辑性知识页分开：

- Wiki 负责来源、概念、候选姓名与互链关系。
- Corpus 负责完整原文和作品级全文检索。
- LLM Agent 按 `catalog.md` 用 find/grep/read 直接核对 Wiki 和上游原始文件。

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
   - 用户自己拥有合法使用权的文本。未经授权的在版权作品不随程序分发。

上游原始数据位于 `vendor/`。这些大文件默认不提交到应用源码仓库。仓库自带的 Wiki 可以独立使用；需要检索大规模完整原文时，再安装本目录记录的语料包。

## 下载固定版本语料包

推荐使用已经打包并记录校验值的版本：

- 夸克网盘：<https://pan.quark.cn/s/0f58be1b7b2e>
- 文件：`jiaming-corpus-v2026.07.26.tar.gz`
- 大小：`60,469,138` 字节
- SHA-256：`e683e58ebc8b2815878277c747062a29b2cde9559da1cd6fbaa99aef9f41539d`

查看当前下载信息：

```bash
npm run corpus:info
```

下载完成后安装：

```bash
npm run corpus:verify -- "/path/to/jiaming-corpus-v2026.07.26.tar.gz"
npm run corpus:install -- "/path/to/jiaming-corpus-v2026.07.26.tar.gz"
```

安装器会先校验文件大小和 SHA-256，检查压缩包中不存在越界路径，并且不会覆盖已有的 `vendor/` 内容。版本、来源提交和许可信息保存在 `corpus-package.json`。

## 从上游重新同步

```bash
npm run corpus:sync
```

该方式需要 Git 和网络，并获取上游仓库的当前版本；如需可复现结果，优先使用固定版本语料包。

## 版权与版本说明

古典作品原文本身属于公有领域，但数字整理可能有单独的数据许可；本项目保留上游许可证与来源。在版权作品不收录目录或全文。用户取得合法授权后，可按 `authorized/README.md` 的格式导入。

安装或同步完成后，LLM Agent 使用只读 Shell 直接检索文件，不会把原文上传到在线站点。模型不可用时应用直接显示错误，不生成本地降级回答。
