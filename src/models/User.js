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
    subscriptionStatus: {
      type: DataTypes.ENUM('FREE', 'TRIAL', 'PAID', 'EXPIRED'),
      allowNull: false,
    },
    subscriptionEnds: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
  });

  return User;
};
