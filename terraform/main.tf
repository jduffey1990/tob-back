# main.tf
# Main infrastructure resources for companies microservice

# Configure AWS provider

# Local variables for computed values
locals {
  common_tags = {
    Project     = var.project
    Owner       = var.owner
    Environment = var.environment
    Service     = var.service_name
    Type        = "managed-resource"
  }
  
  # Resource naming following your convention
  lambda_name      = "${var.service_name}"
  codebuild_name   = "${var.service_name}"
  pipeline_name    = "${var.service_name}-pipe"
  api_name         = "${var.service_name}-api"
}

# ============================================
# LAMBDA FUNCTION
# ============================================

resource "aws_lambda_function" "main" {
  function_name = local.lambda_name
  runtime       = var.lambda_runtime
  handler       = "dist/app.handler"
  role          = aws_iam_role.lambda_execution.arn
  
  # Placeholder code - actual code deployed via CodePipeline
  filename         = "${path.module}/placeholder.zip"
  source_code_hash = filebase64sha256("${path.module}/placeholder.zip")
  
  memory_size = var.lambda_memory
  timeout     = var.lambda_timeout

  # Blast-radius cap. Unbounded, a burst against the unauthenticated routes
  # scales Lambda out until the account limit, and the bill follows. 50 is far
  # above real traffic; raise it before a launch push rather than after.
  # Note this RESERVES capacity from the account pool -- requests past it get
  # 429 rather than queueing. The TTS worker keeps its own separate cap.
  reserved_concurrent_executions = 50

  environment {
    variables = {
      # Service identification
      SERVICE_NAME = var.service_name
      ENVIRONMENT  = var.environment
      PROJECT      = var.project
      NODE_ENV     = var.node_env
      
      # Database
      DATABASE_URL = var.database_url
      
      # Authentication
      JWT_SECRET   = var.jwt_secret
      
      # AI Services
      OPENAI_API_KEY    = var.openai_api_key
      SPEECHIFY_API_KEY = var.speechify_api_key
      AZURE_TTS_API_KEY = var.azure_tts_api_key
      AZURE_TTS_REGION  = var.azure_tts_region
      FISH_API_KEY      = var.fish_api_key
      # CARTESIA_API_KEY  = var.cartesia_api_key  # commented out — may revisit
      
      # Email & App URLs
      APP_URL      = var.app_url
      FROM_EMAIL   = var.from_email
      
      # Storage
      S3_AUDIO_BUCKET = var.s3_audio_bucket
      
      # Redis 
      REDIS_URL   = var.redis_url
      REDIS_TOKEN = var.redis_token

      #SQS
      TTS_QUEUE_URL = aws_sqs_queue.tts_generation.url
      # Read-only, for the daily digest: DLQ depth is the "we exhausted every
      # retry and gave up" signal. tts_generations records that an attempt
      # failed, but a failure followed by a successful retry looks identical in
      # aggregate -- only the DLQ distinguishes permanent loss.
      TTS_DLQ_URL   = aws_sqs_queue.tts_dead_letter.url

      # Data Cleanup Security
      CLEANUP_API_KEY = var.cleanup_api_key

      # Admin Stats
      ADMIN_STATS_EMAIL = var.admin_stats_email

      # APNs push notifications (flock prayer pings)
      APNS_AUTH_KEY    = var.apns_auth_key
      APNS_KEY_ID      = var.apns_key_id
      APNS_TEAM_ID     = var.apns_team_id
      APNS_BUNDLE_ID   = var.apns_bundle_id
      APNS_ENVIRONMENT = var.apns_environment
    }
  }
  
  tags = merge(local.common_tags, {
    Type = "lambda"
  })
}
# ============================================
# SQS - TTS GENERATION QUEUE
# ============================================

resource "aws_sqs_queue" "tts_dead_letter" {
  name                      = "${var.service_name}-tts-dlq"
  message_retention_seconds = 1209600  # 14 days

  tags = merge(local.common_tags, {
    Type = "sqs-dlq"
  })
}

resource "aws_sqs_queue" "tts_generation" {
  name                       = "${var.service_name}-tts-generation"
  # Must exceed the lock TTL (timeout + 30) so a retry never lands while a stale
  # lock is still held -- that burns an attempt on a spurious ConflictError.
  # Ordering: worker timeout <= lock TTL < visibility timeout.
  visibility_timeout_seconds = var.tts_worker_timeout + 60
  message_retention_seconds  = 3600 # 1 hour - stale generations are useless

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.tts_dead_letter.arn
    maxReceiveCount     = 3  # 3 attempts then DLQ
  })

  tags = merge(local.common_tags, {
    Type = "sqs-queue"
  })
}

# Worker Lambda - same code, different config
resource "aws_lambda_function" "tts_worker" {
  function_name = "${var.service_name}-tts-worker"
  runtime       = var.lambda_runtime
  handler       = "dist/app.handler"
  role          = aws_iam_role.lambda_execution.arn
  reserved_concurrent_executions = 20


  filename         = "${path.module}/placeholder.zip"
  source_code_hash = filebase64sha256("${path.module}/placeholder.zip")

  memory_size = 512
  timeout     = var.tts_worker_timeout

  environment {
    # Lock TTL sits just past the worker's own ceiling: a lock older than that
    # can only be debris from a hard-killed invocation. Derived, not hardcoded,
    # so raising the timeout can never strand it again.
    variables = merge(aws_lambda_function.main.environment[0].variables, {
      TTS_LOCK_TTL_SECONDS = tostring(var.tts_worker_timeout + 30)
    })
  }

  tags = merge(local.common_tags, {
    Type = "lambda-worker"
  })
}

# SQS triggers the worker
resource "aws_lambda_event_source_mapping" "tts_trigger" {
  event_source_arn                   = aws_sqs_queue.tts_generation.arn
  function_name                      = aws_lambda_function.tts_worker.arn
  batch_size                         = 1
  function_response_types            = ["ReportBatchItemFailures"]
}

# API Lambda needs permission to send to SQS
resource "aws_iam_policy" "lambda_sqs_send" {
  name = "${var.service_name}-sqs-send"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["sqs:SendMessage"]
      Resource = aws_sqs_queue.tts_generation.arn
    }]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_sqs_attach" {
  role       = aws_iam_role.lambda_execution.name
  policy_arn = aws_iam_policy.lambda_sqs_send.arn
}

resource "aws_iam_policy" "lambda_sqs_receive" {
  name = "${var.service_name}-sqs-receive"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes"
      ]
      # DLQ included so the digest can read its depth. The worker never receives
      # from the DLQ -- nothing redrives automatically -- but GetQueueAttributes
      # is scoped per-queue, so it has to be named explicitly.
      Resource = [
        aws_sqs_queue.tts_generation.arn,
        aws_sqs_queue.tts_dead_letter.arn
      ]
    }]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_sqs_receive_attach" {
  role       = aws_iam_role.lambda_execution.name
  policy_arn = aws_iam_policy.lambda_sqs_receive.arn
}


# ============================================
# ALLOW LAMBDA TO SEND EMAIL VIA SES
# ============================================

resource "aws_iam_policy" "lambda_ses_send" {
  name = "${var.service_name}-ses-send"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ses:SendEmail",
          "ses:SendRawEmail"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_ses_attach" {
  role       = aws_iam_role.lambda_execution.name
  policy_arn = aws_iam_policy.lambda_ses_send.arn
}

# ============================================
# API GATEWAY (HTTP API)
# ============================================

resource "aws_apigatewayv2_api" "main" {
  name          = local.api_name
  protocol_type = "HTTP"
  
  cors_configuration {
    allow_origins     = ["*"]
    allow_methods     = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]
    allow_headers     = [
      "authorization",
      "content-type",
      "x-csrftoken",
      "accept",
      "accept-encoding",
      "accept-language"
    ]
    allow_credentials = false
    max_age           = 300
  }
  
  tags = merge(local.common_tags, {
    Type = "api-gateway"
  })
}

# Default stage
resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.main.id
  name        = "$default"
  auto_deploy = true
  
  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_gateway.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      ip             = "$context.identity.sourceIp"
      requestTime    = "$context.requestTime"
      httpMethod     = "$context.httpMethod"
      routeKey       = "$context.routeKey"
      status         = "$context.status"
      protocol       = "$context.protocol"
      responseLength = "$context.responseLength"
    })
  }

  default_route_settings {
    throttling_burst_limit = 5000  # Max concurrent requests
    throttling_rate_limit  = 2000  # Requests per second
  }
  
  tags = local.common_tags
}

# CloudWatch log group for API Gateway
resource "aws_cloudwatch_log_group" "api_gateway" {
  name              = "/aws/apigateway/${local.api_name}"
  retention_in_days = 7
  
  tags = local.common_tags
}

# Integration with Lambda
resource "aws_apigatewayv2_integration" "lambda" {
  api_id           = aws_apigatewayv2_api.main.id
  integration_type = "AWS_PROXY"
  
  integration_uri    = aws_lambda_function.main.invoke_arn
  integration_method = "POST"
  payload_format_version = "2.0"
}

# Catch-all route
resource "aws_apigatewayv2_route" "default" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

# Allow API Gateway to invoke Lambda
resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.main.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

# ============================================
# CODEBUILD PROJECT
# ============================================

resource "aws_codebuild_project" "main" {
  name          = local.codebuild_name
  service_role  = aws_iam_role.codebuild.arn
  build_timeout = 10
  
  artifacts {
    type = "CODEPIPELINE"
  }
  
  environment {
    compute_type                = "BUILD_GENERAL1_SMALL"
    image                       = "aws/codebuild/standard:7.0"
    type                        = "LINUX_CONTAINER"
    image_pull_credentials_type = "CODEBUILD"
    
    environment_variable {
      name  = "LAMBDA_FUNCTION_NAME"
      value = aws_lambda_function.main.function_name
    }
    
    environment_variable {
      name  = "SERVICE_NAME"
      value = var.service_name
    }
    
    environment_variable {
      name  = "AWS_DEFAULT_REGION"
      value = var.aws_region
    }

    environment_variable {
      name  = "DATABASE_URL"
      value = var.database_url
    }
  }
  
  source {
    type      = "CODEPIPELINE"
    buildspec = "buildspec.yml"
  }
  
  logs_config {
    cloudwatch_logs {
      group_name = "/aws/codebuild/${local.codebuild_name}"
    }
  }
  
  tags = merge(local.common_tags, {
    Type = "codebuild"
  })
}

# ============================================
# S3 BUCKET FOR PIPELINE ARTIFACTS
# ============================================

resource "aws_s3_bucket" "pipeline_artifacts" {
  bucket = "${var.project}-${var.service_name}-pipeline-artifacts"
  
  tags = merge(local.common_tags, {
    Type = "s3-bucket"
  })
}

resource "aws_s3_bucket_versioning" "pipeline_artifacts" {
  bucket = aws_s3_bucket.pipeline_artifacts.id
  
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "pipeline_artifacts" {
  bucket = aws_s3_bucket.pipeline_artifacts.id
  
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Block public access
resource "aws_s3_bucket_public_access_block" "pipeline_artifacts" {
  bucket = aws_s3_bucket.pipeline_artifacts.id
  
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ============================================
# CODESTAR CONNECTION - GITHUB (v2)
# ============================================

# Replaces the deprecated GitHub v1 OAuth-token source action. Authenticates via
# the AWS Connector GitHub App rather than a PAT, so nothing expires out from
# under the pipeline, and pushes arrive by webhook instead of polling.
#
# Terraform creates this in PENDING status and it CANNOT be authorized from
# code -- a human must complete the handshake once:
#   Console -> Developer Tools -> Settings -> Connections
#   -> towerofbabble-github -> "Update pending connection" -> install/authorize
# Until then the Source stage fails with a connection error.
resource "aws_codestarconnections_connection" "github" {
  name          = "${var.service_name}-github"
  provider_type = "GitHub"

  tags = merge(local.common_tags, {
    Type = "codestar-connection"
  })
}

# ============================================
# CODEPIPELINE
# ============================================

resource "aws_codepipeline" "main" {
  name     = local.pipeline_name
  role_arn = aws_iam_role.codepipeline.arn
  
  artifact_store {
    type     = "S3"
    location = aws_s3_bucket.pipeline_artifacts.bucket
  }
  
  stage {
    name = "Source"
    
    action {
      name             = "Source"
      category         = "Source"
      owner            = "AWS"
      provider         = "CodeStarSourceConnection"
      version          = "1"
      output_artifacts = ["source_output"]

      configuration = {
        ConnectionArn        = aws_codestarconnections_connection.github.arn
        FullRepositoryId     = "${var.github_owner}/${var.github_repo}"
        BranchName           = var.github_branch
        DetectChanges        = "true"
        OutputArtifactFormat = "CODE_ZIP"
      }
    }
  }
  
  stage {
    name = "Build"
    
    action {
      name             = "Build"
      category         = "Build"
      owner            = "AWS"
      provider         = "CodeBuild"
      version          = "1"
      input_artifacts  = ["source_output"]
      output_artifacts = ["build_output"]
      
      configuration = {
        ProjectName = aws_codebuild_project.main.name
      }
    }
  }
  
  tags = merge(local.common_tags, {
    Type = "codepipeline"
  })
}

# ============================================
# EVENTBRIDGE - DAILY DATA CLEANUP
# ============================================

# EventBridge rule to trigger cleanup daily at 3 AM UTC
resource "aws_cloudwatch_event_rule" "data_cleanup_schedule" {
  name                = "${var.service_name}-data-cleanup-daily"
  description         = "Delete soft-deleted users older than 30 days"
  schedule_expression = "cron(0 3 * * ? *)"  # 3 AM UTC daily
  
  tags = merge(local.common_tags, {
    Type = "eventbridge-rule"
  })
}

# Target Lambda directly
resource "aws_cloudwatch_event_target" "cleanup_lambda" {
  rule      = aws_cloudwatch_event_rule.data_cleanup_schedule.name
  target_id = "CleanupLambdaTarget"
  arn       = aws_lambda_function.main.arn
  
  # Pass event data to Lambda
  input = jsonencode({
    action = "cleanup_deleted_data"
  })
}

# Grant EventBridge permission to invoke Lambda
resource "aws_lambda_permission" "allow_eventbridge" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.main.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.data_cleanup_schedule.arn
}

# ============================================
# EVENTBRIDGE - LAMBDA WARM-UP (every 5 min)
# ============================================

# Keeps Lambda container warm to eliminate cold starts
# Cost: ~8,640 invocations/month = pennies
resource "aws_cloudwatch_event_rule" "warmup_schedule" {
  name                = "${var.service_name}-warmup"
  description         = "Ping Lambda every 5 minutes to prevent cold starts"
  schedule_expression = "rate(5 minutes)"
  
  tags = merge(local.common_tags, {
    Type = "eventbridge-rule"
  })
}

resource "aws_cloudwatch_event_target" "warmup_lambda" {
  rule      = aws_cloudwatch_event_rule.warmup_schedule.name
  target_id = "WarmupLambdaTarget"
  arn       = aws_lambda_function.main.arn
  
  input = jsonencode({
    action = "warmup"
  })
}

resource "aws_lambda_permission" "allow_eventbridge_warmup" {
  statement_id  = "AllowExecutionFromEventBridgeWarmup"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.main.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.warmup_schedule.arn
}

# ============================================
# EVENTBRIDGE - DAILY STATS EMAIL
# ============================================

# EventBridge rule to send daily stats at 1 PM UTC (~7 AM Mountain)
resource "aws_cloudwatch_event_rule" "daily_stats_schedule" {
  name                = "${var.service_name}-daily-stats"
  description         = "Send daily stats digest email"
  schedule_expression = "cron(0 13 * * ? *)"  # 1 PM UTC = ~7 AM MT
  
  tags = merge(local.common_tags, {
    Type = "eventbridge-rule"
  })
}

resource "aws_cloudwatch_event_target" "stats_lambda" {
  rule      = aws_cloudwatch_event_rule.daily_stats_schedule.name
  target_id = "DailyStatsLambdaTarget"
  arn       = aws_lambda_function.main.arn
  
  input = jsonencode({
    action = "send_daily_stats"
  })
}

resource "aws_lambda_permission" "allow_eventbridge_stats" {
  statement_id  = "AllowExecutionFromEventBridgeStats"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.main.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.daily_stats_schedule.arn
}

