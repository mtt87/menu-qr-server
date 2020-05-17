const Sequelize = require('sequelize');

const sequelizeInstance = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  protocol: 'postgres',
  dialectOptions: {
    ssl: {
      rejectUnauthorized: false,
    },
  },
  logging: false,
});

const db = {
  Sequelize,
  sequelizeInstance,
  User: sequelizeInstance.import('./User.js'),
  Restaurant: sequelizeInstance.import('./Restaurant.js'),
  Upload: sequelizeInstance.import('./Upload.js'),
};

db.User.hasMany(db.Restaurant);
db.Restaurant.belongsTo(db.User);
db.Restaurant.hasMany(db.Upload);
db.Upload.belongsTo(db.Restaurant);

module.exports = db;
