const dotenv = require('dotenv');
const path = require('path');
const { parseAzureSqlConnectionString } = require('./parseAzureSqlConnectionString');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const connectionString = process.env.AZURE_SQL_CONNECTION_STRING;

if (!connectionString) {
  throw new Error('Missing AZURE_SQL_CONNECTION_STRING environment variable');
}

const parsedConfig = parseAzureSqlConnectionString(connectionString);

// Chỉ dùng 1 Azure SQL Database duy nhất cho mọi environment, nên cả 3 key
// (development/test/production) đều trỏ về cùng một cấu hình.
const shared = parsedConfig
  ? { ...parsedConfig, logging: false, define: { freezeTableName: true, underscored: true } }
  : {
      dialect: 'mssql',
      url: connectionString,
      dialectOptions: { options: { encrypt: true, enableArithAbort: true } },
      logging: false,
      define: { freezeTableName: true, underscored: true }
    };

module.exports = {
  development: shared,
  test: shared,
  production: shared
};
