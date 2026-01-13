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

variable "github_token" {
  description = "GitHub personal access token for CodePipeline"
  type        = string
  sensitive   = true
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

variable "app_url" {
  description = "base application webpage"
  type        = string
  sensitive   = true
}

variable "redis_host" {
  description = "Redis host endpoint (Upstash endpoint)"
  type        = string
  sensitive   = false
}

variable "redis_port" {
  description = "Redis port (usually 6379 or 6380 for TLS)"
  type        = string
  default     = "6379"
}

variable "redis_token" {
  description = "Redis password/token (Upstash API key)"
  type        = string
  sensitive   = true
}

variable "redis_tls" {
  description = "Whether to use TLS for Redis connection"
  type        = string
  default     = "true"
}