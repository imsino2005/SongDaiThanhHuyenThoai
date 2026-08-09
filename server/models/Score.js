module.exports = (sequelize, DataTypes) => {
  const Score = sequelize.define('Score', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false
    },
    score: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    kills: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    levelReached: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    gameMode: {
      type: DataTypes.STRING(64),
      allowNull: false,
      defaultValue: 'default'
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

  Score.associate = (models) => {
    Score.belongsTo(models.User, { foreignKey: 'userId' });
  };

  return Score;
};
