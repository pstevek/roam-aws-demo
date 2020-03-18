const   express = require('express'),
    aws = require('aws-sdk'),
    bodyParser = require('body-parser'),
    app = express();

let inputData = null;

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.post('/create-environment', (req, res) => {
    // Get Request form data
    inputData = {
        accessKeyId: req.body.accessKeyId,
        secretAccessKey: req.body.secretAccessKey,
        region: req.body.region,
        ec2KeyPair: req.body.ec2KeyPair,
        ec2SecurityGroupId: null,
        ec2SubnetId: null,
        ec2InstanceId: null,
        elbDNSName: null,
        vpcId: null
    };

    aws.config.setPromisesDependency(null);
    aws.config.update({
        accessKeyId: inputData.accessKeyId,
        secretAccessKey: inputData.secretAccessKey,
        region: inputData.region
    });

    aws.config.apiVersions = {
        ec2: '2016-11-15',
        elb: '2012-06-01',
        rds: '2014-10-31',
    };

    const   ec2 = new aws.EC2(),
            rds = new aws.RDS(),
            elb = new aws.ELB();

    // Create promise on an EC2 instance
    const vpcPromise = ec2.createVpc({CidrBlock: "10.0.0.0/16"}).promise();

    vpcPromise.then(
        function(data) {
            inputData.vpcId = data.Vpc.VpcId;
            console.log("Vpc successfully created ! VpcId : ", inputData.vpcId);

            const paramsSubnet = {
                CidrBlock: "10.0.0.0/16",
                VpcId: inputData.vpcId
            };

            const subnetPromise = ec2.createSubnet(paramsSubnet).promise();

            subnetPromise.then(
                function(data) {
                    inputData.ec2SubnetId = data.Subnet.SubnetId;
                    console.log("Subnet for Vpc : " + inputData.vpcId + " successfully created ! SubnetId : " + inputData.ec2SubnetId);
                }
            ).catch(
                function(err) {
                    console.error(err, err.stack);
                }
            );

            const paramsSecurityGroup = {
                Description: 'Security Group for EC2 instance',
                GroupName: 'roam-sg-demo',
                VpcId: inputData.vpcId
            };

            const sgPromise = ec2.createSecurityGroup(paramsSecurityGroup).promise();

            sgPromise.then(
                function(data) {
                    inputData.ec2SecurityGroupId = data.GroupId;
                    console.log("Security Group successfully created ! GroupId : ", inputData.ec2SecurityGroupId);
                    const paramsIngress = {
                        GroupId: inputData.ec2SecurityGroupId,
                        IpPermissions: [
                            {
                                IpProtocol: "tcp",
                                FromPort: 80,
                                ToPort: 80,
                                IpRanges: [{"CidrIp":"0.0.0.0/0"}]
                            },
                            {
                                IpProtocol: "tcp",
                                FromPort: 22,
                                ToPort: 22,
                                IpRanges: [{"CidrIp":"0.0.0.0/0"}]
                            }
                        ]
                    };

                    const gatewayPromise = ec2.createInternetGateway().promise();

                    gatewayPromise.then(
                        function(data) {
                            const gatewayId = data.InternetGateway.InternetGatewayId;
                            console.log("Internet Gateway created successfully : ", gatewayId);
                            const paramsGateway = {
                                InternetGatewayId: gatewayId,
                                VpcId: inputData.vpcId
                            };

                            ec2.attachInternetGateway(paramsGateway).promise().then(
                                function(data) {
                                    console.log("Internet Gateway successfully attached");
                                }
                            ).catch(
                                function(err) {
                                    console.error(err, err.stack);
                                }
                            );
                        }
                    ).catch(
                        function(err) {
                            console.error(err, err.stack);
                        }
                    );

                    const sgIngress = ec2.authorizeSecurityGroupIngress(paramsIngress).promise();

                    sgIngress.then(
                        function(data) {
                            console.log("Ingress Successfully Set : ", data);
                            const instanceParams = {
                                ImageId: 'ami-0fc61db8544a617ed',
                                InstanceType: 't2.micro',
                                KeyName: inputData.ec2KeyPair,
                                MinCount: 1,
                                MaxCount: 1,
                                SecurityGroupIds: [inputData.ec2SecurityGroupId],
                                SubnetId: inputData.ec2SubnetId
                            };

                            // Run the EC2 instance
                            const instancePromise = ec2.runInstances(instanceParams).promise();

                            // Handle promise's fulfilled/rejected states
                            instancePromise.then(
                                function(data) {
                                    inputData.ec2InstanceId = data.Instances[0].InstanceId;
                                    console.log("Created EC2 instance : ", inputData.ec2InstanceId);
                                    // Add tags to the instance
                                    const tagParams = {
                                        Resources:[inputData.ec2InstanceId],
                                        Tags: [
                                            {
                                                Key: 'Name',
                                                Value: 'EC2 ROAM Demo'
                                            }
                                        ]};

                                    setTimeout(() => {
                                        // Allocate the Elastic IP address
                                        const ipAllocatePromise = ec2.allocateAddress({Domain: "vpc"}).promise();

                                        ipAllocatePromise.then(
                                            function (data) {
                                                console.log("Address allocated: ", data.AllocationId);
                                                const paramsAssociateAddress = {
                                                    AllocationId: data.AllocationId,
                                                    InstanceId: inputData.ec2InstanceId
                                                };

                                                // Associate the new Elastic IP address with an EC2 instance
                                                const ipAssociatePromise = ec2.associateAddress(paramsAssociateAddress).promise();

                                                ipAssociatePromise.then(
                                                    function (data) {
                                                        console.log("Address associated: ", data.AssociationId);
                                                    }
                                                ).catch(
                                                    function(err) {
                                                        console.error(err, err.stack);
                                                    }
                                                );

                                                const elbParams = {
                                                    Listeners: [
                                                        {
                                                            InstancePort: 80,
                                                            InstanceProtocol: "HTTP",
                                                            LoadBalancerPort: 80,
                                                            Protocol: "HTTP"
                                                        }
                                                    ],
                                                    LoadBalancerName: "roam-load-balancer",
                                                    SecurityGroups: [inputData.ec2SecurityGroupId],
                                                    Subnets: [inputData.ec2SubnetId]
                                                };

                                                const elbPromise = elb.createLoadBalancer(elbParams).promise();

                                                elbPromise.then(
                                                    function (data) {
                                                        console.log("ELB DNSName: ", data.DNSName);
                                                        inputData.elbDNSName = data.DNSName;

                                                        const rdsParams = {
                                                            DBInstanceClass: "db.t2.micro",
                                                            DBInstanceIdentifier: "mydbinstance",
                                                            MasterUsername: "pstevek",
                                                            MasterUserPassword: "password1234",
                                                            DBName: "roamdb",
                                                            Engine: "mysql",
                                                            StorageType: "standard",
                                                            AllocatedStorage: 10,
                                                        };

                                                        setTimeout( () => {
                                                            const rdsPromise = rds.createDBInstance(rdsParams).promise();

                                                            rdsPromise.then(
                                                                function (data) {
                                                                    console.log("RDS Data : ", data);
                                                                }
                                                            ).catch(
                                                                function(err) {
                                                                    console.error(err, err.stack);
                                                                }
                                                            );
                                                        }, 40000);
                                                    }
                                                );
                                            }
                                        ).catch(
                                            function(err) {
                                                console.error(err, err.stack);
                                            }
                                        );
                                    }, 50000);

                                    // Create a promise on an EC2 service object
                                    const tagPromise = ec2.createTags(tagParams).promise();
                                    // Handle promise's fulfilled/rejected states
                                    tagPromise.then(
                                        function(data) {
                                            console.log("EC2 Instance tagged");
                                        }).catch(
                                        function(err) {
                                            console.error(err, err.stack);
                                        });
                                }).catch(
                                function(err) {
                                    console.error(err, err.stack);
                                });
                        }
                    ).catch(
                        function(err) {
                            console.error(err, err.stack);
                        });
                }
            ).catch(
                function(err) {
                    console.error(err, err.stack);
                });
        }
    ).catch(
        function(err) {
            console.error(err, err.stack);
        }
    );

    setTimeout(() => {
        res.status(200).json({
            message: "Enviromnent created successfully !",
            VpcId : inputData.vpcId,
            EC2InstanceId : inputData.ec2InstanceId,
            ELB: inputData.elbDNSName,
            success: true
        });
    }, 100000)
});

module.exports = app;