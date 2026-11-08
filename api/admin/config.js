import {headers} from '../../server/access.js';
export default function handler(req,res){headers(res);if(req.method!=='GET')return res.status(405).end();const {SUPABASE_URL:url,SUPABASE_ANON_KEY:key}=process.env;if(!url||!key)return res.status(503).json({error:'Admin identity provider not configured'});res.json({url,key});}
