var Client = require('node-rest-client').Client;
var async = require('async');
var client = new Client();

var defaultParser = client.parsers.getDefault();
client.parsers.clean();
client.parsers.add(defaultParser);

var accessKey = '';
var affinity = null;
var version = 40;

var contPoll = false;

function getSessionId(callback){
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
        data = JSON.parse(data);
        accessKey = data.key;
        affinity = data.affinityToken;
        // console.log(response);
        console.log(data);
        console.log('===============================');
        chatVisitorInit(callback)
    });
}

function chatVisitorInit(callback){
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
        startPolling(callback)
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

function pollMessage(callback){
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
        // console.log(response);
        if(response.statusCode == 200){
            data = JSON.parse(data);
            console.log(data);
            data.messages.forEach(function(item){
                console.log(item.message);
            });
            var res = [ data, response ];
            
            callback(null, res);
        } else if(response.statusCode == 204){
            console.log('no data');
            callback(null, [null, null]);
        } else {
            // callback(err);
        }
        
    });
}

function startPolling(){
    contPoll = true;
    async.whilst(
        function(){
            return contPoll;
        }, pollMessage,
        function(err, result){
            // if(err){
            //     console.log('polling stopped');
            //     console.log(err);
            // } else {
            //     callback(result[0], result[1]);
            // }
        }
    )
}

function stopPolling(){
    contPoll = false;
}

function testMessage(){
    return 'invoked from salesforce module!';
}

var slService = {
    getSessionId: getSessionId,
    chatVisitorInit: chatVisitorInit,
    sendMessage: sendMessage,
    pollMessage: pollMessage,
    startPolling: startPolling,
    stopPolling: stopPolling,
    testMessage: testMessage,
    connInfo: {
        accessKey: accessKey,
        affinity: affinity,
        version: version
    }
}

module.exports = {
    slService: slService
}