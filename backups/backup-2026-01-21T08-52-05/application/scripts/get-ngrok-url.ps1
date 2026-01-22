# Get Ngrok Public URL
# This script retrieves the current ngrok public URL from the ngrok API

Write-Host "`n🔍 Retrieving ngrok public URL..." -ForegroundColor Cyan

try {
    $response = Invoke-RestMethod -Uri "http://localhost:4040/api/tunnels" -Method GET -ErrorAction Stop
    
    if ($response.tunnels -and $response.tunnels.Count -gt 0) {
        $tunnel = $response.tunnels[0]
        $publicUrl = $tunnel.public_url
        
        Write-Host "`n✅ Ngrok is running!" -ForegroundColor Green
        Write-Host "`n📱 Public URL: $publicUrl" -ForegroundColor Cyan
        Write-Host "`n🔗 Webhook URL: $publicUrl/api/whatsapp/webhook" -ForegroundColor Yellow
        
        Write-Host "`n📋 Use this URL in your WhatsApp provider configuration:" -ForegroundColor White
        Write-Host "   $publicUrl/api/whatsapp/webhook" -ForegroundColor Cyan
        
        # Copy to clipboard if possible
        try {
            $publicUrl | Set-Clipboard
            Write-Host "`n✅ URL copied to clipboard!" -ForegroundColor Green
        } catch {
            # Clipboard not available, that's okay
        }
        
    } else {
        Write-Host "❌ No active ngrok tunnels found" -ForegroundColor Red
        Write-Host "`nMake sure ngrok is running. Start it with:" -ForegroundColor Yellow
        Write-Host "   npm run ngrok" -ForegroundColor White
        Write-Host "   or" -ForegroundColor White
        Write-Host "   powershell -ExecutionPolicy Bypass -File scripts/setup-ngrok.ps1" -ForegroundColor White
    }
} catch {
    Write-Host "❌ Could not connect to ngrok API" -ForegroundColor Red
    Write-Host "   Error: $_" -ForegroundColor Red
    Write-Host "`nMake sure ngrok is running on port 4040" -ForegroundColor Yellow
    Write-Host "   Start it with: npm run ngrok" -ForegroundColor White
}

