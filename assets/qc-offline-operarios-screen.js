'use strict';
// Solo consulta de snapshots autorizados y ya leídos desde el frontend.
(function(){
  const $=id=>document.getElementById(id);
  const authKey='lasala-firebase-auth-v1';
  const roleKey='viguerapp-qc-offline-role-test-v1';
  const sessionKey='lasala-sesion-v1';
  const text=(tag,value,className)=>{
    const el=document.createElement(tag);
    if(value!==undefined)el.textContent=String(value);
    if(className)el.className=className;
    return el;
  };
  const anchor=new Date(2026,5,15);
  const day=n=>{const d=new Date(anchor);d.setDate(d.getDate()+n-15);return d.toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit',year:'numeric'})};
  const period=q=>day(15+q*14)+' — '+day(28+q*14);
  let slices=[];
  function render(){
    const tipo=$('tipo').value,q=$('quincena').value,term=$('search').value.trim().toUpperCase();
    const records=slices.filter(s=>(!tipo||s.tipo===tipo)&&(!q||String(s.q)===q))
      .flatMap(s=>s.records)
      .filter(r=>!term||r.partida.toUpperCase().includes(term))
      .sort((a,b)=>b.dia-a.dia||a.partida.localeCompare(b.partida,'es'));
    $('count').textContent=records.length+' controles disponibles';
    const list=$('items');list.replaceChildren();
    const fragment=document.createDocumentFragment();
    for(const r of records.slice(0,120)){
      const item=text('div',undefined,'item'),left=text('div'),right=text('div',day(r.dia),'date');
      left.append(text('strong',r.partida));
      const info=(r.tipo==='tunel'?'QC Túnel':'QC Carga')+
        (r.bandejas?' · '+r.bandejas+' bandejas':'')+
        (r.inv?' · INV '+r.inv:'')+
        (r.calle!==null?' · Calle '+r.calle:'');
      left.append(text('span',info),text('span','Inspección '+r.id));
      if(window.QCOfflineDraftEditor)window.QCOfflineDraftEditor.decorate(left,r);
      if(window.QCOfflinePhotos)window.QCOfflinePhotos.decorate(left,r);
      item.append(left,right);fragment.append(item);
    }
    list.append(fragment);
    if(records.length>120)$('count').textContent+=' · mostrando los primeros 120';
  }
  async function boot(){
    try{
      const auth=JSON.parse(localStorage.getItem(authKey)||'null');
      const session=JSON.parse(localStorage.getItem(sessionKey)||'null');
      const role=localStorage.getItem(roleKey);
      if(!auth?.user||!auth.refreshToken||auth.user!==session?.user||
         !['ADMIN','TECNICO','CARGADOR'].includes(role))throw Error('LOGIN_REQUIRED');
      if(!window.QCOfflineOperarios)throw Error('OFFLINE_NOT_SUPPORTED');
      slices=await window.QCOfflineOperarios.list(auth.user,role);
      const localDraftCount=window.QCOfflineDraftEditor?
        await window.QCOfflineDraftEditor.init(auth.user,role).catch(()=>0):0;
      const localPhotoCount=window.QCOfflinePhotos?
        await window.QCOfflinePhotos.init(auth.user,role):0;
      if(!slices.length){
        // Las fotos NO caducan con la copia de partidas: ofrecer lectura y
        // envío manual usando el ID original validado por el servidor.
        if(localPhotoCount&&window.QCOfflinePhotos)
          window.QCOfflinePhotos.renderSaved($('photo-rescue'));
        $('status').textContent='No hay partidas preparadas o la copia ha caducado (24 h). Conéctate y abre QC Túnel o QC Carga.'+
          (localDraftCount?' Hay '+localDraftCount+' borradores de cantidades locales.':'')+
          (localPhotoCount?' Hay '+localPhotoCount+' fotos locales pendientes; se conservarán al caducar esta consulta.':'');
        return;
      }
      const last=Math.max(...slices.map(s=>s.at));
      $('status').textContent='Copia local de '+new Date(last).toLocaleString('es-ES')+'. No son datos en tiempo real.';
      const qs=[...new Set(slices.map(x=>x.q))].sort((a,b)=>b-a);
      for(const q of qs){
        const option=text('option',period(q));option.value=String(q);
        $('quincena').append(option);
      }
      if(role==='CARGADOR'){$('tipo').value='carga';$('tipo').disabled=true;}
      $('area').hidden=false;
      for(const id of ['tipo','quincena','search'])$(id).addEventListener(id==='search'?'input':'change',render);
      render();
    }catch(e){
      $('status').textContent=e.message==='LOGIN_REQUIRED'?
        'Abre ViguerAPP TEST desde este mismo navegador o desde la aplicación instalada, inicia sesión y utiliza Control → Sin conexión. Los enlaces abiertos desde otra aplicación o navegador no comparten la sesión.':
        'No se puede leer la consulta local. Conéctate y abre Control.';
    }
  }
  boot();
})();