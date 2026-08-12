module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: { isEmail: true }
    },
    username: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true
    },
    passwordHash: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    avatarUrl: {
      type: DataTypes.STRING(512)
    },
    jsonProfile: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '{}'
    },
    cloudSaveUrl: {
      type: DataTypes.STRING(512)
    },
    gold: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    // 3 field phục vụ luồng "Quên mật khẩu": lưu HASH của mã 6 số (không lưu
    // mã gốc), thời điểm hết hạn, và số lần nhập sai để chặn brute-force.
    resetCodeHash: {
      type: DataTypes.STRING(255)
    },
    resetCodeExpiresAt: {
      type: DataTypes.DATE
    },
    resetCodeAttempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
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
  }, {
    indexes: [
      { fields: ['email'] },
      { fields: ['username'] }
    ]
  });

  User.associate = (models) => {
    User.hasMany(models.Score, { foreignKey: 'userId' });
    User.hasMany(models.Achievement, { foreignKey: 'userId' });
    User.hasMany(models.ShopItem, { foreignKey: 'userId' });
  };

  return User;
};
