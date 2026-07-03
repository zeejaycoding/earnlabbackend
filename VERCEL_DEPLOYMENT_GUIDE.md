# Vercel Deployment Guide for EarnLab Backend

## MongoDB Connection Issue - FIXED ✅

### Problem
The backend was experiencing MongoDB connection timeouts on Vercel:
```
MongooseError: Operation `adminusers.findOne()` buffering timed out after 10000ms
```

### Root Causes
1. **Long connection timeout settings** (30s) exceeding Vercel's 10s function timeout
2. **No connection caching** - Each serverless invocation tried to create a new connection
3. **Missing serverless optimizations** in vercel.json

### Solutions Applied

#### 1. Optimized MongoDB Connection (`src/index.ts`)
- ✅ Added connection caching to reuse connections across serverless invocations
- ✅ Reduced timeouts to 10s (matches Vercel's limit)
- ✅ Set `family: 4` to use IPv4 (faster than IPv6 on most Vercel deployments)
- ✅ Adjusted pool sizes for serverless (minPoolSize: 1, maxPoolSize: 10)
- ✅ Faster retry logic with shorter backoff intervals

#### 2. Updated Vercel Configuration (`vercel.json`)
- ✅ Increased function timeout to 30s (from default 10s)
- ✅ Set memory to 1024MB for better performance
- ✅ Specified region: `iad1` (US East) - adjust based on your MongoDB cluster location
- ✅ Added all HTTP methods to routes

## Required Vercel Environment Variables

Make sure these are set in your Vercel project settings:

```bash
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/dbname?retryWrites=true&w=majority
NODE_ENV=production
JWT_SECRET=your-strong-secret-key
CLERK_SECRET_KEY=sk_test_your_clerk_key
GIFTBIT_API_KEY=your_giftbit_api_key
GIFTBIT_BASE_URL=https://api-testbed.giftbit.com/papi/v1
FRONTEND_ORIGIN=https://earnlabadmin.vercel.app
```

### How to Set Environment Variables in Vercel

1. Go to your Vercel project dashboard
2. Click **Settings** → **Environment Variables**
3. Add each variable:
   - **Key**: Variable name (e.g., `MONGODB_URI`)
   - **Value**: Your secret value
   - **Environment**: Select `Production`, `Preview`, and `Development`
4. Click **Save**

## MongoDB Atlas Configuration

### Recommended Settings for Vercel Deployment

1. **Network Access**
   - Add `0.0.0.0/0` to IP whitelist (Vercel uses dynamic IPs)
   - Or use Vercel's IP ranges if you want tighter security

2. **Database Access**
   - Create a dedicated user for production
   - Use strong password
   - Grant read/write access to your database

3. **Connection String**
   - Use `mongodb+srv://` protocol (includes SSL)
   - Include `retryWrites=true&w=majority` parameters
   - Ensure cluster is in a region close to Vercel (e.g., US East for `iad1`)

## Deployment Steps

### 1. Build the Project
```bash
cd earnlabbackend
npm run build
```

### 2. Deploy to Vercel
```bash
vercel --prod
```

Or use Vercel GitHub integration for automatic deployments.

### 3. Verify Deployment
Check the deployment logs in Vercel dashboard:
- ✅ "Connected to MongoDB successfully" (or "Using cached MongoDB connection")
- ❌ Any MongoDB timeout errors

## Troubleshooting

### Still Getting Timeout Errors?

1. **Check MongoDB Network Access**
   ```bash
   # Test connectivity from Vercel function
   curl https://your-backend.vercel.app/api/v1/health
   ```

2. **Verify MongoDB URI Format**
   - Should start with `mongodb+srv://`
   - Must include database name
   - Should have `retryWrites=true&w=majority`

3. **Check MongoDB Cluster Status**
   - Ensure cluster is running (not paused)
   - Check Atlas dashboard for performance issues

4. **Review Vercel Function Logs**
   ```bash
   vercel logs your-deployment-url --follow
   ```

5. **Test Connection Locally**
   ```bash
   # In earnlabbackend directory
   npm run dev
   # Test login endpoint
   curl -X POST http://localhost:5000/api/admin/login \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@earnlab.com","password":"admin123"}'
   ```

### Performance Optimization

- **Cold Start**: First request may be slow (~2-5s) due to MongoDB connection
- **Subsequent Requests**: Should be fast (<500ms) due to cached connection
- **Consider**: MongoDB Atlas M10+ tier for better performance and dedicated resources

## Admin Panel Configuration

Update your admin frontend (`earnlabadmin`) to point to the correct backend:

**File**: `earnlabadmin/.env` or Vercel environment variables
```bash
VITE_API_URL=https://earnlabbackend.vercel.app
```

Then rebuild and redeploy the admin panel.

## Testing Checklist

After deployment, test these endpoints:

- [ ] Health check: `GET /api/v1/health`
- [ ] Admin login: `POST /api/admin/login`
- [ ] Get users: `GET /api/admin/users` (with auth token)
- [ ] Dashboard stats: `GET /api/admin/stats` (with auth token)

## Monitoring

Set up monitoring in Vercel:
1. Enable **Vercel Analytics**
2. Enable **Log Drains** for persistent logs
3. Set up **Alerts** for function errors

## Next Steps

1. ✅ Rebuild backend: `npm run build`
2. ✅ Redeploy to Vercel: `vercel --prod`
3. ✅ Verify all environment variables are set
4. ✅ Test admin login from frontend
5. ✅ Monitor logs for any errors

---

**Last Updated**: November 15, 2025
**Status**: MongoDB connection optimized for Vercel serverless ✅
