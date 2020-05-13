const express = require('express');
const bodyParser = require('body-parser');
const { v4: uuid } = require('uuid');
const request = require('superagent');
const cors = require('cors');
const QRCode = require('qrcode');
// const moment = require('moment');
const multer = require('multer');
const multerS3 = require('multer-s3');
// const path = require('path');

const db = require('./models');
const jwtMiddleware = require('./jwtMiddleware');
const s3 = require('./s3');

const app = express();

// Force ssl on Heroku
const forceSsl = (req, res, next) => {
  if (req.headers['x-forwarded-proto'] !== 'https') {
    return res.redirect(['https://', req.get('Host'), req.url].join(''));
  }
  return next();
};

// force SSL only in production
if (process.env.NODE_ENV === 'production') {
  app.use(forceSsl);
}

// const storage = multer.memoryStorage();
const fileSize = 1024 * 1024 * 5; // 5mb

const upload = multer({
  limits: {
    fileSize,
  },
  storage: multerS3({
    s3,
    bucket: 'view.menu-qr.tech',
    acl: 'public-read',
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (req, file, cb) => {
      cb(null, `${file.originalname}_${Date.now()}`);
    },
  }),
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cors());
app.use('*', jwtMiddleware);
app.use((err, req, res, next) => {
  if (err.name === 'UnauthorizedError') {
    res.status(401).send('invalid token');
    return;
  }
  next();
});

const getBearerToken = (token) => token.split('Bearer ')[1];

app.get('/', (req, res) => res.send('hello world'));

// Restaurants
app.get('/restaurants', async (req, res) => {
  if (!req.user) {
    res.sendStatus(401);
    return;
  }
  const userId = req.user.sub;
  const userExists = await db.User.findByPk(userId);
  if (!userExists) {
    const token = getBearerToken(req.headers.authorization);
    const { body: userProfile } = await request
      .get('https://project-qr.eu.auth0.com/userinfo')
      .set('Authorization', `Bearer ${token}`);
    const { email } = userProfile;
    const newUser = {
      id: userId,
      email,
      subscriptionType: 'TRIAL',
    };
    await db.User.create(newUser);
  }
  const data = await db.User.findByPk(userId, {
    include: [
      {
        model: db.Restaurant,
        include: db.Upload,
      },
    ],
  });
  res.send(data);
});

app.post('/restaurants', async (req, res) => {
  if (!req.user) {
    res.sendStatus(401);
    return;
  }
  const userId = req.user.sub;
  const { name } = req.body;
  try {
    const User = await db.User.findByPk(userId);
    const Restaurant = await db.Restaurant.create({
      id: uuid(),
      name,
    });
    await User.addRestaurant(Restaurant);
    res.sendStatus(201);
  } catch (err) {
    console.error(err);
  }
});

app.delete('/restaurants/:restaurantId', async (req, res) => {
  if (!req.user) {
    res.sendStatus(401);
    return;
  }
  const userId = req.user.sub;
  const { restaurantId } = req.params;
  try {
    const User = await db.User.findByPk(userId, {
      include: [
        {
          model: db.Restaurant,
          include: db.Upload,
        },
      ],
    });
    if (!User.Restaurants.find((r) => r.id === restaurantId)) {
      res.sendStatus(403);
      return;
    }
    await db.Restaurant.destroy({
      where: {
        id: restaurantId,
      },
    });
    res.sendStatus(200);
  } catch (err) {
    console.error(err);
  }
});

app.put('/restaurants/:restaurantId', async (req, res) => {
  if (!req.user) {
    res.sendStatus(401);
    return;
  }
  const userId = req.user.sub;
  const { restaurantId } = req.params;
  const { name } = req.body;
  try {
    const User = await db.User.findByPk(userId, {
      include: [
        {
          model: db.Restaurant,
          include: db.Upload,
        },
      ],
    });
    if (!User.Restaurants.find((r) => r.id === restaurantId)) {
      res.sendStatus(403);
      return;
    }
    const Restaurant = await db.Restaurant.findByPk(restaurantId);
    await Restaurant.update({
      name,
    });
    res.sendStatus(200);
  } catch (err) {
    console.error(err);
  }
});

// QR
app.get('/view-qr/:uploadId', async (req, res) => {
  const { uploadId } = req.params;
  const { cdnUrl } = await db.Upload.findByPk(uploadId);
  QRCode.toFileStream(res, cdnUrl, {
    width: 512,
    margin: 0,
  });
});

app.get('/download-qr/:uploadId', async (req, res) => {
  const { uploadId } = req.params;
  const { cdnUrl } = await db.Upload.findByPk(uploadId);
  res.attachment('qr-menu.png');
  QRCode.toFileStream(res, cdnUrl, {
    width: 1024,
    margin: 2,
  });
});

// Uploads
app.post('/restaurants/:restaurantId/uploads', upload.single('menu'), async (req, res) => {
  if (!req.file) {
    res.sendStatus(400);
    return;
  }
  const userId = req.user.sub;
  const { originalname, key, location } = req.file;
  const { restaurantId } = req.params;
  try {
    const User = await db.User.findByPk(userId, {
      include: [
        {
          model: db.Restaurant,
          include: db.Upload,
        },
      ],
    });
    if (!User.Restaurants.find((r) => r.id === restaurantId)) {
      res.sendStatus(403);
      return;
    }
    const Restaurant = await db.Restaurant.findByPk(restaurantId);
    const newUpload = {
      id: uuid(),
      name: originalname,
      s3Key: key,
      s3Url: location,
      cdnUrl: `${process.env.CDN_URL}/${key}`,
    };
    const Upload = await db.Upload.create(newUpload);
    await Restaurant.addUpload(Upload);
    res.sendStatus(201);
  } catch (err) {
    //
  }
});

app.get('/view/:uploadId', async (req, res) => {
  try {
    const { uploadId } = req.params;
    const { cdnUrl } = await db.Upload.findByPk(uploadId);
    res.send({ url: cdnUrl });
  } catch (err) {
    res.sendStatus(400);
  }
});

module.exports = app;
