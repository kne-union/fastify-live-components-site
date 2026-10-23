const fp = require('fastify-plugin');
const { num, list, success, empty, PERMISSION, SITE_STATUS, site } = require('../schema/response');

const TAG = 'Live组件站点管理后台-站点';

const siteOptions = {
  type: 'object',
  description: '站点扩展配置（JSON），原样保存',
  properties: {
    aiEnabled: { description: '是否开启 AI 生成，传 false 关闭；未传视为开启（需同时配置插件 ai.getAIModel）' }
  }
};

module.exports = fp(async (fastify, options) => {
  const { services } = fastify[options.name];

  fastify.get(
    `${options.prefix}/site/list`,
    {
      onRequest: options.getAuthenticate('site'),
      schema: {
        tags: [TAG],
        summary: '站点列表',
        description: '分页查询站点，按创建时间倒序；可按状态与名称关键字筛选',
        query: {
          type: 'object',
          properties: {
            filter: {
              type: 'object',
              default: {},
              description: '筛选条件，如 filter[status]=open',
              properties: {
                status: { description: `按状态筛选，${SITE_STATUS}；其它值忽略` },
                keyword: { description: '按站点名称模糊匹配' }
              }
            },
            perPage: { type: 'number', default: 20, description: '每页条数' },
            currentPage: { type: 'number', default: 1, description: '当前页码，从 1 开始' }
          }
        },
        response: success('站点分页列表', {
          type: 'object',
          additionalProperties: true,
          properties: {
            pageData: list('当前页站点列表', site),
            totalCount: num('符合条件的站点总数')
          }
        })
      }
    },
    async request => {
      return services.site.list(request.userInfo || {}, request.query);
    }
  );

  fastify.get(
    `${options.prefix}/site/detail`,
    {
      onRequest: options.getAuthenticate('site'),
      schema: {
        tags: [TAG],
        summary: '站点详情',
        description: '按 ID 获取站点信息，含公开入口地址 host；站点不存在返回 404',
        query: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', description: '站点 ID' }
          }
        },
        response: success('站点详情', site)
      }
    },
    async request => {
      return services.site.detail(request.userInfo || {}, request.query);
    }
  );

  fastify.post(
    `${options.prefix}/site/create`,
    {
      onRequest: options.getAuthenticate('site:create'),
      schema: {
        tags: [TAG],
        summary: '创建站点并签发 shorten 链接',
        description: '创建站点后通过 shorten 服务签发站点公开访问短码，返回带 host 的站点信息',
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', description: '站点名称，去除首尾空格后不能为空' },
            defaultPermission: { type: 'string', enum: ['r', 'rw'], description: `新建节点默认${PERMISSION}；默认 rw` },
            status: { type: 'string', enum: ['open', 'closed'], description: `${SITE_STATUS}；默认 open` },
            options: siteOptions
          }
        },
        response: success('创建后的站点', site)
      }
    },
    async request => {
      return services.site.create(request.userInfo || {}, request.body);
    }
  );

  fastify.post(
    `${options.prefix}/site/save`,
    {
      onRequest: options.getAuthenticate('site:manage'),
      schema: {
        tags: [TAG],
        summary: '修改站点（含开启/关闭）',
        description: '只更新传入的字段；shorten、时间字段不可修改。关闭后站点公开入口与内容短链返回 403，重新开启后沿用原 host',
        body: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', description: '站点 ID' },
            name: { type: 'string', description: '站点名称，传入时去除首尾空格后不能为空' },
            status: { type: 'string', enum: ['open', 'closed'], description: SITE_STATUS },
            defaultPermission: { type: 'string', enum: ['r', 'rw'], description: `新建节点默认${PERMISSION}` },
            options: Object.assign({}, siteOptions, { description: '站点扩展配置（JSON），整体覆盖原值' })
          }
        },
        response: empty('保存成功')
      }
    },
    async request => {
      await services.site.save(request.userInfo || {}, request.body);
      return {};
    }
  );

  fastify.post(
    `${options.prefix}/site/remove`,
    {
      onRequest: options.getAuthenticate('site:manage'),
      schema: {
        tags: [TAG],
        summary: '删除站点',
        description: '删除站点及其全部文件节点、内容分享记录，并移除站点短码与内容短码',
        body: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', description: '站点 ID' }
          }
        },
        response: empty('删除成功')
      }
    },
    async request => {
      await services.site.remove(request.userInfo || {}, request.body);
      return {};
    }
  );
});
