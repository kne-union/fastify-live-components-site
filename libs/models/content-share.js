module.exports = ({ DataTypes, definePrimaryType }) => {
  return {
    model: {
      siteId: Object.assign(definePrimaryType('siteId'), {
        allowNull: false,
        comment: '所属站点'
      }),
      nodeId: Object.assign(definePrimaryType('nodeId'), {
        allowNull: false,
        comment: '文件节点'
      }),
      shorten: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: '内容访问短码'
      },
      expires: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '过期时间，空表示永久'
      }
    },
    associate: ({ contentShare, site, node }) => {
      contentShare.belongsTo(site, { foreignKey: 'siteId' });
      contentShare.belongsTo(node, { foreignKey: 'nodeId' });
    },
    options: {
      comment: 'Live 组件文件内容分享短链',
      indexes: [
        { fields: ['site_id', 'node_id'] },
        {
          fields: ['shorten'],
          unique: true,
          where: { deleted_at: null }
        }
      ]
    }
  };
};
