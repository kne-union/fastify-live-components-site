const fp = require('fastify-plugin');
const { allowCors, handleOptions, normalizeHooks } = require('../utils/cors');

module.exports = fp(async (fastify, options) => {
  const { services } = fastify[options.name];
  const entryAuth = options.getAuthenticate('entry');
  const withEntryAuth = [allowCors, ...normalizeHooks(entryAuth)];

  // 预检：内容访问 + 站点公开入口（不含 /site 管理）
  fastify.options(
    `${options.prefix}/content/:contentShorten`,
    {
      schema: { hide: true }
    },
    handleOptions
  );
  fastify.options(
    `${options.prefix}/:shorten/*`,
    {
      schema: { hide: true }
    },
    handleOptions
  );

  // 公开内容短链：不带站点 shorten，须注册在 /:shorten/* 之前
  fastify.get(
    `${options.prefix}/content/:contentShorten`,
    {
      onRequest: allowCors,
      schema: {
        summary: '通过内容短码直出已保存 content（text/plain，无 code/data；不带站点 shorten）',
        params: {
          type: 'object',
          required: ['contentShorten'],
          properties: {
            contentShorten: { type: 'string' }
          }
        }
      }
    },
    async (request, reply) => {
      const content = await services.contentShare.resolveByCode({
        contentShorten: request.params.contentShorten
      });
      reply.type('text/plain; charset=utf-8');
      return content;
    }
  );

  fastify.get(
    `${options.prefix}/:shorten/getFolderTree`,
    {
      onRequest: withEntryAuth,
      schema: {
        summary: '获取站点文件树',
        params: {
          type: 'object',
          required: ['shorten'],
          properties: {
            shorten: { type: 'string' }
          }
        }
      }
    },
    async request => {
      return services.node.getFolderTree(request.authenticatePayload);
    }
  );

  fastify.get(
    `${options.prefix}/:shorten/get`,
    {
      onRequest: withEntryAuth,
      schema: {
        summary: '读取文件内容',
        params: {
          type: 'object',
          required: ['shorten'],
          properties: {
            shorten: { type: 'string' }
          }
        },
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
      return services.node.get(request.authenticatePayload, request.query);
    }
  );

  fastify.post(
    `${options.prefix}/:shorten/content-share/create`,
    {
      onRequest: withEntryAuth,
      schema: {
        summary: '创建文件内容分享短链（可设有效期）',
        params: {
          type: 'object',
          required: ['shorten'],
          properties: {
            shorten: { type: 'string' }
          }
        },
        body: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
            expiresIn: { type: ['number', 'null'] }
          }
        }
      }
    },
    async request => {
      return services.contentShare.create(request.authenticatePayload, request.body);
    }
  );

  fastify.get(
    `${options.prefix}/:shorten/content-share/list`,
    {
      onRequest: withEntryAuth,
      schema: {
        summary: '列出文件已有内容分享短链',
        params: {
          type: 'object',
          required: ['shorten'],
          properties: {
            shorten: { type: 'string' }
          }
        },
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
      return services.contentShare.list(request.authenticatePayload, request.query);
    }
  );

  fastify.post(
    `${options.prefix}/:shorten/content-share/remove`,
    {
      onRequest: withEntryAuth,
      schema: {
        summary: '删除文件内容分享短链',
        params: {
          type: 'object',
          required: ['shorten'],
          properties: {
            shorten: { type: 'string' }
          }
        },
        body: {
          type: 'object',
          required: ['shorten'],
          properties: {
            shorten: { type: 'string' }
          }
        }
      }
    },
    async request => {
      return services.contentShare.remove(request.authenticatePayload, request.body);
    }
  );

  fastify.post(
    `${options.prefix}/:shorten/createFolder`,
    {
      onRequest: withEntryAuth,
      schema: {
        summary: '创建文件夹',
        params: {
          type: 'object',
          required: ['shorten'],
          properties: {
            shorten: { type: 'string' }
          }
        },
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            parentId: { type: ['string', 'null'] },
            name: { type: 'string' }
          }
        }
      }
    },
    async request => {
      return services.node.createFolder(request.authenticatePayload, request.body);
    }
  );

  fastify.post(
    `${options.prefix}/:shorten/create`,
    {
      onRequest: withEntryAuth,
      schema: {
        summary: '创建文件',
        params: {
          type: 'object',
          required: ['shorten'],
          properties: {
            shorten: { type: 'string' }
          }
        },
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            parentId: { type: ['string', 'null'] },
            name: { type: 'string' },
            content: { type: 'string' }
          }
        }
      }
    },
    async request => {
      return services.node.create(request.authenticatePayload, request.body);
    }
  );

  fastify.post(
    `${options.prefix}/:shorten/save`,
    {
      onRequest: withEntryAuth,
      schema: {
        summary: '保存文件内容',
        params: {
          type: 'object',
          required: ['shorten'],
          properties: {
            shorten: { type: 'string' }
          }
        },
        body: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
            content: { type: 'string' }
          }
        }
      }
    },
    async request => {
      return services.node.save(request.authenticatePayload, request.body);
    }
  );

  fastify.post(
    `${options.prefix}/:shorten/rename`,
    {
      onRequest: withEntryAuth,
      schema: {
        summary: '重命名节点',
        params: {
          type: 'object',
          required: ['shorten'],
          properties: {
            shorten: { type: 'string' }
          }
        },
        body: {
          type: 'object',
          required: ['id', 'name'],
          properties: {
            id: { type: 'string' },
            name: { type: 'string' }
          }
        }
      }
    },
    async request => {
      return services.node.rename(request.authenticatePayload, request.body);
    }
  );

  fastify.post(
    `${options.prefix}/:shorten/remove`,
    {
      onRequest: withEntryAuth,
      schema: {
        summary: '删除节点',
        params: {
          type: 'object',
          required: ['shorten'],
          properties: {
            shorten: { type: 'string' }
          }
        },
        body: {
          type: 'object',
          required: ['ids'],
          properties: {
            ids: {
              type: 'array',
              items: { type: 'string' }
            }
          }
        }
      }
    },
    async request => {
      return services.node.remove(request.authenticatePayload, request.body);
    }
  );
});
