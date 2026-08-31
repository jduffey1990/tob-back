# api_domain.tf
# Stable, client-facing hostname for the API.
#
# The iOS app hardcodes the generated execute-api hostname, which can never be
# repointed once a build ships. This gives clients a name we own, so the backend
# can move later (API Gateway -> ALB, or off AWS entirely) without an app update
# and without an App Store review in the critical path.
#
# Purely additive: both hostnames serve the same API at the same time, so there
# is no cutover and no flag day. Already-shipped app versions keep resolving
# execute-api until they age out.
#
# DNS for tobprayer.app is hosted at Cloudflare (GoDaddy is only the registrar),
# so the two required records are created BY HAND in the Cloudflare dashboard.
# Both must be DNS-only (grey cloud, not orange): a proxied record makes ACM
# validation fail to resolve, and makes API Gateway answer 403 on Host/SNI
# mismatch.
#
# Apply flow -- one apply, with a manual step in the middle:
#   1. terraform apply
#        Creates the certificate, then BLOCKS on aws_acm_certificate_validation
#        while it polls for the cert to be issued.
#   2. While it waits, in another shell:
#        aws acm describe-certificate --region us-east-2 \
#          --certificate-arn "$(terraform output -raw acm_certificate_arn)" \
#          --query 'Certificate.DomainValidationOptions[0].ResourceRecord'
#        Add that CNAME in Cloudflare, DNS-only.
#   3. Validation completes, the apply continues on its own and creates the
#      custom domain + mapping. Then:
#        terraform output api_custom_domain_target
#      and add a second Cloudflare CNAME, DNS-only:
#        api  ->  <that value>
#
# Ctrl-C during the wait is safe -- the cert persists in state, and re-running
# terraform apply resumes from where it stopped.
#
# Only after `dig api.tobprayer.app` resolves and the endpoint answers should
# TowerOfBabble/Core/config.swift be pointed at the new hostname.

resource "aws_acm_certificate" "api" {
  domain_name       = var.api_domain_name
  validation_method = "DNS"

  # Cert replacement must create the new one before destroying the old, or the
  # API Gateway domain briefly references a deleted certificate.
  lifecycle {
    create_before_destroy = true
  }

  tags = merge(local.common_tags, {
    Type = "acm-certificate"
  })
}

# Blocks until the DNS validation record added in Cloudflare is observed and the
# certificate reaches ISSUED. No validation_record_fqdns here on purpose: the
# records are managed by hand at Cloudflare, not by Terraform.
resource "aws_acm_certificate_validation" "api" {
  certificate_arn = aws_acm_certificate.api.arn

  timeouts {
    create = "60m"
  }
}

resource "aws_apigatewayv2_domain_name" "api" {
  domain_name = var.api_domain_name

  domain_name_configuration {
    certificate_arn = aws_acm_certificate.api.arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }

  # REGIONAL requires the cert in this same region (us-east-2); an edge-optimized
  # domain would need it in us-east-1 instead.
  depends_on = [aws_acm_certificate_validation.api]

  tags = merge(local.common_tags, {
    Type = "apigateway-domain"
  })
}

# Root mapping: the stage is "$default", so paths pass through unprefixed --
# https://api.tobprayer.app/prayers hits the same route as the execute-api URL.
resource "aws_apigatewayv2_api_mapping" "api" {
  api_id      = aws_apigatewayv2_api.main.id
  domain_name = aws_apigatewayv2_domain_name.api.id
  stage       = aws_apigatewayv2_stage.default.id
}
