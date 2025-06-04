const admin = require('../firebase');

exports.getUserProfile = async (req, res) => {
  try {
    const user = await admin.auth().getUser(req.user.uid);
    res.json(user);
  } catch {
    res.status(500).json({ error: 'Fetch user failed' });
  }
};

exports.updateUserProfile = async (req, res) => {
  try {
    const updatedUser = await admin.auth().updateUser(req.user.uid, req.body);
    res.json(updatedUser);
  } catch {
    res.status(500).json({ error: 'Update failed' });
  }
};
