const Meeting = require('../models/Meeting');
const Notification = require('../models/Notification');
const axios = require('axios');

// Cal.com API config
const CAL_API_URL = process.env.CAL_API_URL || 'https://api.cal.com/v1';
const CAL_API_KEY = process.env.CAL_API_KEY;
const CAL_USERNAME = 'saswat-pattanaik-io4wsx';

const calApi = axios.create({
  baseURL: CAL_API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// 1. Fetch event types
const fetchCalEventTypes = async () => {
  const response = await calApi.get(`/event-types?apiKey=${CAL_API_KEY}`);
  return response.data.event_types || [];
};

// 2. Fetch specific event type
const fetchEventTypeById = async (eventTypeId) => {
  const response = await calApi.get(`/event-types/${eventTypeId}?apiKey=${CAL_API_KEY}`);
  console.log('Event type details:', response.data);
  return response.data;
};

// 3. Create event type
const createEventType = async (title, duration) => {
  const payload = {
    title,
    slug: title.toLowerCase().replace(/\s+/g, '-'),
    length: duration,
    hidden: false,
    position: 0,
    eventName: null,
    timeZone: null,
    scheduleId: 5,
    periodType: "UNLIMITED",
    periodStartDate: new Date().toISOString(),
    periodEndDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString(),
    periodDays: null,
    periodCountCalendarDays: false,
    requiresConfirmation: false,
    recurringEvent: {
      freq: 1,
      count: 1,
      interval: 1
    },
    disableGuests: false,
    hideCalendarNotes: false,
    minimumBookingNotice: 120,
    beforeEventBuffer: 0,
    afterEventBuffer: 0,
    price: 0,
    currency: "usd",
    slotInterval: null,
    successRedirectUrl: null,
    description: `${title} scheduled by backend`,
    metadata: {
      apps: {
        stripe: {
          price: 0,
          enabled: false,
          currency: "usd"
        }
      }
    }
  };

  const response = await calApi.post(`/event-types?apiKey=${CAL_API_KEY}`, payload);
  console.log('Created event type:', response.data);
  return response.data;
};

// 4. Get or create event type
const getOrCreateEventTypeId = async (title, duration) => {
  try {
    const eventTypes = await fetchCalEventTypes();
    console.log('Available event types:', eventTypes);

    const match = eventTypes.find(et =>
      et.title && et.title.toLowerCase() === title.toLowerCase()
    );

    if (match) {
      console.log('Found matching event type:', match);
      return match.id;
    }

    console.log('Creating new event type for:', title);
    const newEventType = await createEventType(title, duration);
    console.log('Created new event type:', newEventType);
    return newEventType.id;
  } catch (error) {
    console.error('Error in getOrCreateEventTypeId:', error);
    throw error;
  }
};

// 5. Schedule meeting
const scheduleMeeting = async (req, res) => {
  try {
    const { title, description, datetime, duration, attendees, attendeeNames } = req.body;
    const userId = req.user._id;

    if (!title || !datetime || !duration || !attendees || !attendees.length) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required fields: title, datetime, duration, and at least one attendee are required'
      });
    }

    const eventTypeId = await getOrCreateEventTypeId(title || 'Default Meeting', duration);
    console.log('Using event type ID:', eventTypeId);

    if (!eventTypeId) {
      return res.status(400).json({
        status: 'error',
        message: 'Failed to get or create event type'
      });
    }

    const startTime = new Date(datetime);
    const endTime = new Date(startTime);
    endTime.setMinutes(endTime.getMinutes() + duration);

    const primaryAttendeeEmail = attendees[0];
    const primaryAttendeeName = attendeeNames?.[0] || primaryAttendeeEmail.split('@')[0];

    // Match exactly with the working example format
    const bookingData = {
      eventTypeId: parseInt(eventTypeId), // Ensure it's a number
      start: startTime.toISOString(),
      end: endTime.toISOString(),
      responses: {
        name: primaryAttendeeName,
        email: primaryAttendeeEmail,
        smsReminderNumber: "",
        location: {
          value: "Google Meet",
          optionValue: ""
        }
      },
      timeZone: "Asia/Kolkata",
      language: "en",
      title: title,
      description: null,
      status: "",
      metadata: {},
      recurringEvent: {
        freq: 1,
        count: 1,
        interval: 1
      }
    };

    console.log('Sending booking request:', JSON.stringify(bookingData, null, 2));

    const response = await calApi.post(`/bookings?apiKey=${CAL_API_KEY}`, bookingData);
    console.log('Booking response:', response.data);

    const calEvent = response.data;

    const meeting = new Meeting({
      title,
      description,
      datetime: startTime,
      duration,
      meetLink: calEvent.location || calEvent.hangoutLink,
      calEventId: calEvent.id,
      createdBy: userId,
      participants: [userId]
    });

    await meeting.save();

    const notifications = attendees.map(email => new Notification({
      userId: req.user._id,
      message: `New meeting scheduled: ${title}`,
      type: 'meeting',
      relatedMeeting: meeting._id
    }));

    await Notification.insertMany(notifications);

    res.status(201).json({
      status: 'success',
      data: { meeting, eventTypeId }
    });
  } catch (error) {
    console.error('Error scheduling meeting:', error.message);
    if (error.response) {
      console.error('Cal.com API Error:', error.response.data);
    }
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
    logger.error('Error fetching meetings:', error);
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
    logger.error('Error fetching meeting details:', error);
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
    logger.error('Error cancelling meeting:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to cancel meeting'
    });
  }
};

const getAvailableSlots = async (req, res) => {
  try {
    const { date } = req.query;
    const username = 'saswat-pattanaik-io4wsx'; // Replace with actual Cal.com username

    
    const response = await calApi.get('/availability?apiKey=' + process.env.CAL_API_KEY, {
      params: {
        username,
        dateFrom: date,
        dateTo: date,
      },
    });


    // Process the response to extract available slots
    const workingHours = response.data?.workingHours || [];
    const dateRanges = response.data?.dateRanges || [];
    const busy = response.data?.busy || [];
    const timeZone = response.data?.timeZone || 'UTC';



    // Generate available slots based on working hours
    const slots = [];
    
    // If we have date ranges, use those instead of working hours
    if (dateRanges.length > 0) {
      dateRanges.forEach(range => {
        const startTime = new Date(range.start);
        const endTime = new Date(range.end);
        
        // Generate 30-minute slots
        for (let time = new Date(startTime); time < endTime; time.setMinutes(time.getMinutes() + 30)) {
          const isBusy = busy.some(busySlot => 
            new Date(busySlot.start) <= time && time < new Date(busySlot.end)
          );
          
          slots.push({
            time: time.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
            available: !isBusy
          });
        }
      });
    } else if (workingHours.length > 0) {
      // Use working hours if no date ranges
      workingHours.forEach(day => {
        if (day.days.includes(new Date(date).getDay())) {
          // Convert minutes since midnight to HH:mm format
          const startHour = Math.floor(day.startTime / 60);
          const startMinute = day.startTime % 60;
          const endHour = Math.floor(day.endTime / 60);
          const endMinute = day.endTime % 60;

          const startTimeStr = `${startHour.toString().padStart(2, '0')}:${startMinute.toString().padStart(2, '0')}`;
          const endTimeStr = `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`;

          const startTime = new Date(`${date}T${startTimeStr}`);
          const endTime = new Date(`${date}T${endTimeStr}`);
          
          // Generate 30-minute slots
          for (let time = new Date(startTime); time < endTime; time.setMinutes(time.getMinutes() + 30)) {
            const isBusy = busy.some(busySlot => 
              new Date(busySlot.start) <= time && time < new Date(busySlot.end)
            );
            
            slots.push({
              time: time.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
              available: !isBusy
            });
          }
        }
      });
    }


    res.status(200).json({
      status: 'success',
      data: {
        slots,
        timeZone
      },
    });
  } catch (error) {
    console.error('Error fetching available slots:', error.response?.data || error.message);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch available slots',
      details: error.response?.data || null,
    });
  }
};


const getEventTypes = async (req, res) => {
  try {
    // API key is now passed as an explicit parameter as it seems to be required based on error logs
    const response = await calApi.get(`/event-types?apiKey=${process.env.CAL_API_KEY}`);
    
    res.status(200).json({
      status: 'success',
      data: {
        eventTypes: response.data.eventTypes || []
      }
    });
  } catch (error) {
    console.error('Error fetching event types:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch event types'
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
    logger.error('Error fetching all bookings:', error);
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
  getAvailableSlots,
  getEventTypes,
  getAllBookings
};