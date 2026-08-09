"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('User', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        allowNull: false,
        primaryKey: true
      },
      email: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true
      },
      username: {
        type: Sequelize.STRING(64),
        allowNull: false,
        unique: true
      },
      passwordHash: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      avatarUrl: {
        type: Sequelize.STRING(512)
      },
      jsonProfile: {
        type: Sequelize.TEXT,
        allowNull: false,
        defaultValue: '{}'
      },
      cloudSaveUrl: {
        type: Sequelize.STRING(512)
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('GETDATE()')
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('GETDATE()')
      }
    });

    await queryInterface.createTable('Score', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        allowNull: false,
        primaryKey: true
      },
      userId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'User', key: 'id' },
        onDelete: 'CASCADE'
      },
      score: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      kills: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      levelReached: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1
      },
      gameMode: {
        type: Sequelize.STRING(64),
        allowNull: false,
        defaultValue: 'default'
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('GETDATE()')
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('GETDATE()')
      }
    });

    await queryInterface.createTable('Achievement', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        allowNull: false,
        primaryKey: true
      },
      userId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'User', key: 'id' },
        onDelete: 'CASCADE'
      },
      key: {
        type: Sequelize.STRING(128),
        allowNull: false
      },
      title: {
        type: Sequelize.STRING(128),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      unlockedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('GETDATE()')
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('GETDATE()')
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('GETDATE()')
      }
    });

    await queryInterface.createTable('ShopItem', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        allowNull: false,
        primaryKey: true
      },
      userId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'User', key: 'id' },
        onDelete: 'CASCADE'
      },
      itemKey: {
        type: Sequelize.STRING(128),
        allowNull: false
      },
      itemType: {
        type: Sequelize.STRING(64),
        allowNull: false
      },
      price: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      quantity: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1
      },
      metadata: {
        type: Sequelize.TEXT
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('GETDATE()')
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('GETDATE()')
      }
    });

    await queryInterface.addIndex('User', ['email']);
    await queryInterface.addIndex('User', ['username']);
    await queryInterface.addIndex('Score', ['userId']);
    await queryInterface.addIndex('Achievement', ['userId']);
    await queryInterface.addIndex('Achievement', ['key']);
    await queryInterface.addIndex('ShopItem', ['userId']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('ShopItem');
    await queryInterface.dropTable('Achievement');
    await queryInterface.dropTable('Score');
    await queryInterface.dropTable('User');
  }
};
