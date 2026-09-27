# vocab-de

[English](README.md) | 中文

在浏览器里背德语单词的应用。面向手机、平板和电脑，支持普通浏览器离线学习，安装成应用是可选项。多设备同步是可选的，数据放在你自己控制的服务器上。界面有中文和英文，释义可以用任何语言写。

## 功能

- 内置 20 个 A1 示例词，可以先试用，再导入自己的词表
- 支持标签和批量选择，可批量整理标签、暂停／恢复复习及删除词条

- 提供三种独立安排复习时间的卡片，是否出现取决于词条类型和学习进度：
  - 释义：看德语回想意思，自己评分
  - 冠词（已填写冠词的名词）：只显示名词，选 der / die / das，按对错和反应时间自动评分
  - 拼写：看意思写德语，名词要带冠词；词义记牢以后才会出现
- 复习调度使用 [FSRS](https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm)，目标记忆率可选 85% / 90% / 95%
- 冠词练习答错时会提示词尾规律（-ung → die、-chen → das 等），复合词会指出最后一部分（Haustür → die Tür），规律不适用的词会标成例外
- 冠词自由练习：从学过的名词里抽，错得多的出现得多
- 粘贴导入，能识别常见词表写法：`der Tisch, -e 桌子`、`der Tisch, -e - table`、`gehen, ging, ist gegangen = to go`、Goethe 词表、表格里复制的两列；复数标记会展开成完整形式
- 离线优先：数据存在浏览器里（IndexedDB），每个版本的文件全部预先缓存，有网时再同步
- 界面参考 iOS 设计，宽屏时换成侧边栏；支持深色模式、调节字号、减弱动态效果和降低透明度
- 用系统自带的德语语音朗读，电脑上有快捷键

## 浏览器要求

前端使用 IndexedDB、Service Worker、ES 模块和现代 CSS，面向 iOS、iPadOS、Android、macOS、Windows、Linux 上较新的浏览器。目前没有经过完整验证的最低版本兼容表；安装入口、语音和存储行为会随浏览器与设备变化。

朗读调用 Web Speech。德语语音是否可用、能否离线朗读取决于浏览器和系统，应用本身不附带音频文件。

## 运行方式

只在本机学习可用静态托管；自部署同步可用 Node.js＋SQLite；托管同步可用 Cloudflare Workers＋D1。三种方式共用前端。学习规则仍针对德语；中文和英文是界面语言，释义可以用任何语言。

### 用 Node.js 自己部署

需要 Node.js 22.13 以上。VPS、NAS 或任何常开的电脑都可以。

```bash
npm install
export SYNC_TOKEN='replace-with-a-long-random-secret'
npm start
```

| 环境变量 | 默认值 | 用途 |
|---|---|---|
| `SYNC_TOKEN` | 未设置 | 同步口令。不设置也能用，只是没有同步 |
| `PORT` | `8787` | HTTP 端口 |
| `HOST` | `0.0.0.0` | 监听地址；本机反向代理可设为 `127.0.0.1` |
| `DB_PATH` | `vocab-de.sqlite` | SQLite 数据库路径，相对路径以运行目录为准 |

Service Worker 和剪贴板等安全上下文功能需要 HTTPS，本机开发可使用 localhost。其他设备通过网络访问时，需要在前面加一个带证书的反向代理，比如 [Caddy](https://caddyserver.com)：`caddy reverse-proxy --from vocab.example.com --to localhost:8787`。

### Cloudflare Workers

使用 Workers 静态资源与 D1，不必维护 Node 服务器。部署时查看自己账号的当前用量限制。

```bash
npm install
npx wrangler login
npx wrangler d1 create vocab-de
```

把输出里的 `database_id` 填进 `wrangler.jsonc`，再运行：

```bash
npx wrangler secret put SYNC_TOKEN
npx wrangler deploy
```

数据表会在第一次请求时自动创建。

### 静态托管，不带同步

前端就是一组普通文件。运行 `node scripts/build-sw.mjs`，把 `public/` 目录上传到任何静态托管（GitHub Pages、Netlify、自己的网页服务器）。除了同步，其他功能都能用；数据留在各自设备上，可以用 设置 → 导出 / 导入备份 转移。

## 直接使用与可选安装

打开部署后的网址就能开始学习，本机学习不需要账号，也不要求安装。首次离线使用前先联网打开，等待整套资源缓存完成；普通浏览器可以从收藏夹进入。

如果浏览器提供安装功能，可按需使用以下入口：

- iPhone / iPad：Safari 点“分享” → “添加到主屏幕”
- Mac：Safari 菜单“文件” → “添加到程序坞”
- Android：Chrome 菜单 → “安装应用”
- Windows / macOS / Linux 上的 Chrome 或 Edge：地址栏的安装图标，或者应用里 设置 → 安装

不要假设浏览器标签页与安装后的应用共享本地数据。在准备使用的入口连接同步或导入 JSON 备份。安装本身不能保证数据永不被清理。

启用同步需要先部署同步后端，在每台设备的 设置 → 同步 中填写相同的 `SYNC_TOKEN`。保存好配置的口令，不要每次重启都重新生成，否则原设备需要重新连接。连接其他设备：在一台设备的设置里点“复制口令给其他设备”，到另一台设备的设置里点“粘贴”。

界面语言跟随系统，可以在 设置 → 语言 里切换。

## 导入格式

一行一个词。德语和释义之间用 tab、` - `、` = ` 或 `: ` 分隔；中文释义可以直接跟在后面。

```
der Tisch, -e 桌子
die Mutter, ¨ - mother
der Lehrer, - teacher
das Kind (-er) - child
gehen, ging, ist gegangen = to go
Zeitung
```

逗号后面单独的 `-` 表示“复数和单数相同”，不算分隔符。没写释义或冠词的，可以在导入预览里直接补。

## 同步方式

每条记录带更新时间，服务器按“后写入的为准”合并，客户端按服务器序号增量拉取。两台设备离线时修改了同一个词，按记录的更新时间选择较新版本。设备时钟不一致可能影响合并结果。复习记录按独立 ID 同步。Cloudflare Worker 和 Node 服务器提供的是同一套接口。

## 数据与备份

词条、复习记录和设置保存在本机。JSON 导出包含词条、复习记录和设置；目前导入只合并词条和复习记录，不恢复设置，新设备需重新配置。CSV 只用于导出词表。清除网站数据及浏览器存储回收可能影响本地数据。迁移域名或浏览器配置前先导出备份。

每个同步服务对应一个共享词库，不是多用户独立账号系统。持有同步口令的人可以读取和修改这个词库。口令保护 `/api/*`，应用页面本身仍可公开访问。生产环境使用 HTTPS，同步不是端到端加密。

Node 后端启用 SQLite WAL 模式。应使用一致性 SQLite 备份，或停服后保留数据库及仍存在的 `-wal` 文件，再重启服务。运行时只复制主数据库文件可能漏掉最近写入。D1 的备份由 Cloudflare 单独管理。

## 开发

```bash
npm install
npm start          # Node 服务器，http://localhost:8787
npm run dev        # 或者 Cloudflare 本地环境（需要 .dev.vars 里写 SYNC_TOKEN）
npm test
```

```
public/              前端，纯 HTML/CSS/ES 模块，不需要打包
  js/fsrs.js         FSRS 调度
  js/german.js       词条解析、复数推导、冠词规律、拼写比对
  js/store.js        IndexedDB 存储、选卡、统计
  js/sync.js         增量同步
  js/i18n.js         中英文案
  js/app.js          界面
src/worker.js        同步接口 /api/sync，两种后端共用
src/sw.js            Service Worker 模板，构建时生成 public/sw.js
server/node.mjs      自部署服务器
server/d1-sqlite.mjs 用 SQLite 实现接口需要的 D1 方法
scripts/             构建脚本
test/                单元测试（node --test）
```

## 许可证

[MIT](LICENSE)
