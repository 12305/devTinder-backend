import express from 'express';
import { body, validationResult } from 'express-validator';
import User from '../models/User.js';
import { authenticateToken } from '../middleware/auth.js';
import { uploadToCloudinary } from '../utils/cloudinary.js';
import multer from 'multer';

const router = express.Router();

// Configure multer for memory storage
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Get potential matches with advanced filtering
router.get('/potential-matches', authenticateToken, async (req, res) => {
  try {
    const currentUser = req.user;
    const { 
      minAge, 
      maxAge, 
      skills, 
      experienceLevel, 
      location, 
      lookingFor 
    } = req.query;
    
    // Get IDs of users already swiped on
    const swipedUserIds = currentUser.swipedUsers.map(swipe => swipe.user);
    
    // Build filter query
    let filterQuery = {
      _id: { 
        $nin: [...swipedUserIds, currentUser._id] 
      }
    };

    // Age filtering
    if (minAge || maxAge) {
      filterQuery.age = {};
      if (minAge) filterQuery.age.$gte = parseInt(minAge);
      if (maxAge) filterQuery.age.$lte = parseInt(maxAge);
    }

    // Skills filtering
    if (skills) {
      const skillsArray = skills.split(',').map(skill => skill.trim());
      filterQuery.skills = { $in: skillsArray };
    }

    // Experience level filtering
    if (experienceLevel) {
      filterQuery.experienceLevel = experienceLevel;
    }

    // Location filtering
    if (location) {
      filterQuery.location = { $regex: location, $options: 'i' };
    }

    // Looking for filtering
    if (lookingFor) {
      filterQuery.lookingFor = lookingFor;
    }

    // Find users with filters applied, limit to 2
    const potentialMatches = await User.find(filterQuery)
      .select('firstName lastName age bio skills profilePicture location github linkedin experienceLevel jobTitle company lookingFor isOnline lastSeen')
      .limit(2);

    res.json(potentialMatches);
  } catch (error) {
    console.error('Error fetching potential matches:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update profile with enhanced fields
router.put('/profile', authenticateToken, [
  body('bio').optional().isLength({ max: 500 }).withMessage('Bio must be less than 500 characters'),
  body('skills').optional().isArray().withMessage('Skills must be an array'),
  body('location').optional().trim(),
  body('github').optional().trim(),
  body('linkedin').optional().trim(),
  body('experienceLevel').optional().isIn(['Junior', 'Mid-Level', 'Senior', 'Lead', 'Architect']),
  body('jobTitle').optional().trim(),
  body('company').optional().trim(),
  body('lookingFor').optional().isIn(['Collaboration', 'Mentorship', 'Networking', 'Job Opportunities', 'Friendship'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { 
      bio, 
      skills, 
      location, 
      github, 
      linkedin, 
      experienceLevel, 
      jobTitle, 
      company, 
      lookingFor 
    } = req.body;
    const userId = req.user._id;

    const updateData = {};
    if (bio !== undefined) updateData.bio = bio;
    if (skills !== undefined) updateData.skills = skills;
    if (location !== undefined) updateData.location = location;
    if (github !== undefined) updateData.github = github;
    if (linkedin !== undefined) updateData.linkedin = linkedin;
    if (experienceLevel !== undefined) updateData.experienceLevel = experienceLevel;
    if (jobTitle !== undefined) updateData.jobTitle = jobTitle;
    if (company !== undefined) updateData.company = company;
    if (lookingFor !== undefined) updateData.lookingFor = lookingFor;

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    res.json({
      message: 'Profile updated successfully',
      user: updatedUser
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Upload profile picture
router.post('/upload-profile-picture', authenticateToken, upload.single('profilePicture'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Upload to Cloudinary
    const result = await uploadToCloudinary(req.file.buffer, 'devtinder/profiles');
    
    // Update user profile picture
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { profilePicture: result.secure_url },
      { new: true }
    ).select('-password');

    res.json({
      message: 'Profile picture uploaded successfully',
      profilePicture: result.secure_url,
      user: updatedUser
    });
  } catch (error) {
    console.error('Profile picture upload error:', error);
    res.status(500).json({ message: 'Server error during upload' });
  }
});

// Update online status
router.put('/online-status', authenticateToken, async (req, res) => {
  try {
    const { isOnline } = req.body;
    
    const updateData = {
      isOnline,
      lastSeen: new Date()
    };

    await User.findByIdAndUpdate(req.user._id, updateData);
    
    res.json({ message: 'Status updated' });
  } catch (error) {
    console.error('Status update error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;