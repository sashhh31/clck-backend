# Document and Video Management Backend

A comprehensive backend system for managing documents and videos with user authentication, 2FA, and subscription management.

## Features

- 🔐 **Authentication System**
  - User registration with email and password
  - Two-Factor Authentication (2FA) via SMS
  - JWT-based authentication
  - Role-based access control

- 📁 **Document Management**
  - Upload documents to Cloudinary
  - Download documents with secure signed URLs
  - List and manage user documents

- 📹 **Video Management**
  - Upload videos to Vimeo
  - Track video processing status
  - Support for captions/subtitles
  - Secure video streaming

- 💳 **Subscription Management**
  - Three-tier subscription system (Basic, Professional, Enterprise)
  - Stripe integration for payments
  - Subscription status tracking
  - Webhook handling for subscription events

- 👑 **Admin Panel**
  - User management
  - Document management on behalf of users
  - Email notifications
  - User banning and deletion

## Prerequisites

- Node.js (v14 or higher)
- MongoDB
- Cloudinary Account
- Vimeo Account
- Twilio Account
- Stripe Account

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/clck-backend

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=24h

# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# Twilio Configuration
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_PHONE_NUMBER=your-twilio-phone-number

# Vimeo Configuration
VIMEO_ACCESS_TOKEN=your-vimeo-access-token
VIMEO_CLIENT_ID=your-vimeo-client-id
VIMEO_CLIENT_SECRET=your-vimeo-client-secret

# Stripe Configuration
STRIPE_SECRET_KEY=your-stripe-secret-key
STRIPE_WEBHOOK_SECRET=your-stripe-webhook-secret

# Email Configuration
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-smtp-username
SMTP_PASS=your-smtp-password

# Frontend URL (for subscription success/cancel redirects)
FRONTEND_URL=http://localhost:3000
```

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd clck-backend
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

## API Documentation

### Authentication

#### Register User
```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123",
  "phoneNumber": "+1234567890"
}
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

#### Verify 2FA
```http
POST /api/auth/verify-2fa
Content-Type: application/json

{
  "email": "user@example.com",
  "code": "123456"
}
```

### Documents

#### Upload Document
```http
POST /api/documents/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data

document: <file>
```

#### Download Document
```http
GET /api/documents/download/:id
Authorization: Bearer <token>
```

#### List Documents
```http
GET /api/documents?page=1&limit=10
Authorization: Bearer <token>
```

### Videos

#### Upload Video
```http
POST /api/videos/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data

video: <file>
title: "My Video"
description: "Video description"
```

#### Get Video Status
```http
GET /api/videos/status/:id
Authorization: Bearer <token>
```

#### List Videos
```http
GET /api/videos?page=1&limit=10
Authorization: Bearer <token>
```

### Subscriptions

#### Create Subscription
```http
POST /api/subscriptions/create
Authorization: Bearer <token>
Content-Type: application/json

{
  "plan": "professional",
  "paymentMethodId": "pm_xxx"
}
```

#### Cancel Subscription
```http
POST /api/subscriptions/cancel
Authorization: Bearer <token>
```

## Cloudinary Integration

The application uses Cloudinary for document storage and management. Key features:

1. Secure file uploads with automatic file type detection
2. Organized folder structure by user ID
3. Secure signed URLs for document downloads
4. Automatic file cleanup when documents are deleted
5. Support for various file types and sizes

## Security Considerations

1. All document URLs are signed and expire after 1 hour
2. Files are stored in user-specific folders
3. Proper file type validation is implemented
4. Secure file deletion when users are removed
5. Rate limiting on upload endpoints

## Error Handling

The API uses a consistent error response format:

```json
{
  "status": "error",
  "message": "Error message"
}
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details. 