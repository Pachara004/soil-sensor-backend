const initFirebase = require('../config/firebase');

module.exports = (io) => {
  const db = initFirebase();
  io.on('connection', (socket) => {
    socket.on('join-device', (deviceId) => {
      socket.join(deviceId);
      const liveRef = db.ref(`live/${deviceId}`);
      liveRef.on('value', (snapshot) => {
        const payload = snapshot.val();
        if (payload) {
          socket.emit('live-update', payload);
        }
      });
    });

    socket.on('save-measurement', async (data) => {
      const { deviceId, payload, areaId } = data;
      try {
        const measurement = new (require('../models/Measurement'))({
          deviceId,
          ...payload,
          timestamp: Date.now(),
          date: new Date().toISOString().split('T')[0],
          areaId
        });
        await measurement.save();

        if (areaId) {
          const Measurement = require('../models/Measurement');
          const Area = require('../models/Area');
          const measurements = await Measurement.find({ areaId });
          const count = measurements.length;
          const averages = measurements.reduce((acc, m) => {
            acc.temperature += m.temperature || 0;
            acc.moisture += m.moisture || 0;
            acc.nitrogen += m.nitrogen || 0;
            acc.phosphorus += m.phosphorus || 0;
            acc.potassium += m.potassium || 0;
            acc.ph += m.ph || 0;
            return acc;
          }, { temperature: 0, moisture: 0, nitrogen: 0, phosphorus: 0, potassium: 0, ph: 0 });
          Object.keys(averages).forEach(key => averages[key] /= count);
          await Area.updateOne({ id: areaId }, { totalMeasurements: count, averages });
        }

        await db.ref(`live/${deviceId}`).remove();
        socket.emit('measurement-saved', { message: 'Measurement saved and cleared' });
      } catch (err) {
        socket.emit('error', { message: err.message });
      }
    });
  });
};