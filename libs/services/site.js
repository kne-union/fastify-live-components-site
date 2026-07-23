const fp = require('fastify-plugin');
const omit = require('lodash/omit');
const { Unauthorized, Forbidden, NotFound, BadRequest } = require('http-errors');

const STATUS_OPEN = 'open';
const STATUS_CLOSED = 'closed';

const normalizeStatus = status => (status === STATUS_CLOSED ? STATUS_CLOSED : STATUS_OPEN);

module.exports = fp(async (fastify, options) => {
  const { models } = fastify[options.name];
  const { Op } = fastify.sequelize.Sequelize;

  const formatSite = site => {
    const plain = typeof site.get === 'function' ? site.get({ plain: true }) : { ...site };
    plain.id = String(plain.id);
    plain.host = plain.shorten ? options.getSiteHost(plain.shorten) : null;
    return plain;
  };

  const detail = async (authenticatePayload, { id }) => {
    const site = await models.site.findByPk(id);
    if (!site) {
      throw new NotFound('站点不存在');
    }
    return site;
  };

  const authenticateEntry = async request => {
    const code = request.params?.shorten;
    if (!code) {
      throw new Unauthorized('shorten is required');
    }

    let payload;
    try {
      const target = await options.getShortenServices().decode(String(code).toUpperCase());
      payload = typeof target === 'string' ? JSON.parse(target) : target;
    } catch (e) {
      throw new Unauthorized('shorten is invalid');
    }

    if (!payload || payload.type !== options.siteTargetType || !payload.siteId) {
      throw new Unauthorized('shorten is invalid');
    }

    const site = await models.site.findByPk(payload.siteId);
    if (!site) {
      throw new Unauthorized('shorten is invalid');
    }

    if (site.status !== STATUS_OPEN) {
      throw new Forbidden('站点已关闭');
    }

    const siteId = String(site.id);
    request.siteInfo = site;
    request.authenticatePayload = {
      siteId,
      site
    };
  };

  const create = async (authenticatePayload, data = {}) => {
    const name = String(data.name || '').trim();
    if (!name) {
      throw new BadRequest('名称不能为空');
    }

    const defaultPermission = data.defaultPermission === 'r' ? 'r' : 'rw';
    const status = normalizeStatus(data.status);

    const site = await models.site.create({
      name,
      status,
      defaultPermission,
      options: data.options && typeof data.options === 'object' ? data.options : {}
    });

    const target = JSON.stringify({
      type: options.siteTargetType,
      siteId: String(site.id)
    });
    const shorten = await options.getShortenServices().sign(target);
    site.shorten = shorten;
    await site.save();

    return formatSite(site);
  };

  const save = async (authenticatePayload, { id, ...data }) => {
    if (!id) {
      throw new BadRequest('id 不能为空');
    }
    const site = await detail(authenticatePayload, { id });
    const payload = omit(data, ['id', 'shorten', 'createdAt', 'updatedAt', 'deletedAt', 'host']);

    if (payload.name != null) {
      const name = String(payload.name).trim();
      if (!name) {
        throw new BadRequest('名称不能为空');
      }
      payload.name = name;
    }

    if (payload.status != null) {
      payload.status = normalizeStatus(payload.status);
    }

    if (payload.defaultPermission != null) {
      payload.defaultPermission = payload.defaultPermission === 'r' ? 'r' : 'rw';
    }

    await site.update(payload);
    return site;
  };

  const remove = async (authenticatePayload, { id }) => {
    if (!id) {
      throw new BadRequest('id 不能为空');
    }
    const site = await detail(authenticatePayload, { id });
    if (site.shorten) {
      try {
        await options.getShortenServices().remove(site.shorten);
      } catch (e) {
        // 短码可能已不存在，忽略
      }
    }
    const shares = await models.contentShare.findAll({ where: { siteId: site.id } });
    for (const share of shares) {
      try {
        await options.getShortenServices().remove(share.shorten);
      } catch (e) {
        // ignore
      }
    }
    await models.contentShare.destroy({ where: { siteId: site.id } });
    await models.node.destroy({ where: { siteId: site.id } });
    await site.destroy();
  };

  const list = async (authenticatePayload, { filter = {}, perPage = 20, currentPage = 1 } = {}) => {
    const where = {};
    if (filter.status === STATUS_OPEN || filter.status === STATUS_CLOSED) {
      where.status = filter.status;
    }
    if (filter.keyword) {
      where.name = { [Op.like]: `%${filter.keyword}%` };
    }

    const limit = Number(perPage) || 20;
    const page = Number(currentPage) || 1;
    const { rows, count } = await models.site.findAndCountAll({
      where,
      offset: limit * (page - 1),
      limit,
      order: [['createdAt', 'DESC']]
    });

    return {
      pageData: rows.map(formatSite),
      totalCount: count
    };
  };

  const getDetail = async (authenticatePayload, { id }) => {
    const site = await detail(authenticatePayload, { id });
    return formatSite(site);
  };

  Object.assign(fastify[options.name].services, {
    site: {
      authenticateEntry,
      create,
      save,
      remove,
      list,
      detail: getDetail,
      formatSite,
      STATUS_OPEN,
      STATUS_CLOSED
    }
  });
});
