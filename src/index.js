const   express = require('express'),
        aws = require('aws-sdk')
        bodyParser = require('body-parser'),
        inputData = null,
        app = express();

app.use(bodyParser.urlencoded({ extended: false }));        
app.use(bodyParser.json());

app.post('/create-environment', (req, res) => {
    // Get Request form data
    inputData = {
        accessKeyId: req.body.accessKeyId,
        secretAccessKey: req.body.secretAccessKey,
        region: req.body.region,
        ec2KeyPair: req.body.ec2KeyPair,
        securityGroupId: null,
        subnetId: null,
        vpcId: null,
        ec2InstanceId: null
    };

    aws.config.setPromisesDependency();
    aws.config.update({
        accessKeyId: inputData.accessKeyId,
        secretAccessKey: inputData.secretAccessKey,
        region: inputData.region
    });

    // Create EC2 service object
    const ec2 = new aws.EC2({apiVersion: '2016-11-15'});

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
                    inputData.subnetId = data.Subnet.SubnetId;
                    console.log("Subnet for Vpc : " + inputData.vpcId + " successfully created ! SubnetId : " + inputData.subnetId);
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
                    inputData.securityGroupId = data.GroupId;
                    console.log("Security Group successfully created ! GroupId : ", inputData.securityGroupId);
                    const paramsIngress = {
                        GroupId: inputData.securityGroupId,
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
                                ImageId: 'ami-0a887e401f7654935',
                                InstanceType: 't2.micro',
                                KeyName: inputData.ec2KeyPair,
                                MinCount: 1,
                                MaxCount: 1,
                                SecurityGroupIds: [inputData.securityGroupId],
                                SubnetId: inputData.subnetId
                            };
                            
                            // Run the EC2 instance
                            const instancePromise = ec2.runInstances(instanceParams).promise();

                            // Handle promise's fulfilled/rejected states
                            instancePromise.then(
                                function(data) {
                                    inputData.ec2InstanceId = data.Instances[0].InstanceId;
                                    console.log("Created EC2 instance : ", inputData.ec2InstanceId);
                                    // Add tags to the instance
                                    tagParams = {Resources: [inputData.ec2InstanceId], Tags: [
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
                                            }
                                        ).catch(
                                            function(err) {
                                                console.error(err, err.stack);
                                            }
                                        );
                                    }, 30000);

                                    // Create a promise on an EC2 service object
                                    var tagPromise = ec2.createTags(tagParams).promise();
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
            success: true
        });
    }, 40000)
});

module.exports = app;