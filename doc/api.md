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

树节点：`{ id, name, type: 'file'|'directory', permission: 'r'|'rw', children? }`。

错误：无效/过期 shorten → 401；站点关闭 → 403。

## Shorten target

```json
{ "type": "live-components-site", "siteId": "<id>" }
```
