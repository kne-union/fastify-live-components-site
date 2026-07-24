const fp = require('fastify-plugin');
const path = require('node:path');

const SITE_TARGET_TYPE = 'live-components-site';
const CONTENT_TARGET_TYPE = 'live-components-site-content';

module.exports = fp(
  async (fastify, options) => {
    options = Object.assign(
      {},
      {
        dbTableNamePrefix: 't_live_components_site_',
        name: 'liveComponentsSite',
        prefix: '/api/v1/live-components-site',
        siteTargetType: SITE_TARGET_TYPE,
        contentTargetType: CONTENT_TARGET_TYPE,
        getSiteHost: null,
        // 内容短链基址（不含站点 shorten），默认 `${prefix}` → `${prefix}/content/{code}`
        getContentHost: null,
        ai: {
          getAIModel: null,
          catalogCacheDir: null,
          npmRegistry: null,
          remotePackageNames: {}
        },
        getShortenServices: () => {
          if (!fastify.shorten) {
            throw new Error('fastify-shorten plugin must be registered before @kne/fastify-live-components-site, or set options.getShortenServices');
          }
          return fastify.shorten.services;
        },
        getAuthenticate: type => {
          if (type === 'entry') {
            return [
              async request => {
                await fastify[options.name].services.site.authenticateEntry(request);
              }
            ];
          }
          if (!fastify.account) {
            return [
              () => {
                throw new Error('fastify-account plugin must be registered before @kne/fastify-live-components-site, or set options.getAuthenticate');
              }
            ];
          }
          const { authenticate } = fastify.account;
          switch (type) {
            case 'site':
            case 'site:create':
            case 'site:manage':
            default:
              return [authenticate.user, authenticate.admin];
          }
        }
      },
      options
    );

    if (typeof options.getSiteHost !== 'function') {
      options.getSiteHost = shorten => `${options.prefix}/${shorten}`;
    }
    if (typeof options.getContentHost !== 'function') {
      options.getContentHost = () => options.prefix;
    }
    options.ai = Object.assign(
      {
        getAIModel: null,
        catalogCacheDir: null,
        npmRegistry: null,
        remotePackageNames: {}
      },
      options.ai || {}
    );

    fastify.register(require('@kne/fastify-namespace'), {
      options,
      name: options.name,
      modules: [
        [
          'models',
          await fastify.sequelize.addModels(path.resolve(__dirname, './libs/models'), {
            prefix: options.dbTableNamePrefix
          })
        ],
        ['services', path.resolve(__dirname, './libs/services')],
        ['controllers', path.resolve(__dirname, './libs/controllers')]
      ]
    });
  },
  {
    name: 'fastify-live-components-site',
    dependencies: ['fastify-sequelize']
  }
);

module.exports.SITE_TARGET_TYPE = SITE_TARGET_TYPE;
module.exports.CONTENT_TARGET_TYPE = CONTENT_TARGET_TYPE;
