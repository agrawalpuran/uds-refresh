# WhatsApp Integration Test Script
# Tests the complete WhatsApp ordering flow

param(
    [string]$Phone = "+919876543210",
    [string]$BaseUrl = "http://localhost:3001/api/whatsapp/webhook"
)

Write-Host "`n🧪 WhatsApp Integration Test Script" -ForegroundColor Cyan
Write-Host "====================================`n" -ForegroundColor Cyan

Write-Host "Phone Number: $Phone" -ForegroundColor Yellow
Write-Host "Webhook URL: $BaseUrl`n" -ForegroundColor Yellow

function SendMessage {
    param(
        [string]$Message,
        [string]$MessageId,
        [string]$Description
    )
    
    Write-Host "[$MessageId] $Description..." -ForegroundColor Green
    
    $body = @{
        from = $Phone
        message = $Message
        messageId = $MessageId
    } | ConvertTo-Json
    
    try {
        $response = Invoke-RestMethod -Uri $BaseUrl -Method POST -Body $body -ContentType "application/json"
        
        Write-Host "✅ Response:" -ForegroundColor Cyan
        Write-Host $response.message -ForegroundColor White
        Write-Host ""
        
        return $response
    } catch {
        Write-Host "❌ Error: $_" -ForegroundColor Red
        Write-Host ""
        return $null
    }
}

# Test Flow
Write-Host "Starting test flow...`n" -ForegroundColor Yellow

# 1. Authenticate
$response1 = SendMessage -Message "Hello" -MessageId "test_001" -Description "Authentication"

# Wait a moment
Start-Sleep -Seconds 1

# 2. Main Menu
$response2 = SendMessage -Message "MENU" -MessageId "test_002" -Description "Main Menu"

# Wait a moment
Start-Sleep -Seconds 1

# 3. Start Order (Option 1)
$response3 = SendMessage -Message "1" -MessageId "test_003" -Description "Start Order Flow"

# Wait a moment
Start-Sleep -Seconds 1

# 4. View Past Orders (Option 2)
$response4 = SendMessage -Message "MENU" -MessageId "test_004" -Description "Return to Menu"
Start-Sleep -Seconds 1
$response5 = SendMessage -Message "2" -MessageId "test_005" -Description "View Past Orders"

# Wait a moment
Start-Sleep -Seconds 1

# 5. Check Status (Option 3)
$response6 = SendMessage -Message "MENU" -MessageId "test_006" -Description "Return to Menu"
Start-Sleep -Seconds 1
$response7 = SendMessage -Message "3" -MessageId "test_007" -Description "Check Order Status"

# Wait a moment
Start-Sleep -Seconds 1

# 6. Help (Option 4)
$response8 = SendMessage -Message "MENU" -MessageId "test_008" -Description "Return to Menu"
Start-Sleep -Seconds 1
$response9 = SendMessage -Message "4" -MessageId "test_009" -Description "Show Help"

# Wait a moment
Start-Sleep -Seconds 1

# 7. Global Commands
$response10 = SendMessage -Message "STATUS" -MessageId "test_010" -Description "Global STATUS Command"

Write-Host "`n✅ Test Flow Complete!" -ForegroundColor Green
Write-Host "`nTo test order placement, manually send:" -ForegroundColor Yellow
Write-Host "  1. 'MENU' to return to menu" -ForegroundColor White
Write-Host "  2. '1' to start order" -ForegroundColor White
Write-Host "  3. Product number (e.g., '1')" -ForegroundColor White
Write-Host "  4. Size (e.g., 'M')" -ForegroundColor White
Write-Host "  5. Quantity (e.g., '2')" -ForegroundColor White
Write-Host "  6. Delivery option ('1' for office, '2' for home)" -ForegroundColor White
Write-Host "  7. 'CONFIRM' to place order" -ForegroundColor White

