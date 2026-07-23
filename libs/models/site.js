module.exports = ({ DataTypes }) => {
  return {
    model: {
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: '站点名称'
      },
      shorten: {
        type: DataTypes.STRING,
        comment: '公开访问短码'
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'open',
        comment: '状态: open 开启, closed 关闭'
      },
      defaultPermission: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'rw',
        comment: '新建节点默认权限: r | rw'
      },
      options: {
        type: DataTypes.JSON,
        defaultValue: {},
        comment: '扩展配置'
      }
    },
    options: {
      comment: 'Live 组件站点',
      indexes: [
        {
          fields: ['shorten'],
          unique: true,
          where: { deleted_at: null }
        },
        { fields: ['status'] }
      ]
    }
  };
};
