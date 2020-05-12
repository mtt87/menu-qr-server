module.exports = (sequelize, DataTypes) => {
  const Transaction = sequelize.define('Transaction', {
    id: {
      type: DataTypes.STRING(),
      primaryKey: true,
    },
    payload: {
      type: DataTypes.STRING(),
      allowNull: true,
    },
  });

  return Transaction;
};
