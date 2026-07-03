# Admin Panel Backend Integration

## Files Created/Modified

### New Files
- `src/routes/admin.ts` - All 9 admin API endpoints
- `src/utils/requireAdmin.ts` - Admin authentication middleware

### Modified Files
- `src/index.ts` - Added admin routes mounting
- `src/models/User.ts` - Added ban fields (isBanned, banReason, bannedAt)

## Environment Variables Required

Add to your `.env` file:

```env
# Admin Panel
ADMIN_EMAIL=admin@earnlab.com
ADMIN_PASSWORD=admin123
JWT_SECRET=your-super-secret-jwt-key-change-in-production
ADMIN_EMAILS=admin@earnlab.com
```

## API Endpoints

Base URL: `http://localhost:5000/api/admin`

### Authentication
- `POST /login` - Admin login

### User Management
- `GET /users` - List all users
- `POST /user/ban` - Ban user
- `POST /user/unban` - Unban user
- `POST /user/refund` - Process refund

### Bonus Codes
- `POST /bonus-codes` - Create bonus code
- `GET /bonus-codes/list` - List bonus codes

### Withdrawals
- `GET /withdrawals` - List all withdrawals
- `POST /withdrawals/update` - Update withdrawal status

### Notifications
- `POST /notifications/send` - Send notification

## Database Models

### BonusCode (New Model)
```typescript
{
  code: string (unique, indexed)
  amountCents: number
  usageLimit: number
  usedCount: number
  isActive: boolean
  usedBy: ObjectId[]
  createdAt: Date
  expiresAt?: Date
}
```

### User (Updated)
Added fields:
```typescript
{
  isBanned: boolean (default: false)
  banReason: string | null
  bannedAt: Date | null
}
```

## Testing

### Test Admin Login
```bash
curl -X POST http://localhost:5000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@earnlab.com","password":"admin123"}'
```

### Test Get Users (replace TOKEN)
```bash
curl http://localhost:5000/api/admin/users \
  -H "Authorization: Bearer TOKEN"
```

## Security Notes

1. Change default admin credentials in production
2. Use strong JWT_SECRET (32+ characters)
3. Implement rate limiting for admin endpoints
4. Add audit logging for admin actions
5. Consider IP whitelisting for admin access
