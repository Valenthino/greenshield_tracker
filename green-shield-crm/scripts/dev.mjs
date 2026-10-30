import { spawn } from 'node:child_process';
const args=process.argv.slice(2);
const value=(...flags)=>{for(const flag of flags){const i=args.indexOf(flag);if(i>=0&&args[i+1])return args[i+1];}return undefined;};
const hostname=value('--hostname','--host')||'127.0.0.1';
const port=value('--port','-p')||process.env.PORT||'3000';
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname',hostname,'--port',port],{stdio:'inherit',env:process.env});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>process.exit(code??1));
