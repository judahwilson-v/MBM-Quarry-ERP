const blocked = () => { throw new Error('MBM_NETWORK_DENIED'); };
const net = require('node:net');
const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function(...args) {
 const first = args[0];
 // Permit only named local IPC pipes used by test workers, never TCP.
 if (typeof first === 'string' && first.startsWith('/')) return originalConnect.apply(this,args);
 if (first && typeof first === 'object' && typeof first.path === 'string' && first.path.startsWith('/')) return originalConnect.apply(this,args);
 return blocked();
};
for (const name of ['node:http','node:https']) { const mod=require(name);mod.request=blocked;mod.get=blocked; }
for (const name of ['lookup','resolve','resolve4','resolve6','resolveAny']) require('node:dns')[name]=blocked;
require('node:dgram').createSocket=blocked;
globalThis.fetch=blocked;
