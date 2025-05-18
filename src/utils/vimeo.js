const { Vimeo } = require('@vimeo/vimeo');

// Replace with your credentials (recommended: use env variables)
const clientId = process.env.VIMEO_CLIENT_ID;
const clientSecret = process.env.VIMEO_CLIENT_SECRET;
const accessToken = process.env.VIMEO_ACCESS_TOKEN;

// Create Vimeo client instance
const vimeoClient = new Vimeo(clientId, clientSecret, accessToken);

module.exports = { vimeoClient };
