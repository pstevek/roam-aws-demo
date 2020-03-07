const   express = require('express'),
        aws = require('aws-sdk')
        bodyParser = require('body-parser'),
        app = express();

app.use(bodyParser.urlencoded({ extended: false }));        
app.use(bodyParser.json());

app.post('/create-environment', (req, res) => {
    // Get Request form data
    const data = {
        accessKeyId: req.body.accessKeyId,
        secretAccessKey: req.body.secretAccessKey,
        region: req.body.region,
        ec2KeyPair: req.body.ec2KeyPair
    };

    // Set AWS Credentials
    aws.config.update({
        accessKeyId: data.accessKeyId,
        secretAccessKey: data.secretAccessKey,
        region: data.region
    });

    // Create EC2 service object
    const ec2 = new aws.EC2({apiVersion: '2016-11-15'});

    // Create promise on an EC2 instance
    const vpcPromise = ec2.createVpc({CidrBlock: "10.0.0.0/16"}).promise();

    vpcPromise.then(
        function(data) {
            vpcId = data.Vpc.VpcId;
            const paramsSecurityGroup = {
                Description: 'Security Group for EC2 instance',
                GroupName: 'roam-sg-demo',
                VpcId: vpcId
            };

            const sgPromise = ec2.createSecurityGroup(paramsSecurityGroup).promise();

            sgPromise.then(
                function(data) {
                    const SecurityGroupId = data.GroupId;
                    console.log("Security Group successfully created ! GroupId : ", SecurityGroupId);
                    const paramsIngress = {
                        GroupId: SecurityGroupId,
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
                    const sgIngress = ec2.authorizeSecurityGroupIngress(paramsIngress).promise();

                    sgIngress.then(
                        function(data) {
                            console.log("Ingress Successfully Set : ", data);
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
        });

    const instanceParams = {
        ImageId: 'ami-0a887e401f7654935',
        InstanceType: 't2.micro',
        KeyName: data.ec2KeyPair,
        MinCount: 1,
        MaxCount: 1,
    };
    
    // Run the EC2 instance
    const instancePromise = ec2.runInstances(instanceParams).promise();

    // Handle promise's fulfilled/rejected states
    instancePromise.then(
        function(data) {
            var instanceId = data.Instances[0].InstanceId;
            console.log("Created EC2 instance : ", instanceId);
            // Add tags to the instance
            tagParams = {Resources: [instanceId], Tags: [
                {
                    Key: 'Name',
                    Value: 'Ringier EC2 Demo 2'
                }
            ]};
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
});

module.exports = app;