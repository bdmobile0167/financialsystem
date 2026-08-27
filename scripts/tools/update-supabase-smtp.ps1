param(
  [string]$ProjectRef = $env:SUPABASE_PROJECT_REF,
  [string]$AccessToken = $env:SUPABASE_ACCESS_TOKEN,
  [string]$SmtpHost = $env:SUPABASE_SMTP_HOST,
  [int]$SmtpPort = [int]($env:SUPABASE_SMTP_PORT),
  [string]$SmtpUser = $env:SUPABASE_SMTP_USER,
  [string]$SmtpPass = $env:SUPABASE_SMTP_PASS,
  [string]$AdminEmail = $env:SUPABASE_SMTP_ADMIN_EMAIL,
  [string]$SenderName = $env:SUPABASE_SMTP_SENDER_NAME
)

$ErrorActionPreference = 'Stop'

if (-not $ProjectRef) {
  $ProjectRef = 'imlmclalgbfxhhnpsyam'
}

function Require-Value {
  param([string]$Name, [string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) {
    throw "Missing $Name. Set it as an environment variable or pass it as a parameter."
  }
}

Require-Value 'SUPABASE_ACCESS_TOKEN' $AccessToken
Require-Value 'SUPABASE_SMTP_HOST' $SmtpHost
Require-Value 'SUPABASE_SMTP_USER' $SmtpUser
Require-Value 'SUPABASE_SMTP_PASS' $SmtpPass
Require-Value 'SUPABASE_SMTP_ADMIN_EMAIL' $AdminEmail

if ($SmtpHost -match '^https?://' -or $SmtpHost -match '[/:]') {
  throw "SUPABASE_SMTP_HOST must be only a hostname, for example smtp.sendgrid.net. Do not include https://, paths, or :$SmtpPort."
}

if ($SmtpPort -ne 465 -and $SmtpPort -ne 587) {
  throw 'SUPABASE_SMTP_PORT should normally be 465 or 587.'
}

if ($AdminEmail -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') {
  throw 'SUPABASE_SMTP_ADMIN_EMAIL must be an email address, not a URL.'
}

$body = @{
  external_email_enabled = $true
  mailer_autoconfirm = $false
  smtp_admin_email = $AdminEmail
  smtp_host = $SmtpHost
  smtp_port = $SmtpPort
  smtp_user = $SmtpUser
  smtp_pass = $SmtpPass
  smtp_sender_name = $(if ($SenderName) { $SenderName } else { 'Financial System' })
} | ConvertTo-Json

$uri = "https://api.supabase.com/v1/projects/$ProjectRef/config/auth"

Write-Host "Updating Supabase Auth SMTP for project $ProjectRef..."
Invoke-RestMethod `
  -Method Patch `
  -Uri $uri `
  -Headers @{ Authorization = "Bearer $AccessToken"; 'Content-Type' = 'application/json' } `
  -Body $body

Write-Host 'Supabase Auth SMTP update request completed. Send a test invite from the app next.'
