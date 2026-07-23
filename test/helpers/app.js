const Fastify = require('fastify');
const qs = require('qs');

const createFastify = async (pluginOptions = {}) => {
  const fastify = Fastify({
    routerOptions: {
      querystringParser: str => qs.parse(str)
    }
  });

  await fastify.register(require('@fastify/sensible'));

  await fastify.register(require('@kne/fastify-sequelize'), {
    db: { dialect: 'sqlite', storage: ':memory:', logging: false }
  });

  await fastify.register(require('@kne/fastify-shorten'), {
    name: 'shorten',
    dbTableNamePrefix: 't_shorten_'
  });

  fastify.decorate('account', {
    authenticate: {
      user: async request => {
        request.userInfo = request.userInfo || { id: '1', isAdmin: true };
      },
      admin: async request => {
        if (!request.userInfo?.isAdmin) {
          throw fastify.httpErrors.forbidden('需要管理员权限');
        }
      }
    }
  });

  await fastify.register(require('../../index'), {
    name: 'liveComponentsSite',
    prefix: '/api/v1/live-components-site',
    dbTableNamePrefix: 't_live_components_site_',
    ...pluginOptions
  });

  await fastify.ready();
  await fastify.sequelize.sync({ force: true });

  return fastify;
};

module.exports = {
  createFastify
};
