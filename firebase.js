const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://soil-project-fd4f9.firebaseio.com',
  storageBucket: 'soil-project-fd4f9.appspot.com'
});

module.exports = admin;
