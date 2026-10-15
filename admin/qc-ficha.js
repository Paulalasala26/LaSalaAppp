'use strict';
/* QC unificado: mediciones cuantitativas ADITIVAS, sin alterar checks históricos. */
(function(){
  const AUTH_KEY='lasala-firebase-auth-v1';
  const TRANSFER_KEY='lasala-qc-prototipo-ref-v1';
  const RETURN_KEY='lasala-backoffice-control-filtros-v1';
  const LEGACY_HANDOFF='lasala-backoffice-control-v1';
  const API_URL='/api/admin-qc-mediciones';
  let currentRef=null,currentPartida='',version=0,saving=false;
  let savedSnapshot=null,currentRules=null,ruleLoadFailed=false;
  const API_KEY='AIzaSyDdDdMg6M1jVIssvGYKsdRA-mRug31Yt_g';
  const TEST_DB='https://la-sala-app-test-default-rtdb.europe-west1.firebasedatabase.app';
  const CATS=[
    {key:'color',name:'Color',options:[['verde','Verde'],['amarillo','Amarillo'],['verdeClaro','Verde claro'],['ok','OK']]},
    {key:'tamano',name:'Tamaño',options:[['grande','Grande'],['pequeno','Pequeño'],['ok','OK']]},
    {key:'sanidad',name:'Sanidad',options:[['ok','OK'],['enferma','Enferma']]},
    {key:'flores',name:'Flores',options:[['si','Sí'],['no','No']]},
    {key:'raices',name:'Raíces',options:[['pocaRaiz','Poca raíz'],['raizVariedad','Raíz en variedad'],['ok','OK']]}
  ];
  CATS.forEach(cat=>cat.options.push(['noEvaluada','No evaluada']));
  function categoryIssue(category,values,total){
    const notEvaluated=values.noEvaluada||0;
    if(category!=='raices'){
      const sum=Object.values(values).reduce((a,b)=>a+b,0);
      if(sum!==total)return sum<total?'Faltan '+(total-sum)+' bandejas.':'Sobran '+(sum-total)+' bandejas.';
      return '';
    }
    // Los dos defectos de raíces pueden coexistir en una bandeja.
    // OK y No evaluada no se solapan con bandejas defectuosas.
    const evaluated=total-notEvaluated,ok=values.ok||0;
    if(ok>evaluated)return 'OK supera las evaluadas en '+(ok-evaluated)+' bandejas.';
    const affected=evaluated-ok;
    const low=values.pocaRaiz||0,inVariety=values.raizVariedad||0;
    const minimum=Math.max(low,inVariety),maximum=low+inVariety;
    if(affected<minimum)return 'Sobran '+(minimum-affected)+' bandejas con defectos respecto a las evaluadas.';
    if(affected>maximum)return 'Faltan '+(affected-maximum)+' bandejas por clasificar.';
    return '';
  }
  const ILLNESSES={
    hojasManchadas:'Hojas manchadas',hojasAmarillas:'Hojas amarillas',
    tuta:'Tuta',minador:'Minador',pulgon:'Pulgón',oidio:'Oídio',
    alternaria:'Alternaria',botritis:'Botritis'
  };
  const el=id=>document.getElementById(id);
  const labelDate=d=>{
    const START=Date.UTC(2026,5,15);
    return new Date(START+(d-15)*86400000).toLocaleDateString('es-ES',{timeZone:'UTC'});
  };
  const asString=value=>value===undefined||value===null?'':String(value);
  const node=(tag,txt,cls)=>{
    const x=document.createElement(tag);
    if(txt!==undefined&&txt!==null)x.textContent=asString(txt);
    if(cls)x.className=cls;
    return x;
  };
  function gate(msg){
    el('gate-title').textContent='Acceso restringido';
    el('gate-description').textContent=msg;
    el('gate-link').hidden=false;
    el('workspace').hidden=true;
    el('access-gate').hidden=false;
  }
  async function getToken(){
    let saved=null;
    try{saved=JSON.parse(localStorage.getItem(AUTH_KEY)||'null')}catch(e){}
    if(!saved?.user||!saved?.refreshToken)throw new Error('LOGIN_REQUIRED');
    const response=await fetch('https://securetoken.googleapis.com/v1/token?key='+encodeURIComponent(API_KEY),{
      method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({grant_type:'refresh_token',refresh_token:saved.refreshToken}).toString(),
      cache:'no-store'
    });
    if(!response.ok)throw new Error('LOGIN_REQUIRED');
    const auth=await response.json();
    if(!auth.id_token||!auth.refresh_token)throw new Error('LOGIN_REQUIRED');
    localStorage.setItem(AUTH_KEY,JSON.stringify({user:saved.user,refreshToken:auth.refresh_token}));
    return auth.id_token;
  }
  async function verifyAdmin(jwt){
    const response=await fetch('/api/admin-catalog',{
      headers:{Authorization:'Bearer '+jwt},cache:'no-store'
    });
    if(response.status===401)throw new Error('LOGIN_REQUIRED');
    if(response.status===403)throw new Error('NO_PERMISSION');
    if(!response.ok)throw new Error('AUTH_ERROR');
    const value=await response.json();
    if(!value||!Array.isArray(value.rooms)||!Array.isArray(value.greenhouses))
      throw new Error('AUTH_ERROR');
    return value.currentUser||'Administrador';
  }
  function getSelection(){
    let selected=null;
    try{selected=JSON.parse(sessionStorage.getItem(TRANSFER_KEY)||'null')}catch(e){}
    if(!selected||!['tunel','carga'].includes(selected.tipo)||
       !Number.isInteger(selected.dia)||selected.dia<15||selected.dia>4000||
       typeof selected.id!=='string'||!/^[A-Za-z0-9_-]{1,180}$/.test(selected.id)||
       !Number.isFinite(selected.ts)||Date.now()-selected.ts>5*60000||selected.ts>Date.now()+60000){
      throw new Error('NO_SELECTION');
    }
    return selected;
  }
  async function getRecord(jwt,selected){
    const q=Math.max(0,Math.floor((selected.dia-15)/14));
    const shard='lasala-control-items-v2-'+selected.tipo+'-q'+q;
    const url=TEST_DB+'/'+encodeURIComponent(shard)+'/'+encodeURIComponent(selected.id)+'.json?auth='+encodeURIComponent(jwt);
    const response=await fetch(url,{method:'GET',cache:'no-store'});
    if(!response.ok)throw new Error('DB_ERROR');
    const value=await response.json();
    const rec=typeof value==='string'?JSON.parse(value):value;
    if(!rec||Array.isArray(rec)||typeof rec!=='object'||rec.id!==selected.id||
       rec.tipo!==selected.tipo||rec.dia!==selected.dia){
      throw new Error('NOT_FOUND');
    }
    return rec;
  }
  function field(parent,key,val){
    const x=node('div',null,'qcu-field');
    x.append(node('span',key),node('strong',val===''?'—':val));
    parent.append(x);
  }
  function checked(obj){
    if(!obj||typeof obj!=='object'||Array.isArray(obj))return [];
    return Object.keys(obj).filter(k=>obj[k]===true);
  }
  function renderIdentity(r){
    const root=el('qcu-fields');root.replaceChildren();
    const tipo=r.tipo==='tunel'?'Túnel':'Carga';
    field(root,'Partida',r.partida||'—');
    field(root,'Estadio',tipo);
    field(root,'Fecha de control',labelDate(r.dia));
    field(root,'Nº bandejas informadas (heredado)',r.numBandejas||'—');
    field(root,'Cliente / Variedad',r.tipo==='tunel'?(r.clienteVariedad||'—'):
      [r.cliente,r.variedad].filter(Boolean).join(' · ')||'—');
    field(root,'Ubicación',r.tipo==='tunel'?
      ('INV '+asString(r.invId||'—')+(r.calleDesde!=null?' · C/ '+r.calleDesde+(r.calleHasta!=null&&r.calleHasta!==r.calleDesde?'–'+r.calleHasta:''):''))
      :(asString(r.invernadero||'No informada')));
    field(root,'Registro histórico (ID)',r.id);
    field(root,'Creado por',r.creadoPor||'—');
    if(r.fentrega)field(root,'Fecha prevista/entrega heredada',r.fentrega);
  }
  function legacyBlock(label,txt){
    const box=node('div',null,'qcu-legacy');
    box.append(node('b',label),node('p',txt||'Sin responder'));return box;
  }
  function renderLegacy(r){
    const root=el('qcu-legacy');root.replaceChildren();
    for(const cat of CATS){
      const names=new Map(cat.options);
      const marked=checked(r[cat.key]).map(x=>names.get(x)||x);
      root.append(legacyBlock(cat.name,marked.length?marked.join(' · '):'Sin responder'));
    }
    const extra=checked(r.sanidadEnfermedades).map(x=>ILLNESSES[x]||x);
    if(extra.length)root.append(legacyBlock('Enfermedades / incidencias',extra.join(' · ')));
    const injerto=checked(r.raicesInjerto);
    if(injerto.length)root.append(legacyBlock('Raíces injerto (histórico)',injerto.join(' · ')));
    if(r.observaciones)root.append(legacyBlock('Observaciones',r.observaciones));
    const otherRootKeys=[
      'raices','color','tamano','sanidad','flores'
    ];
    for(const k of otherRootKeys){
      const known=new Set(CATS.find(x=>x.key===k)?.options.map(x=>x[0])||[]);
      const unknown=checked(r[k]).filter(x=>!known.has(x));
      if(unknown.length)root.append(legacyBlock('Valores adicionales de '+k,unknown.join(' · ')));
    }
  }
  function renderGroups(legacy){
    const root=el('qcu-groups');root.replaceChildren();
    for(const cat of CATS){
      const wrap=node('fieldset',null,'qcu-group');wrap.dataset.cat=cat.key;
      const legend=node('legend',cat.name);
      wrap.append(legend);
      const list=node('div',null,'qcu-opts');
      const original=new Set(checked(legacy?.[cat.key]));
      for(const [key,name] of cat.options){
        const opt=node('div',null,'qcu-option');opt.dataset.option=key;
        const id='qcu-qty-'+cat.key+'-'+key;
        const label=node('label',name,'qcu-option-label');label.htmlFor=id;
        if(key!=='noEvaluada'&&original.has(key))
          label.append(node('span','✓ Check original','qcu-historical-badge'));
        const indicator=node('span',null,'qcu-inline-indicator');
        indicator.hidden=true;label.append(indicator);
        const quantity=node('input');quantity.type='number';quantity.inputMode='numeric';
        quantity.step='1';quantity.min='1';quantity.max='10000000';
        quantity.id=id;quantity.dataset.cat=cat.key;quantity.dataset.option=key;
        quantity.placeholder='—';
        quantity.setAttribute('aria-label','Bandejas '+name+' en '+cat.name);
        quantity.addEventListener('input',()=>{
          el('qcu-validation').hidden=true;
          quantity.removeAttribute('aria-invalid');
          renderIndicators();
        });
        opt.append(label,quantity);list.append(opt);
      }
      wrap.append(list);root.append(wrap);
    }
  }
  function validInt(value){
    const s=asString(value).trim();
    if(!/^\d+$/.test(s))return null;
    const n=Number(s);return Number.isSafeInteger(n)&&n>0?n:null;
  }
  function validate(){
    const errors=[],entries=[];
    const totalInput=el('qcu-inspected');
    const total=validInt(totalInput.value);
    totalInput.setAttribute('aria-invalid',total===null?'true':'false');
    if(total===null)errors.push('Introduce un número entero mayor que cero de bandejas inspeccionadas.');
    for(const cat of CATS){
      const group=el('qcu-groups').querySelector('[data-cat="'+cat.key+'"].qcu-group');
      const chosen=Array.from(group.querySelectorAll('input[type="number"]'))
        .filter(x=>x.value.trim()!=='');
      if(!chosen.length)errors.push(cat.name+': introduce al menos una cantidad.');
      const values=[];
      for(const input of chosen){
        const count=validInt(input.value);
        const name=cat.options.find(x=>x[0]===input.dataset.option)?.[1]||input.dataset.option;
        const valid=count!==null&&(total===null||count<=total);
        input.setAttribute('aria-invalid',valid?'false':'true');
        if(!valid)errors.push(cat.name+' / '+name+': indica entre 1 y '+(total||'el total inspeccionado')+' bandejas.');
        else values.push({opcion:input.dataset.option,bandejasAfectadas:count});
      }
      if(total!==null&&values.length===chosen.length){
        const issue=categoryIssue(cat.key,Object.fromEntries(values.map(v=>[v.opcion,v.bandejasAfectadas])),total);
        if(issue)errors.push(cat.name+': '+issue);
      }
      entries.push({categoria:cat.key,opciones:values});
    }
    if(total!==null&&total>10000000)errors.push('El máximo técnico es 10.000.000 de bandejas.');
    return {ok:errors.length===0,errors,total,entries};
  }
  function inform(message,error){
    const box=el('qcu-validation');box.hidden=!message;
    box.className='qcu-alert '+(error?'error':'ok');
    box.textContent=message;
  }
  async function savedMeasurements(jwt,ref){
    const query=new URLSearchParams({id:ref.id,tipo:ref.tipo,dia:String(ref.dia)});
    const response=await fetch(API_URL+'?'+query.toString(),{
      method:'GET',headers:{Authorization:'Bearer '+jwt},cache:'no-store'
    });
    if(!response.ok)throw new Error(response.status===409?'SOURCE_CHANGED':'MEASUREMENTS_READ_ERROR');
    const result=await response.json();
    if(!result.ok)throw new Error('MEASUREMENTS_READ_ERROR');
    return result.record;
  }
  function loadSaved(saved){
    savedSnapshot=saved;
    version=saved?.version||0;
    el('qcu-inspected').value=saved?String(saved.bandejasInspeccionadas):'';
    for(const cat of CATS){
      const group=el('qcu-groups').querySelector('[data-cat="'+cat.key+'"].qcu-group');
      for(const [key] of cat.options){
        const qty=Array.from(group.querySelectorAll('input[type="number"]'))
          .find(x=>x.dataset.option===key);
        const n=saved?.mediciones?.[cat.key]?.[key];
        qty.value=Number.isInteger(n)&&n>0?String(n):'';
      }
    }
    inform('',false);
    renderIndicators();
  }
  async function fetchCriteria(jwt,stage){
    const response=await fetch('/api/admin-qc-reglas?stage='+encodeURIComponent(stage),{
      method:'GET',headers:{Authorization:'Bearer '+jwt},cache:'no-store'
    });
    if(!response.ok)throw new Error('CRITERIA_UNAVAILABLE');
    const body=await response.json();
    if(!body.ok||body.stage!==stage||!body.rules||
      !body.rules.criterios||!Number.isSafeInteger(body.rules.version))
      throw new Error('CRITERIA_UNAVAILABLE');
    return body.rules;
  }
  function metric(parent,label,value){
    const wrap=node('div',null,'qci-metric');
    wrap.append(node('b',value),node('span',label));
    parent.append(wrap);
  }
  function percentText(value){
    return Number(value).toLocaleString('es-ES',{maximumFractionDigits:2})+' %';
  }
  function measurementsUnchanged(){
    if(!savedSnapshot||validInt(el('qcu-inspected').value)!==savedSnapshot.bandejasInspeccionadas)
      return false;
    for(const cat of CATS){
      const group=el('qcu-groups').querySelector('[data-cat="'+cat.key+'"].qcu-group');
      for(const input of group.querySelectorAll('input[type="number"]')){
        const original=savedSnapshot.mediciones?.[cat.key]?.[input.dataset.option];
        const text=input.value.trim();
        if(text===''? original!==undefined : validInt(text)!==original)return false;
      }
    }
    return true;
  }
  function renderIndicators(){
    const status=el('qci-status'),section=el('qci-results');
    el('qcu-groups').querySelectorAll('.qcu-inline-indicator').forEach(x=>{x.hidden=true;x.textContent='';});
    status.hidden=false;
    section.hidden=true;
    if(savedSnapshot&&!measurementsUnchanged()){
      status.hidden=true;
      return;
    }
    if(!savedSnapshot){
      status.textContent='Sin mediciones.';
      return;
    }
    if(!window.QCIndicators){
      status.textContent='Indicadores no disponibles.';
      return;
    }
    const result=window.QCIndicators.evaluate(savedSnapshot,currentRules);
    if(!result.available){
      status.textContent='Mediciones no válidas.';
      return;
    }
    status.textContent=ruleLoadFailed?'Criterios no disponibles.':
      result.configuredCount===0?'Sin criterios configurados.':'';
    status.hidden=!status.textContent;
    const stats=el('qci-metrics');stats.replaceChildren();
    metric(stats,'Bandejas inspeccionadas',result.inspected.toLocaleString('es-ES'));
    metric(stats,'Opciones cuantificadas',String(result.evaluatedCount));
    metric(stats,'Advertencias',result.configuredCount?String(result.warningCount):'—');
    metric(stats,'Alertas prioritarias',result.configuredCount?String(result.criticalCount):'—');
    el('qci-objective').textContent=result.objective===null
      ?'':'Objetivo de calidad: '+percentText(result.objective);
    const body=el('qci-rows');body.replaceChildren();
    for(const row of result.rows){
      const option=el('qcu-groups').querySelector(
        '.qcu-group[data-cat="'+row.category+'"] .qcu-option[data-option="'+row.option+'"] .qcu-inline-indicator');
      if(option){
        option.textContent=percentText(row.percentDisplay)+
          (row.level==='critical'?' · Alerta':row.level==='warning'?' · Aviso':'');
        option.className='qcu-inline-indicator '+row.level;
        option.title=row.description;
        option.hidden=false;
      }
      const tr=node('tr');
      for(const value of [
        row.categoryLabel+' · '+row.optionLabel,
        row.count.toLocaleString('es-ES')+' / '+result.inspected.toLocaleString('es-ES'),
        percentText(row.percentDisplay),
        row.treatmentLabel,
        row.tolerance===null?'—':percentText(row.tolerance)
      ])tr.append(node('td',value));
      const state=node('td');state.append(node('span',row.description,'qci-state '+row.level));
      tr.append(state);body.append(tr);
    }
    section.hidden=false;
  }
  function goToLegacy(action){
    if(saving||!currentRef||!['edit','checks'].includes(action))return;
    sessionStorage.setItem(LEGACY_HANDOFF,JSON.stringify({
      action,tipo:currentRef.tipo,dia:currentRef.dia,id:currentRef.id,ts:Date.now()
    }));
    location.assign('../');
  }
  async function submit(e){
    e.preventDefault();
    if(saving||!currentRef)return;
    const result=validate();
    if(!result.ok){
      inform('No se puede guardar: '+result.errors.slice(0,8).join(' · ')+
        (result.errors.length>8?' · Y '+(result.errors.length-8)+' errores más.':'')+
        ' Ningún dato ha cambiado.',true);
      return;
    }
    saving=true;el('qcu-save').disabled=true;
    inform('Guardando…',false);
    try{
      const mediciones={};
      for(const cat of result.entries){
        const choices={};
        for(const opt of cat.opciones)choices[opt.opcion]=opt.bandejasAfectadas;
        mediciones[cat.categoria]=choices;
      }
      const response=await fetch(API_URL,{
        method:'POST',
        headers:{Authorization:'Bearer '+await getToken(),'Content-Type':'application/json'},
        body:JSON.stringify({
          ...currentRef,partida:currentPartida,version,
          bandejasInspeccionadas:result.total,mediciones
        }),cache:'no-store'
      });
      const output=await response.json().catch(()=>({}));
      if(!response.ok){
        if(response.status===409)throw new Error('CONCURRENT_MODIFICATION');
        if(response.status===400)throw new Error('INVALID_MEASUREMENTS');
        throw new Error('SAVE_FAILED');
      }
      if(!output.ok||!Number.isInteger(output.version))throw new Error('SAVE_FAILED');
      version=output.version;
      savedSnapshot={version,bandejasInspeccionadas:result.total,mediciones};
      currentRules=null;ruleLoadFailed=false;
      renderIndicators();
      try{
        currentRules=await fetchCriteria(await getToken(),currentRef.tipo);
      }catch(e){ruleLoadFailed=true}
      renderIndicators();
      inform('✓ Guardado',false);
      setTimeout(()=>{
        if(el('qcu-validation').textContent==='✓ Guardado')inform('',false);
      },2500);
    }catch(err){
      const msg=err.message==='CONCURRENT_MODIFICATION'
        ?'Otro usuario ha cambiado este registro o la partida de origen. No se ha sobrescrito nada. Copia los datos necesarios y vuelve a abrir la ficha para revisar la versión actual.'
        :err.message==='INVALID_MEASUREMENTS'
        ?'El servidor ha rechazado las cantidades. Revisa las cifras; no se han guardado.'
        :'No se ha podido confirmar el guardado. No asumas que los datos están guardados; vuelve a consultar antes de reintentar.';
      inform(msg,true);
    }finally{saving=false;el('qcu-save').disabled=false;}
  }
  async function start(){
    el('qcu-form').addEventListener('submit',submit);
    el('qcu-inspected').addEventListener('input',()=>{
      el('qcu-validation').hidden=true;renderIndicators();
    });
    try{
      const selected=getSelection();
      const jwt=await getToken();
      const username=await verifyAdmin(jwt);
      const rec=await getRecord(jwt,selected);
      renderIdentity(rec);renderLegacy(rec);renderGroups(rec);
      currentRef=selected;
      currentPartida=rec.partida||'';
      loadSaved(await savedMeasurements(jwt,selected));
      try{
        currentRules=await fetchCriteria(jwt,selected.tipo);
      }catch(e){
        currentRules=null;ruleLoadFailed=true;
      }
      renderIndicators();
      el('qcu-edit-legacy').addEventListener('click',()=>goToLegacy('edit'));
      el('qcu-evaluate-legacy').addEventListener('click',()=>goToLegacy('checks'));
      el('session-user').textContent=username;
      el('workspace').hidden=false;
      el('access-gate').hidden=true;
    }catch(e){
      const msg=e?.message==='NO_SELECTION'?'Selecciona primero un registro desde Backoffice → QC.':
        e?.message==='LOGIN_REQUIRED'?'Inicia sesión en ViguerAPP para continuar.':
        e?.message==='NO_PERMISSION'?'Se necesita el rol ADMIN activo.':
        e?.message==='NOT_FOUND'?'El registro ha cambiado o no se encuentra disponible.':
        e?.message==='SOURCE_CHANGED'?'El registro original ha cambiado o no es compatible con la medición existente.':
        'No se ha podido cargar la ficha QC.';
      console.warn('QC prototipo no disponible:',e?.message);
      gate(msg);
    }
  }
  start();
})();
