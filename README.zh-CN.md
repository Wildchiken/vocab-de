# vocab-de

[English](README.md) | 中文

背德语单词用的网页应用，在 iPhone、iPad、Mac 的 Safari 上使用，配置同步口令后可在多台设备间同步。后端使用 Cloudflare Workers + D1。

## 功能

- 每个词有三种卡片，各自安排复习时间：
  - 释义：看德语回想中文，自己评分
  - 冠词：只显示名词，选 der / die / das，按对错和反应时间自动评分
  - 拼写：看中文写德语，名词要带冠词；词义记牢以后才会出现
- 复习调度使用 [FSRS](https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm)，目标记忆率可选 85% / 90% / 95%
- 冠词练习答错时会提示词尾规律（-ung → die、-chen → das 等），复合词会指出最后一部分（Haustür → die Tür），规律不适用的词会标成例外
- 冠词自由练习：从学过的名词里抽，错得多的出现得多
- 粘贴导入，能识别常见词表写法：`der Tisch, -e 桌子`、`der Tisch, -e - table`、`gehen, ging, ist gegangen = to go`、Goethe 词表、Excel 两列；复数标记会展开成完整形式
- 离线可用：每个版本的文件全部预先缓存，更新在后台下载，不在学习中途切换；离线时的改动联网后自动同步，失败会自动重试
- 界面参考 iOS 26：悬浮标签栏，宽屏时换成侧边栏；支持深色模式、系统字号、减弱动态效果
- Safari 自带语音朗读，Mac 上有快捷键

## 部署

需要 Node.js 22 以上和一个 Cloudflare 账号。

```bash
npm install
npx wrangler login
npx wrangler d1 create vocab-de
```

把输出里的 `database_id` 填进 `wrangler.jsonc`，再设置同步口令并部署：

```bash
npx wrangler secret put SYNC_TOKEN
npx wrangler deploy
```

口令建议用随机字符串，比如 `openssl rand -hex 16`。数据表会在第一次请求时自动创建。每次部署会重新生成带内容哈希的 `public/sw.js`，设备会自动更新。

## 在设备上使用

1. Safari 打开部署后的地址，添加到主屏幕（iPhone / iPad：分享 → 添加到主屏幕；Mac：文件 → 添加到程序坞）
2. 从主屏幕或程序坞打开，进 设置 → 同步，填入 `SYNC_TOKEN`
3. 其他设备：在已连接的设备上点“复制口令给其他设备”，到新设备的设置里点“粘贴”。Mac 和 iPhone 之间用通用剪贴板可以直接粘贴

第 2 步要在添加后的 App 里做，不要在 Safari 里做：主屏幕 App 和 Safari 的数据是分开的。添加后的 App 离线可用，也不会被 Safari 清理长期未访问网站数据时清掉。

界面语言跟随系统，可以在 设置 → 语言 里切换。

## 本地开发

```bash
echo 'SYNC_TOKEN=dev-token-123' > .dev.vars
npm run dev
npm test
```

## 目录

```
public/            前端，纯 HTML/CSS/ES 模块，不需要打包
  js/fsrs.js       FSRS 调度
  js/german.js     词条解析、复数推导、冠词规律、拼写比对
  js/store.js      IndexedDB 存储、选卡、统计
  js/sync.js       增量同步
  js/app.js        界面
  js/i18n.js       中英文案
src/worker.js      同步接口 /api/sync
src/sw.js          Service Worker 模板（构建时生成 public/sw.js）
scripts/           构建脚本
test/              单元测试（node --test）
```

同步方式：每条记录带更新时间，服务器按“后写入的为准”合并，客户端按服务器序号增量拉取。两台设备离线时修改了同一个词，按记录的更新时间选择较新版本。设备时钟不一致可能影响合并结果。复习记录按独立 ID 同步。

## 许可证

[MIT](LICENSE)
