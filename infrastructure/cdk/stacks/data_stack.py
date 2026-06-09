import os
from aws_cdk import (
    Stack, Duration, RemovalPolicy, SecretValue,
    aws_ec2 as ec2,
    aws_rds as rds,
    aws_elasticache as elasticache,
    aws_dynamodb as dynamodb,
    aws_secretsmanager as secretsmanager,
    aws_s3 as s3,
)
from constructs import Construct


class DataStack(Stack):
    def __init__(self, scope: Construct, id: str, vpc: ec2.Vpc, redis_sg: ec2.SecurityGroup = None, **kwargs):
        super().__init__(scope, id, **kwargs)

        # ── Secrets Manager — all app credentials ────────────────────────────
        self.app_secret = secretsmanager.Secret(self, "AppSecrets",
            secret_name="leadgenie/app-secrets",
            description="LeadGenie-AI API keys and credentials",
            secret_object_value={
                "ANTHROPIC_API_KEY":  SecretValue.unsafe_plain_text(os.environ.get("ANTHROPIC_API_KEY", "")),
                "APOLLO_API_KEY":     SecretValue.unsafe_plain_text(os.environ.get("APOLLO_API_KEY", "")),
                "VOYAGE_API_KEY":     SecretValue.unsafe_plain_text(os.environ.get("VOYAGE_API_KEY", "")),
                "GMAIL_APP_PASSWORD": SecretValue.unsafe_plain_text(os.environ.get("GMAIL_APP_PASSWORD", "")),
                "RESEND_API_KEY":     SecretValue.unsafe_plain_text(os.environ.get("RESEND_API_KEY", "")),
            },
        )

        # ── RDS Postgres (Multi-AZ) ──────────────────────────────────────────
        db_sg = vpc.node.find_child("DbSg") if vpc.node.try_find_child("DbSg") else None

        self.db = rds.DatabaseInstance(self, "Postgres",
            engine=rds.DatabaseInstanceEngine.postgres(
                version=rds.PostgresEngineVersion.VER_16_3,
            ),
            instance_type=ec2.InstanceType.of(
                ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM,
            ),
            vpc=vpc,
            vpc_subnets=ec2.SubnetSelection(subnet_type=ec2.SubnetType.PRIVATE_WITH_EGRESS),
            multi_az=True,
            allocated_storage=20,
            max_allocated_storage=100,
            database_name="leadgenie",
            credentials=rds.Credentials.from_generated_secret("leadgenie_admin"),
            backup_retention=Duration.days(7),
            deletion_protection=True,
            removal_policy=RemovalPolicy.SNAPSHOT,
            enable_performance_insights=True,
        )

        # ── ElastiCache Redis (single node for demo, cluster=False) ─────────
        redis_subnet_group = elasticache.CfnSubnetGroup(self, "RedisSubnetGroup",
            description="LeadGenie Redis subnet group",
            subnet_ids=[s.subnet_id for s in vpc.private_subnets],
        )

        if redis_sg is None:
            redis_sg = ec2.SecurityGroup(self, "RedisSgFallback",
                vpc=vpc,
                description="Redis fallback SG",
            )

        self.redis = elasticache.CfnReplicationGroup(self, "Redis",
            replication_group_description="LeadGenie semantic cache + working memory",
            automatic_failover_enabled=False,
            num_cache_clusters=1,
            cache_node_type="cache.t3.small",
            engine="redis",
            engine_version="7.1",
            cache_subnet_group_name=redis_subnet_group.ref,
            security_group_ids=[redis_sg.security_group_id],
            at_rest_encryption_enabled=True,
            transit_encryption_enabled=True,
        )

        # ── DynamoDB — activity tracking (auto-sleep) ─────────────────────
        self.activity_table = dynamodb.Table(self, "ActivityTable",
            table_name="leadgenie-activity",
            partition_key=dynamodb.Attribute(name="pk", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            time_to_live_attribute="ttl",
            removal_policy=RemovalPolicy.DESTROY,
        )

        # ── DynamoDB — budget / token counters ────────────────────────────
        self.budget_table = dynamodb.Table(self, "BudgetTable",
            table_name="leadgenie-budget",
            partition_key=dynamodb.Attribute(name="pk", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="sk", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            time_to_live_attribute="ttl",
            removal_policy=RemovalPolicy.DESTROY,
        )

        # ── S3 — templates, KB docs, exports ─────────────────────────────
        self.assets_bucket = s3.Bucket(self, "AssetsBucket",
            bucket_name=f"leadgenie-assets-{self.account}",
            versioned=True,
            encryption=s3.BucketEncryption.S3_MANAGED,
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            removal_policy=RemovalPolicy.RETAIN,
        )
