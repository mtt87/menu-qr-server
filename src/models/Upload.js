module.exports = (sequelize, DataTypes) => {
  const Upload = sequelize.define('Upload', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(128),
      allowNull: true,
    },
    imageUrl: {
      type: DataTypes.STRING(512),
      allowNull: false,
    },
  });

  return Upload;
};
