# PowerShell script to test Shiprocket serviceability for your postcode
# Usage: .\scripts\test-serviceability.ps1 -Pincode "400070" -FromPincode "400001"

param(
    [Parameter(Mandatory=$true)]
    [string]$Pincode,
    
    [Parameter(Mandatory=$false)]
    [string]$FromPincode = "400001",  # Default pickup pincode (Mumbai)
    
    [Parameter(Mandatory=$false)]
    [double]$Weight = 1.0,  # Default weight in kg
    
    [Parameter(Mandatory=$false)]
    [double]$CodAmount = 0  # Default COD amount
)

$baseUrl = "http://127.0.0.1:3001/api/test/shipway"
$headers = @{
    "Content-Type" = "application/json"
}

# Shiprocket credentials
$email = "agrawalpuran@gmail.com"
$password = "!d%wun0jY75pPeapvAJ9kZo#ylHYgIOr"

Write-Host "=================================================================================" -ForegroundColor Cyan
Write-Host "Testing Shiprocket Serviceability" -ForegroundColor Cyan
Write-Host "=================================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📍 Delivery Pincode: $Pincode" -ForegroundColor Yellow
Write-Host "📍 Pickup Pincode: $FromPincode" -ForegroundColor Yellow
Write-Host "📦 Weight: $Weight kg" -ForegroundColor Yellow
Write-Host "💰 COD Amount: ₹$CodAmount" -ForegroundColor Yellow
Write-Host ""

try {
    $body = @{
        testType = "serviceability"
        pincode = $Pincode
        fromPincode = $FromPincode
        weight = $Weight
        codAmount = $CodAmount
        email = $email
        password = $password
    } | ConvertTo-Json

    Write-Host "🔄 Checking serviceability..." -ForegroundColor Cyan
    $response = Invoke-RestMethod -Uri "$baseUrl?providerCode=SHIPROCKET" -Method POST -Headers $headers -Body $body
    
    Write-Host ""
    Write-Host "✅ Serviceability Result:" -ForegroundColor Green
    Write-Host "   Serviceable: $($response.tests.serviceability.result.serviceable)" -ForegroundColor $(if ($response.tests.serviceability.result.serviceable) { "Green" } else { "Red" })
    
    if ($response.tests.serviceability.result.estimatedDays) {
        Write-Host "   Estimated Delivery Days: $($response.tests.serviceability.result.estimatedDays)" -ForegroundColor Cyan
    }
    
    if ($response.tests.serviceability.result.message) {
        Write-Host "   Message: $($response.tests.serviceability.result.message)" -ForegroundColor Cyan
    }
    
    # Show available couriers if serviceable
    if ($response.tests.serviceability.result.serviceable -and $response.tests.serviceability.result.rawResponse.data.available_courier_companies) {
        $couriers = $response.tests.serviceability.result.rawResponse.data.available_courier_companies
        Write-Host ""
        Write-Host "📦 Available Couriers ($($couriers.Count)):" -ForegroundColor Yellow
        Write-Host ""
        
        # Show top 10 couriers with key details
        $topCouriers = $couriers | Select-Object -First 10
        foreach ($courier in $topCouriers) {
            $courierName = $courier.courier_name
            $rate = $courier.rate
            $deliveryDays = $courier.estimated_delivery_days
            $mode = if ($courier.is_surface) { "Surface" } else { "Air" }
            
            Write-Host "   • $courierName" -ForegroundColor White
            Write-Host "     Rate: ₹$rate | Delivery: $deliveryDays days | Mode: $mode" -ForegroundColor Gray
        }
        
        if ($couriers.Count -gt 10) {
            Write-Host ""
            Write-Host "   ... and $($couriers.Count - 10) more couriers available" -ForegroundColor Gray
        }
    }
    
    Write-Host ""
    Write-Host "=================================================================================" -ForegroundColor Cyan
    Write-Host "Test Complete" -ForegroundColor Cyan
    Write-Host "=================================================================================" -ForegroundColor Cyan
    
} catch {
    Write-Host ""
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
    Write-Host ""
}

