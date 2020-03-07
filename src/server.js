const   config = require('../config.json'),
        http = require('http'),
        port = process.env.PORT || config.server.port,
        app = require('./index'),
        server = http.createServer(app);

server.listen(port);