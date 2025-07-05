const Meeting = require('../models/Meeting');
const Notification = require('../models/Notification');
const axios = require('axios');
const mongoose = require('mongoose');

// Calendly API config
const CALENDLY_PAT = process.env.CALENDLY_PAT || 'eyJraWQiOiIxY2UxZTEzNjE3ZGNmNzY2YjNjZWJjY2Y4ZGM1YmFmYThhNjVlNjg0MDIzZjdjMzJiZTgzNDliMjM4MDEzNWI0IiwidHlwIjoiUEFUIiwiYWxnIjoiRVMyNTYifQ.eyJpc3MiOiJodHRwczovL2F1dGguY2FsZW5kbHkuY29tIiwiaWF0IjoxNzUwMzA0Nzg4LCJqdGkiOiI0MTNkNGM5Zi1iNjNhLTRlMDctOGMyOS1hZmQ5YTllZjU0MzUiLCJ1c2VyX3V1aWQiOiI0YzBmODdjOC04ZmNhLTQ2NGEtOWM3YS03NTk5MWI3MDQ4YzkifQ.KOFimS2_qtWvDsKbsJr_QjkZw5_RLjD7XdQCqzRKKxUK9J-n3wsTIkguMow1JN1KJBwZe-PSrcaE5idQd6GNJg';
const CALENDLY_USER_URI = process.env.CALENDLY_USER_URI || 'https://api.calendly.com/users/4c0f87c8-8fca-464a-9c7a-75991b7048c9'; // Replace with your user URI

const scheduleMeeting = async (req, res) => {
  try {
    const { title, description, datetime, duration, attendees, platform } = req.body;
    const userId = req.user._id;

    if (!title || !datetime || !duration || !attendees || !attendees.length) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required fields: title, datetime, duration, and at least one attendee are required'
      });
    }

    let meetLink = '';
    let calendlyEventUri = null;
    let usedPlatform = platform || 'calendly';

    if (platform === 'zoom') {
      // TODO: Replace this with actual Zoom API call
      meetLink = 'https://zoom.us/j/placeholder'; // Placeholder link
    } else if (platform === 'calendly') {
      // Calendly v2 API logic
      // Create a one-off event for the first attendee
      const inviteeEmail = attendees[0];
      const eventStart = new Date(datetime).toISOString();
      const eventEnd = new Date(new Date(datetime).getTime() + duration * 60000).toISOString();
      const payload = {
        "invitees": [
          {
            "email": inviteeEmail
          }
        ],
        "name": title,
        "start_time": eventStart,
        "end_time": eventEnd,
        "location": {
          "type": "zoom_conference",
          "location": "Zoom"
        },
        "description": description
      };
      const calendlyResponse = await axios.post(
        `${CALENDLY_USER_URI}/scheduled_events`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${CALENDLY_PAT}`,
            'Content-Type': 'application/json',
          }
        }
      );
      calendlyEventUri = calendlyResponse.data.resource.uri;
      meetLink = calendlyResponse.data.resource.location.join_url || calendlyEventUri;
    }

    const meeting = new Meeting({
      title,
      description,
      datetime: new Date(datetime),
      duration,
      meetLink,
      calEventId: calendlyEventUri,
      createdBy: userId,
      participants: [userId],
      status: 'scheduled',
      platform: usedPlatform
    });
    await meeting.save();

    // Send notifications to all attendees
    const notifications = attendees.map(email => new Notification({
      userId: req.user._id,
      message: `New meeting scheduled: ${title}`,
      type: 'meeting',
      relatedMeeting: meeting._id
    }));
    await Notification.insertMany(notifications);

    res.status(201).json({
      status: 'success',
      data: { meeting, calendlyEventUri, platform: usedPlatform }
    });
  } catch (error) {
    console.error('Error scheduling meeting:', error.message, error.response?.data);
    res.status(500).json({
      status: 'error',
      message: 'Failed to schedule meeting',
      details: error.response?.data || error.message
    });
  }
};

const getUpcomingMeetings = async (req, res) => {
  try {
    const userId = req.user._id;
    const now = new Date();

    const meetings = await Meeting.find({
      datetime: { $gte: now },
      status: 'scheduled',
      $or: [
        { createdBy: userId },
        { participants: userId }
      ]
    }).sort({ datetime: 1 });

    res.status(200).json({
      status: 'success',
      data: {
        meetings
      }
    });
  } catch (error) {
    console.error('Error fetching meetings:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch meetings'
    });
  }
};

const getMeetingDetails = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const userId = req.user._id;

    // Validate meetingId
    if (!mongoose.Types.ObjectId.isValid(meetingId)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid meeting ID'
      });
    }

    const meeting = await Meeting.findOne({
      _id: meetingId,
      $or: [
        { createdBy: userId },
        { participants: userId }
      ]
    });

    if (!meeting) {
      return res.status(404).json({
        status: 'error',
        message: 'Meeting not found'
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        meeting
      }
    });
  } catch (error) {
    console.error('Error fetching meeting details:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch meeting details'
    });
  }
};

const cancelMeeting = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const userId = req.user._id;

    const meeting = await Meeting.findOne({
      _id: meetingId,
      createdBy: userId
    });

    if (!meeting) {
      return res.status(404).json({
        status: 'error',
        message: 'Meeting not found'
      });
    }

    // Cancel Cal.com event if we have the ID
    if (meeting.calEventId) {
      try {
        await calApi.delete(`/events/${meeting.calEventId}`);
      } catch (calError) {
        console.error('Error cancelling Cal.com event:', calError);
        // Continue with meeting cancellation even if Cal.com API fails
      }
    } else {
      console.warn(`Attempting to cancel meeting ${meetingId} without a calEventId`);
    }

    meeting.status = 'cancelled';
    await meeting.save();

    // Create notifications for participants
    const notifications = meeting.participants.map(participantId => new Notification({
      userId: participantId,
      message: `Meeting cancelled: ${meeting.title}`,
      type: 'meeting',
      relatedMeeting: meeting._id
    }));

    await Notification.insertMany(notifications);

    res.status(200).json({
      status: 'success',
      message: 'Meeting cancelled successfully'
    });
  } catch (error) {
    console.error('Error cancelling meeting:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to cancel meeting'
    });
  }
};

const getAllBookings = async (req, res) => {
  try {
    const bookings = await Meeting.find()
      .sort({ datetime: -1 })
      .populate('createdBy', 'email firstName lastName')
      .populate('participants', 'email firstName lastName')
      .lean();

    res.status(200).json({
      status: 'success',
      data: {
        bookings
      }
    });
  } catch (error) {
    console.error('Error fetching all bookings:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch bookings'
    });
  }
};

module.exports = {
  scheduleMeeting,
  getUpcomingMeetings,
  getMeetingDetails,
  cancelMeeting,
  getAllBookings
};