module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.STRING(),
      primaryKey: true,
    },
    email: {
      type: DataTypes.STRING(128),
      allowNull: false,
    },
    subscriptionId: {
      type: DataTypes.STRING(),
      allowNull: true,
    },
    subscriptionStatus: {
      type: DataTypes.ENUM('FREE', 'TRIAL', 'PAID', 'EXPIRED', 'CANCELLED'),
      allowNull: false,
    },
    subscriptionEnd: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
  });

  return User;
};
