require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const routes = require('./routes');

for (const key of ['DATABASE_URL', 'JWT_SECRET']) {
  if (!process.env[key]) {
    console.error(`Missing required env var ${key}. Copy .env.example to .env.`);
    process.exit(1);
  }
}

const app = express();
app.set('trust proxy', 1); // correct req.ip (e-signature audit) behind a proxy
app.use(helmet());
app.use(
  cors({
    origin: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',').map((s) => s.trim()),
    allowedHeaders: ['Content-Type', 'Authorization', 'x-organization-id'],
  })
);
app.use(express.json({ limit: '100kb' }));

app.use('/api', routes);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.status) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const port = process.env.PORT || 4000;
if (require.main === module) {
  app.listen(port, () => console.log(`ServiceFlow API listening on :${port}`));
}

module.exports = app;
