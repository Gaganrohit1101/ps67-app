import { test } from 'node:test';
import assert from 'node:assert/strict';
import { privateIPv4, inSubnet, networkOptions } from '../scripts/network.mjs';
test('LAN checks reject public addresses and adjacent subnets',()=>{
  for(const ip of ['10.1.16.63','172.16.0.1','172.31.255.255','192.168.1.10'])assert.equal(privateIPv4(ip),true);
  for(const ip of ['8.8.8.8','172.32.0.1','192.169.0.1','999.1.2.3'])assert.equal(privateIPv4(ip),false);
  assert.equal(inSubnet('10.1.19.255','10.1.16.63/22'),true);
  assert.equal(inSubnet('10.1.20.1','10.1.16.63/22'),false);
  const local=networkOptions(false);
  const request=(host,ip)=>({headers:{host},socket:{remoteAddress:ip}});
  assert.equal(local.allowed(request('127.0.0.1:8000','127.0.0.1'),8000),true);
  assert.equal(local.allowed(request('attacker.example:8000','127.0.0.1'),8000),false);
  assert.equal(local.allowed(request('127.0.0.1:8000','8.8.8.8'),8000),false);
});
