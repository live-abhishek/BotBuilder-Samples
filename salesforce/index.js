var Client = require('node-rest-client').Client;
var async = require('async');
var slconnections = require('./salesforceConnections').connections;

var client = new Client();
var defaultParser = client.parsers.getDefault();
client.parsers.clean();
client.parsers.add(defaultParser);

var accessKey = '';
var affinity = null;
var version = 40;
var contPoll = false;

function getSessionId(callback, errCallback){
    var args = {
        headers: {
            "X-LIVEAGENT-API-VERSION": version,
            "X-LIVEAGENT-AFFINITY": affinity
        }
    };
    var url = "https://d.la1-c2-ukb.salesforceliveagent.com/chat/rest/System/SessionId";
    client.get(url, args, function(data, response){
        console.log('Get session ID');
        console.log(data);
        if(response.statusCode == 200){
            data = JSON.parse(data);
            accessKey = data.key;
            affinity = data.affinityToken;
            // console.log(response);
            console.log(data);
            console.log('===============================');
            chatVisitorInit(callback, errCallback);
        } else {
            errCallback();
        }
    });
}

function chatVisitorInit(callback, errCallback){
    var args = {
        data: {
            "organizationId": "00D28000001jAAb", 
            "deploymentId": "572280000004Juf", 
            "buttonId": "573280000008WDR", 
            "sessionId": "id-from-response", 
            "userAgent": "Lynx/2.8.8", 
            "language": "en-US", 
            "screenResolution": "1900x1080", 
            "visitorName": "Frank Underwood", 
            "prechatDetails": [], 
            "prechatEntities": [], 
            "receiveQueueUpdates": true, 
            "isPost": true 
        },
        headers: {
            "X-LIVEAGENT-AFFINITY": affinity,
            "X-LIVEAGENT-API-VERSION": version,
            "X-LIVEAGENT-SESSION-KEY": accessKey,
            "X-LIVEAGENT-SEQUENCE": 1,
            "Content-Type": "application/json"
        }
    };
    var url = "https://d.la1-c2-ukb.salesforceliveagent.com/chat/rest/Chasitor/ChasitorInit";
    client.post(url, args, function(data, response){
        console.log("Chat visitor init");
        // console.log(response);
        console.log(data);
        console.log(affinity);
        console.log(accessKey);
        if(response.statusCode == 200){
            callback();
        } else {
            errCallback();
        }
        console.log('===============================');
    });
}

function sendMessage(msg){
    var args = {
        data:{
            "text": msg
        },
        headers: {
            "X-LIVEAGENT-API-VERSION": version,
            "X-LIVEAGENT-AFFINITY": affinity,
            "X-LIVEAGENT-SESSION-KEY": accessKey,
            "Content-Type": "application/json"
        }
    };
    var url = "https://d.la1-c2-ukb.salesforceliveagent.com/chat/rest/Chasitor/ChatMessage";
    client.post(url, args, function(data, response){
        console.log("send message");
        // console.log(response);
        console.log(data);
    });
}

function startPolling(session){
    contPoll = true;
    async.whilst(
        () => {
            return contPoll;
        },
        function (callback){
            var args = {
                headers: {
                    "X-LIVEAGENT-API-VERSION": version,
                    "X-LIVEAGENT-AFFINITY": affinity,
                    "X-LIVEAGENT-SESSION-KEY": accessKey
                }
            };
            var url = "https://d.la1-c2-ukb.salesforceliveagent.com/chat/rest/System/Messages";
            client.get(url, args, function(data, response){
                console.log("polling message");
                if(response.statusCode == 200){
                    data = JSON.parse(data);
                    console.log(data);
                    data.messages.forEach(function(item){
                        if(item.type == "ChatMessage"){
                            session.send(item.message);
                        }
                        console.log(item);
                    });
                    var res = [ data, response ];
                    callback(null, res);
                } else if(response.statusCode == 204){
                    console.log('no data');
                    callback(null, [null, null]);
                } else {
                    callback(null);
                }
            });
        },
        function(err, result){
            if(err){
                console.log('error occured');
                console.log(err);
            }
            console.log('polling stopped');
        }
    )
}

function stopPolling(){
    contPoll = false;
    affinity = null;
    accessKey = '';
}

var slService = {
    getSessionId: getSessionId,
    chatVisitorInit: chatVisitorInit,
    sendMessage: sendMessage,
    startPolling: startPolling,
    stopPolling: stopPolling,
    connInfo: {
        accessKey: accessKey,
        affinity: affinity,
        version: version
    }
}

module.exports = {
    slService: slService
}