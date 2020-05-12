module.exports = (sequelize, DataTypes) => {
  const Restaurant = sequelize.define('Restaurant', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(128),
      allowNull: false,
    },
    logoUrl: {
      type: DataTypes.STRING(512),
      allowNull: true,
    },
  });

  return Restaurant;
};
