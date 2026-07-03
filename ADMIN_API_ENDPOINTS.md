# EarnLab Admin Panel - Backend API Endpoints

## Overview
All admin panel API endpoints are implemented in the backend at:
- **File**: `src/routes/admin.ts` (2,488 lines)
- **Mount Point**: `/api/admin/*` (line 114 in `src/index.ts`)
- **Authentication**: All endpoints require JWT token via `requireAdmin` middleware

## Backend Connection Architecture

### Main Entry Point
```
src/index.ts (line 114)
├── app.use("/api/admin", adminRouter)
└── adminRouter = require("./routes/admin").default
```

### Admin Router File
```
src/routes/admin.ts
├── Authentication (Login, Setup)
├── User Management (Ban, Unban, Adjust Points, etc.)
├── Withdrawal Management
├── Offer Management
├── Promo Codes
├── Referral System
├── Support Tickets
├── Security Features
├── Notifications
├── Audit Logs
├── Admin Users Management
├── Statistics & Analytics
└── System Settings
```

---

## API Endpoints Implemented

### 1. AUTHENTICATION
**File**: `src/routes/admin.ts` (lines 60-187)

#### POST `/api/admin/login`
- **Description**: Admin login with JWT token generation
- **Request Body**:
  ```json
  {
    "email": "admin@earnlab.com",
    "password": "admin123"
  }
  ```
- **Response**:
  ```json
  {
    "token": "jwt_token_here",
    "email": "admin@earnlab.com",
    "name": "Admin Name",
    "role": "superadmin",
    "permissions": ["*"]
  }
  ```
- **Features**:
  - Account lock after failed attempts
  - Last login tracking
  - Audit logging
  - IP address logging

#### POST `/api/admin/setup`
- **Description**: Create initial superadmin account (only if no admins exist)
- **Request Body**:
  ```json
  {
    "email": "admin@earnlab.com",
    "password": "admin123",
    "name": "Admin Name"
  }
  ```

---

### 2. USER MANAGEMENT
**File**: `src/routes/admin.ts` (lines 189-800+)

#### GET `/api/admin/users`
- **Description**: Get all users with filters and pagination
- **Query Parameters**:
  - `search`: Search by username, email, UUID, or IP
  - `status`: Filter by 'banned', 'active', or 'vpn'
  - `page`: Page number (default: 1)
  - `limit`: Items per page (default: 50)
  - `sortBy`: Sort field (default: 'createdAt')
  - `sortOrder`: 'asc' or 'desc' (default: 'desc')
- **Response**:
  ```json
  {
    "users": [...],
    "pagination": {
      "total": 100,
      "page": 1,
      "limit": 50,
      "pages": 2
    }
  }
  ```

#### GET `/api/admin/users/:userId`
- **Description**: Get detailed user information with activity
- **Response Includes**:
  - User details
  - Recent offers (last 20)
  - Withdrawals (last 10)
  - Referral statistics
  - Referred users list

#### POST `/api/admin/users/:userId/ban`
- **Description**: Ban a user with optional duration
- **Request Body**:
  ```json
  {
    "reason": "Suspicious activity",
    "duration": 7
  }
  ```
- **Features**:
  - Permanent or temporary ban
  - User notification
  - Audit logging
  - IP tracking

#### POST `/api/admin/users/:userId/unban`
- **Description**: Unban a user
- **Features**:
  - User notification
  - Audit logging

#### POST `/api/admin/users/:userId/warn`
- **Description**: Issue warning to user
- **Request Body**:
  ```json
  {
    "reason": "Warning reason"
  }
  ```

#### POST `/api/admin/users/:userId/adjust-points`
- **Description**: Add or deduct user points
- **Request Body**:
  ```json
  {
    "amountCents": 1000,
    "reason": "Manual adjustment",
    "type": "add"
  }
  ```
- **Types**: "add" or "deduct"

#### POST `/api/admin/users/:userId/set-hold-time`
- **Description**: Set reward hold time for user
- **Request Body**:
  ```json
  {
    "holdTimeDays": 7
  }
  ```

#### POST `/api/admin/users/:userId/add-note`
- **Description**: Add internal admin note to user
- **Request Body**:
  ```json
  {
    "note": "Internal note about user"
  }
  ```

#### GET `/api/admin/users/:userId/activity`
- **Description**: Get user activity history
- **Response Includes**:
  - Recent offers
  - Login history
  - IP addresses
  - Device information

---

### 3. WITHDRAWAL MANAGEMENT
**File**: `src/routes/admin.ts` (lines 800+)

#### GET `/api/admin/withdrawals`
- **Description**: Get all withdrawal requests with filters
- **Query Parameters**:
  - `status`: 'Pending', 'Approved', 'Rejected', 'On Hold'
  - `page`: Page number
  - `limit`: Items per page
- **Response**: Paginated withdrawal list

#### POST `/api/admin/withdrawals/:withdrawalId/update`
- **Description**: Update withdrawal status
- **Request Body**:
  ```json
  {
    "status": "Approved",
    "reason": "Approved after verification",
    "proof": "proof_url_if_needed"
  }
  ```

#### POST `/api/admin/withdrawals/:withdrawalId/approve`
- **Description**: Approve withdrawal request
- **Features**:
  - User notification
  - Audit logging
  - Balance verification

#### POST `/api/admin/withdrawals/:withdrawalId/reject`
- **Description**: Reject withdrawal request
- **Request Body**:
  ```json
  {
    "reason": "Insufficient balance"
  }
  ```

---

### 4. OFFER MANAGEMENT
**File**: `src/routes/admin.ts` (lines 1000+)

#### GET `/api/admin/offers`
- **Description**: Get all offers with filters
- **Query Parameters**:
  - `status`: 'active' or 'inactive'
  - `category`: Offer category
  - `offerwall`: Offerwall name
  - `page`: Page number
  - `limit`: Items per page

#### POST `/api/admin/offers/:offerId/toggle`
- **Description**: Toggle offer active/inactive status

#### POST `/api/admin/offers/:offerId/set-hold-time`
- **Description**: Set hold time for offer
- **Request Body**:
  ```json
  {
    "holdTimeDays": 7
  }
  ```

#### GET `/api/admin/offers/logs`
- **Description**: Get offer completion logs
- **Query Parameters**:
  - `status`: 'pending', 'approved', 'rejected'
  - `page`: Page number
  - `limit`: Items per page

#### POST `/api/admin/offers/logs/:logId/approve`
- **Description**: Approve offer completion
- **Request Body**:
  ```json
  {
    "reason": "Verified"
  }
  ```

#### POST `/api/admin/offers/logs/:logId/reject`
- **Description**: Reject offer completion
- **Request Body**:
  ```json
  {
    "reason": "Invalid submission"
  }
  ```

#### POST `/api/admin/offers/manual-credit`
- **Description**: Manually credit offer to user
- **Request Body**:
  ```json
  {
    "userId": "user_id",
    "offerId": "offer_id",
    "amountCents": 5000,
    "reason": "Manual credit after proof"
  }
  ```

---

### 5. PROMO CODES
**File**: `src/routes/admin.ts` (lines 1200+)

#### GET `/api/admin/promo-codes`
- **Description**: Get all promo codes
- **Response**:
  ```json
  {
    "codes": [...]
  }
  ```

#### POST `/api/admin/promo-codes`
- **Description**: Create new promo code
- **Request Body**:
  ```json
  {
    "code": "SUMMER2024",
    "amountCents": 5000,
    "usageLimit": 100,
    "validFrom": "2024-06-01",
    "validUntil": "2024-08-31",
    "description": "Summer promotion"
  }
  ```

#### POST `/api/admin/promo-codes/:codeId/toggle`
- **Description**: Enable/disable promo code

#### DELETE `/api/admin/promo-codes/:codeId`
- **Description**: Delete promo code

---

### 6. REFERRAL SYSTEM
**File**: `src/routes/admin.ts` (lines 1300+)

#### GET `/api/admin/referrals/stats`
- **Description**: Get referral system statistics
- **Response Includes**:
  - Total referrals
  - Total referral earnings
  - Top referrers
  - Fraud detection results

#### GET `/api/admin/referrals/earnings`
- **Description**: Get referral earnings with pagination
- **Query Parameters**:
  - `page`: Page number
  - `limit`: Items per page

#### POST `/api/admin/referrals/:userId/set-rate`
- **Description**: Set custom referral rate for user
- **Request Body**:
  ```json
  {
    "rate": 0.10
  }
  ```

#### GET `/api/admin/referrals/fraud-detection`
- **Description**: Detect referral fraud patterns
- **Detects**:
  - Same IP referrals
  - Inactive referrers
  - Unusual patterns

---

### 7. SUPPORT TICKETS
**File**: `src/routes/admin.ts` (lines 1400+)

#### GET `/api/admin/support/tickets`
- **Description**: Get support tickets with filters
- **Query Parameters**:
  - `status`: 'open', 'in-progress', 'resolved', 'closed'
  - `priority`: 'low', 'medium', 'high', 'urgent'
  - `page`: Page number
  - `limit`: Items per page

#### GET `/api/admin/support/tickets/:ticketId`
- **Description**: Get ticket details with all replies

#### POST `/api/admin/support/tickets/:ticketId/reply`
- **Description**: Reply to support ticket
- **Request Body**:
  ```json
  {
    "message": "Reply message"
  }
  ```

#### POST `/api/admin/support/tickets/:ticketId/status`
- **Description**: Update ticket status
- **Request Body**:
  ```json
  {
    "status": "resolved"
  }
  ```

#### POST `/api/admin/support/tickets/:ticketId/assign`
- **Description**: Assign ticket to admin
- **Request Body**:
  ```json
  {
    "adminId": "admin_id"
  }
  ```

---

### 8. SECURITY & ANTI-FRAUD
**File**: `src/routes/admin.ts` (lines 1500+)

#### POST `/api/admin/security/mark-vpn`
- **Description**: Mark user as VPN user
- **Request Body**:
  ```json
  {
    "userId": "user_id",
    "isVpn": true,
    "reason": "Detected VPN usage"
  }
  ```

#### POST `/api/admin/security/mark-proxy`
- **Description**: Mark user as proxy user
- **Request Body**:
  ```json
  {
    "userId": "user_id",
    "isProxy": true,
    "reason": "Detected proxy usage"
  }
  ```

#### GET `/api/admin/security/suspicious`
- **Description**: Get suspicious activities
- **Query Parameters**:
  - `reviewed`: true/false
  - `severity`: 'low', 'medium', 'high'
  - `activityType`: Type of suspicious activity
  - `page`: Page number
  - `limit`: Items per page

#### POST `/api/admin/security/review-activity`
- **Description**: Review suspicious activity
- **Request Body**:
  ```json
  {
    "activityId": "activity_id",
    "action": "approve",
    "notes": "Activity reviewed and approved"
  }
  ```

#### GET `/api/admin/security/high-payouts`
- **Description**: Detect users with unusually high payouts

#### GET `/api/admin/security/many-offers`
- **Description**: Detect users completing many offers in short time

---

### 9. NOTIFICATIONS
**File**: `src/routes/admin.ts` (lines 1600+)

#### POST `/api/admin/notifications/send`
- **Description**: Send notification to specific users
- **Request Body**:
  ```json
  {
    "type": "warning",
    "title": "Account Warning",
    "message": "Suspicious activity detected",
    "users": ["user_id_1", "user_id_2"]
  }
  ```

#### POST `/api/admin/notifications/broadcast`
- **Description**: Broadcast notification to all users
- **Request Body**:
  ```json
  {
    "type": "info",
    "title": "System Maintenance",
    "message": "System will be down for maintenance"
  }
  ```

---

### 10. STATISTICS & ANALYTICS
**File**: `src/routes/admin.ts` (lines 1700+)

#### GET `/api/admin/stats/dashboard`
- **Description**: Get dashboard statistics
- **Response Includes**:
  - Total users
  - Active users
  - Total earnings
  - Total payouts
  - Pending withdrawals
  - New users (today/week/month)

#### GET `/api/admin/stats/charts`
- **Description**: Get chart data for analytics
- **Query Parameters**:
  - `period`: 'day', 'week', 'month'
- **Response**: Time-series data for charts

#### GET `/api/admin/stats/top-offers`
- **Description**: Get top performing offers

#### GET `/api/admin/stats/top-users`
- **Description**: Get top earning users

#### GET `/api/admin/stats/revenue`
- **Description**: Get revenue statistics
- **Response Includes**:
  - Total revenue
  - Total expenses
  - Profit margin
  - Revenue by offerwall

---

### 11. AUDIT LOGS
**File**: `src/routes/admin.ts` (lines 1800+)

#### GET `/api/admin/audit-logs`
- **Description**: Get audit logs with filters
- **Query Parameters**:
  - `adminId`: Filter by admin
  - `actionType`: Filter by action type
  - `targetType`: Filter by target type
  - `severity`: Filter by severity
  - `page`: Page number
  - `limit`: Items per page
- **Response**: Immutable audit trail

---

### 12. ADMIN USERS MANAGEMENT
**File**: `src/routes/admin.ts` (lines 1900+)

#### GET `/api/admin/admin-users`
- **Description**: Get all admin users
- **Response**:
  ```json
  {
    "admins": [...]
  }
  ```

#### POST `/api/admin/admin-users`
- **Description**: Create new admin user
- **Request Body**:
  ```json
  {
    "email": "newadmin@earnlab.com",
    "name": "New Admin",
    "password": "secure_password",
    "role": "admin",
    "permissions": ["user_management", "withdrawals"]
  }
  ```

#### POST `/api/admin/admin-users/:adminId/deactivate`
- **Description**: Deactivate admin account

---

### 13. SYSTEM SETTINGS
**File**: `src/routes/admin.ts` (lines 2000+)

#### GET `/api/admin/system/health`
- **Description**: Get system health status
- **Response Includes**:
  - Database status
  - Server uptime
  - Memory usage
  - API response time

#### GET `/api/admin/system/settings`
- **Description**: Get system settings
- **Response**:
  ```json
  {
    "settings": {
      "siteName": "EarnLab",
      "logo": "url",
      "colors": {...},
      "smtp": {...},
      "apiKeys": {...}
    }
  }
  ```

#### POST `/api/admin/system/settings`
- **Description**: Update system settings
- **Request Body**: Partial settings object

#### POST `/api/admin/system/clear-cache`
- **Description**: Clear application cache

#### POST `/api/admin/system/backup`
- **Description**: Create database backup

---

### 14. EXPORT
**File**: `src/routes/admin.ts` (lines 2100+)

#### POST `/api/admin/export`
- **Description**: Export data as CSV
- **Request Body**:
  ```json
  {
    "type": "users",
    "filters": {...}
  }
  ```
- **Export Types**: 'users', 'withdrawals', 'offers', 'audit-logs'

---

## Database Models Connected

```
src/models/
├── User.ts                 → User management
├── Withdrawal.ts           → Withdrawal management
├── Offer.ts                → Offer management
├── OfferLog.ts             → Offer completion logs
├── PromoCode.ts            → Promo codes
├── SupportTicket.ts        → Support tickets
├── AdminUser.ts            → Admin accounts
├── AuditLog.ts             → Audit trail
├── Notification.ts         → Notifications
├── ReferralEarning.ts      → Referral earnings
└── SuspiciousActivity.ts   → Fraud detection
```

---

## Authentication & Security

### JWT Token
- **Secret**: `process.env.JWT_SECRET`
- **Expiration**: 7 days
- **Payload**:
  ```json
  {
    "userId": "admin_id",
    "email": "admin@earnlab.com",
    "role": "superadmin",
    "permissions": ["*"]
  }
  ```

### Middleware
- **requireAdmin**: Validates JWT token and checks admin status
- **Location**: `src/utils/requireAdmin.ts`

### Security Features
- Account lockout after failed login attempts
- IP address logging
- User agent tracking
- Audit logging for all actions
- CORS protection
- Helmet security headers

---

## Error Handling

All endpoints return consistent error responses:
```json
{
  "error": "Error message",
  "status": 400
}
```

Common status codes:
- `200`: Success
- `400`: Bad request
- `401`: Unauthorized
- `403`: Forbidden
- `404`: Not found
- `500`: Server error

---

## Real-time Features

### Socket.IO Integration
- **Location**: `src/index.ts` (lines 188-222)
- **Features**:
  - Real-time notifications
  - Live activity updates
  - User identification via JWT

---

## Testing

Run integration tests:
```bash
node test-integration.js
```

See `TEST_GUIDE.md` for detailed testing instructions.

---

## Summary

✅ **All 50+ admin API endpoints are fully implemented**
✅ **Database models connected**
✅ **Authentication & security implemented**
✅ **Audit logging for compliance**
✅ **Real-time features via Socket.IO**
✅ **Error handling & validation**
✅ **Ready for production deployment**
