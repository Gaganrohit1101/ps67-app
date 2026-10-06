import os from 'node:os';
function ipv4(value) {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return null;
  const parts=value.split('.').map(Number);
  return parts.some(n=>n>255) ? null : parts.reduce((n,p)=>(n*256+p)>>>0,0);
}
export function privateIPv4(ip) {
  const n=ipv4(ip);return n!==null && ((n>>>24)===10 || (n>>>20)===2753 || (n>>>16)===49320);
}
export function inSubnet(ip,cidr) {
  const [base,bits]=cidr.split('/'), n=ipv4(ip), b=ipv4(base), prefix=Number(bits);
  if(n===null||b===null||prefix<0||prefix>32||!Number.isInteger(prefix))return false;
  const mask=prefix===0?0:(0xffffffff<<(32-prefix))>>>0;
  return (n&mask)===(b&mask);
}
export function networkOptions(lan=process.argv.includes('--lan')) {
  const interfaces=Object.values(os.networkInterfaces()).flat().filter(a=>a && a.family==='IPv4'&&!a.internal&&privateIPv4(a.address));
  const nic=process.env.LAN_HOST ? interfaces.find(a=>a.address===process.env.LAN_HOST) : interfaces[0];
  if(lan&&!nic)throw new Error('No private LAN IPv4 address found. Set LAN_HOST to this laptop’s Wi-Fi address.');
  const ip=lan?nic.address:'127.0.0.1';
  const subnet=lan?nic.cidr:'127.0.0.0/8';
  const hosts=new Set(['127.0.0.1','localhost',...(lan?[ip]:[])]);
  return {lan,ip,subnet,bind:lan?'0.0.0.0':'127.0.0.1',hosts,
    origin:port=>`http://${ip}:${port}`,
    origins:port=>[...hosts].map(h=>`http://${h}:${port}`),
    allowed(req,port) {
      const remote=(req.socket.remoteAddress||'').replace(/^::ffff:/,'');
      return hosts.has((req.headers.host||'').split(':')[0]) &&
        req.headers.host.endsWith(':'+port) && (remote==='::1'||inSubnet(remote,'127.0.0.0/8')||(lan&&inSubnet(remote,subnet)));
    }};
}
