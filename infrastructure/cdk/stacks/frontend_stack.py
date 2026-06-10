from aws_cdk import (
    Stack, CfnOutput, RemovalPolicy,
    aws_s3 as s3,
    aws_cloudfront as cloudfront,
    aws_cloudfront_origins as origins,
    aws_elasticloadbalancingv2 as elbv2,
)
from constructs import Construct


class FrontendStack(Stack):
    def __init__(self, scope: Construct, id: str, *,
                 alb: elbv2.ApplicationLoadBalancer,
                 **kwargs):
        super().__init__(scope, id, **kwargs)

        # ── S3 bucket for SPA ─────────────────────────────────────────────────
        bucket = s3.Bucket(self, "SpaBucket",
            bucket_name=f"leadgenie-frontend-{self.account}",
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            removal_policy=RemovalPolicy.DESTROY,
            auto_delete_objects=True,
        )

        oac = cloudfront.S3OriginAccessControl(self, "OAC")

        # ── CloudFront distribution ───────────────────────────────────────────
        distribution = cloudfront.Distribution(self, "Distribution",
            default_root_object="index.html",
            default_behavior=cloudfront.BehaviorOptions(
                origin=origins.S3BucketOrigin.with_origin_access_control(bucket, origin_access_control=oac),
                viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                cache_policy=cloudfront.CachePolicy.CACHING_OPTIMIZED,
            ),
            additional_behaviors={
                # All backend API paths proxied through CloudFront to ALB (HTTP only)
                **{
                    path: cloudfront.BehaviorOptions(
                        origin=origins.LoadBalancerV2Origin(alb,
                            protocol_policy=cloudfront.OriginProtocolPolicy.HTTP_ONLY,
                        ),
                        viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                        cache_policy=cloudfront.CachePolicy.CACHING_DISABLED,
                        origin_request_policy=cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
                        allowed_methods=cloudfront.AllowedMethods.ALLOW_ALL,
                    )
                    for path in [
                        "/health*",
                        "/auth/*",
                        "/leads/*",
                        "/company/*",
                        "/outreach/*",
                        "/conversation/*",
                        "/feedback/*",
                        "/learning/*",
                        "/trends*",
                        "/audit/*",
                        "/dashboard/*",
                        "/agent-feed/*",
                        "/pipeline*",
                        "/approval-queue*",
                        "/credits*",
                        "/dev/*",
                        "/whatsapp*",
                        "/api/*",
                        "/quidditch*",
                        "/kb-facts*",
                        "/memory/*",
                        "/pending-messages*",
                        "/followups/*",
                    ]
                },
            },
            # SPA fallback: all paths → index.html
            error_responses=[
                cloudfront.ErrorResponse(
                    http_status=403,
                    response_page_path="/index.html",
                    response_http_status=200,
                ),
                cloudfront.ErrorResponse(
                    http_status=404,
                    response_page_path="/index.html",
                    response_http_status=200,
                ),
            ],
        )

        # ── Outputs ────────────────────────────────────────────────────────────
        CfnOutput(self, "CloudFrontUrl",
            value=f"https://{distribution.distribution_domain_name}",
            export_name="CloudFrontUrl",
        )
        CfnOutput(self, "CloudFrontDistId",
            value=distribution.distribution_id,
            export_name="CloudFrontDistId",
        )
        CfnOutput(self, "FrontendBucket",
            value=bucket.bucket_name,
            export_name="FrontendBucket",
        )
