import express from 'express';
import User from '../models/User.js';
import Chat from '../models/Chat.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Swipe on a user (like or pass)
router.post('/swipe', authenticateToken, async (req, res) => {
  try {
    const { targetUserId, action } = req.body;
    const currentUserId = req.user._id;

    if (!targetUserId || !action || !['like', 'pass'].includes(action)) {
      return res.status(400).json({ message: 'Invalid swipe data' });
    }

    if (targetUserId === currentUserId.toString()) {
      return res.status(400).json({ message: 'Cannot swipe on yourself' });
    }

    // Check if user already swiped on this person
    const currentUser = await User.findById(currentUserId);
    const alreadySwiped = currentUser.swipedUsers.some(
      swipe => swipe.user.toString() === targetUserId
    );

    if (alreadySwiped) {
      return res.status(400).json({ message: 'Already swiped on this user' });
    }

    // Add swipe to current user
    currentUser.swipedUsers.push({
      user: targetUserId,
      action: action
    });

    let isMatch = false;
    let chatId = null;

    // If it's a like, check for mutual like (match)
    if (action === 'like') {
      const targetUser = await User.findById(targetUserId);
      
      if (!targetUser) {
        return res.status(404).json({ message: 'Target user not found' });
      }

      // Check if target user already liked current user
      const mutualLike = targetUser.swipedUsers.some(
        swipe => swipe.user.toString() === currentUserId.toString() && swipe.action === 'like'
      );

      if (mutualLike) {
        isMatch = true;
        
        // Add to matches for both users
        currentUser.matches.push(targetUserId);
        targetUser.matches.push(currentUserId);
        
        // Create chat for the match
        const chat = new Chat({
          participants: [currentUserId, targetUserId]
        });
        
        await chat.save();
        await targetUser.save();
        chatId = chat._id;
      }
    }

    await currentUser.save();

    res.json({
      message: isMatch ? 'It\'s a match!' : 'Swipe recorded',
      isMatch,
      chatId
    });
  } catch (error) {
    console.error('Swipe error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user's matches
router.get('/my-matches', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('matches', 'firstName lastName profilePicture bio age')
      .select('matches');

    res.json(user.matches);
  } catch (error) {
    console.error('Get matches error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;