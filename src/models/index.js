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
  Transaction: sequelizeInstance.import('./Transaction.js'),
};

db.User.hasMany(db.Restaurant);
db.Restaurant.belongsTo(db.User);
db.User.hasMany(db.Transaction);
db.Restaurant.hasMany(db.Upload);
db.Upload.belongsTo(db.Restaurant);

module.exports = db;
