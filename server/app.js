require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const appInsights = require('applicationinsights');
const { sequelize } = require('./config/config');
const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const saveRoutes = require('./routes/cloudSave');
const leaderboardRoutes = require('./routes/leaderboard');
const shopRoutes = require('./routes/shop');
const achievementRoutes = require('./routes/achievement');
const { verifyJwt } = require('./middleware/auth');

const app = express();

if (process.env.APPINSIGHTS_INSTRUMENTATIONKEY) {
  appInsights.setup(process.env.APPINSIGHTS_INSTRUMENTATIONKEY).start();
}

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('tiny'));

// Serve frontend static files if the repo root is deployed alongside the server.
app.use(express.static(path.join(__dirname, '..')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

app.use('/api/auth', authRoutes);
app.use('/api/profile', verifyJwt, profileRoutes);
app.use('/api/cloud-saves', verifyJwt, saveRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/shop', verifyJwt, shopRoutes);
app.use('/api/achievements', verifyJwt, achievementRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

const port = process.env.PORT || 4000;

sequelize.authenticate()
  .then(() => {
    console.log('Connected to Azure SQL Database.');
    app.listen(port, () => {
      console.log(`Server listening on port ${port}`);
    });
  })
  .catch(error => {
    console.error('Unable to connect to the database:', error);
    process.exit(1);
  });
