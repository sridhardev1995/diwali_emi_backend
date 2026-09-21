require('dotenv').config();
const app = require('./app');
const initializeDatabase = require('./database/init');

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await initializeDatabase(); // creates DB + all tables if they don't exist
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();