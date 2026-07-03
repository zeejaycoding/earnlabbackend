# PowerShell script to add balance to a user's wallet
# Usage: .\add-balance.ps1 -Email "testhaider110@gmail.com" -Amount 50

param(
    [Parameter(Mandatory=$true)]
    [string]$Email,
    
    [Parameter(Mandatory=$true)]
    [double]$Amount,
    
    [string]$ApiUrl = "http://localhost:5000"
)

# Validate email
if ($Email -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$') {
    Write-Host "❌ Invalid email format" -ForegroundColor Red
    exit 1
}

# Validate amount
if ($Amount -le 0) {
    Write-Host "❌ Amount must be greater than 0" -ForegroundColor Red
    exit 1
}

Write-Host "🔄 Adding balance to wallet..." -ForegroundColor Cyan
Write-Host "   Email: $Email"
Write-Host "   Amount: `$$Amount"
Write-Host "   API URL: $ApiUrl"
Write-Host ""

# Create request body
$body = @{
    email = $Email
    amountInDollars = $Amount
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod `
        -Uri "$ApiUrl/api/v1/user/admin/add-balance" `
        -Method Post `
        -ContentType "application/json" `
        -Body $body `
        -ErrorAction Stop

    if ($response.success) {
        Write-Host "✅ Balance added successfully!" -ForegroundColor Green
        Write-Host "   Old Balance: `$$($response.oldBalance)" -ForegroundColor Green
        Write-Host "   Added Amount: `$$($response.addedAmount)" -ForegroundColor Green
        Write-Host "   New Balance: `$$($response.newBalance)" -ForegroundColor Green
        Write-Host ""
        Write-Host "✨ User wallet updated!" -ForegroundColor Green
    } else {
        Write-Host "❌ Error: $($response.message)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Request failed" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "💡 Make sure:" -ForegroundColor Yellow
    Write-Host "   1. Backend server is running (npm run dev)" -ForegroundColor Yellow
    Write-Host "   2. MongoDB is connected" -ForegroundColor Yellow
    Write-Host "   3. Email address is correct" -ForegroundColor Yellow
    exit 1
}
