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
    type: {
      type: DataTypes.STRING(128),
      allowNull: true,
    },
    s3Key: {
      type: DataTypes.STRING(128),
      allowNull: true,
    },
    s3Url: {
      type: DataTypes.STRING(512),
      allowNull: true,
    },
    cdnUrl: {
      type: DataTypes.STRING(512),
      allowNull: false,
    },
  });

  return Upload;
};
