const dotenv = require('dotenv');
const { Sequelize } = require('sequelize');
const path = require('path');
const { parseAzureSqlConnectionString } = require('./parseAzureSqlConnectionString');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const connectionString = process.env.AZURE_SQL_CONNECTION_STRING;

if (!connectionString) {
  throw new Error('Missing AZURE_SQL_CONNECTION_STRING environment variable');
}

const connectionConfig = parseAzureSqlConnectionString(connectionString);
const sequelize = connectionConfig
  ? new Sequelize(connectionConfig.database, connectionConfig.username, connectionConfig.password, connectionConfig)
  : new Sequelize(connectionString, {
      dialect: 'mssql',
      dialectOptions: {
        options: {
          encrypt: true,
          enableArithAbort: true
        }
      }
    });

sequelize.options.logging = false;
sequelize.options.define = { freezeTableName: true, underscored: false };

module.exports = { sequelize };
