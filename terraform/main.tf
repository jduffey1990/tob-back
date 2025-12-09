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
  
  environment {
    variables = {
      SERVICE_NAME = var.service_name
      ENVIRONMENT  = var.environment
      PROJECT      = var.project
      NODE_ENV             = "production"
      DATABASE_URL         = var.database_url
      JWT_SECRET           = var.jwt_secret
    }
  }
  
  tags = merge(local.common_tags, {
    Type = "lambda"
  })
}

# ============================================
# API GATEWAY (HTTP API)
# ============================================

resource "aws_apigatewayv2_api" "main" {
  name          = local.api_name
  protocol_type = "HTTP"
  
  cors_configuration {
    allow_origins     = [*]
    allow_methods     = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]
    allow_headers     = [
      "authorization",
      "content-type",
      "x-csrftoken",
      "accept",
      "accept-encoding",
      "accept-language"
    ]
    allow_credentials = true
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
      owner            = "ThirdParty"
      provider         = "GitHub"
      version          = "1"
      output_artifacts = ["source_output"]
      
      configuration = {
        Owner      = var.github_owner
        Repo       = var.github_repo
        Branch     = var.github_branch
        OAuthToken = var.github_token
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
