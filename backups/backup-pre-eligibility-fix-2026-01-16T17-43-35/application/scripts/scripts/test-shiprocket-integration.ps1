# PowerShell script to test Shiprocket Provider API
# Usage: .\scripts\test-shiprocket-integration.ps1

$baseUrl = "http://127.0.0.1:3001/api/test/shipway"
$headers = @{
    "Content-Type" = "application/json"
}

# Shiprocket credentials
$email = "agrawalpuran@gmail.com"
$password = "!d%wun0jY75pPeapvAJ9kZo#ylHYgIOr"

Write-Host "=================================================================================" -ForegroundColor Cyan
Write-Host "Testing Shiprocket Provider API" -ForegroundColor Cyan
Write-Host "=================================================================================" -ForegroundColor Cyan
Write-Host ""

# Test 1: Health Check
Write-Host "Test 1: Health Check (Authentication)" -ForegroundColor Yellow
try {
    $body = @{
        testType = "health"
        email = $email
        password = $password
    } | ConvertTo-Json

    $response = Invoke-RestMethod -Uri "$baseUrl?providerCode=SHIPROCKET" -Method POST -Headers $headers -Body $body
    Write-Host "✅ Health Check Response:" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 10
    Write-Host ""
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
    Write-Host ""
}

# Test 2: Serviceability Check
Write-Host "Test 2: Serviceability Check (Pincode: 400070)" -ForegroundColor Yellow
try {
    $body = @{
        testType = "serviceability"
        pincode = "400070"
        email = $email
        password = $password
    } | ConvertTo-Json

    $response = Invoke-RestMethod -Uri "$baseUrl?providerCode=SHIPROCKET" -Method POST -Headers $headers -Body $body
    Write-Host "✅ Serviceability Response:" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 10
    Write-Host ""
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
    Write-Host ""
}

# Test 3: Shipment Creation
Write-Host "Test 3: Shipment Creation" -ForegroundColor Yellow
try {
    $body = @{
        testType = "create"
        email = $email
        password = $password
        payload = @{
            prNumber = "PR-TEST-001"
            vendorId = "100001"
            companyId = "100001"
            fromAddress = @{
                name = "Test Vendor"
                address = "123 Vendor Street"
                city = "Mumbai"
                state = "Maharashtra"
                pincode = "400001"
                phone = "9876543210"
                email = "vendor@test.com"
            }
            toAddress = @{
                name = "Test Employee"
                address = "456 Employee Lane"
                city = "Mumbai"
                state = "Maharashtra"
                pincode = "400070"
                phone = "9876543211"
                email = "employee@test.com"
            }
            items = @(
                @{
                    productName = "Formal Shirt"
                    quantity = 2
                    weight = 0.5
                }
            )
            shipmentValue = 5000
            paymentMode = "PREPAID"
        }
    } | ConvertTo-Json -Depth 10

    $response = Invoke-RestMethod -Uri "$baseUrl?providerCode=SHIPROCKET" -Method POST -Headers $headers -Body $body
    Write-Host "✅ Shipment Creation Response:" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 10
    Write-Host ""
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
    Write-Host ""
}

# Test 4: Get Configuration
Write-Host "Test 4: Get Provider Configuration" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl?providerCode=SHIPROCKET" -Method GET
    Write-Host "✅ Configuration Response:" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 10
    Write-Host ""
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
}

Write-Host "=================================================================================" -ForegroundColor Cyan
Write-Host "Testing Complete" -ForegroundColor Cyan
Write-Host "=================================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📝 Note: Shiprocket token is valid for 240 hours (10 days)" -ForegroundColor Yellow
Write-Host "   Token will be automatically refreshed when expired" -ForegroundColor Yellow
Write-Host ""

