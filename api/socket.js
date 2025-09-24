const { Server } = require("socket.io");

let io;

module.exports = (req, res) => {
  if (!io) {
    io = new Server(res.socket.server, {
      cors: {
        origin: "*", // 本番環境では特定のオリジンに制限することを推奨
        methods: ["GET", "POST"]
      }
    });

    io.on('connection', (socket) => {
      console.log('A user connected:', socket.id);

      socket.on('joinRoom', (roomId) => {
        socket.join(roomId);
        console.log(`User ${socket.id} joined room ${roomId}`);
      });

      socket.on('signal', (data) => {
        console.log('Signal received, broadcasting to room:', data.roomId);
        socket.to(data.roomId).emit('signal', data);
      });

      socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
      });
    });

    console.log("Socket.IO server initialized!");
  }

  res.end("Socket.IO server is running.");
};