const fp = require('fastify-plugin');
const { NotFound, BadRequest, Unauthorized, Forbidden } = require('http-errors');
const crypto = require('node:crypto');

module.exports = fp(async (fastify, options) => {
  const { models } = fastify[options.name];
  const { Op } = fastify.sequelize.Sequelize;

  const toId = value => (value == null || value === '' ? null : String(value));

  const getSiteId = authenticatePayload => {
    const siteId = toId(authenticatePayload?.siteId);
    if (!siteId) {
      throw new BadRequest('siteId 不能为空');
    }
    return siteId;
  };

  const formatShare = (share, contentBase) => {
    const plain = typeof share.get === 'function' ? share.get({ plain: true }) : { ...share };
    const code = String(plain.shorten || '').toUpperCase();
    const base = String(contentBase || options.prefix || '').replace(/\/$/, '');
    return {
      id: String(plain.id),
      nodeId: String(plain.nodeId),
      shorten: code,
      expires: plain.expires || null,
      // 不带站点 shorten：{prefix}/content/{contentShorten}
      url: base ? `${base}/content/${code}` : null,
      createdAt: plain.createdAt || null
    };
  };

  const getContentBase = () => {
    if (typeof options.getContentHost === 'function') {
      return options.getContentHost();
    }
    return options.prefix;
  };

  const create = async (authenticatePayload, { id, expiresIn } = {}) => {
    const siteId = getSiteId(authenticatePayload);
    const nodeId = toId(id);
    if (!nodeId) {
      throw new BadRequest('id 不能为空');
    }

    const node = await models.node.findOne({ where: { id: nodeId, siteId } });
    if (!node) {
      throw new NotFound('节点不存在');
    }
    if (node.type !== 'file') {
      throw new BadRequest('Not a file');
    }

    let expires = null;
    if (expiresIn != null && expiresIn !== '' && Number(expiresIn) > 0) {
      expires = new Date(Date.now() + Number(expiresIn) * 1000);
    }

    const shareId = crypto.randomBytes(8).toString('hex');
    const target = JSON.stringify({
      type: options.contentTargetType,
      siteId,
      nodeId,
      shareId
    });
    const code = await options.getShortenServices().sign(target, expires);

    const share = await models.contentShare.create({
      siteId,
      nodeId,
      shorten: code,
      expires
    });

    return formatShare(share, getContentBase());
  };

  const list = async (authenticatePayload, { id } = {}) => {
    const siteId = getSiteId(authenticatePayload);
    const nodeId = toId(id);
    if (!nodeId) {
      throw new BadRequest('id 不能为空');
    }

    const now = new Date();
    const rows = await models.contentShare.findAll({
      where: { siteId, nodeId },
      order: [['createdAt', 'DESC']]
    });

    const contentBase = getContentBase();
    const active = [];
    for (const row of rows) {
      if (row.expires && row.expires <= now) {
        try {
          await options.getShortenServices().remove(row.shorten);
        } catch (e) {
          // ignore
        }
        await row.destroy();
        continue;
      }
      active.push(formatShare(row, contentBase));
    }
    return active;
  };

  const remove = async (authenticatePayload, { shorten } = {}) => {
    const siteId = getSiteId(authenticatePayload);
    const code = String(shorten || '')
      .trim()
      .toUpperCase();
    if (!code) {
      throw new BadRequest('shorten 不能为空');
    }

    const share = await models.contentShare.findOne({
      where: { siteId, shorten: code }
    });
    if (!share) {
      throw new NotFound('分享不存在');
    }

    try {
      await options.getShortenServices().remove(code);
    } catch (e) {
      // ignore
    }
    await share.destroy();
    return { shorten: code };
  };

  /** 通过内容短码读取已保存 content（公开访问，不依赖站点 shorten） */
  const resolveByCode = async ({ contentShorten } = {}) => {
    const code = String(contentShorten || '')
      .trim()
      .toUpperCase();
    if (!code) {
      throw new BadRequest('content shorten 不能为空');
    }

    let payload;
    try {
      const target = await options.getShortenServices().decode(code);
      payload = typeof target === 'string' ? JSON.parse(target) : target;
    } catch (e) {
      throw new Unauthorized('content shorten is invalid or expired');
    }

    if (!payload || payload.type !== options.contentTargetType || !payload.siteId || !payload.nodeId) {
      throw new Unauthorized('content shorten is invalid');
    }

    const siteId = String(payload.siteId);
    const site = await models.site.findByPk(siteId);
    if (!site) {
      throw new Unauthorized('content shorten is invalid');
    }
    if (site.status !== 'open') {
      throw new Forbidden('站点已关闭');
    }

    const share = await models.contentShare.findOne({
      where: {
        siteId,
        shorten: code,
        nodeId: toId(payload.nodeId),
        [Op.or]: [{ expires: null }, { expires: { [Op.gt]: new Date() } }]
      }
    });
    if (!share) {
      throw new Unauthorized('content shorten is invalid or expired');
    }

    return fastify[options.name].services.node.getContent({ siteId }, { id: payload.nodeId });
  };

  /** @deprecated 保留兼容：带站点鉴权上下文时也可解析 */
  const resolveContent = async (authenticatePayload, { contentShorten } = {}) => {
    return resolveByCode({ contentShorten });
  };

  Object.assign(fastify[options.name].services, {
    contentShare: {
      create,
      list,
      remove,
      resolveByCode,
      resolveContent
    }
  });
});
