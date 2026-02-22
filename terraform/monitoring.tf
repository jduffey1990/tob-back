# ============================================================
# terraform/monitoring.tf
# ============================================================

# ============================================
# SNS TOPIC - Alert notifications
# ============================================
# Reuses existing admin_stats_email variable — 
# same email gets daily stats AND alerts.

resource "aws_sns_topic" "alerts" {
  name = "${var.service_name}-alerts"
  
  tags = merge(local.common_tags, {
    Type = "sns-topic"
  })
}

resource "aws_sns_topic_subscription" "alert_email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.admin_stats_email
}

# ============================================
# ALARM 1: Lambda Errors (5xx / unhandled throws)
# ============================================
# Fires if there are more than 5 Lambda errors in a 5-minute window.
# This catches unhandled exceptions, timeouts, and OOM kills.

resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  alarm_name          = "${var.service_name}-lambda-errors"
  alarm_description   = "Lambda function errors exceeded threshold"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  treat_missing_data  = "notBreaching"
  
  dimensions = {
    FunctionName = aws_lambda_function.main.function_name
  }
  
  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
  
  tags = merge(local.common_tags, {
    Type = "cloudwatch-alarm"
  })
}

# ============================================
# ALARM 2: Lambda Duration (something is hanging)
# ============================================
# Fires if average duration exceeds 10 seconds over a 5-minute window.
# Your timeout is 30s, so 10s average means something is very wrong 
# (stuck DB connection, external API hanging, etc.)

resource "aws_cloudwatch_metric_alarm" "lambda_duration" {
  alarm_name          = "${var.service_name}-lambda-high-duration"
  alarm_description   = "Lambda average duration exceeds 10 seconds"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "Duration"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Average"
  threshold           = 10000
  treat_missing_data  = "notBreaching"
  
  dimensions = {
    FunctionName = aws_lambda_function.main.function_name
  }
  
  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
  
  tags = merge(local.common_tags, {
    Type = "cloudwatch-alarm"
  })
}

# ============================================
# ALARM 3: Lambda Throttles (hitting concurrency limit)
# ============================================
# Fires if ANY throttles occur. At your scale this should never happen,
# so if it does, something is seriously wrong (runaway loop, DDoS, etc.)

resource "aws_cloudwatch_metric_alarm" "lambda_throttles" {
  alarm_name          = "${var.service_name}-lambda-throttles"
  alarm_description   = "Lambda function is being throttled"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Throttles"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  
  dimensions = {
    FunctionName = aws_lambda_function.main.function_name
  }
  
  alarm_actions = [aws_sns_topic.alerts.arn]
  
  tags = merge(local.common_tags, {
    Type = "cloudwatch-alarm"
  })
}

# ============================================
# ALARM 4: API Gateway 5xx rate
# ============================================
# Catches cases where API Gateway itself returns 5xx
# (Lambda timeout, integration errors, etc.)

resource "aws_cloudwatch_metric_alarm" "api_5xx" {
  alarm_name          = "${var.service_name}-api-5xx-errors"
  alarm_description   = "API Gateway 5xx error rate exceeded threshold"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "5xx"
  namespace           = "AWS/ApiGateway"
  period              = 300
  statistic           = "Sum"
  threshold           = 10
  treat_missing_data  = "notBreaching"
  
  dimensions = {
    ApiId = aws_apigatewayv2_api.main.id
  }
  
  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
  
  tags = merge(local.common_tags, {
    Type = "cloudwatch-alarm"
  })
}