const express = require('express');
const router = express.Router();
const { auth, adminAuth } = require('../middleware/auth');
const {
  scheduleMeeting,
  getUpcomingMeetings,
  getMeetingDetails,
  cancelMeeting,
  getAvailableSlots,
  getEventTypes,
  getAllBookings
} = require('../controllers/meetingController');

// All routes require authentication
router.use(auth);

// Schedule a new meeting
router.post('/', scheduleMeeting);

// Get upcoming meetings
router.get('/upcoming', getUpcomingMeetings);

// Cal.com specific routes — put these BEFORE dynamic routes
router.get('/available-slots', getAvailableSlots);
router.get('/event-types', getEventTypes);

// Admin route
router.get('/admin/bookings', adminAuth, getAllBookings);

// Cancel meeting
router.put('/:meetingId/cancel', cancelMeeting);

// ⚠️ Dynamic route should be last
router.get('/:meetingId', getMeetingDetails);

module.exports = router;
