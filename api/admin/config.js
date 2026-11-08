import {headers} from '../../server/access.js';
import {configured} from '../../server/auth.js';
import {CEO_EMAIL} from '../../server/policy.js';
export default function handler(req,res){headers(res);if(req.method!=='GET')return res.status(405).end();if(!configured())return res.status(503).json({error:'Private login or storage not configured'});return res.json({email:CEO_EMAIL,configured:true});}
