// 响应 schema 会参与 fast-json-stringify 序列化：对象一律 additionalProperties: true 以免裁掉未声明字段；
// 用 nullable 而非类型数组（类型数组遇到不匹配的值会直接 500），类型不确定的字段（如 id、日期、JSON 列）只写说明不声明类型
const str = description => ({ type: 'string', nullable: true, description });
const num = description => ({ type: 'number', nullable: true, description });
const bool = description => ({ type: 'boolean', nullable: true, description });
const any = description => ({ description });
const list = (description, items) => ({ type: 'array', nullable: true, description, items });
const obj = (description, properties = {}) => ({ type: 'object', nullable: true, description, additionalProperties: true, properties });

const success = (description, schema) => ({
  200: Object.assign({}, schema || { type: 'object' }, { description })
});

const empty = (description = '操作成功，返回空对象') => success(description);

const PERMISSION = '权限：r 只读，rw 可读写';
const SITE_STATUS = '站点状态：open 开启，closed 关闭';

const site = obj('站点', {
  id: any('站点 ID（字符串）'),
  name: str('站点名称'),
  shorten: str('站点公开访问短码'),
  host: str('站点公开入口地址，由 getSiteHost(shorten) 生成，默认 {prefix}/{shorten}'),
  status: str(SITE_STATUS),
  defaultPermission: str(`新建节点默认${PERMISSION}`),
  options: any('站点扩展配置（JSON），如 aiEnabled: false 关闭 AI'),
  createdAt: any('创建时间'),
  updatedAt: any('更新时间'),
  deletedAt: any('删除时间，未删除为 null')
});

const nodeBase = {
  id: any('节点 ID（字符串）'),
  name: str('节点名称'),
  type: str('节点类型：file 文件，directory 文件夹'),
  permission: str(PERMISSION)
};

const treeNode = obj('文件树节点', Object.assign({}, nodeBase, { children: list('子节点列表（仅文件夹有），结构同本节点', obj('子节点')) }));

const contentShare = obj('内容分享短链', {
  id: any('分享记录 ID（字符串）'),
  nodeId: any('文件节点 ID（字符串）'),
  shorten: str('内容短码（大写）'),
  expires: any('过期时间，null 表示永久有效'),
  url: str('内容访问地址：{getContentHost()}/content/{shorten}，不带站点短码'),
  createdAt: any('创建时间')
});

module.exports = { str, num, bool, any, list, obj, success, empty, PERMISSION, SITE_STATUS, site, nodeBase, treeNode, contentShare };
