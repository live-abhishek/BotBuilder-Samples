var util = require('util');
var builder = require('botbuilder');

function ManualDialog(tasks){
    function func(session, args){
        session.dialogData.taskNum = session.dialogData.taskNum || 0;

        function nextfn(args){
            session.dialogData.taskNum += 1;
            var task = tasks[session.dialogData.taskNum];
            if(!task){
                if(args){
                    session.endDialogWithResult(args);
                } else {
                    session.endDialog();
                }
            } else {
                task(session, args, nextfn);
            }
        }
        tasks[session.dialogData.taskNum](session, args, nextfn);
    }
    ManualDialog.super_.call(this, func);
}

util.inherits(ManualDialog, builder.SimpleDialog);
module.exports = ManualDialog;