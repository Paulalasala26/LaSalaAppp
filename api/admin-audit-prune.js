'use strict';
// Vercel Cron diario del proyecto TEST: depura sólo lasala-admin-audit-v1.
const crypto=require('node:crypto');
const {serviceAccount,serviceAccessToken}=require('./admin-users')._adminCatalogHelpers;
const {pruneExpiredAudit}=require('./admin-audit');
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  }
  const secret=process.env.CRON_SECRET;
  const supplied=req.headers.authorization||'';
  if(typeof secret!=='string'||secret.length<16)
    return res.status(503).json({error:'CRON_NOT_CONFIGURED'});
  const a=Buffer.from(supplied,'utf8');
  const b=Buffer.from('Bearer '+secret,'utf8');
  if(a.length!==b.length||!crypto.timingSafeEqual(a,b))
    return res.status(401).json({error:'UNAUTHORIZED'});
  try{
    const accessToken=await serviceAccessToken(serviceAccount());
    const summary=await pruneExpiredAudit(accessToken);
    console.info('ADMIN_AUDIT_RETENTION_TEST',{
      ...summary,retention:'1 calendar year',timestamp:new Date().toISOString()
    });
    return res.status(200).json({ok:true,...summary,retention:'1 calendar year'});
  }catch(e){
    console.error('ADMIN_AUDIT_RETENTION_TEST_FAILED',e.message);
    return res.status(503).json({error:'PRUNE_FAILED'});
  }
};