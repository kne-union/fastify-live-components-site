/**
 * 公开接口 CORS：允许任意 Origin。
 * 仅用于站点入口（/:shorten/*）与内容访问（/content/:code），不含站点管理 /site/*。
 */
const setCorsHeaders = (request, reply) => {
  reply.header('Access-Control-Allow-Origin', '*');
  reply.header('Access-Control-Allow-Methods', 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS');
  reply.header('Access-Control-Allow-Headers', request.headers['access-control-request-headers'] || 'Content-Type, Authorization, X-Requested-With, x-user-code');
  reply.header('Access-Control-Max-Age', '86400');
};

const allowCors = async (request, reply) => {
  setCorsHeaders(request, reply);
};

const handleOptions = async (request, reply) => {
  setCorsHeaders(request, reply);
  return reply.code(204).send();
};

const normalizeHooks = hooks => {
  if (!hooks) {
    return [];
  }
  return Array.isArray(hooks) ? hooks : [hooks];
};

module.exports = {
  setCorsHeaders,
  allowCors,
  handleOptions,
  normalizeHooks
};
