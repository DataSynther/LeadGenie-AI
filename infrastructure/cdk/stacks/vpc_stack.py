from aws_cdk import Stack, aws_ec2 as ec2
from constructs import Construct


class VpcStack(Stack):
    def __init__(self, scope: Construct, id: str, **kwargs):
        super().__init__(scope, id, **kwargs)

        self.vpc = ec2.Vpc(self, "LeadGenieVpc",
            max_azs=2,
            nat_gateways=1,             # single NAT saves ~$32/mo vs 2
            subnet_configuration=[
                ec2.SubnetConfiguration(
                    name="Public",
                    subnet_type=ec2.SubnetType.PUBLIC,
                    cidr_mask=24,
                ),
                ec2.SubnetConfiguration(
                    name="Private",
                    subnet_type=ec2.SubnetType.PRIVATE_WITH_EGRESS,
                    cidr_mask=24,
                ),
            ],
        )

        # Security groups exposed to other stacks
        self.alb_sg = ec2.SecurityGroup(self, "AlbSg",
            vpc=self.vpc,
            description="ALB - allow 80/443 from internet",
        )
        self.alb_sg.add_ingress_rule(ec2.Peer.any_ipv4(), ec2.Port.tcp(80))
        self.alb_sg.add_ingress_rule(ec2.Peer.any_ipv4(), ec2.Port.tcp(443))

        self.app_sg = ec2.SecurityGroup(self, "AppSg",
            vpc=self.vpc,
            description="ECS tasks - allow from ALB only",
        )
        self.app_sg.add_ingress_rule(self.alb_sg, ec2.Port.tcp(8000))

        self.db_sg = ec2.SecurityGroup(self, "DbSg",
            vpc=self.vpc,
            description="RDS - allow from ECS tasks only",
        )
        self.db_sg.add_ingress_rule(self.app_sg, ec2.Port.tcp(5432))

        self.redis_sg = ec2.SecurityGroup(self, "RedisSg",
            vpc=self.vpc,
            description="ElastiCache - allow from ECS tasks only",
        )
        self.redis_sg.add_ingress_rule(self.app_sg, ec2.Port.tcp(6379))

        self.efs_sg = ec2.SecurityGroup(self, "EfsSg",
            vpc=self.vpc,
            description="EFS - allow NFS from ECS tasks",
        )
        self.efs_sg.add_ingress_rule(self.app_sg, ec2.Port.tcp(2049))
