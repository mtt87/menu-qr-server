const express = require('express');
const bodyParser = require('body-parser');
// const { CronJob } = require('cron');
const { v4: uuid } = require('uuid');
const request = require('superagent');
const cors = require('cors');
const moment = require('moment');
const QRCode = require('qrcode');
const multer = require('multer');
const multerS3 = require('multer-s3');
const path = require('path');
const stripe = require('stripe')(process.env.STRIPE_SECRET);
const db = require('./models');

// const { Op } = db.Sequelize;
const jwtMiddleware = require('./jwtMiddleware');
const s3 = require('./s3');

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

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
  fileFilter: (req, file, callback) => {
    const ext = path.extname(file.originalname);
    if (ext !== '.png' && ext !== '.jpg' && ext !== '.pdf' && ext !== '.jpeg') {
      callback(new Error('Solo PDF e immagini'));
      return;
    }
    callback(null, true);
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

// Use JSON parser for all non-webhook routes
app.use('/webhooks/stripe', bodyParser.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook error', err.message);
    res.status(400).send(err.message);
    return;
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const { subscription, client_reference_id: userId } = session;
      const User = await db.User.findByPk(userId);
      await User.update({
        subscriptionId: subscription,
        subscriptionStatus: 'PAID',
      });
    }

    res.json({ received: true });
  } catch (err) {
    console.error(err);
    res.status(400).send(err.message);
  }
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cors());
app.use('*', jwtMiddleware);

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
      subscriptionStatus: 'TRIAL',
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
  const url = `https://view.menu-qr.tech/?id=${uploadId}`;
  QRCode.toFileStream(res, url, {
    width: 512,
    margin: 0,
    color: {
      dark: '#000',
      light: '#fff',
    },
  });
});

app.get('/download-qr/:uploadId', async (req, res) => {
  const { uploadId } = req.params;
  const url = `https://view.menu-qr.tech/?id=${uploadId}`;
  res.attachment('qr-menu.png');
  QRCode.toFileStream(res, url, {
    width: 1024,
    margin: 2,
    color: {
      dark: '#000',
      light: '#fff',
    },
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
  const { type } = req.body;
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
      type,
      cdnUrl: `${process.env.CDN_URL}/${key}`,
    };
    const Upload = await db.Upload.create(newUpload);
    await Restaurant.addUpload(Upload);
    res.sendStatus(201);
  } catch (err) {
    //
    console.error(err);
    res.sendStatus(500);
  }
});

app.put('/restaurants/:restaurantId/uploads/:uploadId', upload.single('menu'), async (req, res) => {
  if (!req.file) {
    res.sendStatus(400);
    return;
  }
  const userId = req.user.sub;
  const { originalname, key, location } = req.file;
  const { restaurantId, uploadId } = req.params;
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
    const Upload = await db.Upload.findByPk(uploadId);
    await Upload.update({
      name: originalname,
      s3Key: key,
      s3Url: location,
      cdnUrl: `${process.env.CDN_URL}/${key}`,
    });
    res.sendStatus(201);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

app.delete('/restaurants/:restaurantId/uploads/:uploadId', async (req, res) => {
  const userId = req.user.sub;
  const { restaurantId, uploadId } = req.params;
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
    const Upload = await db.Upload.findByPk(uploadId);
    await s3
      .deleteObject({
        Bucket: 'view.menu-qr.tech',
        Key: Upload.s3Key,
      })
      .promise();
    await Upload.destroy();
    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

app.get('/view/:uploadId', async (req, res) => {
  try {
    const { uploadId } = req.params;
    const Upload = await db.Upload.findByPk(uploadId, {
      include: {
        model: db.Restaurant,
        attributes: ['id'],
        include: {
          model: db.User,
          attributes: ['subscriptionStatus'],
        },
      },
    });
    if (Upload.Restaurant.User.subscriptionStatus === 'EXPIRED') {
      res.sendStatus(403);
      return;
    }
    res.send({ url: Upload.cdnUrl });
  } catch (err) {
    console.error(err);
    res.sendStatus(400);
  }
});

app.post('/cancel-subscription', async (req, res) => {
  if (!req.user) {
    res.sendStatus(401);
    return;
  }
  try {
    const userId = req.user.sub;
    const User = await db.User.findByPk(userId);
    const { subscriptionId } = User;
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
    await User.update({
      subscriptionEnd: moment(subscription.current_period_end).format('yyyy-mm-dd'),
    });
    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

// const handleCancelledUsers = async () => {
//   console.log('checking cancelled users');
//   try {
//     const expiredUsers = await db.User.findAll({
//       where: {
//         subscriptionEnd: {
//           [Op.lt]: new Date(),
//         },
//       },
//       attributes: ['id'],
//     });
//     if (expiredUsers.length > 0) {
//       const updates = expiredUsers.map((user) => user.update({ subscriptionStatus: 'EXPIRED' }));
//       await Promise.all(updates);
//     }
//   } catch (err) {
//     console.error(err);
//   }
// };

// const handleExpiredTrialUsers = async () => {
//   console.log('checking expired trial users');
//   try {
//     const expiredTrialUsers = await db.User.findAll({
//       where: {
//         subscriptionStatus: 'TRIAL',
//         createdAt: {
//           [Op.lt]: moment().subtract(14, 'days').toDate(),
//         },
//       },
//       attributes: ['id'],
//     });
//     if (expiredTrialUsers.length > 0) {
//       const updates = expiredTrialUsers.map((user) =>
//         user.update({ subscriptionStatus: 'EXPIRED' }),
//       );
//       await Promise.all(updates);
//     }
//   } catch (err) {
//     console.error(err);
//   }
// };

// const expireCancelledUsersCron = new CronJob('0 1 * * *', handleCancelledUsers);
// const expireTrialUsersCron = new CronJob('0 1 * * *', handleExpiredTrialUsers);
// expireCancelledUsersCron.start();
// expireTrialUsersCron.start();

module.exports = app;
