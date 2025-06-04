const admin = require('../firebase');

exports.addMeasurement = async (req, res) => {
  const { deviceId, data, location } = req.body;
  const uid = req.user.uid;

  try {
    const ref = admin.database().ref(`measurements/${uid}/${deviceId}`);
    await ref.push({
      ...data,
      location,
      timestamp: Date.now()
    });

    res.json({ message: 'Measurement saved' });
  } catch {
    res.status(500).json({ error: 'Save failed' });
  }
};
