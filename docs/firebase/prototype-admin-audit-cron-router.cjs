'use strict';
// TEST-ONLY architectural prototype. No API route, no deployment, no side effects.
// Keeps admin-audit GET unchanged. Routes ?job=prune to CRON_SECRET-only pruning.
// Production integration must import the ORIGINAL audit handler and pruneExpiredAudit.
const crypto=require('node:crypto');
const RETENTION='1 calendar year';
function createAuditCronRouter({auditHandler,pruneExpiredAudit,serviceAccount,
  serviceAccessToken,getCronSecret=()=>process.env.CRON_SECRET,logger=console}={}){
  if(typeof auditHandler!=='function'||typeof pruneExpiredAudit!=='function'||
     typeof serviceAccount!=='function'||typeof serviceAccessToken!=='function')
    throw new TypeError('MISSING_DEPENDENCY');
  return async function auditCronRouter(req,res){
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    if(req?.method!=='GET'){
      res.setHeader('Allow','GET');
      return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
    }
    const q=req.query||{};
    if(!q||typeof q!=='object'||Array.isArray(q))
      return res.status(400).json({error:'INVALID_QUERY'});
    // No job parameter: exact delegation to original ADMIN-only audit handler.
    if(!Object.prototype.hasOwnProperty.call(q,'job'))
      return auditHandler(req,res);
    // Unrecognized / ambiguous query never falls through to a privileged handler.
    if(q.job!=='prune'||Object.keys(q).length!==1)
      return res.status(400).json({error:'INVALID_JOB'});
    const secret=getCronSecret();
    if(typeof secret!=='string'||secret.length<16)
      return res.status(503).json({error:'CRON_NOT_CONFIGURED'});
    const raw=req.headers?.authorization||'';
    if(typeof raw!=='string')return res.status(401).json({error:'UNAUTHORIZED'});
    const candidate=Buffer.from(raw,'utf8');
    const expected=Buffer.from('Bearer '+secret,'utf8');
    if(candidate.length!==expected.length||!crypto.timingSafeEqual(candidate,expected))
      return res.status(401).json({error:'UNAUTHORIZED'});
    try{
      const token=await serviceAccessToken(serviceAccount());
      const summary=await pruneExpiredAudit(token);
      logger.info?.('ADMIN_AUDIT_RETENTION_TEST',{
        ...summary,retention:RETENTION,timestamp:new Date().toISOString()
      });
      return res.status(200).json({ok:true,...summary,retention:RETENTION});
    }catch(e){
      // Do not print auth values, records, personal data, or Firebase endpoints.
      logger.error?.('ADMIN_AUDIT_RETENTION_TEST_FAILED','PRUNE_FAILED');
      return res.status(503).json({error:'PRUNE_FAILED'});
    }
  };
}
module.exports={createAuditCronRouter};
