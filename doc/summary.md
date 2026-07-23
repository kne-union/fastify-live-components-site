# Live Components Site

为 `LiveComponentEditor` 提供远程站点文件树 API，并通过 shorten 短码免登录访问；站点链接由 admin 管理。

## 能力

- 管理端：创建/修改/开启关闭/删除站点，签发含 shorten 的访问 host
- 公开端：`{prefix}/{shorten}/*` 文件树读写，路径 shorten 校验，无需登录
- `GET {prefix}/content/{contentShorten}`：直出后端已保存 content（`text/plain`）；短码由 `content-share` 签发，URL **不含**站点 shorten，可设有效期并可管理删除
