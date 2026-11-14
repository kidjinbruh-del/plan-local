const path = require('node:path');
function portableRoot({packaged,execPath,portableDir,projectDir}) {
 if(!packaged)return path.join(projectDir,'.desktop-dev');
 return portableDir ? path.resolve(portableDir) : path.dirname(execPath);
}
module.exports={portableRoot};
