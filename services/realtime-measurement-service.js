const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const admin = require('firebase-admin');

class RealtimeMeasurementService {
  constructor(server) {
    this.io = socketIo(server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });
    
    this.setupSocketHandlers();
    this.setupFirebaseListeners();
  }

  setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`🔌 Client connected: ${socket.id}`);
      
      // Join device room
      socket.on('join-device', (deviceId) => {
        socket.join(`device-${deviceId}`);
        console.log(`📱 Client ${socket.id} joined device room: ${deviceId}`);
      });
      
      // Leave device room
      socket.on('leave-device', (deviceId) => {
        socket.leave(`device-${deviceId}`);
        console.log(`📱 Client ${socket.id} left device room: ${deviceId}`);
      });
      
      // Handle measurement completion
      socket.on('measurement-completed', (data) => {
        console.log(`✅ Measurement completed for device: ${data.deviceId}`);
        this.io.to(`device-${data.deviceId}`).emit('measurement-update', data);
      });
      
      // Handle next measurement request
      socket.on('request-next-measurement', (data) => {
        console.log(`🎯 Next measurement requested for device: ${data.deviceId}`);
        this.io.to(`device-${data.deviceId}`).emit('next-measurement', data);
      });
      
      socket.on('disconnect', () => {
        console.log(`🔌 Client disconnected: ${socket.id}`);
      });
    });
  }

  setupFirebaseListeners() {
    if (!admin.apps.length) {
      console.log('⚠️ Firebase not initialized, skipping Firebase listeners');
      return;
    }

    const db = admin.database();
    
    // Listen for live measurement updates
    const liveRef = db.ref('/live');
    liveRef.on('child_changed', (snapshot) => {
      const deviceId = snapshot.key;
      const liveData = snapshot.val();
      
      console.log(`📡 Live data updated for device: ${deviceId}`);
      
      // Emit to all clients in device room
      this.io.to(`device-${deviceId}`).emit('live-update', {
        deviceId: deviceId,
        data: liveData,
        timestamp: new Date().toISOString()
      });
    });
    
    // Listen for measurement completion
    const measurementsRef = db.ref('/measurements');
    measurementsRef.on('child_added', (snapshot) => {
      const deviceId = snapshot.key;
      const measurementData = snapshot.val();
      
      console.log(`✅ New measurement completed for device: ${deviceId}`);
      
      // Emit to all clients in device room
      this.io.to(`device-${deviceId}`).emit('measurement-completed', {
        deviceId: deviceId,
        measurement: measurementData,
        timestamp: new Date().toISOString()
      });
    });
    
    // Listen for device status updates
    const devicesRef = db.ref('/devices');
    devicesRef.on('child_changed', (snapshot) => {
      const deviceId = snapshot.key;
      const deviceData = snapshot.val();
      
      console.log(`📱 Device status updated: ${deviceId}`);
      
      // Emit to all clients in device room
      this.io.to(`device-${deviceId}`).emit('device-status-update', {
        deviceId: deviceId,
        status: deviceData,
        timestamp: new Date().toISOString()
      });
    });
    
    console.log('🔥 Firebase listeners setup completed');
  }

  // Send next measurement command to ESP32
  async sendNextMeasurementCommand(deviceId, areasid, lat, lng) {
    try {
      if (!admin.apps.length) {
        throw new Error('Firebase not initialized');
      }

      const db = admin.database();
      const commandRef = db.ref(`/commands/${deviceId}`);
      
      await commandRef.set({
        action: 'next_measurement',
        areasid: areasid,
        lat: lat,
        lng: lng,
        timestamp: new Date().toISOString(),
        status: 'pending'
      });
      
      console.log(`🎯 Next measurement command sent to device: ${deviceId}`);
      
      // Emit to all clients in device room
      this.io.to(`device-${deviceId}`).emit('next-measurement-command', {
        deviceId: deviceId,
        areasid: areasid,
        lat: lat,
        lng: lng,
        timestamp: new Date().toISOString()
      });
      
      return true;
    } catch (error) {
      console.error('❌ Error sending next measurement command:', error);
      throw error;
    }
  }

  // Get connected clients count
  getConnectedClientsCount() {
    return this.io.engine.clientsCount;
  }

  // Get device room clients count
  getDeviceRoomClientsCount(deviceId) {
    const room = this.io.sockets.adapter.rooms.get(`device-${deviceId}`);
    return room ? room.size : 0;
  }
}

module.exports = RealtimeMeasurementService;
