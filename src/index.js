const   express = require('express'),
        aws = require('aws-sdk'),
        bodyParser = require('body-parser'),
        app = express();

app.use(bodyParser.urlencoded({ extended: false }));        
app.use(bodyParser.json());

app.post('/create-environment', (req, res) => {
   
});


module.exports = app;