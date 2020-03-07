const   express = require('express'),
        aws = require('aws-sdk'),
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
        ec2Key: req.body.accessKeyName
    };

    // Set AWS Credentials
    aws.config.update({
        accessKeyId: data.accessKeyId,
        secretAccessKey: data.secretAccessKey,
        region: data.region
    });

    // Create EC2 service object
    const ec2 = new aws.EC2({apiVersion: '2016-11-15'});
});


module.exports = app;