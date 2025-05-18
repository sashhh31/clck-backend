const twilio = require('twilio');

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const sendVerificationCode = async (phoneNumber) => {
  try {
    const verification = await twilioClient.verify.v2
      .services(process.env.TWILIO_VERIFY_SID)
      .verifications.create({
        to: phoneNumber,
        channel: 'sms'
      });
    return { success: true, status: verification.status };
  } catch (error) {
    console.error('Twilio verification error:', error);
    throw new Error('Failed to send verification code');
  }
};

const verifyCode = async (phoneNumber, code) => {
  try {
    const verificationCheck = await twilioClient.verify.v2
      .services(process.env.TWILIO_VERIFY_SID)
      .verificationChecks.create({
        to: phoneNumber,
        code: code
      });

    return {
      success: verificationCheck.status === 'approved',
      status: verificationCheck.status
    };
  } catch (error) {
    console.error('Twilio verification check error:', error);
    throw new Error('Failed to verify code');
  }
};

module.exports = {
  sendVerificationCode,
  verifyCode
}; 