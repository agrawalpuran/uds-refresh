# PowerShell script to test Mock Provider API
# Usage: .\scripts\test-mock-api.ps1

$baseUrl = "http://127.0.0.1:3001/api/test/shipway"
$headers = @{
    "Content-Type" = "application/json"
}

Write-Host "=================================================================================" -ForegroundColor Cyan
Write-Host "Testing Mock Provider API" -ForegroundColor Cyan
Write-Host "=================================================================================" -ForegroundColor Cyan
Write-Host ""

# Test 1: Health Check
Write-Host "Test 1: Health Check" -ForegroundColor Yellow
try {
    $body = @{
        testType = "health"
    } | ConvertTo-Json

    $response = Invoke-RestMethod -Uri "$baseUrl?providerCode=MOCK" -Method POST -Headers $headers -Body $body
    Write-Host "✅ Health Check Response:" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 10
    Write-Host ""
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
}

# Test 2: Serviceability Check
Write-Host "Test 2: Serviceability Check (Pincode: 400070)" -ForegroundColor Yellow
try {
    $body = @{
        testType = "serviceability"
        pincode = "400070"
    } | ConvertTo-Json

    $response = Invoke-RestMethod -Uri "$baseUrl?providerCode=MOCK" -Method POST -Headers $headers -Body $body
    Write-Host "✅ Serviceability Response:" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 10
    Write-Host ""
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
}

# Test 3: Shipment Creation
Write-Host "Test 3: Shipment Creation" -ForegroundColor Yellow
try {
    $body = @{
        testType = "create"
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
            }
            toAddress = @{
                name = "Test Employee"
                address = "456 Employee Lane"
                city = "Mumbai"
                state = "Maharashtra"
                pincode = "400070"
                phone = "9876543211"
            }
            items = @(
                @{
                    productName = "Formal Shirt"
                    quantity = 2
                }
            )
            shipmentValue = 5000
            paymentMode = "PREPAID"
        }
    } | ConvertTo-Json -Depth 10

    $response = Invoke-RestMethod -Uri "$baseUrl?providerCode=MOCK" -Method POST -Headers $headers -Body $body
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
    $response = Invoke-RestMethod -Uri "$baseUrl?providerCode=MOCK" -Method GET
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

