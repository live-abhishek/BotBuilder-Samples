var builder = require('botbuilder');
var siteUrl = require('./site-url');
var OrientDB = require('orientjs');

var connector = new builder.ChatConnector({
    appId: process.env.MICROSOFT_APP_ID,
    appPassword: process.env.MICROSOFT_APP_PASSWORD
});

var server = OrientDB({
    "host": process.env.ORIENTDB_HOST,
    "port": process.env.ORIENTDB_PORT,
    "httpPort": process.env.ORIENTDB_HTTP_PORT,
    "username": process.env.ORIENTDB_USERNAME,
    "password": process.env.ORIENTDB_PASSWORD
  });
var db = server.use(process.env.ORIENTDB_DBNAME);

// Welcome Dialog
var MainOptions = {
    Shop: 'main_options_order_flowers',
    Support: 'main_options_talk_to_support'
};

var bot = new builder.UniversalBot(connector, [function (session) {
    session.send('Test Echo ' + session.message.text);

    // if (localizedRegex(session, [MainOptions.Shop]).test(session.message.text)) {
    //     // Order Flowers
    //     return session.beginDialog('shop:/');
    // }

}])
.endConversationAction(
    "endOrderDinner", "Bye!",
    {
        matches: /^cancel$|^goodbye$/i,
        confirmPrompt: "Are you sure?"
    }
);

bot.dialog('showcards', function(session){
    getDBCards(session);
}).triggerAction({matches: /^showcards/i});

// Enable Conversation Data persistence
bot.set('persistConversationData', true);

// Set default locale
bot.set('localizerSettings', {
    botLocalePath: './bot/locale',
    defaultLocale: 'en'
});

// Trigger secondary dialogs when 'settings' or 'support' is called. Add Middlewares.
bot.use({
    botbuilder: function (session, next) {
        var text = session.message.text;
        console.log(session.message);
        next();
    }
});

// Connector listener wrapper to capture site url
var connectorListener = connector.listen();
function listen() {
    return function (req, res) {
        // Capture the url for the hosted application
        // We'll later need this url to create the checkout link 
        var url = req.protocol + '://' + req.get('host');
        siteUrl.save(url);
        connectorListener(req, res);
    };
}

// Other wrapper functions
function beginDialog(address, dialogId, dialogArgs) {
    bot.beginDialog(address, dialogId, dialogArgs);
}

function sendMessage(message) {
    bot.send(message);
}

function createCard(session, dbCard){
    var cardActions = [];
    if(dbCard.callToActions){
        for( var i = 0; i < dbCard.callToActions.length; i++ ){
            var cardAction;
            var cta = dbCard.callToActions[i];
            if(cta.type === 'postback'){
                cardAction = builder.CardAction.imBack(session, cta.title, cta.title);
            } else if(cta.type === 'web_url'){
                cardAction = builder.CardAction.openUrl(session, cta.url, cta.title);
            }
            cardActions.push(cardAction);
        }
    }
    var heroCard = new builder.HeroCard(session)
    .title(dbCard.title || '')
    .subtitle(dbCard.subtitle || '')
    .images([builder.CardImage.create(session, 'https://hashblu-static.s3.amazonaws.com/'+dbCard.imageUrls[0])])
    .buttons(cardActions);
    
    return heroCard;
}

function getDBCards(session){
    db.open().then(function() {
        console.log('executing query');
        return db.query('select from CardContent where parentId = "root" and orgId = "shopninja" and status = "live" and templateType != "newarrivals_card"');
     }).then(function(res){
        createCarouselAndSend(session, res);
        db.close().then(function(){
           console.log('closed');
        });
     });
}

function createCarouselAndSend(session, dbCards){
    var heroCards = [];
    var msg = new builder.Message(session);
    for(var i = 0; i < 2; i++){
        heroCards.push(createCard(session, dbCards[i]));
    }
    msg.attachmentLayout(builder.AttachmentLayout.carousel);
    msg.attachments(heroCards);
    session.send(msg).endDialog();
}

module.exports = {
    listen: listen,
    beginDialog: beginDialog,
    sendMessage: sendMessage
};