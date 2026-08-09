module.exports = (sequelize, DataTypes) => {
  const ShopItem = sequelize.define('ShopItem', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false
    },
    itemKey: {
      type: DataTypes.STRING(128),
      allowNull: false
    },
    itemType: {
      type: DataTypes.STRING(64),
      allowNull: false
    },
    price: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    metadata: {
      type: DataTypes.TEXT
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  });

  ShopItem.associate = (models) => {
    ShopItem.belongsTo(models.User, { foreignKey: 'userId' });
  };

  return ShopItem;
};
