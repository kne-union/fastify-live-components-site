module.exports = ({ DataTypes, definePrimaryType }) => {
  return {
    model: {
      parentId: Object.assign(definePrimaryType('parentId'), {
        allowNull: true,
        comment: '父节点 id，根节点为空'
      }),
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: '节点名称'
      },
      type: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: '节点类型: file | directory'
      },
      permission: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'rw',
        comment: '权限: r | rw'
      },
      content: {
        type: DataTypes.TEXT,
        comment: '文件内容，目录为空'
      }
    },
    associate: ({ node, site }) => {
      node.belongsTo(site, {
        foreignKey: 'siteId',
        comment: '所属站点'
      });
    },
    options: {
      comment: 'Live 组件站点文件树节点',
      indexes: [
        { fields: ['site_id'] },
        { fields: ['parent_id'] },
        {
          fields: ['site_id', 'parent_id', 'name'],
          unique: true,
          where: { deleted_at: null }
        }
      ]
    }
  };
};
