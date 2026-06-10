from aws_cdk import (
    Stack, Duration, CfnOutput,
    aws_ec2 as ec2,
    aws_ecs as ecs,
    aws_ecr as ecr,
    aws_elasticloadbalancingv2 as elbv2,
    aws_iam as iam,
    aws_logs as logs,
    aws_secretsmanager as secretsmanager,
    aws_sqs as sqs,
    aws_dynamodb as dynamodb,
    aws_elasticache as elasticache,
)
from constructs import Construct


class ComputeStack(Stack):
    def __init__(self, scope: Construct, id: str, *,
                 vpc: ec2.Vpc,
                 alb_sg: ec2.SecurityGroup = None,
                 app_sg: ec2.SecurityGroup = None,
                 redis: elasticache.CfnReplicationGroup,
                 activity_table: dynamodb.Table,
                 budget_table: dynamodb.Table,
                 queue_table: dynamodb.Table,
                 secret: secretsmanager.Secret,
                 api_image: str,
                 worker_image: str,
                 **kwargs):
        super().__init__(scope, id, **kwargs)
        self._alb_sg = alb_sg
        self._app_sg = app_sg

        # ── ECR repos ────────────────────────────────────────────────────────
        api_repo    = ecr.Repository.from_repository_name(self, "ApiRepo",    "leadgenie-api")
        worker_repo = ecr.Repository.from_repository_name(self, "WorkerRepo", "leadgenie-worker")

        # ── SQS agent job queue ───────────────────────────────────────────────
        self.job_queue = sqs.Queue(self, "AgentJobQueue",
            queue_name="leadgenie-agent-jobs",
            visibility_timeout=Duration.minutes(16),
            retention_period=Duration.hours(4),
        )

        # ── ECS Cluster ───────────────────────────────────────────────────────
        self.cluster = ecs.Cluster(self, "Cluster",
            cluster_name="leadgenie-cluster",
            vpc=vpc,
            container_insights=True,
        )

        # ── Task execution role (shared) ──────────────────────────────────────
        exec_role = iam.Role(self, "ExecRole",
            assumed_by=iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
            managed_policies=[
                iam.ManagedPolicy.from_aws_managed_policy_name(
                    "service-role/AmazonECSTaskExecutionRolePolicy"
                ),
            ],
        )
        secret.grant_read(exec_role)

        # ── Task role (what the app code can do) ──────────────────────────────
        task_role = iam.Role(self, "TaskRole",
            assumed_by=iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
        )
        self.job_queue.grant_send_messages(task_role)
        self.job_queue.grant_consume_messages(task_role)
        activity_table.grant_read_write_data(task_role)
        budget_table.grant_read_write_data(task_role)
        queue_table.grant_read_write_data(task_role)


        # ── Common environment ────────────────────────────────────────────────
        redis_host = redis.attr_primary_end_point_address
        common_env = {
            "REDIS_URL":             f"rediss://{redis_host}:6379",
            "SQS_QUEUE_URL":         self.job_queue.queue_url,
            "ACTIVITY_TABLE":        activity_table.table_name,
            "BUDGET_TABLE":          budget_table.table_name,
            "QUEUE_TABLE":           queue_table.table_name,
            "AWS_REGION":            self.region,
            "WHATSAPP_TEST_PHONE":   "+918056498879",
        }
        common_secrets = {
            "ANTHROPIC_API_KEY":      ecs.Secret.from_secrets_manager(secret, "ANTHROPIC_API_KEY"),
            "APOLLO_API_KEY":         ecs.Secret.from_secrets_manager(secret, "APOLLO_API_KEY"),
            "VOYAGE_API_KEY":         ecs.Secret.from_secrets_manager(secret, "VOYAGE_API_KEY"),
            "GMAIL_APP_PASSWORD":     ecs.Secret.from_secrets_manager(secret, "GMAIL_APP_PASSWORD"),
            "RESEND_API_KEY":         ecs.Secret.from_secrets_manager(secret, "RESEND_API_KEY"),
            "LEADGENIE_GMAIL":        ecs.Secret.from_secrets_manager(secret, "LEADGENIE_GMAIL"),
            "LEADGENIE_GMAIL_PASSWORD": ecs.Secret.from_secrets_manager(secret, "LEADGENIE_GMAIL_PASSWORD"),
        }

        log_group = logs.LogGroup(self, "LogGroup",
            log_group_name="/leadgenie/ecs",
            retention=logs.RetentionDays.ONE_WEEK,
        )

        # ── API Task Definition ───────────────────────────────────────────────
        api_task_def = ecs.FargateTaskDefinition(self, "ApiTaskDef",
            family="leadgenie-api",
            cpu=512,
            memory_limit_mib=1024,
            execution_role=exec_role,
            task_role=task_role,
        )
        api_task_def.add_container("leadgenie-api",
            image=ecs.ContainerImage.from_ecr_repository(api_repo, tag="latest")
                  if not api_image else ecs.ContainerImage.from_registry(api_image),
            port_mappings=[ecs.PortMapping(container_port=8000)],
            environment=common_env,
            secrets=common_secrets,
            logging=ecs.LogDrivers.aws_logs(
                stream_prefix="api",
                log_group=log_group,
            ),
            health_check=ecs.HealthCheck(
                command=["CMD-SHELL", "curl -f http://localhost:8000/health || exit 1"],
                interval=Duration.seconds(30),
                timeout=Duration.seconds(5),
                retries=3,
            ),
        )

        # ── Worker Task Definition ─────────────────────────────────────────────
        worker_task_def = ecs.FargateTaskDefinition(self, "WorkerTaskDef",
            family="leadgenie-worker",
            cpu=1024,
            memory_limit_mib=2048,
            execution_role=exec_role,
            task_role=task_role,
        )
        worker_task_def.add_container("leadgenie-worker",
            image=ecs.ContainerImage.from_ecr_repository(worker_repo, tag="latest")
                  if not worker_image else ecs.ContainerImage.from_registry(worker_image),
            environment={**common_env, "WORKER_MODE": "true"},
            secrets=common_secrets,
            logging=ecs.LogDrivers.aws_logs(
                stream_prefix="worker",
                log_group=log_group,
            ),
        )

        # ── ALB ────────────────────────────────────────────────────────────────
        alb_sg = self._alb_sg
        self.alb = elbv2.ApplicationLoadBalancer(self, "Alb",
            vpc=vpc,
            internet_facing=True,
            security_group=alb_sg,
        )
        listener = self.alb.add_listener("HttpListener",
            port=80,
            open=False,
        )

        app_sg = self._app_sg

        # ── API ECS Service ────────────────────────────────────────────────────
        self.api_service = ecs.FargateService(self, "ApiService",
            service_name="leadgenie-api",
            cluster=self.cluster,
            task_definition=api_task_def,
            desired_count=1,
            min_healthy_percent=0,
            max_healthy_percent=200,
            security_groups=[app_sg],
            vpc_subnets=ec2.SubnetSelection(subnet_type=ec2.SubnetType.PRIVATE_WITH_EGRESS),
            enable_execute_command=True,
            circuit_breaker=ecs.DeploymentCircuitBreaker(rollback=True),
        )

        # Auto-scaling for API
        api_scaling = self.api_service.auto_scale_task_count(min_capacity=1, max_capacity=1)
        api_scaling.scale_on_cpu_utilization("CpuScaling",
            target_utilization_percent=60,
            scale_in_cooldown=Duration.minutes(5),
            scale_out_cooldown=Duration.seconds(60),
        )
        api_scaling.scale_on_request_count("RequestScaling",
            requests_per_target=500,
            target_group=listener.add_targets("ApiTargets",
                port=8000,
                protocol=elbv2.ApplicationProtocol.HTTP,
                targets=[self.api_service],
                health_check=elbv2.HealthCheck(
                    path="/health",
                    interval=Duration.seconds(30),
                    healthy_http_codes="200",
                ),
                deregistration_delay=Duration.seconds(30),
            ),
        )

        # ── Worker ECS Service ─────────────────────────────────────────────────
        self.worker_service = ecs.FargateService(self, "WorkerService",
            service_name="leadgenie-worker",
            cluster=self.cluster,
            task_definition=worker_task_def,
            desired_count=1,
            min_healthy_percent=0,
            max_healthy_percent=200,
            security_groups=[app_sg],
            vpc_subnets=ec2.SubnetSelection(subnet_type=ec2.SubnetType.PRIVATE_WITH_EGRESS),
            circuit_breaker=ecs.DeploymentCircuitBreaker(rollback=True),
            capacity_provider_strategies=[
                ecs.CapacityProviderStrategy(
                    capacity_provider="FARGATE_SPOT",
                    weight=2,
                ),
                ecs.CapacityProviderStrategy(
                    capacity_provider="FARGATE",
                    weight=1,
                ),
            ],
        )

        # Worker auto-scaling based on SQS queue depth
        worker_scaling = self.worker_service.auto_scale_task_count(min_capacity=0, max_capacity=8)
        worker_scaling.scale_on_metric("QueueDepthScaling",
            metric=self.job_queue.metric_approximate_number_of_messages_visible(),
            scaling_steps=[
                {"upper": 0,  "change": -1},
                {"lower": 1,  "change": +1},
                {"lower": 10, "change": +2},
            ],
            cooldown=Duration.minutes(2),
        )

        # ── Outputs ────────────────────────────────────────────────────────────
        CfnOutput(self, "AlbDns", value=self.alb.load_balancer_dns_name, export_name="AlbDns")
        CfnOutput(self, "ClusterName", value=self.cluster.cluster_name)
        CfnOutput(self, "ApiServiceName", value=self.api_service.service_name)
        CfnOutput(self, "WorkerServiceName", value=self.worker_service.service_name)
