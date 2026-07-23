const fp = require('fastify-plugin');
const { NotFound, BadRequest, Forbidden } = require('http-errors');

module.exports = fp(async (fastify, options) => {
  const { models } = fastify[options.name];
  const { Op } = fastify.sequelize.Sequelize;

  const toId = value => (value == null || value === '' ? null : String(value));

  const assertWritable = node => {
    if (!node) {
      throw new NotFound('节点不存在');
    }
    if (node.permission !== 'rw') {
      throw new Forbidden('Read-only permission');
    }
  };

  const getSiteId = authenticatePayload => {
    const siteId = toId(authenticatePayload?.siteId);
    if (!siteId) {
      throw new BadRequest('siteId 不能为空');
    }
    return siteId;
  };

  const findNode = async (siteId, id) => {
    const node = await models.node.findOne({
      where: { id: toId(id), siteId }
    });
    if (!node) {
      throw new NotFound('节点不存在');
    }
    return node;
  };

  const assertUniqueSiblingName = async (siteId, parentId, name, excludeId) => {
    const where = {
      siteId,
      name,
      parentId: parentId || null
    };
    if (excludeId) {
      where.id = { [Op.ne]: toId(excludeId) };
    }
    // SQLite 中 null 比较需特殊处理
    const count = await models.node.count({
      where: parentId
        ? where
        : {
            siteId,
            name,
            parentId: { [Op.is]: null },
            ...(excludeId ? { id: { [Op.ne]: toId(excludeId) } } : {})
          }
    });
    if (count > 0) {
      throw new BadRequest('DUPLICATE_NAME');
    }
  };

  const toTreeNode = (node, childrenMap) => {
    const id = String(node.id);
    const item = {
      id,
      name: node.name,
      type: node.type,
      permission: node.permission || 'rw'
    };
    if (node.type === 'directory') {
      item.children = (childrenMap.get(id) || []).map(child => toTreeNode(child, childrenMap));
    }
    return item;
  };

  const getFolderTree = async authenticatePayload => {
    const siteId = getSiteId(authenticatePayload);
    const nodes = await models.node.findAll({
      where: { siteId },
      order: [
        ['type', 'DESC'],
        ['name', 'ASC']
      ]
    });

    const childrenMap = new Map();
    const roots = [];

    nodes.forEach(node => {
      const parentId = toId(node.parentId);
      if (!parentId) {
        roots.push(node);
        return;
      }
      if (!childrenMap.has(parentId)) {
        childrenMap.set(parentId, []);
      }
      childrenMap.get(parentId).push(node);
    });

    return roots.map(node => toTreeNode(node, childrenMap));
  };

  const get = async (authenticatePayload, { id }) => {
    const siteId = getSiteId(authenticatePayload);
    const node = await findNode(siteId, id);
    if (node.type !== 'file') {
      throw new BadRequest('Not a file');
    }
    return {
      id: String(node.id),
      name: node.name,
      permission: node.permission || 'rw',
      content: node.content ?? ''
    };
  };

  /** 仅返回已保存的 content 字符串（供 text/plain 直出） */
  const getContent = async (authenticatePayload, { id }) => {
    const file = await get(authenticatePayload, { id });
    return file.content ?? '';
  };

  const resolveParent = async (siteId, parentId) => {
    if (!parentId) {
      return null;
    }
    const parent = await findNode(siteId, parentId);
    assertWritable(parent);
    if (parent.type !== 'directory') {
      throw new BadRequest('Parent is not a directory');
    }
    return parent;
  };

  const createFolder = async (authenticatePayload, { parentId, name }) => {
    const siteId = getSiteId(authenticatePayload);
    const trimmedName = String(name || '').trim();
    if (!trimmedName) {
      throw new BadRequest('Name is required');
    }

    const normalizedParentId = toId(parentId);
    await resolveParent(siteId, normalizedParentId);
    await assertUniqueSiblingName(siteId, normalizedParentId, trimmedName);

    const permission = authenticatePayload?.site?.defaultPermission === 'r' ? 'r' : 'rw';
    const folder = await models.node.create({
      siteId,
      parentId: normalizedParentId,
      name: trimmedName,
      type: 'directory',
      permission,
      content: null
    });

    return {
      id: String(folder.id),
      name: folder.name,
      type: 'directory',
      permission: folder.permission,
      children: []
    };
  };

  const create = async (authenticatePayload, { parentId, name, content = '' }) => {
    const siteId = getSiteId(authenticatePayload);
    const trimmedName = String(name || '').trim();
    if (!trimmedName) {
      throw new BadRequest('Name is required');
    }

    const normalizedParentId = toId(parentId);
    await resolveParent(siteId, normalizedParentId);
    await assertUniqueSiblingName(siteId, normalizedParentId, trimmedName);

    const permission = authenticatePayload?.site?.defaultPermission === 'r' ? 'r' : 'rw';
    const file = await models.node.create({
      siteId,
      parentId: normalizedParentId,
      name: trimmedName,
      type: 'file',
      permission,
      content: content == null ? '' : String(content)
    });

    return {
      id: String(file.id),
      name: file.name,
      type: 'file',
      permission: file.permission
    };
  };

  const save = async (authenticatePayload, { id, content }) => {
    const siteId = getSiteId(authenticatePayload);
    const node = await findNode(siteId, id);
    assertWritable(node);
    if (node.type !== 'file') {
      throw new BadRequest('Not a file');
    }
    node.content = content == null ? '' : String(content);
    await node.save();
    return {
      id: String(node.id),
      content: node.content
    };
  };

  const rename = async (authenticatePayload, { id, name }) => {
    const siteId = getSiteId(authenticatePayload);
    const trimmedName = String(name || '').trim();
    if (!trimmedName) {
      throw new BadRequest('Name is required');
    }
    const node = await findNode(siteId, id);
    assertWritable(node);
    const parentId = toId(node.parentId);
    await assertUniqueSiblingName(siteId, parentId, trimmedName, node.id);
    node.name = trimmedName;
    await node.save();
    return {
      id: String(node.id),
      name: node.name,
      type: node.type,
      permission: node.permission
    };
  };

  const remove = async (authenticatePayload, { ids }) => {
    const siteId = getSiteId(authenticatePayload);
    const idList = Array.isArray(ids) ? ids : [ids];
    if (!idList.length) {
      throw new BadRequest('ids is required');
    }

    for (const id of idList) {
      const node = await findNode(siteId, id);
      assertWritable(node);
      if (node.type === 'directory') {
        const childCount = await models.node.count({
          where: { siteId, parentId: String(node.id) }
        });
        if (childCount > 0) {
          throw new BadRequest('Cannot remove non-empty folder');
        }
      } else {
        const shares = await models.contentShare.findAll({
          where: { siteId, nodeId: String(node.id) }
        });
        for (const share of shares) {
          try {
            await options.getShortenServices().remove(share.shorten);
          } catch (e) {
            // ignore
          }
          await share.destroy();
        }
      }
      await node.destroy();
    }

    return { ids: idList.map(String) };
  };

  Object.assign(fastify[options.name].services, {
    node: {
      getFolderTree,
      get,
      getContent,
      createFolder,
      create,
      save,
      rename,
      remove
    }
  });
});
