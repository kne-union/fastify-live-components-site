# @kne/fastify-live-components-site

Fastify 插件：为 LiveComponentEditor 提供远程站点文件树，并通过 shorten 短码免登录访问。

## 安装

```bash
npm i @kne/fastify-live-components-site
```

需已注册 `@kne/fastify-sequelize`、`@kne/fastify-namespace`、`@kne/fastify-shorten`；管理端还需 `@kne/fastify-account`（或自定义 `getAuthenticate`）。

## 使用

```javascript
await fastify.register(require('@kne/fastify-shorten'));
await fastify.register(require('@kne/fastify-live-components-site'), {
  prefix: '/api/v1/live-components-site'
});
```

Admin 创建站点后，将返回的 `host` 配置到前端 `sites: [{ host, name }]`。

公开站点入口（`{prefix}/:shorten/*`）与内容访问（`{prefix}/content/:code`）默认允许任意域跨域；站点管理（`{prefix}/site/*`）除外。

详见 [doc/api.md](doc/api.md)。
