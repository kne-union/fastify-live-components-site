const fp = require('fastify-plugin');
const { allowCors, handleOptions, normalizeHooks } = require('../utils/cors');
const { str, bool, any, list, obj, success, PERMISSION, SITE_STATUS, nodeBase, treeNode, contentShare } = require('../schema/response');

const TAG_SITE = 'Live组件站点-站点信息';
const TAG_AI = 'Live组件站点-AI';
const TAG_FILE = 'Live组件站点-文件';
const TAG_SHARE = 'Live组件站点-内容分享';

const ENTRY_HINT = '通过站点短码 shorten 鉴权（站点须存在且为开启状态，关闭返回 403，短码无效返回 401），允许任意 Origin 跨域';

const shortenParams = {
  type: 'object',
  required: ['shorten'],
  properties: {
    shorten: { type: 'string', description: '站点公开访问短码（不区分大小写）' }
  }
};

const PARENT_ID = '父文件夹节点 ID，为空表示根目录；父节点须为可写文件夹';

const fileNode = obj('文件节点', nodeBase);

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
        tags: [TAG_SHARE],
        summary: '通过内容短码直出已保存 content（text/plain，无 code/data；不带站点 shorten）',
        description: '公开访问，无需站点短码；短码无效或已过期返回 401，所属站点关闭返回 403。允许任意 Origin 跨域',
        params: {
          type: 'object',
          required: ['contentShorten'],
          properties: {
            contentShorten: { type: 'string', description: '内容分享短码（不区分大小写）' }
          }
        },
        response: success('文件已保存的内容原文，Content-Type 为 text/plain; charset=utf-8', { type: 'string' })
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
    `${options.prefix}/:shorten/info`,
    {
      onRequest: withEntryAuth,
      schema: {
        tags: [TAG_SITE],
        summary: '站点信息（含是否支持 AI）',
        description: ENTRY_HINT,
        params: shortenParams,
        response: success('站点公开信息', {
          type: 'object',
          additionalProperties: true,
          properties: {
            name: str('站点名称'),
            status: str(SITE_STATUS),
            defaultPermission: str(`新建节点默认${PERMISSION}`),
            aiEnabled: bool('是否可用 AI 生成：插件配置了 ai.getAIModel 且站点 options.aiEnabled 不为 false')
          }
        })
      }
    },
    async request => {
      return services.ai.getInfo(request.authenticatePayload);
    }
  );

  fastify.post(
    `${options.prefix}/:shorten/ai/start`,
    {
      onRequest: withEntryAuth,
      schema: {
        tags: [TAG_AI],
        summary: '创建 AI 流式任务，返回 streamToken',
        description: `${ENTRY_HINT}。站点未开启 AI 返回 403；refine 模式 messages 不能为空。任务暂存于内存，2 分钟内需用 streamToken 调用 ai/stream 消费`,
        params: shortenParams,
        body: {
          type: 'object',
          properties: {
            mode: { type: 'string', description: '任务模式：generate 生成代码，其它值按 refine（完善需求对话）处理' },
            messages: { type: 'array', description: '对话历史，元素形如 { role: user|assistant, content }，其它 role 或空 content 会被忽略' },
            content: { type: 'string', description: '编辑器当前整份源码' },
            scope: { type: 'object', description: '编辑器当前 scope（可用变量/组件声明）' },
            props: { description: '编辑器当前组件参数，形如 { name: { type, defaultValue } }；非对象时忽略' },
            libs: { type: 'array', description: '可用依赖库标识列表，元素会转为字符串' },
            remotes: { type: 'array', description: '可用远程组件包列表，用于在 stream 阶段拉取组件文档索引' },
            selection: {
              type: 'object',
              description: '编辑器选中片段；传入时 AI 只针对选中部分',
              properties: {
                code: { description: '选中片段源码' },
                startLine: { description: '选中片段起始行' },
                label: { description: '选中片段名称，用于提示' }
              }
            }
          }
        },
        response: success('任务已创建', {
          type: 'object',
          additionalProperties: true,
          properties: {
            streamToken: str('一次性流式任务令牌，传给 ai/stream 的 token')
          }
        })
      }
    },
    async request => {
      return services.ai.start(request.authenticatePayload, request.body || {});
    }
  );

  fastify.get(
    `${options.prefix}/:shorten/ai/stream`,
    {
      onRequest: withEntryAuth,
      schema: {
        tags: [TAG_AI],
        summary: 'SSE 推送 AI 流式输出',
        description: `${ENTRY_HINT}。token 只能消费一次，无效或过期返回 404；成功后以 text/event-stream 推送 data: {...} 事件直到结束`,
        params: shortenParams,
        query: {
          type: 'object',
          required: ['token'],
          properties: {
            token: { type: 'string', description: 'ai/start 返回的 streamToken' }
          }
        },
        response: {
          200: { description: 'text/event-stream 事件流，每条为 data: JSON；出错时推送 { text: 错误信息, done: true } 后结束' }
        }
      }
    },
    async (request, reply) => {
      return services.ai.stream(request.authenticatePayload, request.query, reply);
    }
  );

  fastify.get(
    `${options.prefix}/:shorten/getFolderTree`,
    {
      onRequest: withEntryAuth,
      schema: {
        tags: [TAG_FILE],
        summary: '获取站点文件树',
        description: `${ENTRY_HINT}。同级按类型（文件夹在前）、名称排序`,
        params: shortenParams,
        response: success('根节点列表，文件夹带 children', { type: 'array', items: treeNode })
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
        tags: [TAG_FILE],
        summary: '读取文件内容',
        description: `${ENTRY_HINT}。节点不存在返回 404，非文件返回 400`,
        params: shortenParams,
        query: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', description: '文件节点 ID' }
          }
        },
        response: success('文件内容', {
          type: 'object',
          additionalProperties: true,
          properties: {
            id: any('节点 ID（字符串）'),
            name: str('文件名'),
            permission: str(PERMISSION),
            content: str('文件内容，未保存过为空字符串')
          }
        })
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
        tags: [TAG_SHARE],
        summary: '创建文件内容分享短链（可设有效期）',
        description: `${ENTRY_HINT}。只能分享文件；生成的短链通过 content/:contentShorten 公开访问`,
        params: shortenParams,
        body: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', description: '文件节点 ID' },
            expiresIn: { type: ['number', 'null'], description: '有效期（秒），不传、null 或不大于 0 表示永久有效' }
          }
        },
        response: success('创建的分享短链', contentShare)
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
        tags: [TAG_SHARE],
        summary: '列出文件已有内容分享短链',
        description: `${ENTRY_HINT}。按创建时间倒序；已过期的分享会在查询时被删除并移除短码，不出现在结果中`,
        params: shortenParams,
        query: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', description: '文件节点 ID' }
          }
        },
        response: success('未过期的分享短链列表', { type: 'array', items: contentShare })
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
        tags: [TAG_SHARE],
        summary: '删除文件内容分享短链',
        description: `${ENTRY_HINT}。删除分享记录并移除内容短码；分享不存在返回 404`,
        params: shortenParams,
        body: {
          type: 'object',
          required: ['shorten'],
          properties: {
            shorten: { type: 'string', description: '要删除的内容分享短码（不区分大小写）' }
          }
        },
        response: success('删除成功', {
          type: 'object',
          additionalProperties: true,
          properties: {
            shorten: str('已删除的内容短码（大写）')
          }
        })
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
        tags: [TAG_FILE],
        summary: '创建文件夹',
        description: `${ENTRY_HINT}。同级重名返回 400 DUPLICATE_NAME；新节点权限取站点 defaultPermission`,
        params: shortenParams,
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            parentId: { type: ['string', 'null'], description: PARENT_ID },
            name: { type: 'string', description: '文件夹名称，去除首尾空格后不能为空' }
          }
        },
        response: success('创建的文件夹', obj('文件夹节点', Object.assign({}, nodeBase, { children: list('子节点，新建时为空数组', obj('子节点')) })))
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
        tags: [TAG_FILE],
        summary: '创建文件',
        description: `${ENTRY_HINT}。同级重名返回 400 DUPLICATE_NAME；新节点权限取站点 defaultPermission`,
        params: shortenParams,
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            parentId: { type: ['string', 'null'], description: PARENT_ID },
            name: { type: 'string', description: '文件名称，去除首尾空格后不能为空' },
            content: { type: 'string', description: '初始文件内容，默认空字符串' }
          }
        },
        response: success('创建的文件', fileNode)
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
        tags: [TAG_FILE],
        summary: '保存文件内容',
        description: `${ENTRY_HINT}。只读节点返回 403，非文件返回 400`,
        params: shortenParams,
        body: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', description: '文件节点 ID' },
            content: { type: 'string', description: '新的文件内容，不传保存为空字符串' }
          }
        },
        response: success('保存后的文件内容', {
          type: 'object',
          additionalProperties: true,
          properties: {
            id: any('节点 ID（字符串）'),
            content: str('保存后的文件内容')
          }
        })
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
        tags: [TAG_FILE],
        summary: '重命名节点',
        description: `${ENTRY_HINT}。只读节点返回 403，同级重名返回 400 DUPLICATE_NAME`,
        params: shortenParams,
        body: {
          type: 'object',
          required: ['id', 'name'],
          properties: {
            id: { type: 'string', description: '文件或文件夹节点 ID' },
            name: { type: 'string', description: '新名称，去除首尾空格后不能为空' }
          }
        },
        response: success('重命名后的节点', fileNode)
      }
    },
    async request => {
      return services.node.rename(request.authenticatePayload, request.body);
    }
  );

  fastify.post(
    `${options.prefix}/:shorten/move`,
    {
      onRequest: withEntryAuth,
      schema: {
        tags: [TAG_FILE],
        summary: '移动文件或文件夹到目标目录',
        description: `${ENTRY_HINT}。目标与当前目录相同、移动到自身或自身子目录返回 400 INVALID_MOVE_TARGET；目标目录下重名返回 400 DUPLICATE_NAME`,
        params: shortenParams,
        body: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', description: '要移动的节点 ID' },
            parentId: { type: ['string', 'null'], description: '目标文件夹节点 ID，为空表示移动到根目录' }
          }
        },
        response: success(
          '移动后的节点',
          obj(
            '节点',
            Object.assign({}, nodeBase, {
              parentId: any('新的父节点 ID，根目录为 null')
            })
          )
        )
      }
    },
    async request => {
      return services.node.move(request.authenticatePayload, request.body);
    }
  );

  fastify.post(
    `${options.prefix}/:shorten/remove`,
    {
      onRequest: withEntryAuth,
      schema: {
        tags: [TAG_FILE],
        summary: '删除节点',
        description: `${ENTRY_HINT}。按顺序逐个删除，遇到只读节点（403）或非空文件夹（400）即中止，已删除的不回滚；删除文件时一并删除其内容分享短链`,
        params: shortenParams,
        body: {
          type: 'object',
          required: ['ids'],
          properties: {
            ids: {
              type: 'array',
              items: { type: 'string' },
              description: '要删除的节点 ID 列表'
            }
          }
        },
        response: success('删除成功', {
          type: 'object',
          additionalProperties: true,
          properties: {
            ids: list('已删除的节点 ID 列表', any('节点 ID（字符串）'))
          }
        })
      }
    },
    async request => {
      return services.node.remove(request.authenticatePayload, request.body);
    }
  );
});
