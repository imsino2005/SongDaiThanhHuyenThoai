"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('User', 'resetCodeHash', {
      type: Sequelize.STRING(255),
      allowNull: true
    });
    await queryInterface.addColumn('User', 'resetCodeExpiresAt', {
      type: Sequelize.DATE,
      allowNull: true
    });
    await queryInterface.addColumn('User', 'resetCodeAttempts', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('User', 'resetCodeHash');
    await queryInterface.removeColumn('User', 'resetCodeExpiresAt');
    await queryInterface.removeColumn('User', 'resetCodeAttempts');
  }
};
