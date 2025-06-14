import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import matchRoutes from './routes/matches.js';
import chatRoutes from './routes/chat.js';
import { authenticateSocket } from './middleware/auth.js';
import User from './models/User.js';

dotenv.config();

const app = express();
const server = createServer(app);

// ✅ Strict CORS origin for frontend
const FRONTEND_ORIGIN = "https://dev-tinder-frontend-omega.vercel.app";

// Express CORS setup
app.use(cors({
  origin: FRONTEND_ORIGIN,
  credentials: true
}));
app.options('*', cors({ origin: FRONTEND_ORIGIN, credentials: true }));

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/chat', chatRoutes);

// Socket.IO CORS setup
const io = new Server(server, {
  cors: {
    origin: FRONTEND_ORIGIN,
    methods: ["GET", "POST"],
    credentials: true
  }
});

io.use(authenticateSocket);

const connectedUsers = new Map();

io.on('connection', async (socket) => {
  console.log('User connected:', socket.userId);

  await User.findByIdAndUpdate(socket.userId, {
    isOnline: true,
    lastSeen: new Date()
  });

  connectedUsers.set(socket.userId, socket.id);
  socket.join(socket.userId);
  socket.broadcast.emit('user_online', socket.userId);

  socket.on('join_chat', (chatId) => {
    socket.join(chatId);
    console.log(`User ${socket.userId} joined chat ${chatId}`);
  });

  socket.on('send_message', async (data) => {
    try {
      const { chatId, message } = data;
      socket.to(chatId).emit('receive_message', {
        chatId,
        message,
        sender: socket.userId,
        timestamp: new Date()
      });
      console.log(`Message sent in chat ${chatId} by user ${socket.userId}`);
    } catch (error) {
      console.error('Error sending message:', error);
    }
  });

  socket.on('typing_start', (data) => {
    socket.to(data.chatId).emit('user_typing', {
      userId: socket.userId,
      chatId: data.chatId
    });
  });

  socket.on('typing_stop', (data) => {
    socket.to(data.chatId).emit('user_stop_typing', {
      userId: socket.userId,
      chatId: data.chatId
    });
  });

  socket.on('disconnect', async () => {
    console.log('User disconnected:', socket.userId);
    await User.findByIdAndUpdate(socket.userId, {
      isOnline: false,
      lastSeen: new Date()
    });
    connectedUsers.delete(socket.userId);
    socket.broadcast.emit('user_offline', socket.userId);
  });
});

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/devtinder')
  .then(() => console.log('Connected to MongoDB'))
  .catch((error) => console.error('MongoDB connection error:', error));

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
