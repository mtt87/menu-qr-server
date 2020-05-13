// silent cause on Heroku there is no .env
require('dotenv').config({
  silent: true,
});

const db = require('./src/models');
const app = require('./src/server');

const { PORT = 3001 } = process.env;

db.sequelizeInstance
  .sync({ force: false })
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server listening on: ${PORT}`);
    });
  })
  .catch((err) => console.error(err));
