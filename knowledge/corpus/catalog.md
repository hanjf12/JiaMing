# 完整原文语料路径表

Agent 应先用本页缩小检索范围，再对相应目录执行固定字符串搜索。`vendor/` 是本机同步的上游原文件；若目录不存在，先由维护者运行 `npm run corpus:sync`，问答 Agent 不负责下载。

## 四书五经与十三经

优先使用 `gujilab/chinese-classical-corpus` 的简体整理版：

| 范围 | 路径 |
| --- | --- |
| 《大学》《中庸》《论语》《孟子》 | `knowledge/corpus/vendor/chinese-classical-corpus/output/sishu/` |
| 《诗经》《尚书》《礼记》《周易》《左传》 | `knowledge/corpus/vendor/chinese-classical-corpus/output/wujing/` |
| 《公羊传》《穀梁传》《孝经》《尔雅》 | `knowledge/corpus/vendor/chinese-classical-corpus/output/shisanjing/` |

来源：`gujilab/chinese-classical-corpus`，数据声明为 CC0-1.0。`chinese-poetry/论语`、`chinese-poetry/四书五经` 和 `chinese-poetry/诗经` 是可用于版本比对的另一份整理。

## 历代诗词

| 范围 | 路径或文件模式 |
| --- | --- |
| 全唐诗 | `knowledge/corpus/vendor/chinese-poetry/全唐诗/poet.tang.*.json` |
| 全宋诗 | `knowledge/corpus/vendor/chinese-poetry/全唐诗/poet.song.*.json` |
| 全宋词 | `knowledge/corpus/vendor/chinese-poetry/宋词/ci.song.*.json` |
| 元曲 | `knowledge/corpus/vendor/chinese-poetry/元曲/yuanqu.json` |
| 花间集、南唐词 | `knowledge/corpus/vendor/chinese-poetry/五代诗词/` |
| 《诗经》 | `knowledge/corpus/vendor/chinese-poetry/诗经/shijing.json` |
| 《楚辞》 | `knowledge/corpus/vendor/chinese-poetry/楚辞/chuci.json` |
| 曹操诗集 | `knowledge/corpus/vendor/chinese-poetry/曹操诗集/caocao.json` |
| 纳兰性德诗集 | `knowledge/corpus/vendor/chinese-poetry/纳兰性德/纳兰性德诗集.json` |

来源：`chinese-poetry/chinese-poetry`，MIT。注意上游把 `poet.song.*.json` 与唐诗文件放在同一个“全唐诗”目录中，必须按文件名前缀区分朝代。

## 近现代作品

- `knowledge/corpus/modern-catalog.json`：毛泽东诗词等作品目录，只包含作品名、作者、年代和版权状态。
- `knowledge/corpus/authorized/`：用户自行导入且有权使用的全文。

未获授权的近现代作品不得从外部网络补全文，也不得把模型记忆当作原文。

## 推荐命令

```bash
# 先看本机有哪些文件
rg --files knowledge/corpus

# 在宋词中核对精确原句
rg -n -F -m 8 -B 12 -A 5 "人间有味是清欢" knowledge/corpus/vendor/chinese-poetry/宋词

# 在四书中定位关键词
rg -n -F -m 8 -B 5 -A 5 "博学之，审问之，慎思之" knowledge/corpus/vendor/chinese-classical-corpus/output/sishu

# 检查近现代目录，不搜索未授权全文
rg -n -F -m 8 "沁园春·长沙" knowledge/corpus/modern-catalog.json
```

`classics.sqlite` 仍为网页的快速全文诊断服务保留，但 LLM Agent 不读取数据库；Agent 的证据链来自上述可直接检查的文件路径和行号。
