# variables.tf
# Input parameters for the companies microservice infrastructure

variable "service_name" {
  description = "Name of the microservice"
  type        = string
  default     = "towerofbabble"
}

variable "github_repo" {
  description = "GitHub repository name"
  type        = string
  default     = "tob-back"
}

variable "github_owner" {
  description = "GitHub account/org that owns the repo"
  type        = string
  default     = "jduffey1990"
}

variable "api_domain_name" {
  description = "Stable client-facing hostname for the API (DNS hosted at Cloudflare)"
  type        = string
  default     = "api.tobprayer.app"
}

variable "github_branch" {
  description = "GitHub branch to deploy from"
  type        = string
  default     = "main"
}

variable "project" {
  description = "Project name for tagging"
  type        = string
  default     = "towerofbabble"
}

variable "owner" {
  description = "Owner tag for resources"
  type        = string
  default     = "jduffey"
}

variable "environment" {
  description = "Environment (dev, staging, prod)"
  type        = string
  default     = "production"
  
  validation {
    condition     = contains(["dev", "staging", "production"], var.environment)
    error_message = "Environment must be dev, staging, or production."
  }
}

variable "aws_region" {
  description = "AWS region to deploy to"
  type        = string
  default     = "us-east-2"
}

variable "aws_account_id" {
  description = "AWS account ID"
  type        = string
  sensitive   = true
}

variable "lambda_runtime" {
  description = "Lambda function runtime"
  type        = string
  default     = "nodejs22.x"
}

variable "lambda_memory" {
  description = "Lambda memory in MB"
  type        = number
  default     = 512
}

variable "tts_worker_timeout" {
  description = "TTS worker Lambda timeout (seconds). The Redis build lock TTL and the SQS visibility timeout are both derived from this -- see api note in audioService.generateAndStore."
  type        = number
  default     = 120
}

variable "lambda_timeout" {
  description = "Lambda timeout in seconds"
  type        = number
  default     = 30
}

variable "node_env" {
  description = "Describing environment in some places conditionally in code"
  type        = string
  default     = "production"
}

variable "database_url" {
  description = "PostgreSQL connection string"
  type        = string
  sensitive   = true
}

variable "jwt_secret" {
  description = "JWT secret for authentication"
  type        = string
  sensitive   = true
}

variable "openai_api_key" {
  description = "API key for open AI chat completion"
  type        = string
  sensitive   = true
}

variable "speechify_api_key" {
  description = "API key for open AI chat completion"
  type        = string
  sensitive   = true
}

variable "azure_tts_api_key" {
  description = "API key for open AI chat completion"
  type        = string
  sensitive   = true
}

variable "azure_tts_region" {
  description = "API key for open AI chat completion"
  type        = string
  sensitive   = true
}

variable "fish_api_key" {
  description = "API key for fish audio"
  type        = string
  sensitive   = true
}

# variable "cartesia_api_key" {          # commented out — may revisit
#   description = "API key for Cartesia"
#   type        = string
#   sensitive   = true
# }

variable "app_url" {
  description = "base application webpage"
  type        = string
  sensitive   = true
}

variable "redis_url" {
  description = "Full Redis URL (Upstash endpoint with protocol)"
  type        = string
  sensitive   = true
}

variable "redis_token" {
  description = "Full Redis URL (Upstash endpoint with protocol)"
  type        = string
  sensitive   = true
}

variable "cleanup_api_key" {
  description = "Event Bridge connection secret key"
  type        = string
  sensitive   = true
}

variable "from_email" {
  description = "From email address for sending emails"
  type        = string
  default     = "noreply@tobprayer.app"
}

variable "s3_audio_bucket" {
  description = "S3 bucket name for audio files"
  type        = string
  default     = "tob-audio-files"
}

variable "admin_stats_email" {
  description = "Email address to receive daily stats digest"
  type        = string
  sensitive   = true
}

# ============================================
# APNs - Apple Push Notifications (flock prayer pushes)
# ============================================

variable "apns_auth_key" {
  description = "PEM contents of the APNs .p8 auth key (including BEGIN/END lines)"
  type        = string
  sensitive   = true
}

variable "apns_key_id" {
  description = "10-character APNs key ID (from the .p8 filename)"
  type        = string
  sensitive   = true
}

variable "apns_team_id" {
  description = "10-character Apple Developer Team ID"
  type        = string
  sensitive   = true
}

variable "apns_bundle_id" {
  description = "iOS app bundle identifier (e.g. com.foxdog.TowerOfBabble)"
  type        = string
}

variable "apns_environment" {
  description = "APNs environment: sandbox, production, or disabled (kill switch)"
  type        = string
  default     = "production"

  validation {
    condition     = contains(["sandbox", "production", "disabled"], var.apns_environment)
    error_message = "apns_environment must be sandbox, production, or disabled."
  }
}