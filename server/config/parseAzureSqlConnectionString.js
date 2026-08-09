function parseAzureSqlConnectionString(conn) {
  const values = conn.split(';').reduce((acc, part) => {
    const [key, ...rest] = part.split('=');
    if (!key || rest.length === 0) return acc;
    acc[key.trim().toLowerCase()] = rest.join('=').trim();
    return acc;
  }, {});

  if (!values.server || !(values.database || values['initial catalog']) || !values['user id'] || !values.password) {
    return null;
  }

  let host = values.server.replace(/^tcp:/i, '').trim();
  let port = 1433;
  if (host.includes(',')) {
    const [hostname, portPart] = host.split(',');
    host = hostname.trim();
    port = parseInt(portPart.trim(), 10) || 1433;
  }

  return {
    database: values.database || values['initial catalog'],
    username: values['user id'],
    password: values.password,
    host,
    port,
    dialect: 'mssql',
    dialectOptions: {
      options: {
        encrypt: values.encrypt ? values.encrypt.toLowerCase() === 'true' : true,
        trustServerCertificate: values.trustservercertificate ? values.trustservercertificate.toLowerCase() === 'true' : false,
        enableArithAbort: true
      }
    }
  };
}

module.exports = { parseAzureSqlConnectionString };
