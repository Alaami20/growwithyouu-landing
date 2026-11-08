import {createStore} from '../server/store.js';
export function memoryStore({representationEtags=false}={}){
 const files=new Map();let version=0;
 const adapter={
  async head(path){const file=files.get(path);if(!file){const e=Error("Not found");e.name="BlobNotFoundError";throw e;}return {etag:file.etag};},
  async get(path){const file=files.get(path);if(!file)return null;return {statusCode:200,stream:new Blob([file.body]).stream(),blob:{url:'https://test.private.blob.vercel-storage.com/'+path,etag:representationEtags?`W/"http-${file.etag}"`:file.etag,size:Buffer.byteLength(file.body)}};},
  async put(path,body,options){const old=files.get(path);if((options.ifMatch&&old?.etag!==options.ifMatch)||(!options.ifMatch&&old)){const e=Error('Conflict');e.name='BlobPreconditionFailedError';throw e;}const etag=String(++version);files.set(path,{body,etag});return {etag};}
 };
 return createStore(adapter,{BLOB_READ_WRITE_TOKEN:'test-storage-token'});
}
export function response(){return {code:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(body){this.body=body;return this;},end(){return this;}};}
export const authEnv={CEO_VERIFIED_EMAIL:'alaamiari@growwithyouu.com',ADMIN_PASSWORD:'test-password-only',ADMIN_SESSION_SECRET:'test-session-key-with-at-least-32-characters',ADMIN_ORIGIN:'https://example.test',BLOB_READ_WRITE_TOKEN:'test-storage-token'};
