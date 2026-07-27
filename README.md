# fastify-live-components-site

### 描述

Fastify 插件：为 LiveComponentEditor 提供远程站点文件树与短链访问管理

### 安装

```shell
npm i --save @kne/fastify-live-components-site
```

### 概述

# Live Components Site

为 `LiveComponentEditor` 提供远程站点文件树 API，并通过 shorten 短码免登录访问；站点链接由 admin 管理。

## 能力

- 管理端：创建/修改/开启关闭/删除站点，签发含 shorten 的访问 host
- 公开端：`{prefix}/{shorten}/*` 文件树读写，路径 shorten 校验，无需登录
- `GET {prefix}/content/{contentShorten}`：直出后端已保存 content（`text/plain`）；短码由 `content-share` 签发，URL **不含**站点 shorten，可设有效期并可管理删除


### 示例

### API

# API

## 配置项

| 属性名 | 说明 | 类型 | 默认值 |
|-----|----|----|-----|
| name | 命名空间 | string | `liveComponentsSite` |
| prefix | 路由前缀 | string | `/api/v1/live-components-site` |
| dbTableNamePrefix | 表前缀 | string | `t_live_components_site_` |
| siteTargetType | shorten target.type（站点） | string | `live-components-site` |
| contentTargetType | shorten target.type（内容分享） | string | `live-components-site-content` |
| getSiteHost | 由 shorten 组装站点 host | `(shorten) => string` | `` `${prefix}/${shorten}` `` |
| getContentHost | 内容短链基址（不含站点 shorten） | `() => string` | `` `${prefix}` `` → 访问路径 `` `${prefix}/content/{code}` `` |
| getShortenServices | 注入 shorten 服务 | `() => services` | `() => fastify.shorten.services` |
| getAuthenticate | 按功能返回鉴权中间件 | `(type) => middleware[]` | 见下表 |
| ai | AI 生成配置 | object | 见下表 |

### ai

| 属性名 | 说明 | 类型 | 默认值 |
|-----|----|----|-----|
| getAIModel | 返回 ai-sdk LanguageModel；未配置则全站 `aiEnabled: false` | `() => LanguageModel \| Promise<LanguageModel>` | `null` |
| catalogCacheDir | 远程组件文档索引缓存目录（按库名/版本落盘） | string | 插件内 `data/ai-catalog` |
| npmRegistry | 传给 `@kne/load-npm-info` 的 registry；不传则用其默认 | string | - |
| remotePackageNames | remote 名 → npm 包名；默认 `` `@kne-components/${name}` `` | object | `{}` |

站点 `options.aiEnabled === false` 时可关闭单站 AI（在 create/save 的 `options` 中配置）。

提示词（refine/generate）仅插件内置，不允许外部传入。

### getAuthenticate(type)

| type | 默认 |
|------|------|
| `entry` | 校验 path `:shorten`，写入 `request.authenticatePayload` |
| `site` / `site:create` / `site:manage` | `[authenticate.user, authenticate.admin]` |

## 管理端（需登录 admin）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `{prefix}/site/list` | 列表，`filter.status` / `filter.keyword`，`perPage` / `currentPage` |
| GET | `{prefix}/site/detail` | 详情，`?id=` |
| POST | `{prefix}/site/create` | 创建并签发 shorten，body: `{ name, defaultPermission?, status?, options? }` |
| POST | `{prefix}/site/save` | 修改，body: `{ id, name?, status?, defaultPermission?, options? }`；`status`: `open` / `closed` |
| POST | `{prefix}/site/remove` | 删除，body: `{ id }` |

创建返回含 `shorten`、`host`（可直接作为前端 `sites[].host`）。

站点字段：`status` `open` 开启 / `closed` 关闭；关闭后公开 API 返回 403，host/shorten 不变。站点与 shorten 均不过期。

## 公开端（path 含 shorten，无需登录）

`host` 形态：`{origin}{prefix}/{shorten}`

**CORS**：下列公开接口与内容访问接口均允许任意 Origin（`Access-Control-Allow-Origin: *`），并支持 `OPTIONS` 预检。站点管理接口（`{prefix}/site/*`）不启用该跨域策略。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `{host}/info` | `{ name, status, aiEnabled, defaultPermission }` |
| GET | `{host}/getFolderTree` | 文件树 |
| GET | `{host}/get?id=` | 读文件（JSON：`{ id, name, permission, content }`） |
| GET | `{prefix}/content/{contentShorten}` | 直出已保存 content（`text/plain`，无 `{code,data}`；不带站点 shorten） |
| POST | `{host}/content-share/create` | `{ id, expiresIn? }`，`expiresIn` 为秒，空/省略为永久；返回 `{ shorten, url, expires }`，`url` 为 `{prefix}/content/{shorten}` |
| GET | `{host}/content-share/list?id=` | 列出该文件未过期的内容短链 |
| POST | `{host}/content-share/remove` | `{ shorten }` |
| POST | `{host}/createFolder` | `{ parentId, name }` |
| POST | `{host}/create` | `{ parentId, name, content? }` |
| POST | `{host}/save` | `{ id, content }` |
| POST | `{host}/rename` | `{ id, name }` |
| POST | `{host}/remove` | `{ ids: string[] }` |
| POST | `{host}/ai/start` | 创建 AI 流任务；见下 |
| GET | `{host}/ai/stream?token=` | SSE 流式输出 |

### AI（需 `options.ai.getAIModel`）

`POST {host}/ai/start` body：

```js
{
  mode: 'refine' | 'generate',
  messages: [{ role: 'user'|'assistant', content: string }],
  content?: string,
  scope?: object,
  props?: object,
  libs?: string[],
  remotes?: [{ name, version, packageName? }],
  selection?: { startLine, endLine, code, label }
}
```

返回 `{ streamToken }`。随后 `GET {host}/ai/stream?token=` 以 SSE 推送：

- `{ text, done: false }` 增量文本
- `{ done: true, suggestedScope?, suggestedProps? }` 结束（生成阶段可通过工具声明组件域 / 组件参数）

前端从 `@kne/remote-loader` preset 收集 `remotes`，并从当前环境合并 `libs` 键名一并上传。服务端按「库名/版本」缓存组件文档索引（`load-npm-info` + `md-doc`）。

树节点：`{ id, name, type: 'file'|'directory', permission: 'r'|'rw', children? }`。

错误：无效/过期 shorten → 401；站点关闭 → 403。

## Shorten target

```json
{ "type": "live-components-site", "siteId": "<id>" }
```
