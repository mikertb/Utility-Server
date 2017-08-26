const fs = require('fs-extra');
const path = require('path');

module.exports = {
    append_log: function(file,message) {
        let date_now = (new Date()).toISOString().replace(/T/," ");
        let text_msg = `${date_now} - ${message}`;
        let filepath = path.join(process.cwd(),'logs',file);
        if(!fs.existsSync(filepath)) fs.closeSync(fs.openSync(filepath, 'w'));
        fs.appendFile(filepath,`${text_msg}\n`,(err)=>{});
    },
    write_log: function(file,message) {
        let filepath = path.join(process.cwd(),'logs',file);
        fs.writeFile(filepath,message,(err)=>{});
    },
    read_log: function(file) {
        let filepath = path.join(process.cwd(),'logs',file);
        if(!fs.existsSync(filepath)) {
            return "";
        } else {
            return fs.readFileSync(filepath).toString();
        }
    }
}