// Run locally in a terminal. Password entry is hidden and never written to a file.
import {randomBytes} from 'node:crypto';
import {hashPassword} from '../server/auth.js';
if(!process.stdin.isTTY){process.stderr.write('Run this command in an interactive terminal.\n');process.exit(1);}
let password='';process.stdout.write('Admin password (hidden): ');process.stdin.setRawMode(true);process.stdin.resume();
process.stdin.on('data',buffer=>{for(const char of buffer.toString()){
 if(char==='\u0003'){process.stdin.setRawMode(false);process.stdout.write('\n');process.exit(1);}
 if(char==='\r'||char==='\n'){process.stdin.setRawMode(false);process.stdin.pause();if(!password){process.stderr.write('\nPassword cannot be empty.\n');process.exit(1);}process.stdout.write('\nADMIN_PASSWORD_HASH='+hashPassword(password,randomBytes(24).toString('hex'))+'\n');password='';process.exit(0);}
 else if(char==='\u007f')password=password.slice(0,-1);else if(password.length<1024)password+=char;
}});
