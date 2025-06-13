import express from 'express';
import Chat from '../models/Chat.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get user's chats with unread counts
router.get('/my-chats', authenticateToken, async (req, res) => {
  try {
    const chats = await Chat.find({
      participants: req.user._id
    })
    .populate('participants', 'firstName lastName profilePicture isOnline lastSeen')
    .populate('lastMessage.sender', 'firstName lastName')
    .sort({ 'lastMessage.timestamp': -1 });

    // Calculate unread counts for current user
    const chatsWithUnread = chats.map(chat => {
      const unreadInfo = chat.unreadCount.find(
        uc => uc.user.toString() === req.user._id.toString()
      );
      
      return {
        ...chat.toObject(),
        unreadCount: unreadInfo ? unreadInfo.count : 0
      };
    });

    res.json(chatsWithUnread);
  } catch (error) {
    console.error('Get chats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get messages for a specific chat
router.get('/:chatId/messages', authenticateToken, async (req, res) => {
  try {
    const { chatId } = req.params;
    
    const chat = await Chat.findById(chatId)
      .populate('messages.sender', 'firstName lastName profilePicture')
      .populate('participants', 'firstName lastName profilePicture isOnline lastSeen');

    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    // Check if user is participant
    const isParticipant = chat.participants.some(
      participant => participant._id.toString() === req.user._id.toString()
    );

    if (!isParticipant) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Mark messages as read and reset unread count
    await Chat.findByIdAndUpdate(chatId, {
      $set: {
        'messages.$[elem].read': true,
        'messages.$[elem].readAt': new Date(),
        'unreadCount.$[user].count': 0
      }
    }, {
      arrayFilters: [
        { 'elem.sender': { $ne: req.user._id }, 'elem.read': false },
        { 'user.user': req.user._id }
      ]
    });


    res.json(chat);
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Send a message
router.post('/:chatId/messages', authenticateToken, async (req, res) => {
  try {
    const { chatId } = req.params;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ message: 'Message content is required' });
    }

    const chat = await Chat.findById(chatId);
    
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    // Check if user is participant
    const isParticipant = chat.participants.some(
      participant => participant.toString() === req.user._id.toString()
    );

    if (!isParticipant) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Add message to chat
    const newMessage = {
      sender: req.user._id,
      content: content.trim(),
      timestamp: new Date()
    };

    chat.messages.push(newMessage);
    
    // Update last message
    chat.lastMessage = {
      content: content.trim(),
      sender: req.user._id,
      timestamp: new Date()
    };

    // Update unread count for other participant
    const otherParticipant = chat.participants.find(
      p => p.toString() !== req.user._id.toString()
    );

    const unreadIndex = chat.unreadCount.findIndex(
      uc => uc.user.toString() === otherParticipant.toString()
    );

    if (unreadIndex >= 0) {
      chat.unreadCount[unreadIndex].count += 1;
    } else {
      chat.unreadCount.push({
        user: otherParticipant,
        count: 1
      });
    }

    await chat.save();

    // Populate the new message for response
    await chat.populate('messages.sender', 'firstName lastName profilePicture');
    const savedMessage = chat.messages[chat.messages.length - 1];

    res.status(201).json(savedMessage);
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
