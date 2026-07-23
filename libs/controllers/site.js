const fp = require('fastify-plugin');

module.exports = fp(async (fastify, options) => {
  const { services } = fastify[options.name];

  fastify.get(
    `${options.prefix}/site/list`,
    {
      onRequest: options.getAuthenticate('site'),
      schema: {
        summary: '站点列表',
        query: {
          type: 'object',
          properties: {
            filter: { type: 'object', default: {} },
            perPage: { type: 'number', default: 20 },
            currentPage: { type: 'number', default: 1 }
          }
        }
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
        summary: '站点详情',
        query: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' }
          }
        }
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
        summary: '创建站点并签发 shorten 链接',
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string' },
            defaultPermission: { type: 'string', enum: ['r', 'rw'] },
            status: { type: 'string', enum: ['open', 'closed'] },
            options: { type: 'object' }
          }
        }
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
        summary: '修改站点（含开启/关闭）',
        body: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            status: { type: 'string', enum: ['open', 'closed'] },
            defaultPermission: { type: 'string', enum: ['r', 'rw'] },
            options: { type: 'object' }
          }
        }
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
        summary: '删除站点',
        body: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' }
          }
        }
      }
    },
    async request => {
      await services.site.remove(request.userInfo || {}, request.body);
      return {};
    }
  );
});
