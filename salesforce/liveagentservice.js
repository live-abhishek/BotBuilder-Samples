var Client = require('node-rest-client').Client;
var fetch = require('isomorphic-fetch');

function LiveAgentService(){
    this.client = new Client();
    this.accessKey = '';
    this.affinity = 'null';
    this.version = 40;

    this.connected = false;
    
    var defaultParser = this.client.parsers.getDefault();
    this.client.parsers.clean();
    this.client.parsers.add(defaultParser);
}

LiveAgentService.prototype.getSessionId = function(){
    var args = {
        headers: {
            "X-LIVEAGENT-API-VERSION": this.version,
            "X-LIVEAGENT-AFFINITY": this.affinity
        }
    };
    var url = "https://d.la1-c2-ukb.salesforceliveagent.com/chat/rest/System/SessionId";
    return fetch(url, {
        method: 'GET',
        headers: args.headers
    }).then((res) => {
        return res.json();
    }).then((json) => {
        this.affinity = json.affinityToken;
        this.accessKey = json.key;
        return;
    });
}
LiveAgentService.prototype.chatVisitorInit = function(){
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
            "X-LIVEAGENT-AFFINITY": this.affinity,
            "X-LIVEAGENT-API-VERSION": this.version,
            "X-LIVEAGENT-SESSION-KEY": this.accessKey,
            "X-LIVEAGENT-SEQUENCE": 1,
            "Content-Type": "application/json"
        }
    };
    var url = "https://d.la1-c2-ukb.salesforceliveagent.com/chat/rest/Chasitor/ChasitorInit";
    return fetch(url, {
        method: 'POST',
        body: args.data,
        headers: args.headers
    }).then((res) => {
        console.log(res);
    });
}

var las = new LiveAgentService();
las.getSessionId().then(function(){
    las.chatVisitorInit();
});